import type { SQLiteDatabase } from 'expo-sqlite';
import { getCatalogDatabase } from '@/src/features/productCatalog/data/catalogDatabase';
import { withSQLiteWriteTransaction } from '@/src/shared/storage/sqliteWriteQueue';
import { emitOrderOutboxChange } from './orderOutboxEvents';
import { isAutomaticSubmission, matchingSubmissionReceipt, submissionHash, type FrozenSubmission, type SubmissionReceipt } from './orderSubmissionProtocol';
import { reviewFromError } from '../lib/draftReview';
import type { ClientOrder } from '@/utils/clientOrdersService';
import { legacyOrderMatches } from '../lib/legacyOrderRecovery';
import { ORDER_API_SCOPE, legacyOrderApiScope, localOrderApiScope } from './orderOutboxScope';

export type Delivery = FrozenSubmission & { apiScope: string; leaseToken: string; attempts: number; receipt: SubmissionReceipt | null };
const retryDelay = (attempt: number) => Math.min(300_000, 5_000 * 2 ** Math.min(6, Math.max(0, attempt - 1)));
async function database() {
  const db = await getCatalogDatabase();
  if (!db) throw new Error('Хранилище очереди недоступно. Документы не отправлены.');
  return db;
}
function packet(row: any): Delivery {
  return { apiScope: row.api_scope, userId: row.user_id, clientOrderId: row.client_order_id, clientRevision: row.client_revision,
    payloadHash: row.payload_hash, payload: JSON.parse(row.payload_json), leaseToken: row.lease_token,
    attempts: row.attempts, receipt: row.receipt_json ? JSON.parse(row.receipt_json) : null };
}
async function draftStatus(tx: SQLiteDatabase, item: FrozenSubmission, status: string, error: string | null = null, details?: any) {
  const row = await tx.getFirstAsync<any>(`SELECT order_json FROM offline_drafts
    WHERE user_id=? AND client_order_id=? AND client_revision=? AND intent='SUBMIT'`, item.userId, item.clientOrderId, item.clientRevision);
  if (!row) return;
  const order = JSON.parse(row.order_json);
  const readOnly = ['SENDING','API_ACCEPTED'].includes(status);
  const review = details ? reviewFromError(details, order.warehouse?.guid) : null;
  const next = { ...order, offlineDraftStatus: status, readOnly, readOnlyReason: readOnly ? 'Заказ отправляется в API' : null,
    lastExportError: error, ...(details ? { draftReview: review, submissionErrorDetails: details } : {}) };
  await tx.runAsync(`UPDATE offline_drafts SET status=?, last_send_error=?, order_json=?, updated_at=?
    WHERE user_id=? AND client_order_id=? AND client_revision=? AND intent='SUBMIT'`,
  status, error, JSON.stringify(next), new Date().toISOString(), item.userId, item.clientOrderId, item.clientRevision);
}

/** Freeze + SQL lease are one transaction, shared by foreground/headless runtimes. */
export async function claimOrderUploads(userId: string, limit = 10, now = Date.now()): Promise<Delivery[]> {
  const db = await database();
  const claimed: Delivery[] = [];
  await withSQLiteWriteTransaction(db, async tx => {
    const legacyScope = await legacyOrderApiScope(tx);
    // Bound the bridge/JSON work as well as the HTTP batch. A large local queue
    // must not transfer/parse every document on each wake-up.
    const rows = await tx.getAllAsync<any>(`SELECT d.* FROM offline_drafts d LEFT JOIN offline_order_deliveries x
      ON x.user_id=d.user_id AND x.client_order_id=d.client_order_id AND x.client_revision=d.client_revision AND x.api_scope=?
      WHERE d.user_id=? AND d.intent='SUBMIT' AND d.status IN ('READY_TO_SEND','SEND_ERROR','SENDING')
      AND COALESCE(CASE WHEN json_valid(d.order_json) THEN json_extract(d.order_json,'$._deviceApiBaseUrl') END,?)=?
      AND (x.state IS NULL OR (x.state IN ('PENDING','UPLOADING') AND x.next_attempt_at<=?
        AND (x.state<>'UPLOADING' OR x.lease_until<=?)))
      ORDER BY d.created_at,d.client_order_id LIMIT ?`, ORDER_API_SCOPE, userId, legacyScope, ORDER_API_SCOPE, now, now, limit);
    for (const row of rows) {
      if (claimed.length >= limit) break;
      if (!isAutomaticSubmission({ intent: row.intent, status: row.status, clientOrderId: row.client_order_id })) continue;
      let localPayload: any;
      let localOrder: any;
      try { localPayload = JSON.parse(row.payload_json); localOrder = JSON.parse(row.order_json); }
      catch {
        await tx.runAsync(`UPDATE offline_drafts SET status='NEEDS_EDIT',last_send_error=? WHERE user_id=? AND id=?`,
        'Не удалось прочитать локальный заказ. Копия сохранена для восстановления.', userId, row.id);
        continue;
      }
      if (localOrderApiScope(localOrder, legacyScope) !== ORDER_API_SCOPE) continue;
      const previous = await tx.getFirstAsync<any>(`SELECT * FROM offline_order_deliveries WHERE user_id=? AND client_order_id=? AND client_revision=? AND api_scope=?`,
      userId, row.client_order_id, row.client_revision, ORDER_API_SCOPE);
      if (previous && (['ACCEPTED','REVIEW','REJECTED','DONE'].includes(previous.state)
        || previous.next_attempt_at > now || (previous.state === 'UPLOADING' && previous.lease_until > now))) continue;
      if (!previous) {
        const payload = { ...localPayload, clientRevision: row.client_revision, intent: 'SUBMIT',
          offlineReview: localPayload.offlineReview ?? { pricePolicy: 'ASK' } };
        if (row.client_order_id.startsWith('legacy-server:')) {
          payload.legacyServerGuid = row.server_guid || row.client_order_id.slice('legacy-server:'.length);
          payload.legacyServerRevision = row.server_revision ?? localOrder.revision;
        }
        await tx.runAsync(`INSERT INTO offline_order_deliveries(api_scope,user_id,client_order_id,client_revision,payload_hash,payload_json,state,updated_at)
          VALUES (?,?,?,?,?,?,'PENDING',?)`, ORDER_API_SCOPE, userId, row.client_order_id, row.client_revision, submissionHash(payload), JSON.stringify(payload), new Date(now).toISOString());
      }
      const leaseToken = `${now}-${Math.random().toString(36).slice(2)}-${row.client_order_id}`;
      await tx.runAsync(`UPDATE offline_order_deliveries SET state='UPLOADING',lease_token=?,lease_until=?,attempts=attempts+1,updated_at=?
        WHERE user_id=? AND client_order_id=? AND client_revision=? AND api_scope=?`, leaseToken, now + 180_000, new Date(now).toISOString(), userId, row.client_order_id, row.client_revision, ORDER_API_SCOPE);
      const delivery = packet(await tx.getFirstAsync<any>(`SELECT * FROM offline_order_deliveries WHERE user_id=? AND client_order_id=? AND client_revision=? AND api_scope=?`,
      userId, row.client_order_id, row.client_revision, ORDER_API_SCOPE));
      await draftStatus(tx, delivery, 'SENDING');
      claimed.push(delivery);
    }
  });
  if (claimed.length) emitOrderOutboxChange({ userId });
  return claimed;
}

export async function acceptOrderUpload(item: Delivery, receipt: SubmissionReceipt) {
  if (item.apiScope !== ORDER_API_SCOPE) return;
  if (!matchingSubmissionReceipt(item, receipt)) throw new Error('API не подтвердил точный пакет заказа. Копия сохранена.');
  const db = await database();
  await withSQLiteWriteTransaction(db, async tx => {
    const changed = await tx.runAsync(`UPDATE offline_order_deliveries SET state='ACCEPTED',receipt_json=?,lease_token=NULL,lease_until=NULL,next_attempt_at=0,last_error=NULL,updated_at=?
      WHERE user_id=? AND client_order_id=? AND client_revision=? AND state='UPLOADING' AND lease_token=? AND api_scope=?`,
    JSON.stringify(receipt), new Date().toISOString(), item.userId, item.clientOrderId, item.clientRevision, item.leaseToken, ORDER_API_SCOPE);
    if (changed.changes) await draftStatus(tx, item, 'API_ACCEPTED');
  });
  emitOrderOutboxChange({ userId: item.userId });
}

export async function failOrderUpload(item: Delivery, failure: { retryable: boolean; message: string; code?: string; details?: any }) {
  if (item.apiScope !== ORDER_API_SCOPE) return;
  const db = await database();
  await withSQLiteWriteTransaction(db, async tx => {
    const changed = await tx.runAsync(`UPDATE offline_order_deliveries SET state=?,lease_token=NULL,lease_until=NULL,next_attempt_at=?,last_error=?,updated_at=?
      WHERE user_id=? AND client_order_id=? AND client_revision=? AND state='UPLOADING' AND lease_token=? AND api_scope=?`,
    failure.retryable ? 'PENDING' : 'REJECTED', Date.now() + retryDelay(item.attempts), failure.message, new Date().toISOString(),
    item.userId, item.clientOrderId, item.clientRevision, item.leaseToken, ORDER_API_SCOPE);
    if (changed.changes) await draftStatus(tx, item, failure.retryable ? 'READY_TO_SEND' : 'NEEDS_EDIT',
      failure.retryable ? null : failure.message, { backendErrorCode: failure.code, message: failure.message, errorDetails: failure.details });
  });
  emitOrderOutboxChange({ userId: item.userId });
}

export async function readAcceptedUploads(userId: string): Promise<Delivery[]> {
  const db = await database();
  return (await db.getAllAsync<any>(`SELECT * FROM offline_order_deliveries WHERE user_id=? AND api_scope=? AND state='ACCEPTED' AND next_attempt_at<=? ORDER BY updated_at LIMIT 20`, userId, ORDER_API_SCOPE, Date.now())).map(packet);
}
export async function updateSubmissionStatus(item: Delivery, receipt: SubmissionReceipt) {
  if (item.apiScope !== ORDER_API_SCOPE) return;
  if (!matchingSubmissionReceipt(item, receipt) || item.receipt?.submissionId !== receipt.submissionId) return;
  const db = await database();
  await withSQLiteWriteTransaction(db, async tx => {
    const review = ['NEEDS_REVIEW','REJECTED'].includes(receipt.state);
    const changed = await tx.runAsync(`UPDATE offline_order_deliveries SET state=?,receipt_json=?,next_attempt_at=?,updated_at=?
      WHERE user_id=? AND client_order_id=? AND client_revision=? AND state='ACCEPTED' AND api_scope=?`, review ? 'REVIEW' : 'ACCEPTED',
    JSON.stringify(receipt), Date.now() + 10_000, new Date().toISOString(), item.userId, item.clientOrderId, item.clientRevision, ORDER_API_SCOPE);
    if (changed.changes && review) await draftStatus(tx, item, receipt.errorCode === 'PRICE_REVIEW_REQUIRED' ? 'PRICE_REVIEW' : 'NEEDS_EDIT',
      receipt.errorMessage || 'Заказ требует проверки', { backendErrorCode: receipt.errorCode, message: receipt.errorMessage, errorDetails: receipt.errorDetails });
  });
  emitOrderOutboxChange({ userId: item.userId });
}

/** Mirror is committed BEFORE deleting the exact local operation. Never a naked receipt. */
export async function completeOrderUpload(item: Delivery, order: ClientOrder, legacy = false) {
  if (item.apiScope !== ORDER_API_SCOPE) return;
  if (order.createdByUser?.id !== Number(item.userId) || !order.guid || order.origin === 'device'
    || (!legacy && (order.clientOrderId !== item.clientOrderId || order.clientRevision !== item.clientRevision
      || (item.receipt?.orderGuid && item.receipt.orderGuid !== order.guid)))
    || !['QUEUED','SYNCED'].includes(order.syncState) || !['QUEUED','SENT_TO_1C','CONFIRMED'].includes(order.status)) {
    throw new Error('Сервер не подтвердил отправленную версию. Копия сохранена.');
  }
  if (legacy && !legacyOrderMatches({ guid: item.payload.legacyServerGuid, userId: Number(item.userId), payload: item.payload }, order)) {
    throw new Error('Исходный заказ не совпал с отправленным пакетом. Копия сохранена.');
  }
  const db = await database();
  let previousGuid: string | null = null;
  await withSQLiteWriteTransaction(db, async tx => {
    const current = await tx.getFirstAsync<any>(`SELECT * FROM offline_drafts WHERE user_id=? AND client_order_id=? AND client_revision=? AND intent='SUBMIT'`,
    item.userId, item.clientOrderId, item.clientRevision);
    if (!current) return;
    const delivery = await tx.getFirstAsync<any>(`SELECT * FROM offline_order_deliveries WHERE user_id=? AND client_order_id=? AND client_revision=? AND api_scope=?`, item.userId, item.clientOrderId, item.clientRevision, ORDER_API_SCOPE);
    if (!delivery || !['ACCEPTED','UPLOADING'].includes(delivery.state) || delivery.payload_hash !== item.payloadHash
      || (legacy && delivery.lease_token !== item.leaseToken)) return;
    previousGuid = JSON.parse(current.order_json).guid;
    await tx.runAsync(`INSERT INTO offline_order_mirrors(api_scope,user_id,client_order_id,client_revision,order_json,updated_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(api_scope,user_id,client_order_id) DO UPDATE SET client_revision=excluded.client_revision,order_json=excluded.order_json,updated_at=excluded.updated_at
      WHERE excluded.client_revision>=offline_order_mirrors.client_revision`, ORDER_API_SCOPE, item.userId, item.clientOrderId, item.clientRevision, JSON.stringify(order), new Date().toISOString());
    await tx.runAsync('DELETE FROM offline_draft_lines WHERE user_id=? AND draft_id=?', item.userId, current.id);
    await tx.runAsync("DELETE FROM offline_drafts WHERE user_id=? AND client_order_id=? AND client_revision=? AND intent='SUBMIT'", item.userId, item.clientOrderId, item.clientRevision);
    await tx.runAsync(`UPDATE offline_order_deliveries SET state='DONE',payload_json='null',lease_token=NULL,lease_until=NULL,updated_at=? WHERE user_id=? AND client_order_id=? AND client_revision=? AND api_scope=?`,
    new Date().toISOString(), item.userId, item.clientOrderId, item.clientRevision, ORDER_API_SCOPE);
    // Only completed metadata/mirrors; drafts, active/uncertain uploads and reviews stay intact.
    await tx.runAsync(`DELETE FROM offline_order_deliveries WHERE user_id=? AND state='DONE' AND updated_at<?`,
    item.userId, new Date(Date.now() - 30 * 86_400_000).toISOString());
    await tx.runAsync(`DELETE FROM offline_order_mirrors WHERE user_id=? AND api_scope=? AND client_order_id NOT IN (
      SELECT client_order_id FROM offline_order_mirrors WHERE user_id=? AND api_scope=? ORDER BY updated_at DESC LIMIT 100)`, item.userId, ORDER_API_SCOPE, item.userId, ORDER_API_SCOPE);
  });
  emitOrderOutboxChange({ userId: item.userId, order, previousGuid });
}
export async function readOrderMirrors(userId: string): Promise<ClientOrder[]> {
  const db = await database();
  return (await db.getAllAsync<any>('SELECT order_json FROM offline_order_mirrors WHERE user_id=? AND api_scope=? ORDER BY updated_at DESC LIMIT 100', userId, ORDER_API_SCOPE)).map(row => JSON.parse(row.order_json));
}
export async function hasPendingOrderUploads(userId: string) {
  const db = await database();
  const legacyScope = await legacyOrderApiScope(db);
  return !!await db.getFirstAsync(`SELECT 1 FROM offline_drafts WHERE user_id=? AND intent='SUBMIT'
    AND status IN ('READY_TO_SEND','SEND_ERROR','SENDING')
    AND COALESCE(CASE WHEN json_valid(order_json) THEN json_extract(order_json,'$._deviceApiBaseUrl') END,?)=? LIMIT 1`, userId, legacyScope, ORDER_API_SCOPE);
}
export async function expediteOrderUploads(userId: string) {
  const db = await database();
  await withSQLiteWriteTransaction(db, async tx => {
    await tx.runAsync(`UPDATE offline_order_deliveries SET next_attempt_at=0 WHERE user_id=? AND api_scope=? AND state IN ('PENDING','ACCEPTED')`, userId, ORDER_API_SCOPE);
  });
}
