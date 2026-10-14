import type { ClientOrder } from '@/utils/clientOrdersService';
import { buildCopyPayload, orderToDraft } from '../clientOrdersShared';
import { sameDeviceDraftContent } from './deviceDraftRecovery';
type ClientOrderSavePayload = ReturnType<typeof buildCopyPayload>;

type Operation = {
  guid: string; revision: number; userId: number; intent: 'SAVE' | 'SUBMIT';
  payload: ClientOrderSavePayload;
};
type Dependencies = {
  read: (guid: string) => Promise<ClientOrder>;
  update: (guid: string, payload: ClientOrderSavePayload & { revision: number }) => Promise<ClientOrder>;
  submit: (guid: string, revision: number) => Promise<ClientOrder>;
  checkpoint: (order: ClientOrder) => Promise<void>;
  isCurrent?: () => boolean;
};

export function isRecoverableLegacySaveError(error: unknown) {
  const e = error as { status?: number; message?: string } | null;
  return [0, 408, 409, 502, 503, 504].includes(e?.status ?? -1)
    || /версия заказа устарела|network|failed to fetch|timeout|нет соединения/i.test(e?.message || '');
}

export function legacyOrderMatches(operation: Pick<Operation, 'guid' | 'userId' | 'payload'>, order: ClientOrder) {
  if (!order || order.origin === 'device' || order.guid !== operation.guid
    || order.createdByUser?.id !== operation.userId || !Number.isInteger(order.revision)) return false;
  try { return sameDeviceDraftContent(operation.payload, buildCopyPayload(orderToDraft(order))); }
  catch { return false; }
}

export function legacySubmissionAccepted(order: ClientOrder) {
  return ['QUEUED', 'SENT_TO_1C', 'CONFIRMED'].includes(order.status)
    && ['QUEUED', 'SYNCED'].includes(order.syncState);
}

function conflict(operation: Operation, order: ClientOrder) {
  let server: ClientOrderSavePayload | null = null;
  try { server = buildCopyPayload(orderToDraft(order)); } catch { /* Fail closed. */ }
  const changes: string[] = [];
  if (server) {
    const headers = [
      ['organizationGuid', 'Организация', order.organization?.name],
      ['counterpartyGuid', 'Клиент', order.counterparty?.name],
      ['agreementGuid', 'Соглашение', order.agreement?.name],
      ['contractGuid', 'Договор', order.contract?.number],
      ['warehouseGuid', 'Склад', order.warehouse?.name],
      ['deliveryAddressGuid', 'Адрес доставки', order.deliveryAddress?.fullAddress],
      ['priceTypeGuid', 'Вид цены', order.priceType?.name],
    ] as const;
    for (const [key, label, value] of headers) {
      if (String(server[key] || '').toLowerCase() !== String(operation.payload[key] || '').toLowerCase()) {
        changes.push(`${label} на сервере: ${value || 'не указано'}.`);
      }
    }
    if (server.items.length !== operation.payload.items.length) {
      changes.push(`Позиций на телефоне: ${operation.payload.items.length}, на сервере: ${server.items.length}.`);
    }
    const names = new Map(order.items.map(item => [item.lineGuid, item.product?.name || 'Товар']));
    for (const line of operation.payload.items) {
      const other = server.items.find(item => item.lineGuid === line.lineGuid);
      if (!other) changes.push('На телефоне есть строка, которой нет на сервере.');
      else if (Number(line.quantity) !== Number(other.quantity)) {
        changes.push(`${names.get(line.lineGuid) || 'Товар'}: количество на телефоне ${line.quantity}, на сервере ${other.quantity}.`);
      }
      else if (!sameDeviceDraftContent({ ...server, items: [line] }, { ...server, items: [other] })) {
        changes.push(`${names.get(line.lineGuid) || 'Товар'}: количество, цена или реквизиты строки отличаются.`);
      }
    }
  }
  if (!changes.length) changes.push('Реквизиты или состав заказа на сервере отличаются от копии на телефоне.');
  return Object.assign(new Error(`Заказ изменён на сервере. ${changes.slice(0, 3).join(' ')} Локальные изменения сохранены. Сравните версии перед отправкой.`), {
    status: 409, errorDetails: { kind: 'LEGACY_DRAFT_CONFLICT', serverGuid: operation.guid, changes },
  });
}

/** Never rebase differing content or create a replacement order after a lost reply. */
export async function runLegacyOrderOperation(operation: Operation, deps: Dependencies): Promise<ClientOrder> {
  const current = () => {
    if (deps.isCurrent && !deps.isCurrent()) throw new Error('Заказ изменён на устройстве. Повторите проверку перед отправкой.');
  };
  const validate = (order: ClientOrder) => {
    if (!order || order.guid !== operation.guid || order.createdByUser?.id !== operation.userId
      || !Number.isInteger(order.revision) || order.revision < operation.revision || order.origin === 'device') {
      throw new Error('Не удалось подтвердить состояние исходного заказа. Копия сохранена на телефоне.');
    }
  };
  let saved = await deps.read(operation.guid);
  validate(saved);
  current();
  if (!legacyOrderMatches(operation, saved)) {
    if (saved.revision !== operation.revision) throw conflict(operation, saved);
    try { saved = await deps.update(operation.guid, { ...operation.payload, revision: saved.revision }); }
    catch (error) {
      if (!isRecoverableLegacySaveError(error)) throw error;
      const observed = await deps.read(operation.guid);
      validate(observed);
      if (!legacyOrderMatches(operation, observed)) throw conflict(operation, observed);
      saved = observed;
    }
    validate(saved);
    if (!legacyOrderMatches(operation, saved)) throw conflict(operation, saved);
  }
  current();
  // Commit the successful SAVE before SUBMIT. SQLite failure must prevent sending.
  await deps.checkpoint(saved);
  current();
  if (operation.intent === 'SAVE' || legacySubmissionAccepted(saved)) return saved;
  try {
    const submitted = await deps.submit(saved.guid, saved.revision);
    validate(submitted);
    if (!legacyOrderMatches(operation, submitted) || !legacySubmissionAccepted(submitted)) throw conflict(operation, submitted);
    current();
    await deps.checkpoint(submitted);
    return submitted;
  } catch (error) {
    if (!isRecoverableLegacySaveError(error)) throw error;
    const observed = await deps.read(operation.guid);
    validate(observed);
    current();
    if (!legacyOrderMatches(operation, observed)) throw conflict(operation, observed);
    await deps.checkpoint(observed);
    if (legacySubmissionAccepted(observed)) return observed;
    throw Object.assign(new Error('Результат отправки пока не подтверждён. Нажмите «Отправить документы», чтобы проверить состояние и продолжить.'), { status: 0 });
  }
}
