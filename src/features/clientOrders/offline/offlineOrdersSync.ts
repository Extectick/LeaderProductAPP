import { Platform } from 'react-native';
import { fetchOfflineChanges, fetchOfflineManifest, fetchOfflineSnapshot, type OfflineManifestEntry } from './offlineOrdersApi';
import {
  abortOfflineEntitySnapshot,
  applyOfflineChanges,
  appendOfflineEntitySnapshot,
  beginOfflineEntitySnapshot,
  commitOfflineEntitySnapshot,
  OFFLINE_ENTITIES,
  readOfflineDatasetMeta,
  type OfflineEntity,
} from './offlineOrdersDatabase';

const PAGE_SIZE = 1000;
const THROTTLE_MS = 2 * 60_000;
const pendingByUser = new Map<string, Promise<boolean>>();
const lastCheckedAtByUser = new Map<string, number>();

async function fullSync(userId: string, remote: OfflineManifestEntry) {
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

async function deltaSync(userId: string, remote: OfflineManifestEntry, fromRevision: string) {
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
    await applyOfflineChanges(userId, {
      entity: remote.entity,
      epoch: remote.epoch,
      revision: page.nextRevision,
      schemaVersion: remote.schemaVersion,
      itemCount: remote.itemCount,
      lastSourceUpdateAt: remote.lastSourceUpdateAt,
      lastSyncedAt: new Date().toISOString(),
    }, page.changes);
    revision = page.nextRevision;
    hasMore = page.hasMore;
  }
  return true;
}

async function syncEntity(userId: string, remote: OfflineManifestEntry) {
  const local = await readOfflineDatasetMeta(userId, remote.entity);
  const requiresFull = !local
    || local.epoch !== remote.epoch
    || local.schemaVersion !== remote.schemaVersion
    || BigInt(local.revision) < BigInt(remote.minAvailableRevision)
    || BigInt(local.revision) > BigInt(remote.revision)
    || (local.revision === remote.revision && local.itemCount !== remote.itemCount);
  if (requiresFull) return fullSync(userId, remote);
  if (BigInt(local.revision) < BigInt(remote.revision)) {
    try {
      return await deltaSync(userId, remote, local.revision);
    } catch (error) {
      if ((error as { status?: number })?.status === 409) return fullSync(userId, remote);
      throw error;
    }
  }
  return true;
}

async function perform(userId: string, force: boolean) {
  if (Platform.OS === 'web') return false;
  if (!force && Date.now() - (lastCheckedAtByUser.get(userId) ?? 0) < THROTTLE_MS) return true;
  const manifest = await fetchOfflineManifest();
  if (!manifest.enabled) return false;
  lastCheckedAtByUser.set(userId, Date.now());
  const byEntity = new Map(manifest.entities.map((entry) => [entry.entity, entry]));
  // Bounded parallelism keeps memory and 1C/API pressure predictable on older phones.
  const entities = OFFLINE_ENTITIES.filter((entity) => byEntity.has(entity));
  for (let index = 0; index < entities.length; index += 3) {
    await Promise.all(entities.slice(index, index + 3).map((entity) => syncEntity(userId, byEntity.get(entity)!)));
  }
  return true;
}

export function syncOfflineOrderData(userId: string, options: { force?: boolean; silent?: boolean } = {}) {
  const existing = pendingByUser.get(userId);
  if (existing) return existing;
  const pending = perform(userId, options.force === true)
    .catch((error) => {
      if (!options.silent) console.warn('[offline-orders] synchronization failed', error);
      return false;
    })
    .finally(() => { pendingByUser.delete(userId); });
  pendingByUser.set(userId, pending);
  return pending;
}

export function scheduleOfflineOrderDataSync(userId: string) {
  void syncOfflineOrderData(userId, { silent: true });
}

export function resetOfflineOrderSyncThrottle(userId?: string) {
  if (userId) lastCheckedAtByUser.delete(userId);
  else lastCheckedAtByUser.clear();
}

export type { OfflineEntity };
