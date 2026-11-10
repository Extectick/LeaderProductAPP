import { apiClient } from '@/utils/apiClient';
import type { useClientOrdersWorkspace } from '../useClientOrdersWorkspace';

export type OrderShareLink = { url: string; expiresAt: string | null; active: boolean };
export type SharingWorkspace = Pick<ReturnType<typeof useClientOrdersWorkspace>, 'prepareOrderForSharing' | 'mutationLocked'>;

/** Only publish after the workspace has confirmed the target's latest saved state. */
async function publishClientOrderShareByGuid(guid: string, rotate = false) {
  if (!guid || guid.startsWith('device-')) {
    throw new Error('Заказ пока только на устройстве. Для ссылки сначала сохраните его на сервере.');
  }
  const result = await apiClient<{ rotate: boolean }, OrderShareLink>(`/api/order-sharing/${encodeURIComponent(guid)}/share`, { method: 'POST', body: { rotate } });
  if (!result.ok || !result.data?.url || !result.data.active) throw new Error(result.message || 'Не удалось создать ссылку');
  return { guid, link: result.data };
}

/** Sharing only saves to API. It must never submit to 1C or operate on a list-row DTO. */
export async function publishClientOrderShare(workspace: SharingWorkspace, rotate = false, guid?: string) {
  if (workspace.mutationLocked) throw new Error('Дождитесь завершения операции с документом');
  // A local autosave can retain its original server GUID and clear `dirty`.
  // Both entry points must confirm the target's durable operation with the API.
  const order = await workspace.prepareOrderForSharing(guid);
  if (!order?.guid || order.origin === 'device' || order.guid.startsWith('device-')) {
    throw new Error('Не удалось сохранить заказ на сервере. Проверьте подключение и заполнение заказа. Черновик остаётся на устройстве.');
  }
  return publishClientOrderShareByGuid(order.guid, rotate);
}
