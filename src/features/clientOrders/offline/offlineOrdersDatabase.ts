import type { SQLiteDatabase } from 'expo-sqlite';
import { getCatalogDatabase } from '@/src/features/productCatalog/data/catalogDatabase';

export const OFFLINE_ENTITIES = [
  'organizations',
  'warehouses',
  'counterparties',
  'agreements',
  'contracts',
  'delivery-addresses',
  'price-types',
  'order-options',
  'selling-prices',
  'stock',
  'manager-stock',
] as const;

export type OfflineEntity = typeof OFFLINE_ENTITIES[number];
export type OfflineDraftStatus =
  | 'ON_DEVICE'
  | 'READY_TO_SEND'
  | 'PRICE_REVIEW'
  | 'NEEDS_EDIT'
  | 'SENDING'
  | 'SEND_ERROR';

export type StoredOfflineDraft = {
  id: string;
  clientOrderId: string;
  clientRevision: number;
  status: OfflineDraftStatus;
  intent: 'SAVE' | 'SUBMIT';
  serverGuid: string | null;
  serverRevision: number | null;
  order: any;
  payload: any;
  createdAt: string;
  updatedAt: string;
  lastSendError: string | null;
};

export type OfflineDatasetMeta = {
  entity: OfflineEntity;
  epoch: string;
  revision: string;
  schemaVersion: number;
  itemCount: number;
  lastSourceUpdateAt: string | null;
  lastSyncedAt: string | null;
};

const text = (value: unknown) => value === null || value === undefined ? null : String(value);
const number = (value: unknown, fallback = 0) => {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
};

function nestedGuid(item: any, field: string, fallback?: string) {
  return text(item?.[field]?.guid ?? item?.[fallback ?? `${field}Guid`]);
}

export function offlineItemKey(entity: OfflineEntity, item: any) {
  if (entity === 'selling-prices') return text(item?.syncKey) || '';
  if (entity === 'manager-stock') return text(item?.syncKey) || '';
  if (entity === 'stock') {
    return `${nestedGuid(item, 'product') ?? ''}|${nestedGuid(item, 'warehouse') ?? ''}|${nestedGuid(item, 'organization') ?? ''}|${text(item?.seriesGuid) ?? ''}`;
  }
  return text(item?.guid) || '';
}

async function setMeta(db: SQLiteDatabase, userId: string, meta: OfflineDatasetMeta) {
  await db.runAsync(`
    INSERT INTO offline_dataset_meta(
      user_id, entity, epoch, revision, schema_version, item_count,
      last_source_update_at, last_synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, entity) DO UPDATE SET
      epoch=excluded.epoch,
      revision=excluded.revision,
      schema_version=excluded.schema_version,
      item_count=excluded.item_count,
      last_source_update_at=excluded.last_source_update_at,
      last_synced_at=excluded.last_synced_at
  `, userId, meta.entity, meta.epoch, meta.revision, meta.schemaVersion, meta.itemCount,
  meta.lastSourceUpdateAt, meta.lastSyncedAt);
}

async function upsertEntityItem(db: SQLiteDatabase, userId: string, entity: OfflineEntity, item: any) {
  const itemKey = offlineItemKey(entity, item);
  if (!itemKey) return;
  await db.runAsync(`
    INSERT INTO offline_entities(user_id, entity, item_key, payload_json, source_updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, entity, item_key) DO UPDATE SET
      payload_json=excluded.payload_json,
      source_updated_at=excluded.source_updated_at
  `, userId, entity, itemKey, JSON.stringify(item), text(item?.sourceUpdatedAt));

  if (entity === 'selling-prices') {
    await db.runAsync(`
      INSERT INTO offline_selling_prices(
        user_id, item_key, product_guid, price_type_guid, price, currency,
        package_guid, min_qty, priority, source_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, item_key) DO UPDATE SET
        product_guid=excluded.product_guid,
        price_type_guid=excluded.price_type_guid,
        price=excluded.price,
        currency=excluded.currency,
        package_guid=excluded.package_guid,
        min_qty=excluded.min_qty,
        priority=excluded.priority,
        source_updated_at=excluded.source_updated_at
    `, userId, itemKey, nestedGuid(item, 'product'), nestedGuid(item, 'priceType'), number(item?.price),
    text(item?.currency), text(item?.packageGuid), item?.minQty == null ? null : number(item.minQty),
    number(item?.priority), text(item?.sourceUpdatedAt));
  }

  if (entity === 'stock') {
    await db.runAsync(`
      INSERT INTO offline_stock(
        user_id, item_key, product_guid, warehouse_guid, organization_guid,
        quantity, free_available, own_reserve, available, receipt_price, source_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, item_key) DO UPDATE SET
        product_guid=excluded.product_guid,
        warehouse_guid=excluded.warehouse_guid,
        organization_guid=excluded.organization_guid,
        quantity=excluded.quantity,
        free_available=excluded.free_available,
        own_reserve=excluded.own_reserve,
        available=excluded.available,
        receipt_price=excluded.receipt_price,
        source_updated_at=excluded.source_updated_at
    `, userId, itemKey, nestedGuid(item, 'product'), nestedGuid(item, 'warehouse'), nestedGuid(item, 'organization'),
    number(item?.quantity), number(item?.freeAvailable), number(item?.ownReserve), number(item?.available),
    item?.receiptPrice == null ? null : number(item.receiptPrice), text(item?.sourceUpdatedAt ?? item?.updatedAt));
  }

  if (entity === 'manager-stock') {
    await db.runAsync(`
      INSERT INTO offline_manager_stock(
        user_id, item_key, product_guid, warehouse_guid, organization_guid, reserved, source_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, item_key) DO UPDATE SET
        product_guid=excluded.product_guid,
        warehouse_guid=excluded.warehouse_guid,
        organization_guid=excluded.organization_guid,
        reserved=excluded.reserved,
        source_updated_at=excluded.source_updated_at
    `, userId, itemKey, nestedGuid(item, 'product'), nestedGuid(item, 'warehouse'), nestedGuid(item, 'organization'),
    number(item?.reserved), text(item?.sourceUpdatedAt));
  }
}

async function deleteEntityItem(db: SQLiteDatabase, userId: string, entity: OfflineEntity, itemKey: string) {
  await db.runAsync('DELETE FROM offline_entities WHERE user_id = ? AND entity = ? AND item_key = ?', userId, entity, itemKey);
  if (entity === 'selling-prices') {
    await db.runAsync('DELETE FROM offline_selling_prices WHERE user_id = ? AND item_key = ?', userId, itemKey);
  } else if (entity === 'stock') {
    await db.runAsync('DELETE FROM offline_stock WHERE user_id = ? AND item_key = ?', userId, itemKey);
  } else if (entity === 'manager-stock') {
    await db.runAsync('DELETE FROM offline_manager_stock WHERE user_id = ? AND item_key = ?', userId, itemKey);
  }
}

export async function replaceOfflineEntity(
  userId: string,
  meta: OfflineDatasetMeta,
  items: any[]
) {
  const db = await getCatalogDatabase();
  if (!db) return false;
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('DELETE FROM offline_entities WHERE user_id = ? AND entity = ?', userId, meta.entity);
    if (meta.entity === 'selling-prices') {
      await tx.runAsync('DELETE FROM offline_selling_prices WHERE user_id = ?', userId);
    } else if (meta.entity === 'stock') {
      await tx.runAsync('DELETE FROM offline_stock WHERE user_id = ?', userId);
    } else if (meta.entity === 'manager-stock') {
      await tx.runAsync('DELETE FROM offline_manager_stock WHERE user_id = ?', userId);
    }
    for (const item of items) await upsertEntityItem(tx, userId, meta.entity, item);
    await setMeta(tx, userId, { ...meta, itemCount: items.length, lastSyncedAt: new Date().toISOString() });
    await tx.runAsync(
      `INSERT INTO catalog_meta(key, value) VALUES ('offlineActiveUserId', ?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      userId
    );
  });
  return true;
}

function snapshotUserId(userId: string, entity: OfflineEntity) {
  return `${userId}::offline-snapshot::${entity}`;
}

async function clearEntityRows(db: SQLiteDatabase, userId: string, entity: OfflineEntity) {
  await db.runAsync('DELETE FROM offline_entities WHERE user_id = ? AND entity = ?', userId, entity);
  if (entity === 'selling-prices') {
    await db.runAsync('DELETE FROM offline_selling_prices WHERE user_id = ?', userId);
  } else if (entity === 'stock') {
    await db.runAsync('DELETE FROM offline_stock WHERE user_id = ?', userId);
  } else if (entity === 'manager-stock') {
    await db.runAsync('DELETE FROM offline_manager_stock WHERE user_id = ?', userId);
  }
}

export async function beginOfflineEntitySnapshot(userId: string, entity: OfflineEntity) {
  const db = await getCatalogDatabase();
  if (!db) return null;
  const stagingUserId = snapshotUserId(userId, entity);
  await db.withExclusiveTransactionAsync(async (tx) => {
    await clearEntityRows(tx, stagingUserId, entity);
  });
  return stagingUserId;
}

export async function appendOfflineEntitySnapshot(
  stagingUserId: string,
  entity: OfflineEntity,
  items: any[]
) {
  const db = await getCatalogDatabase();
  if (!db) return false;
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const item of items) await upsertEntityItem(tx, stagingUserId, entity, item);
  });
  return true;
}

export async function abortOfflineEntitySnapshot(userId: string, entity: OfflineEntity) {
  const db = await getCatalogDatabase();
  if (!db) return false;
  await db.withExclusiveTransactionAsync(async (tx) => {
    await clearEntityRows(tx, snapshotUserId(userId, entity), entity);
  });
  return true;
}

export async function commitOfflineEntitySnapshot(
  userId: string,
  meta: OfflineDatasetMeta
) {
  const db = await getCatalogDatabase();
  if (!db) return false;
  const stagingUserId = snapshotUserId(userId, meta.entity);
  await db.withExclusiveTransactionAsync(async (tx) => {
    const staged = await tx.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM offline_entities WHERE user_id = ? AND entity = ?',
      stagingUserId,
      meta.entity
    );
    await clearEntityRows(tx, userId, meta.entity);
    await tx.runAsync(
      'UPDATE offline_entities SET user_id = ? WHERE user_id = ? AND entity = ?',
      userId,
      stagingUserId,
      meta.entity
    );
    if (meta.entity === 'selling-prices') {
      await tx.runAsync('UPDATE offline_selling_prices SET user_id = ? WHERE user_id = ?', userId, stagingUserId);
    } else if (meta.entity === 'stock') {
      await tx.runAsync('UPDATE offline_stock SET user_id = ? WHERE user_id = ?', userId, stagingUserId);
    } else if (meta.entity === 'manager-stock') {
      await tx.runAsync('UPDATE offline_manager_stock SET user_id = ? WHERE user_id = ?', userId, stagingUserId);
    }
    await setMeta(tx, userId, {
      ...meta,
      itemCount: number(staged?.count),
      lastSyncedAt: new Date().toISOString(),
    });
    await tx.runAsync(
      `INSERT INTO catalog_meta(key, value) VALUES ('offlineActiveUserId', ?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      userId
    );
  });
  return true;
}

export async function applyOfflineChanges(
  userId: string,
  meta: OfflineDatasetMeta,
  changes: Array<{ itemKey: string; operation: 'UPSERT' | 'DELETE'; item: any | null }>
) {
  const db = await getCatalogDatabase();
  if (!db) return false;
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const change of changes) {
      if (change.operation === 'DELETE' || !change.item) {
        await deleteEntityItem(tx, userId, meta.entity, change.itemKey);
      } else {
        await upsertEntityItem(tx, userId, meta.entity, change.item);
      }
    }
    const row = await tx.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM offline_entities WHERE user_id = ? AND entity = ?',
      userId,
      meta.entity
    );
    await setMeta(tx, userId, { ...meta, itemCount: number(row?.count), lastSyncedAt: new Date().toISOString() });
  });
  return true;
}

export async function readOfflineDatasetMeta(userId: string, entity: OfflineEntity) {
  const db = await getCatalogDatabase();
  if (!db) return null;
  const row = await db.getFirstAsync<any>(
    'SELECT * FROM offline_dataset_meta WHERE user_id = ? AND entity = ?', userId, entity
  );
  if (!row) return null;
  return {
    entity,
    epoch: row.epoch,
    revision: row.revision,
    schemaVersion: number(row.schema_version),
    itemCount: number(row.item_count),
    lastSourceUpdateAt: row.last_source_update_at,
    lastSyncedAt: row.last_synced_at,
  } satisfies OfflineDatasetMeta;
}

export async function readOfflineEntityItems<T = any>(userId: string, entity: OfflineEntity): Promise<T[]> {
  const db = await getCatalogDatabase();
  if (!db) return [];
  const rows = await db.getAllAsync<{ payload_json: string }>(
    'SELECT payload_json FROM offline_entities WHERE user_id = ? AND entity = ? ORDER BY item_key',
    userId,
    entity
  );
  return rows.flatMap((row) => {
    try { return [JSON.parse(row.payload_json) as T]; } catch { return []; }
  });
}

export async function readActiveOfflineEntityItems<T = any>(entity: OfflineEntity): Promise<T[]> {
  const db = await getCatalogDatabase();
  if (!db) return [];
  const active = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM catalog_meta WHERE key = 'offlineActiveUserId'"
  );
  return active?.value ? readOfflineEntityItems<T>(active.value, entity) : [];
}

export async function hasActiveOfflineEntity(entity: OfflineEntity) {
  const db = await getCatalogDatabase();
  if (!db) return false;
  const active = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM catalog_meta WHERE key = 'offlineActiveUserId'"
  );
  if (!active?.value) return false;
  const meta = await db.getFirstAsync<{ entity: string }>(
    'SELECT entity FROM offline_dataset_meta WHERE user_id = ? AND entity = ?',
    active.value,
    entity
  );
  return !!meta;
}

export async function isOfflineDataReady(userId: string) {
  const db = await getCatalogDatabase();
  if (!db) return false;
  const [metas, productCount] = await Promise.all([
    Promise.all(OFFLINE_ENTITIES.map((entity) => readOfflineDatasetMeta(userId, entity))),
    db.getFirstAsync<{ value: string }>("SELECT value FROM catalog_meta WHERE key = 'productCount'"),
  ]);
  const byEntity = new Map(metas.filter(Boolean).map((meta) => [meta!.entity, meta!]));
  return Boolean(
    metas.every(Boolean)
    && (byEntity.get('organizations')?.itemCount ?? 0) > 0
    && (byEntity.get('warehouses')?.itemCount ?? 0) > 0
    && number(productCount?.value) > 0
  );
}

export async function readOfflineDrafts(userId: string): Promise<StoredOfflineDraft[]> {
  const db = await getCatalogDatabase();
  if (!db) return [];
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM offline_drafts WHERE user_id = ? ORDER BY updated_at DESC', userId
  );
  return rows.flatMap((row) => {
    try {
      return [{
        id: row.id,
        clientOrderId: row.client_order_id,
        clientRevision: number(row.client_revision, 1),
        status: row.status,
        intent: row.intent,
        serverGuid: row.server_guid,
        serverRevision: row.server_revision == null ? null : number(row.server_revision),
        order: JSON.parse(row.order_json),
        payload: JSON.parse(row.payload_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastSendError: row.last_send_error,
      } as StoredOfflineDraft];
    } catch { return []; }
  });
}

export async function upsertOfflineDraft(userId: string, draft: StoredOfflineDraft) {
  const db = await getCatalogDatabase();
  if (!db) return false;
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(`
      INSERT INTO offline_drafts(
        user_id, id, client_order_id, client_revision, status, intent,
        server_guid, server_revision, order_json, payload_json,
        created_at, updated_at, last_send_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, id) DO UPDATE SET
        client_order_id=excluded.client_order_id,
        client_revision=excluded.client_revision,
        status=excluded.status,
        intent=excluded.intent,
        server_guid=excluded.server_guid,
        server_revision=excluded.server_revision,
        order_json=excluded.order_json,
        payload_json=excluded.payload_json,
        updated_at=excluded.updated_at,
        last_send_error=excluded.last_send_error
    `, userId, draft.id, draft.clientOrderId, draft.clientRevision, draft.status, draft.intent,
    draft.serverGuid, draft.serverRevision, JSON.stringify(draft.order), JSON.stringify(draft.payload),
    draft.createdAt, draft.updatedAt, draft.lastSendError);
    await tx.runAsync('DELETE FROM offline_draft_lines WHERE user_id = ? AND draft_id = ?', userId, draft.id);
    const items = Array.isArray(draft.payload?.items) ? draft.payload.items : [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      await tx.runAsync(`
        INSERT INTO offline_draft_lines(user_id, draft_id, line_guid, product_guid, payload_json)
        VALUES (?, ?, ?, ?, ?)
      `, userId, draft.id, text(item?.lineGuid) || `line-${index}`, text(item?.productGuid) || '', JSON.stringify(item));
    }
  });
  return true;
}

export async function deleteOfflineDraft(userId: string, id: string) {
  const db = await getCatalogDatabase();
  if (!db) return false;
  await db.runAsync('DELETE FROM offline_drafts WHERE user_id = ? AND id = ?', userId, id);
  return true;
}

export async function replaceOfflineDrafts(userId: string, drafts: StoredOfflineDraft[]) {
  const db = await getCatalogDatabase();
  if (!db) return false;
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('DELETE FROM offline_drafts WHERE user_id = ?', userId);
    for (const draft of drafts) {
      await tx.runAsync(`
        INSERT INTO offline_drafts(
          user_id, id, client_order_id, client_revision, status, intent,
          server_guid, server_revision, order_json, payload_json,
          created_at, updated_at, last_send_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, userId, draft.id, draft.clientOrderId, draft.clientRevision, draft.status, draft.intent,
      draft.serverGuid, draft.serverRevision, JSON.stringify(draft.order), JSON.stringify(draft.payload),
      draft.createdAt, draft.updatedAt, draft.lastSendError);
      const items = Array.isArray(draft.payload?.items) ? draft.payload.items : [];
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        await tx.runAsync(
          'INSERT INTO offline_draft_lines(user_id, draft_id, line_guid, product_guid, payload_json) VALUES (?, ?, ?, ?, ?)',
          userId, draft.id, text(item?.lineGuid) || `line-${index}`, text(item?.productGuid) || '', JSON.stringify(item)
        );
      }
    }
  });
  return true;
}
