import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import type { ClientOrderProduct } from '@/utils/clientOrdersService';
import type { CatalogChange, CatalogProduct, CatalogSearchResult } from '../model/catalog.types';

const DATABASE_NAME = 'leader-product-catalog.db';
const DATABASE_VERSION = 3;

type CatalogMeta = {
  epoch: string | null;
  revision: string;
  schemaVersion: number;
  productCount: number;
  lastSyncedAt: string | null;
};

let databasePromise: Promise<SQLite.SQLiteDatabase | null> | null = null;

function serialize(value: unknown) {
  return JSON.stringify(value ?? null);
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function migrate(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS catalog_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS catalog_products (
      guid TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      code TEXT,
      article TEXT,
      sku TEXT,
      is_weight INTEGER NOT NULL DEFAULT 0,
      is_service INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      group_json TEXT,
      base_unit_json TEXT,
      packages_json TEXT NOT NULL DEFAULT '[]',
      image_hash TEXT,
      revision TEXT NOT NULL DEFAULT '0',
      source_updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS catalog_products_name_idx ON catalog_products(name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS catalog_products_code_idx ON catalog_products(code COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS catalog_products_article_idx ON catalog_products(article COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS catalog_products_sku_idx ON catalog_products(sku COLLATE NOCASE);
    CREATE VIRTUAL TABLE IF NOT EXISTS catalog_products_fts USING fts5(
      guid UNINDEXED,
      name,
      code,
      article,
      sku,
      barcodes,
      tokenize='unicode61 remove_diacritics 2'
    );
    CREATE TABLE IF NOT EXISTS offline_dataset_meta (
      user_id TEXT NOT NULL,
      entity TEXT NOT NULL,
      epoch TEXT NOT NULL,
      revision TEXT NOT NULL DEFAULT '0',
      schema_version INTEGER NOT NULL DEFAULT 1,
      item_count INTEGER NOT NULL DEFAULT 0,
      last_source_update_at TEXT,
      last_synced_at TEXT,
      PRIMARY KEY(user_id, entity)
    );
    CREATE TABLE IF NOT EXISTS offline_entities (
      user_id TEXT NOT NULL,
      entity TEXT NOT NULL,
      item_key TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      source_updated_at TEXT,
      PRIMARY KEY(user_id, entity, item_key)
    );
    CREATE INDEX IF NOT EXISTS offline_entities_lookup_idx ON offline_entities(user_id, entity);
    CREATE TABLE IF NOT EXISTS offline_selling_prices (
      user_id TEXT NOT NULL,
      item_key TEXT NOT NULL,
      product_guid TEXT NOT NULL,
      price_type_guid TEXT NOT NULL,
      price REAL NOT NULL,
      currency TEXT,
      package_guid TEXT,
      min_qty REAL,
      priority INTEGER NOT NULL DEFAULT 0,
      source_updated_at TEXT,
      PRIMARY KEY(user_id, item_key)
    );
    CREATE INDEX IF NOT EXISTS offline_selling_prices_lookup_idx
      ON offline_selling_prices(user_id, product_guid, price_type_guid, priority DESC);
    CREATE TABLE IF NOT EXISTS offline_stock (
      user_id TEXT NOT NULL,
      item_key TEXT NOT NULL,
      product_guid TEXT NOT NULL,
      warehouse_guid TEXT NOT NULL,
      organization_guid TEXT,
      quantity REAL NOT NULL DEFAULT 0,
      free_available REAL NOT NULL DEFAULT 0,
      own_reserve REAL NOT NULL DEFAULT 0,
      available REAL NOT NULL DEFAULT 0,
      receipt_price REAL,
      source_updated_at TEXT,
      PRIMARY KEY(user_id, item_key)
    );
    CREATE INDEX IF NOT EXISTS offline_stock_lookup_idx
      ON offline_stock(user_id, product_guid, warehouse_guid, organization_guid);
    CREATE TABLE IF NOT EXISTS offline_manager_stock (
      user_id TEXT NOT NULL,
      item_key TEXT NOT NULL,
      product_guid TEXT NOT NULL,
      warehouse_guid TEXT NOT NULL,
      organization_guid TEXT,
      reserved REAL NOT NULL DEFAULT 0,
      source_updated_at TEXT,
      PRIMARY KEY(user_id, item_key)
    );
    CREATE INDEX IF NOT EXISTS offline_manager_stock_lookup_idx
      ON offline_manager_stock(user_id, product_guid, warehouse_guid, organization_guid);
    CREATE TABLE IF NOT EXISTS offline_drafts (
      user_id TEXT NOT NULL,
      id TEXT NOT NULL,
      client_order_id TEXT NOT NULL,
      client_revision INTEGER NOT NULL,
      status TEXT NOT NULL,
      intent TEXT NOT NULL,
      server_guid TEXT,
      server_revision INTEGER,
      order_json TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_send_error TEXT,
      PRIMARY KEY(user_id, id),
      UNIQUE(user_id, client_order_id)
    );
    CREATE INDEX IF NOT EXISTS offline_drafts_status_idx ON offline_drafts(user_id, status, updated_at DESC);
    CREATE TABLE IF NOT EXISTS offline_draft_lines (
      user_id TEXT NOT NULL,
      draft_id TEXT NOT NULL,
      line_guid TEXT NOT NULL,
      product_guid TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      PRIMARY KEY(user_id, draft_id, line_guid),
      FOREIGN KEY(user_id, draft_id) REFERENCES offline_drafts(user_id, id) ON DELETE CASCADE
    );
    PRAGMA user_version = ${DATABASE_VERSION};
  `);
}

export async function getCatalogDatabase() {
  if (Platform.OS === 'web') return null;
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (db) => {
      await migrate(db);
      return db;
    }).catch((error) => {
      databasePromise = null;
      console.warn('[catalog] SQLite initialization failed', error);
      return null;
    });
  }
  return databasePromise;
}

async function readMetaValue(db: SQLite.SQLiteDatabase, key: string) {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM catalog_meta WHERE key = ?', key);
  return row?.value ?? null;
}

export async function readCatalogMeta(): Promise<CatalogMeta> {
  const db = await getCatalogDatabase();
  if (!db) return { epoch: null, revision: '0', schemaVersion: 0, productCount: 0, lastSyncedAt: null };
  const [epoch, revision, schemaVersion, productCount, lastSyncedAt] = await Promise.all([
    readMetaValue(db, 'epoch'),
    readMetaValue(db, 'revision'),
    readMetaValue(db, 'schemaVersion'),
    readMetaValue(db, 'productCount'),
    readMetaValue(db, 'lastSyncedAt'),
  ]);
  return {
    epoch,
    revision: revision || '0',
    schemaVersion: Number(schemaVersion || 0),
    productCount: Number(productCount || 0),
    lastSyncedAt,
  };
}

async function setMeta(tx: SQLite.SQLiteDatabase, key: string, value: string | number) {
  await tx.runAsync(
    'INSERT INTO catalog_meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    String(value)
  );
}

function productBarcodes(product: CatalogProduct) {
  return (product.packages || []).map((pack) => (pack as { barcode?: string | null }).barcode).filter(Boolean).join(' ');
}

async function upsertProduct(
  upsertStatement: SQLite.SQLiteStatement,
  deleteFtsStatement: SQLite.SQLiteStatement,
  insertFtsStatement: SQLite.SQLiteStatement,
  product: CatalogProduct
) {
  await upsertStatement.executeAsync([
    product.guid,
    product.name,
    product.code ?? null,
    product.article ?? null,
    product.sku ?? null,
    product.isWeight ? 1 : 0,
    product.isService ? 1 : 0,
    product.isActive === false ? 0 : 1,
    serialize(product.group),
    serialize(product.baseUnit),
    serialize(product.packages || []),
    product.imageHash ?? null,
    product.revision || '0',
    product.sourceUpdatedAt ?? null,
  ]);
  await deleteFtsStatement.executeAsync([product.guid]);
  await insertFtsStatement.executeAsync([
    product.guid,
    product.name,
    product.code ?? '',
    product.article ?? '',
    product.sku ?? '',
    productBarcodes(product),
  ]);
}

async function withCatalogStatements(
  tx: SQLite.SQLiteDatabase,
  callback: (statements: {
    upsert: SQLite.SQLiteStatement;
    deleteProduct: SQLite.SQLiteStatement;
    deleteFts: SQLite.SQLiteStatement;
    insertFts: SQLite.SQLiteStatement;
  }) => Promise<void>
) {
  const upsert = await tx.prepareAsync(`
    INSERT INTO catalog_products(
      guid, name, code, article, sku, is_weight, is_service, is_active,
      group_json, base_unit_json, packages_json, image_hash, revision, source_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(guid) DO UPDATE SET
      name=excluded.name, code=excluded.code, article=excluded.article, sku=excluded.sku,
      is_weight=excluded.is_weight, is_service=excluded.is_service, is_active=excluded.is_active,
      group_json=excluded.group_json, base_unit_json=excluded.base_unit_json,
      packages_json=excluded.packages_json, image_hash=excluded.image_hash,
      revision=excluded.revision, source_updated_at=excluded.source_updated_at
  `);
  const deleteProduct = await tx.prepareAsync('DELETE FROM catalog_products WHERE guid = ?');
  const deleteFts = await tx.prepareAsync('DELETE FROM catalog_products_fts WHERE guid = ?');
  const insertFts = await tx.prepareAsync(
    'INSERT INTO catalog_products_fts(guid, name, code, article, sku, barcodes) VALUES (?, ?, ?, ?, ?, ?)'
  );
  try {
    await callback({ upsert, deleteProduct, deleteFts, insertFts });
  } finally {
    await Promise.all([upsert.finalizeAsync(), deleteProduct.finalizeAsync(), deleteFts.finalizeAsync(), insertFts.finalizeAsync()]);
  }
}

export async function replaceCatalog(input: {
  epoch: string;
  schemaVersion: number;
  revision: string;
  products: CatalogProduct[];
}) {
  const db = await getCatalogDatabase();
  if (!db) return false;
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.execAsync('DELETE FROM catalog_products_fts; DELETE FROM catalog_products;');
    await withCatalogStatements(tx, async (statements) => {
      for (const product of input.products) {
        if (product.isActive === false) continue;
        await upsertProduct(statements.upsert, statements.deleteFts, statements.insertFts, product);
      }
    });
    await setMeta(tx, 'epoch', input.epoch);
    await setMeta(tx, 'schemaVersion', input.schemaVersion);
    await setMeta(tx, 'revision', input.revision);
    await setMeta(tx, 'productCount', input.products.filter((product) => product.isActive !== false).length);
    await setMeta(tx, 'lastSyncedAt', new Date().toISOString());
  });
  return true;
}

export async function applyCatalogChanges(input: {
  epoch: string;
  schemaVersion: number;
  revision: string;
  changes: CatalogChange[];
}) {
  const db = await getCatalogDatabase();
  if (!db) return false;
  await db.withExclusiveTransactionAsync(async (tx) => {
    await withCatalogStatements(tx, async (statements) => {
      for (const change of input.changes) {
        if (change.operation === 'DELETE' || !change.item) {
          await statements.deleteFts.executeAsync([change.productGuid]);
          await statements.deleteProduct.executeAsync([change.productGuid]);
        } else {
          await upsertProduct(statements.upsert, statements.deleteFts, statements.insertFts, change.item);
        }
      }
    });
    const count = await tx.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM catalog_products');
    await setMeta(tx, 'epoch', input.epoch);
    await setMeta(tx, 'schemaVersion', input.schemaVersion);
    await setMeta(tx, 'revision', input.revision);
    await setMeta(tx, 'productCount', Number(count?.count || 0));
    await setMeta(tx, 'lastSyncedAt', new Date().toISOString());
  });
  return true;
}

type ProductRow = {
  guid: string;
  name: string;
  code: string | null;
  article: string | null;
  sku: string | null;
  is_weight: number;
  base_unit_json: string | null;
  packages_json: string;
  image_hash: string | null;
};

function rowToProduct(row: ProductRow): ClientOrderProduct {
  return {
    guid: row.guid,
    name: row.name,
    code: row.code,
    article: row.article,
    sku: row.sku,
    isWeight: row.is_weight === 1,
    baseUnit: parseJson(row.base_unit_json, null),
    packages: parseJson(row.packages_json, []),
    imageHash: row.image_hash,
    basePrice: null,
    receiptPrice: null,
    stock: null,
  };
}

function buildFtsQuery(search: string) {
  const tokens = search
    .normalize('NFKC')
    .toLocaleLowerCase('ru')
    .replace(/[^\p{L}\p{N}_-]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  return tokens.map((token) => `"${token.replace(/"/g, '""')}"*`).join(' AND ');
}

export type CatalogCommercialContext = {
  priceTypeGuid?: string;
  warehouseGuid?: string;
  organizationGuid?: string;
  inStockOnly?: boolean;
};

async function loadOfflineStockByProduct(
  db: SQLite.SQLiteDatabase,
  userId: string,
  productGuids: string[],
  context: CatalogCommercialContext
) {
  if (!productGuids.length) return new Map<string, any>();
  const placeholders = productGuids.map(() => '?').join(',');
  const stockClauses = ['user_id = ?', `product_guid IN (${placeholders})`];
  const stockArgs: any[] = [userId, ...productGuids];
  if (context.warehouseGuid) {
    stockClauses.push('warehouse_guid = ?');
    stockArgs.push(context.warehouseGuid);
  }
  if (context.organizationGuid) {
    stockClauses.push('(organization_guid = ? OR organization_guid IS NULL)');
    stockArgs.push(context.organizationGuid);
  }
  const groupedByOrganization = context.organizationGuid ? ', organization_guid' : '';
  const organizationOrder = context.organizationGuid
    ? 'ORDER BY product_guid, CASE WHEN organization_guid = ? THEN 0 ELSE 1 END'
    : 'ORDER BY product_guid';
  const stocks = await db.getAllAsync<any>(`
    SELECT product_guid, organization_guid,
           SUM(quantity) AS quantity, SUM(free_available) AS free_available,
           MAX(receipt_price) AS receipt_price
    FROM offline_stock
    WHERE ${stockClauses.join(' AND ')}
    GROUP BY product_guid${groupedByOrganization}
    ${organizationOrder}
  `, ...stockArgs, ...(context.organizationGuid ? [context.organizationGuid] : []));
  const reserves = await db.getAllAsync<any>(`
    SELECT product_guid, organization_guid, SUM(reserved) AS own_reserve
    FROM offline_manager_stock
    WHERE ${stockClauses.join(' AND ')}
    GROUP BY product_guid${groupedByOrganization}
    ${organizationOrder}
  `, ...stockArgs, ...(context.organizationGuid ? [context.organizationGuid] : []));
  const stockByProduct = new Map<string, any>();
  stocks.forEach((item) => {
    if (!stockByProduct.has(item.product_guid)) stockByProduct.set(item.product_guid, item);
  });
  const reserveByProduct = new Map<string, number>();
  reserves.forEach((item) => {
    if (!reserveByProduct.has(item.product_guid)) {
      reserveByProduct.set(item.product_guid, Number(item.own_reserve || 0));
    }
  });
  productGuids.forEach((guid) => {
    const stock = stockByProduct.get(guid) ?? {};
    const freeAvailable = Number(stock.free_available || 0);
    const ownReserve = reserveByProduct.get(guid) ?? 0;
    stockByProduct.set(guid, {
      ...stock,
      quantity: Number(stock.quantity || 0),
      free_available: freeAvailable,
      own_reserve: ownReserve,
      available: Math.max(freeAvailable, 0) + Math.max(ownReserve, 0),
    });
  });
  return stockByProduct;
}

export async function searchCatalogProducts(
  search: string,
  limit: number,
  offset: number,
  context: CatalogCommercialContext = {}
): Promise<CatalogSearchResult | null> {
  const db = await getCatalogDatabase();
  if (!db) return null;
  const meta = await readCatalogMeta();
  if (!meta.epoch || meta.productCount <= 0) return null;
  const pageSize = Math.max(1, Math.min(100, limit));
  const fetchSize = pageSize + 1;
  let rows: ProductRow[];
  const fts = buildFtsQuery(search);
  if (fts) {
    rows = await db.getAllAsync<ProductRow>(`
      SELECT p.guid, p.name, p.code, p.article, p.sku, p.is_weight,
             p.base_unit_json, p.packages_json, p.image_hash
      FROM catalog_products_fts f
      JOIN catalog_products p ON p.guid = f.guid
      WHERE catalog_products_fts MATCH ? AND p.is_active = 1
      ORDER BY bm25(catalog_products_fts), p.name COLLATE NOCASE, p.guid
      LIMIT ? OFFSET ?
    `, fts, fetchSize, Math.max(0, offset));
  } else {
    rows = await db.getAllAsync<ProductRow>(`
      SELECT guid, name, code, article, sku, is_weight,
             base_unit_json, packages_json, image_hash
      FROM catalog_products
      WHERE is_active = 1
      ORDER BY name COLLATE NOCASE, guid
      LIMIT ? OFFSET ?
    `, fetchSize, Math.max(0, offset));
  }
  const hasMore = rows.length > pageSize;
  let page = hasMore ? rows.slice(0, pageSize) : rows;
  const activeUserId = await readMetaValue(db, 'offlineActiveUserId');
  const commercialByProduct = new Map<string, {
    basePrice: number | null;
    receiptPrice: number | null;
    currency: string | null;
    priceType: { guid: string; name: string } | null;
    stock: ClientOrderProduct['stock'];
  }>();
  if (activeUserId && page.length) {
    const placeholders = page.map(() => '?').join(',');
    const guids = page.map((row) => row.guid);
    const prices = context.priceTypeGuid
      ? await db.getAllAsync<any>(`
          SELECT product_guid, price, currency, price_type_guid
          FROM offline_selling_prices
          WHERE user_id = ? AND price_type_guid = ? AND product_guid IN (${placeholders})
          ORDER BY priority DESC, source_updated_at DESC
        `, activeUserId, context.priceTypeGuid, ...guids)
      : [];
    const priceByProduct = new Map<string, any>();
    prices.forEach((item) => { if (!priceByProduct.has(item.product_guid)) priceByProduct.set(item.product_guid, item); });
    const stockByProduct = await loadOfflineStockByProduct(db, activeUserId, guids, context);
    let priceTypeName = context.priceTypeGuid || '';
    if (context.priceTypeGuid) {
      const row = await db.getFirstAsync<{ payload_json: string }>(
        "SELECT payload_json FROM offline_entities WHERE user_id = ? AND entity = 'price-types' AND item_key = ?",
        activeUserId,
        context.priceTypeGuid
      );
      priceTypeName = parseJson<any>(row?.payload_json, {}).name || context.priceTypeGuid;
    }
    guids.forEach((guid) => {
      const price = priceByProduct.get(guid);
      const stock = stockByProduct.get(guid);
      commercialByProduct.set(guid, {
        basePrice: price ? Number(price.price) : null,
        receiptPrice: stock?.receipt_price == null ? null : Number(stock.receipt_price),
        currency: price?.currency ?? null,
        priceType: price ? { guid: price.price_type_guid, name: priceTypeName } : null,
        stock: stock ? {
          quantity: Number(stock.quantity || 0),
          freeAvailable: Number(stock.free_available || 0),
          myReserved: Number(stock.own_reserve || 0),
          available: Number(stock.available || 0),
        } : { quantity: 0, freeAvailable: 0, myReserved: 0, available: 0 },
      });
    });
    if (context.inStockOnly) {
      page = page.filter((row) => Number(commercialByProduct.get(row.guid)?.stock?.available || 0) > 0);
    }
  }
  return {
    items: page.map((row) => ({ ...rowToProduct(row), ...(commercialByProduct.get(row.guid) ?? {}) })),
    total: Math.max(0, offset) + page.length + (hasMore ? 1 : 0),
    hasMore,
  };
}

export async function getCatalogProductsByGuids(
  productGuids: string[],
  context: CatalogCommercialContext = {}
): Promise<ClientOrderProduct[]> {
  const db = await getCatalogDatabase();
  if (!db || !productGuids.length) return [];
  const guids = [...new Set(productGuids)];
  const placeholders = guids.map(() => '?').join(',');
  const rows = await db.getAllAsync<ProductRow>(`
    SELECT guid, name, code, article, sku, is_weight, base_unit_json, packages_json, image_hash
    FROM catalog_products
    WHERE is_active = 1 AND guid IN (${placeholders})
  `, ...guids);
  const activeUserId = await readMetaValue(db, 'offlineActiveUserId');
  if (!activeUserId) return rows.map(rowToProduct);
  const prices = context.priceTypeGuid
    ? await db.getAllAsync<any>(`
        SELECT product_guid, price, currency, price_type_guid
        FROM offline_selling_prices
        WHERE user_id = ? AND price_type_guid = ? AND product_guid IN (${placeholders})
        ORDER BY priority DESC, source_updated_at DESC
      `, activeUserId, context.priceTypeGuid, ...guids)
    : [];
  const priceByProduct = new Map<string, any>();
  prices.forEach((item) => { if (!priceByProduct.has(item.product_guid)) priceByProduct.set(item.product_guid, item); });
  const stockByProduct = await loadOfflineStockByProduct(db, activeUserId, guids, context);
  const byGuid = new Map(rows.map((row) => [row.guid, row]));
  return guids.flatMap((guid) => {
    const row = byGuid.get(guid);
    if (!row) return [];
    const price = priceByProduct.get(guid);
    const stock = stockByProduct.get(guid);
    return [{
      ...rowToProduct(row),
      basePrice: price ? Number(price.price) : null,
      receiptPrice: stock?.receipt_price == null ? null : Number(stock.receipt_price),
      currency: price?.currency ?? null,
      priceType: price ? { guid: price.price_type_guid, name: price.price_type_guid } : null,
      stock: stock ? {
        quantity: Number(stock.quantity || 0),
        freeAvailable: Number(stock.free_available || 0),
        myReserved: Number(stock.own_reserve || 0),
        available: Number(stock.available || 0),
      } : { quantity: 0, freeAvailable: 0, myReserved: 0, available: 0 },
    }];
  });
}
