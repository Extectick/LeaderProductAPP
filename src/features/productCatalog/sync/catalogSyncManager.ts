import { Platform } from 'react-native';
import { fetchCatalogChangesPage, fetchCatalogManifest, fetchCatalogSnapshotPage } from '../api/catalogApi';
import { applyCatalogChanges, readCatalogMeta, replaceCatalog } from '../data/catalogDatabase';
import type { CatalogProduct } from '../model/catalog.types';

const PAGE_SIZE = 1000;
const MANIFEST_THROTTLE_MS = 2 * 60_000;

let pendingSync: Promise<boolean> | null = null;
let lastManifestCheckAt = 0;

async function downloadFullCatalog(epoch: string, schemaVersion: number, revision: string) {
  const products: CatalogProduct[] = [];
  let cursor: string | null = null;
  const visitedCursors = new Set<string>();
  do {
    const page = await fetchCatalogSnapshotPage({
      cursor,
      limit: PAGE_SIZE,
      snapshotRevision: revision,
      epoch,
    });
    if (page.epoch !== epoch || page.schemaVersion !== schemaVersion || page.snapshotRevision !== revision) {
      throw new Error('Каталог изменился во время полной синхронизации');
    }
    products.push(...page.items);
    const nextCursor = page.hasMore ? page.nextCursor : null;
    if (nextCursor && visitedCursors.has(nextCursor)) throw new Error('Сервер повторил курсор каталога');
    if (nextCursor) visitedCursors.add(nextCursor);
    cursor = nextCursor;
  } while (cursor);
  return replaceCatalog({ epoch, schemaVersion, revision, products });
}

async function downloadChanges(epoch: string, schemaVersion: number, fromRevision: string) {
  let revision = fromRevision;
  let hasMore = true;
  while (hasMore) {
    const page = await fetchCatalogChangesPage({ afterRevision: revision, limit: PAGE_SIZE, epoch });
    if (page.epoch !== epoch || page.schemaVersion !== schemaVersion) {
      throw Object.assign(new Error('Версия каталога изменилась'), { status: 409 });
    }
    if (BigInt(page.nextRevision) < BigInt(revision) || (page.hasMore && page.nextRevision === revision)) {
      throw new Error('Сервер не продвинул ревизию каталога');
    }
    await applyCatalogChanges({
      epoch,
      schemaVersion,
      revision: page.nextRevision,
      changes: page.changes,
    });
    revision = page.nextRevision;
    hasMore = page.hasMore;
  }
  return true;
}

async function performSync(force: boolean) {
  if (Platform.OS === 'web') return false;
  const now = Date.now();
  const local = await readCatalogMeta();
  if (!force && local.productCount > 0 && now - lastManifestCheckAt < MANIFEST_THROTTLE_MS) return true;
  const manifest = await fetchCatalogManifest();
  lastManifestCheckAt = now;
  const requiresSnapshot = !local.epoch
    || local.epoch !== manifest.epoch
    || local.schemaVersion !== manifest.schemaVersion
    || BigInt(local.revision || '0') < BigInt(manifest.minAvailableRevision || '0')
    || BigInt(local.revision || '0') > BigInt(manifest.revision || '0')
    || (BigInt(local.revision || '0') === BigInt(manifest.revision || '0') && local.productCount !== manifest.productCount);
  if (requiresSnapshot) {
    return downloadFullCatalog(manifest.epoch, manifest.schemaVersion, manifest.revision);
  }
  if (BigInt(local.revision || '0') < BigInt(manifest.revision || '0')) {
    try {
      return await downloadChanges(manifest.epoch, manifest.schemaVersion, local.revision || '0');
    } catch (error) {
      if ((error as { status?: number })?.status === 409) {
        return downloadFullCatalog(manifest.epoch, manifest.schemaVersion, manifest.revision);
      }
      throw error;
    }
  }
  return local.productCount > 0;
}

export function syncProductCatalog(options: { force?: boolean; silent?: boolean } = {}) {
  if (pendingSync) return pendingSync;
  pendingSync = performSync(options.force === true)
    .catch((error) => {
      if (!options.silent) console.warn('[catalog] synchronization failed', error);
      return false;
    })
    .finally(() => {
      pendingSync = null;
    });
  return pendingSync;
}

export function scheduleProductCatalogSync() {
  void syncProductCatalog({ silent: true });
}
