import { apiClient } from '@/utils/apiClient';
import type { useClientOrdersWorkspace } from '../useClientOrdersWorkspace';

export type OrderShareLink = { url: string; expiresAt: string; active: boolean };
export type SharingWorkspace = Pick<ReturnType<typeof useClientOrdersWorkspace>, 'selectedOrder' | 'readOnly' | 'dirty' | 'saveDraft' | 'mutationLocked'>;

/** List actions publish by identity only: never select/open a row or save its partial DTO. */
export async function publishClientOrderShareByGuid(guid: string, rotate = false) {
  if (!guid || guid.startsWith('device-')) {
    throw new Error('Заказ пока только на устройстве. Для ссылки сначала сохраните его на сервере.');
  }
  const result = await apiClient<{ rotate: boolean }, OrderShareLink>(`/api/order-sharing/${encodeURIComponent(guid)}/share`, { method: 'POST', body: { rotate } });
  if (!result.ok || !result.data?.url || !result.data.active) throw new Error(result.message || 'Не удалось создать ссылку');
  return { guid, link: result.data };
}

/** Sharing only saves to API. It must never submit to 1C or operate on a list-row DTO. */
export async function publishClientOrderShare(workspace: SharingWorkspace, rotate = false) {
  if (workspace.mutationLocked) throw new Error('Дождитесь завершения операции с документом');
  let order = workspace.selectedOrder;
  if (!workspace.readOnly && (workspace.dirty || !order || order.guid.startsWith('device-'))) {
    order = await workspace.saveDraft({ reason: 'manual', intent: 'SAVE', serverOnly: true });
  }
  if (!order || order.guid.startsWith('device-')) {
    throw new Error('Не удалось сохранить заказ на сервере. Проверьте подключение и заполнение заказа. Черновик остаётся на устройстве.');
  }
  return publishClientOrderShareByGuid(order.guid, rotate);
}
