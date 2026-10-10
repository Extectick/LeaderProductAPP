import { getCatalogDatabase } from '../../productCatalog/data/catalogDatabase';
import { withSQLiteStatements, withSQLiteWriteTransaction } from '../../../shared/storage/sqliteWriteQueue';
import { isPurchaseHistory, type CustomerPurchaseHistory } from '../lib/customerPurchaseHistory';

export async function readCustomerPurchaseHistory(userId: string, organizationGuid: string, counterpartyGuid: string) {
  const db = await getCatalogDatabase();
  if (!db || userId === 'anonymous') return null;
  // One statement ensures the metadata and rows belong to the same snapshot,
  // even if another JS runtime commits a replacement concurrently.
  const rows = await db.getAllAsync<{ metadata_json: string; product_guid: string | null; last_purchased_date: string | null }>(`
    SELECT s.metadata_json, p.product_guid, p.last_purchased_date FROM customer_purchase_snapshots s
    LEFT JOIN customer_purchases p USING (user_id, organization_guid, counterparty_guid)
    WHERE s.user_id = ? AND s.organization_guid = ? AND s.counterparty_guid = ?
  `, userId, organizationGuid, counterpartyGuid);
  if (!rows.length) return null;
  try {
    const snapshot = { ...JSON.parse(rows[0].metadata_json), items: rows.filter(row => row.product_guid).map(row => ({
      productGuid: row.product_guid!, lastPurchasedDate: row.last_purchased_date!,
    })) };
    return isPurchaseHistory(snapshot, counterpartyGuid, organizationGuid) ? snapshot : null;
  } catch { return null; }
}

export async function writeCustomerPurchaseHistory(userId: string, snapshot: CustomerPurchaseHistory) {
  if (userId === 'anonymous' || !isPurchaseHistory(snapshot, snapshot.counterpartyGuid, snapshot.organizationGuid)) throw new Error('Invalid purchase history');
  const db = await getCatalogDatabase();
  if (!db) return; // Web uses the fetched in-memory snapshot; SQLite is native.
  const { items, ...metadata } = snapshot;
  const scope = [userId, snapshot.organizationGuid, snapshot.counterpartyGuid];
  await withSQLiteWriteTransaction(db, async tx => {
    await tx.runAsync(`INSERT OR REPLACE INTO customer_purchase_snapshots
      (user_id, organization_guid, counterparty_guid, metadata_json) VALUES (?, ?, ?, ?)`, ...scope, JSON.stringify(metadata));
    await tx.runAsync('DELETE FROM customer_purchases WHERE user_id = ? AND organization_guid = ? AND counterparty_guid = ?', ...scope);
    await withSQLiteStatements(tx, async prepare => {
      const statement = await prepare(`INSERT INTO customer_purchases
        (user_id, organization_guid, counterparty_guid, product_guid, last_purchased_date) VALUES (?, ?, ?, ?, ?)`);
      for (const item of items) await statement.executeAsync([...scope, item.productGuid, item.lastPurchasedDate]);
    });
  });
}
