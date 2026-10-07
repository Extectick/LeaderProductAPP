import { Platform } from 'react-native';
import { registerAppReloadBlocker } from '@/src/shared/ota/appReloadLifecycle';
import { offlineSyncStage, reportOfflineSyncFailure } from '@/src/shared/storage/offlineSyncDiagnostics';
import { syncProductCatalog } from '@/src/features/productCatalog';
import { OfflineSyncError, offlineSyncErrorMessage } from './offlineSyncError';
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
  refreshOfflineDatasetMeta,
  readOfflineDatasetMeta,
  type OfflineEntity,
} from './offlineOrdersDatabase';

const PAGE_SIZE = 1000;
const THROTTLE_MS = 2 * 60_000;
const pendingByUser = new Map<string, Promise<boolean>>();
registerAppReloadBlocker(() => pendingByUser.size ? 'Дождитесь завершения загрузки данных' : null);
const lastCheckedAtByUser = new Map<string, number>();
export type OfflineSyncTransfer = {
  entity: 'catalog' | OfflineEntity | null;
  updating: boolean;
  completed: number;
  total: number;
  itemsLoaded?: number;
  itemsTotal?: number | null;
};
type ItemProgress = { itemsLoaded: number; itemsTotal: number | null };
type EntityProgress = (value: number, items: ItemProgress) => void;
export type OfflineSyncProgress = { progress: number | null; error: string | null; transfer?: OfflineSyncTransfer };
const initialProgress = (): OfflineSyncProgress => ({
  progress: null, error: null,
  transfer: { entity: null, updating: false, completed: 0, total: OFFLINE_ENTITIES.length + 1 },
});
type ProgressListener = (status: OfflineSyncProgress) => void;
const progressListeners = new Map<string, Set<ProgressListener>>();
const progressByUser = new Map<string, OfflineSyncProgress>();
function report(userId: string, status: OfflineSyncProgress) {
  progressByUser.set(userId, status);
  progressListeners.get(userId)?.forEach((listener) => {
    try { listener(status); } catch { /* UI observers must not interrupt database writes. */ }
  });
}

async function fullSync(userId: string, remote: OfflineManifestEntry, progress: EntityProgress) {
  progress(0, { itemsLoaded: 0, itemsTotal: remote.itemCount });
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
      progress(remote.itemCount > 0 ? Math.min(0.95, itemCount / remote.itemCount) : 0.95,
        { itemsLoaded: itemCount, itemsTotal: remote.itemCount });
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

async function deltaSync(userId: string, remote: OfflineManifestEntry, fromRevision: string, progress: EntityProgress) {
  let revision = fromRevision;
  let hasMore = true;
  let itemsLoaded = 0;
  progress(0, { itemsLoaded, itemsTotal: null });
  while (hasMore) {
    const page = await fetchOfflineChanges(remote.entity, {
      afterRevision: revision,
      untilRevision: remote.revision,
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
    itemsLoaded += page.changes.length;
    const total = BigInt(remote.revision) - BigInt(fromRevision);
    // A revision gap is not a row count (it includes other users' changes).
    // The changes endpoint reveals the exact transfer size only on its last page.
    progress(total > 0n ? Math.min(0.95, Number((BigInt(revision) - BigInt(fromRevision)) * 1000n / total) / 1000) : 0.95,
      { itemsLoaded, itemsTotal: page.hasMore ? null : itemsLoaded });
    hasMore = page.hasMore;
  }
  return true;
}

async function syncEntity(userId: string, remote: OfflineManifestEntry, progress: EntityProgress, start: (updating: boolean) => void) {
  const local = await readOfflineDatasetMeta(userId, remote.entity);
  const requiresFull = !local
    || local.epoch !== remote.epoch
    || local.schemaVersion !== remote.schemaVersion
    || BigInt(local.revision) < BigInt(remote.minAvailableRevision)
    || BigInt(local.revision) > BigInt(remote.revision)
    || (local.revision === remote.revision && local.itemCount !== remote.itemCount);
  if (requiresFull) {
    start(!!local);
    return fullSync(userId, remote, progress);
  }
  if (BigInt(local.revision) < BigInt(remote.revision)) {
    start(true);
    try {
      return await deltaSync(userId, remote, local.revision, progress);
    } catch (error) {
      if ((error as { status?: number })?.status === 409) return fullSync(userId, remote, progress);
      throw error;
    }
  }
  // A version check is not a download. Refresh metadata without touching rows.
  await refreshOfflineDatasetMeta(userId, { ...local, lastSourceUpdateAt: remote.lastSourceUpdateAt,
    lastSyncedAt: new Date().toISOString() });
  return true;
}

async function perform(userId: string, force: boolean) {
  if (Platform.OS === 'web') return false;
  if (!force && Date.now() - (lastCheckedAtByUser.get(userId) ?? 0) < THROTTLE_MS) return true;
  const manifest = await fetchOfflineManifest();
  if (!manifest.enabled) throw new OfflineSyncError('Офлайн-загрузка пока недоступна на сервере');
  const byEntity = new Map(manifest.entities.map((entry) => [entry.entity, entry]));
  if (OFFLINE_ENTITIES.some((entity) => {
    const entry = byEntity.get(entity);
    return !entry || (entry.revision === '0' && !entry.lastSourceUpdateAt && !entry.lastFullReconcileAt);
  })) throw new OfflineSyncError('Офлайн-данные ещё не подготовлены на сервере. Попробуйте позже');

  // Include the existing product catalog downloader in manual offline preparation.
  const order = ['catalog', ...OFFLINE_ENTITIES] as const;
  const completed = new Map<typeof order[number], number>();
  const active = new Map<typeof order[number], boolean>();
  const itemProgress = new Map<typeof order[number], ItemProgress>();
  const notifyProgress = () => {
    // Keep the first active dataset in display order; parallel page responses
    // must not cause the label to jump between directories.
    const entity = order.find((name) => active.has(name)) ?? null;
    report(userId, {
      progress: Math.min(0.99, [...completed.values()].reduce((sum, part) => sum + part, 0) / order.length),
      error: null,
      transfer: { entity, updating: entity ? active.get(entity)! : false,
        ...(entity ? itemProgress.get(entity) : undefined),
        completed: [...completed.values()].filter((part) => part === 1).length, total: order.length },
    });
  };
  const start = (entity: typeof order[number], updating: boolean) => {
    active.set(entity, updating);
    notifyProgress();
  };
  const progress = (entity: typeof order[number], value: number, items?: ItemProgress) => {
    if (items) itemProgress.set(entity, items);
    completed.set(entity, Math.max(completed.get(entity) ?? 0, value));
    if (value === 1) active.delete(entity);
    notifyProgress();
  };
  // Joining a background catalog job also subscribes to its page progress.
  if (!await syncProductCatalog({ force, silent: true, throwOnError: true, onProgress: (status) => {
    if (status.progress < 1) active.set('catalog', status.updating);
    progress('catalog', Math.min(0.95, status.progress), { itemsLoaded: status.itemsLoaded, itemsTotal: status.itemsTotal });
  } })) throw new Error('Не удалось загрузить номенклатуру на телефон');
  progress('catalog', 1);
  // Bounded parallelism keeps memory and 1C/API pressure predictable on older phones.
  const entities = OFFLINE_ENTITIES.filter((entity) => byEntity.has(entity));
  for (let index = 0; index < entities.length; index += 3) {
    // Drain the whole batch before releasing the single-flight lock after an error.
    const results = await Promise.allSettled(entities.slice(index, index + 3).map(async (entity) => {
      if (!await offlineSyncStage({ stage: 'offline.entity', entity }, () => syncEntity(userId, byEntity.get(entity)!, (value, items) => progress(entity, value, items), (updating) => start(entity, updating)))) {
        throw new Error('Не удалось сохранить данные на телефон');
      }
      progress(entity, 1);
    }));
    for (const result of results) if (result.status === 'rejected') throw result.reason;
  }
  if (!await isOfflineDataReady(userId)) throw new OfflineSyncError('Недостаточно данных для офлайн-работы. Попробуйте позже');
  if (!await markOfflineDataSynced(userId)) throw new Error('Не удалось сохранить время синхронизации');
  lastCheckedAtByUser.set(userId, Date.now());
  return true;
}

export function syncOfflineOrderData(userId: string, options: { force?: boolean; silent?: boolean; onProgress?: ProgressListener } = {}) {
  if (options.onProgress) {
    if (!progressListeners.has(userId)) progressListeners.set(userId, new Set());
    progressListeners.get(userId)!.add(options.onProgress);
    try { options.onProgress(progressByUser.get(userId) ?? initialProgress()); } catch { /* Observer only. */ }
  }
  const existing = pendingByUser.get(userId);
  if (existing) return existing;
  report(userId, initialProgress());
  const pending = perform(userId, options.force === true)
    .then((result) => {
      if (result) report(userId, { progress: 1, error: null,
        transfer: { entity: null, updating: false, completed: OFFLINE_ENTITIES.length + 1, total: OFFLINE_ENTITIES.length + 1 } });
      return result;
    })
    .catch((error) => {
      reportOfflineSyncFailure(error, { stage: 'offline.sync' });
      report(userId, { progress: null, error: offlineSyncErrorMessage(error) });
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
