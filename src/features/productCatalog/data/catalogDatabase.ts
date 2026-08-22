import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import type { ClientOrderProduct } from '@/utils/clientOrdersService';
import type { CatalogChange, CatalogProduct, CatalogSearchResult } from '../model/catalog.types';

const DATABASE_NAME = 'leader-product-catalog.db';
const DATABASE_VERSION = 1;

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

export async function searchCatalogProducts(search: string, limit: number, offset: number): Promise<CatalogSearchResult | null> {
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
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  return {
    items: page.map(rowToProduct),
    total: Math.max(0, offset) + page.length + (hasMore ? 1 : 0),
    hasMore,
  };
}
