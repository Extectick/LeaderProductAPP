import { Platform } from 'react-native';
import { fetchCatalogChangesPage, fetchCatalogManifest, fetchCatalogSnapshotPage } from '../api/catalogApi';
import { applyCatalogChanges, readCatalogMeta, replaceCatalog } from '../data/catalogDatabase';
import type { CatalogProduct } from '../model/catalog.types';
import { offlineSyncStage, reportOfflineSyncFailure } from '@/src/shared/storage/offlineSyncDiagnostics';
import { registerAppReloadBlocker } from '@/src/shared/ota/appReloadLifecycle';

const PAGE_SIZE = 1000;
const MANIFEST_THROTTLE_MS = 2 * 60_000;

let pendingSync: Promise<boolean> | null = null;
registerAppReloadBlocker(() => pendingSync ? 'Дождитесь завершения загрузки данных' : null);
let lastManifestCheckAt = 0;
type ItemProgress = { itemsLoaded: number; itemsTotal: number | null };
type CatalogSyncProgress = ItemProgress & { progress: number; updating: boolean };
type ProgressListener = (status: CatalogSyncProgress) => void;
const progressListeners = new Set<ProgressListener>();
let lastProgress: CatalogSyncProgress | null = null;
function reportProgress(progress: number, updating = lastProgress?.updating ?? false, items?: ItemProgress) {
  lastProgress = { progress: Math.max(lastProgress?.progress ?? 0, progress), updating,
    itemsLoaded: items?.itemsLoaded ?? lastProgress?.itemsLoaded ?? 0,
    itemsTotal: items ? items.itemsTotal : lastProgress?.itemsTotal ?? null };
  progressListeners.forEach((listener) => {
    try { listener(lastProgress!); } catch { /* UI observers must not interrupt synchronization. */ }
  });
}

async function downloadFullCatalog(epoch: string, schemaVersion: number, revision: string, productCount: number) {
  reportProgress(0, undefined, { itemsLoaded: 0, itemsTotal: productCount });
  const products: CatalogProduct[] = [];
  let cursor: string | null = null;
  const visitedCursors = new Set<string>();
  do {
    const page = await offlineSyncStage({ stage: 'catalog.snapshot' }, () => fetchCatalogSnapshotPage({
      cursor,
      limit: PAGE_SIZE,
      snapshotRevision: revision,
      epoch,
    }));
    if (page.epoch !== epoch || page.schemaVersion !== schemaVersion || page.snapshotRevision !== revision) {
      throw new Error('Каталог изменился во время полной синхронизации');
    }
    products.push(...page.items);
    reportProgress(productCount > 0 ? Math.min(0.95, products.length / productCount) : 0.95,
      undefined, { itemsLoaded: products.length, itemsTotal: productCount });
    const nextCursor = page.hasMore ? page.nextCursor : null;
    if (nextCursor && visitedCursors.has(nextCursor)) throw new Error('Сервер повторил курсор каталога');
    if (nextCursor) visitedCursors.add(nextCursor);
    cursor = nextCursor;
  } while (cursor);
  return offlineSyncStage({ stage: 'catalog.replace' }, () => replaceCatalog({ epoch, schemaVersion, revision, products }));
}

async function downloadChanges(epoch: string, schemaVersion: number, fromRevision: string, targetRevision: string) {
  let revision = fromRevision;
  let hasMore = true;
  let itemsLoaded = 0;
  reportProgress(0, undefined, { itemsLoaded, itemsTotal: null });
  while (hasMore) {
    const page = await offlineSyncStage({ stage: 'catalog.changes' }, () => fetchCatalogChangesPage({ afterRevision: revision, limit: PAGE_SIZE, epoch }));
    if (page.epoch !== epoch || page.schemaVersion !== schemaVersion) {
      throw Object.assign(new Error('Версия каталога изменилась'), { status: 409 });
    }
    if (BigInt(page.nextRevision) < BigInt(revision) || (page.hasMore && page.nextRevision === revision)) {
      throw new Error('Сервер не продвинул ревизию каталога');
    }
    await offlineSyncStage({ stage: 'catalog.apply' }, () => applyCatalogChanges({
      epoch,
      schemaVersion,
      revision: page.nextRevision,
      changes: page.changes,
    }));
    revision = page.nextRevision;
    itemsLoaded += page.changes.length;
    const total = BigInt(targetRevision) - BigInt(fromRevision);
    reportProgress(total > 0n ? Math.min(0.95, Number((BigInt(revision) - BigInt(fromRevision)) * 1000n / total) / 1000) : 0.95,
      undefined, { itemsLoaded, itemsTotal: page.hasMore ? null : itemsLoaded });
    hasMore = page.hasMore;
  }
  return true;
}

async function performSync(force: boolean) {
  if (Platform.OS === 'web') return false;
  const now = Date.now();
  const local = await offlineSyncStage({ stage: 'catalog.read-meta' }, () => readCatalogMeta());
  if (!force && local.productCount > 0 && now - lastManifestCheckAt < MANIFEST_THROTTLE_MS) {
    return true;
  }
  const manifest = await offlineSyncStage({ stage: 'catalog.manifest' }, () => fetchCatalogManifest());
  lastManifestCheckAt = now;
  const requiresSnapshot = !local.epoch
    || local.epoch !== manifest.epoch
    || local.schemaVersion !== manifest.schemaVersion
    || BigInt(local.revision || '0') < BigInt(manifest.minAvailableRevision || '0')
    || BigInt(local.revision || '0') > BigInt(manifest.revision || '0')
    || (BigInt(local.revision || '0') === BigInt(manifest.revision || '0') && local.productCount !== manifest.productCount);
  if (requiresSnapshot) {
    reportProgress(0, !!local.epoch);
    return downloadFullCatalog(manifest.epoch, manifest.schemaVersion, manifest.revision, manifest.productCount);
  }
  if (BigInt(local.revision || '0') < BigInt(manifest.revision || '0')) {
    reportProgress(0, true);
    try {
      return await downloadChanges(manifest.epoch, manifest.schemaVersion, local.revision || '0', manifest.revision);
    } catch (error) {
      if ((error as { status?: number })?.status === 409) {
        return downloadFullCatalog(manifest.epoch, manifest.schemaVersion, manifest.revision, manifest.productCount);
      }
      throw error;
    }
  }
  return local.productCount > 0;
}

export function syncProductCatalog(options: { force?: boolean; silent?: boolean; throwOnError?: boolean; onProgress?: ProgressListener } = {}) {
  if (options.onProgress) {
    progressListeners.add(options.onProgress);
    if (lastProgress) {
      try { options.onProgress(lastProgress); } catch { /* Observer only. */ }
    }
  }
  if (!pendingSync) pendingSync = performSync(options.force === true)
    .then((result) => {
      if (result && lastProgress) reportProgress(1);
      return result;
    })
    .catch((error) => {
      reportOfflineSyncFailure(error, { stage: 'catalog.sync' });
      throw error;
    })
    .finally(() => {
      pendingSync = null;
      progressListeners.clear();
      lastProgress = null;
    });
  // Each observer chooses its error policy, including callers joining a silent
  // background job. Manual offline preparation must retain the native cause.
  return pendingSync.catch((error) => {
    if (options.throwOnError) throw error;
    if (!options.silent) console.warn('[catalog] synchronization failed', error);
    return false;
  });
}

export function scheduleProductCatalogSync() {
  void syncProductCatalog({ silent: true });
}
