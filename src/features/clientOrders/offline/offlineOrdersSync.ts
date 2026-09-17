import { Platform } from 'react-native';
import { syncProductCatalog } from '@/src/features/productCatalog';
import { toUserErrorMessage } from '@/src/shared/errors/userErrorMessage';
import { fetchOfflineChanges, fetchOfflineManifest, fetchOfflineSnapshot, type OfflineManifestEntry } from './offlineOrdersApi';
import {
  abortOfflineEntitySnapshot,
  applyOfflineChanges,
  appendOfflineEntitySnapshot,
  beginOfflineEntitySnapshot,
  commitOfflineEntitySnapshot,
  OFFLINE_ENTITIES,
  isOfflineDataReady,
  markOfflineDataSynced,
  readOfflineDatasetMeta,
  type OfflineEntity,
} from './offlineOrdersDatabase';

const PAGE_SIZE = 1000;
const THROTTLE_MS = 2 * 60_000;
const pendingByUser = new Map<string, Promise<boolean>>();
const lastCheckedAtByUser = new Map<string, number>();
export type OfflineSyncProgress = { progress: number | null; error: string | null };
type ProgressListener = (status: OfflineSyncProgress) => void;
const progressListeners = new Map<string, Set<ProgressListener>>();
const progressByUser = new Map<string, OfflineSyncProgress>();
function report(userId: string, status: OfflineSyncProgress) {
  progressByUser.set(userId, status);
  progressListeners.get(userId)?.forEach((listener) => {
    try { listener(status); } catch { /* UI observers must not interrupt database writes. */ }
  });
}

async function fullSync(userId: string, remote: OfflineManifestEntry, progress: (value: number) => void) {
  const stagingUserId = await beginOfflineEntitySnapshot(userId, remote.entity);
  if (!stagingUserId) return false;
  let cursor: string | null = null;
  let itemCount = 0;
  const seen = new Set<string>();
  try {
    do {
      const page = await fetchOfflineSnapshot(remote.entity, { cursor, limit: PAGE_SIZE });
      if (
        page.epoch !== remote.epoch
        || page.schemaVersion !== remote.schemaVersion
        || page.snapshotRevision !== remote.revision
      ) {
        throw new Error(`Набор ${remote.entity} изменился во время загрузки`);
      }
      if (!await appendOfflineEntitySnapshot(stagingUserId, remote.entity, page.items)) {
        throw new Error(`SQLite недоступна при загрузке ${remote.entity}`);
      }
      itemCount += page.items.length;
      progress(remote.itemCount > 0 ? Math.min(0.95, itemCount / remote.itemCount) : 0.95);
      cursor = page.hasMore ? page.nextCursor : null;
      if (page.hasMore && !cursor) throw new Error(`Сервер не вернул курсор ${remote.entity}`);
      if (cursor && seen.has(cursor)) throw new Error(`Сервер повторил курсор ${remote.entity}`);
      if (cursor) seen.add(cursor);
    } while (cursor);
    if (itemCount !== remote.itemCount) {
      throw new Error(`Количество строк ${remote.entity} изменилось во время загрузки`);
    }
    const committed = await commitOfflineEntitySnapshot(userId, {
      entity: remote.entity,
      epoch: remote.epoch,
      revision: remote.revision,
      schemaVersion: remote.schemaVersion,
      itemCount,
      lastSourceUpdateAt: remote.lastSourceUpdateAt,
      lastSyncedAt: new Date().toISOString(),
    });
    if (!committed) throw new Error(`SQLite недоступна при сохранении ${remote.entity}`);
    return true;
  } catch (error) {
    await abortOfflineEntitySnapshot(userId, remote.entity).catch(() => false);
    throw error;
  }
}

async function deltaSync(userId: string, remote: OfflineManifestEntry, fromRevision: string, progress: (value: number) => void) {
  let revision = fromRevision;
  let hasMore = true;
  while (hasMore) {
    const page = await fetchOfflineChanges(remote.entity, {
      afterRevision: revision,
      epoch: remote.epoch,
      limit: PAGE_SIZE,
    });
    if (page.epoch !== remote.epoch || page.schemaVersion !== remote.schemaVersion) {
      throw new Error(`Набор ${remote.entity} изменился во время загрузки`);
    }
    if (BigInt(page.nextRevision) < BigInt(revision) || (page.hasMore && page.nextRevision === revision)) {
      throw new Error(`Сервер не продвинул ревизию ${remote.entity}`);
    }
    const applied = await applyOfflineChanges(userId, {
      entity: remote.entity,
      epoch: remote.epoch,
      revision: page.nextRevision,
      schemaVersion: remote.schemaVersion,
      itemCount: remote.itemCount,
      lastSourceUpdateAt: remote.lastSourceUpdateAt,
      lastSyncedAt: new Date().toISOString(),
    }, page.changes);
    if (!applied) throw new Error('Не удалось сохранить данные на телефон');
    revision = page.nextRevision;
    const total = BigInt(remote.revision) - BigInt(fromRevision);
    if (total > 0n) progress(Math.min(0.95, Number((BigInt(revision) - BigInt(fromRevision)) * 1000n / total) / 1000));
    hasMore = page.hasMore;
  }
  return true;
}

async function syncEntity(userId: string, remote: OfflineManifestEntry, progress: (value: number) => void) {
  const local = await readOfflineDatasetMeta(userId, remote.entity);
  const requiresFull = !local
    || local.epoch !== remote.epoch
    || local.schemaVersion !== remote.schemaVersion
    || BigInt(local.revision) < BigInt(remote.minAvailableRevision)
    || BigInt(local.revision) > BigInt(remote.revision)
    || (local.revision === remote.revision && local.itemCount !== remote.itemCount);
  if (requiresFull) return fullSync(userId, remote, progress);
  if (BigInt(local.revision) < BigInt(remote.revision)) {
    try {
      return await deltaSync(userId, remote, local.revision, progress);
    } catch (error) {
      if ((error as { status?: number })?.status === 409) return fullSync(userId, remote, progress);
      throw error;
    }
  }
  return true;
}

async function perform(userId: string, force: boolean) {
  if (Platform.OS === 'web') return false;
  if (!force && Date.now() - (lastCheckedAtByUser.get(userId) ?? 0) < THROTTLE_MS) return true;
  const manifest = await fetchOfflineManifest();
  if (!manifest.enabled) throw new Error('Офлайн-загрузка пока недоступна на сервере');
  const byEntity = new Map(manifest.entities.map((entry) => [entry.entity, entry]));
  if (OFFLINE_ENTITIES.some((entity) => {
    const entry = byEntity.get(entity);
    return !entry || (entry.revision === '0' && !entry.lastSourceUpdateAt && !entry.lastFullReconcileAt);
  })) throw new Error('Офлайн-данные ещё не подготовлены на сервере. Попробуйте позже');

  // Include the existing product catalog downloader in manual offline preparation.
  const completed = new Map<string, number>();
  const progress = (entity: string, value: number) => {
    completed.set(entity, Math.max(completed.get(entity) ?? 0, value));
    report(userId, { progress: Math.min(0.99, [...completed.values()].reduce((sum, part) => sum + part, 0) / (OFFLINE_ENTITIES.length + 1)), error: null });
  };
  // The catalog downloader has its own single-flight queue; keep the strip
  // indeterminate while waiting for it, then report committed dataset progress.
  if (!await syncProductCatalog({ force, silent: true })) throw new Error('Не удалось загрузить номенклатуру на телефон');
  progress('catalog', 1);
  // Bounded parallelism keeps memory and 1C/API pressure predictable on older phones.
  const entities = OFFLINE_ENTITIES.filter((entity) => byEntity.has(entity));
  for (let index = 0; index < entities.length; index += 3) {
    // Drain the whole batch before releasing the single-flight lock after an error.
    const results = await Promise.allSettled(entities.slice(index, index + 3).map(async (entity) => {
      if (!await syncEntity(userId, byEntity.get(entity)!, (value) => progress(entity, value))) {
        throw new Error('Не удалось сохранить данные на телефон');
      }
      progress(entity, 1);
    }));
    for (const result of results) if (result.status === 'rejected') throw result.reason;
  }
  if (!await isOfflineDataReady(userId)) throw new Error('Недостаточно данных для офлайн-работы. Попробуйте позже');
  if (!await markOfflineDataSynced(userId)) throw new Error('Не удалось сохранить время синхронизации');
  lastCheckedAtByUser.set(userId, Date.now());
  return true;
}

export function syncOfflineOrderData(userId: string, options: { force?: boolean; silent?: boolean; onProgress?: ProgressListener } = {}) {
  if (options.onProgress) {
    if (!progressListeners.has(userId)) progressListeners.set(userId, new Set());
    progressListeners.get(userId)!.add(options.onProgress);
    try { options.onProgress(progressByUser.get(userId) ?? { progress: null, error: null }); } catch { /* Observer only. */ }
  }
  const existing = pendingByUser.get(userId);
  if (existing) return existing;
  report(userId, { progress: null, error: null });
  const pending = perform(userId, options.force === true)
    .then((result) => {
      if (result) report(userId, { progress: 1, error: null });
      return result;
    })
    .catch((error) => {
      report(userId, { progress: null, error: toUserErrorMessage(error, 'Не удалось обновить данные. Нажмите, чтобы повторить') });
      if (!options.silent) console.warn('[offline-orders] synchronization failed', error);
      return false;
    })
    .finally(() => {
      pendingByUser.delete(userId);
      progressListeners.delete(userId);
      progressByUser.delete(userId);
    });
  pendingByUser.set(userId, pending);
  return pending;
}

export function scheduleOfflineOrderDataSync(userId: string) {
  void syncOfflineOrderData(userId, { silent: true });
}

export function isOfflineOrderDataSyncing(userId: string) {
  return pendingByUser.has(userId);
}

export function resetOfflineOrderSyncThrottle(userId?: string) {
  if (userId) lastCheckedAtByUser.delete(userId);
  else lastCheckedAtByUser.clear();
}

export type { OfflineEntity };
