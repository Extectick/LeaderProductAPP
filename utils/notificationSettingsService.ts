import { apiClient } from './apiClient';
import { API_ENDPOINTS } from './apiEndpoints';

export type NotificationSettings = {
  inAppNotificationsEnabled:    boolean;
  telegramNotificationsEnabled: boolean;
  pushNewMessage:               boolean;
  pushStatusChanged:            boolean;
  pushDeadlineChanged:          boolean;
  telegramNewAppeal:            boolean;
  telegramStatusChanged:        boolean;
  telegramDeadlineChanged:      boolean;
  telegramUnreadReminder:       boolean;
  telegramClosureReminder:      boolean;
  telegramNewMessage:           boolean;
};

export async function getNotificationSettings(): Promise<NotificationSettings | null> {
  const res = await apiClient<void, { settings: NotificationSettings }>(
    API_ENDPOINTS.NOTIFICATIONS.SETTINGS
  );
  if (!res.ok) return null;
  return res.data?.settings ?? null;
}

export async function updateNotificationSettings(
  payload: Partial<NotificationSettings>
): Promise<NotificationSettings> {
  const res = await apiClient<Partial<NotificationSettings>, { settings: NotificationSettings }>(
    API_ENDPOINTS.NOTIFICATIONS.SETTINGS,
    { method: 'PATCH', body: payload }
  );
  if (!res.ok || !res.data?.settings) {
    throw new Error(res.message || 'Не удалось обновить настройки уведомлений');
  }
  return res.data.settings;
}

export async function muteAppeal(appealId: number): Promise<void> {
  const res = await apiClient(API_ENDPOINTS.NOTIFICATIONS.APPEAL_MUTE(appealId), { method: 'POST' });
  if (!res.ok) {
    throw new Error(res.message || 'Не удалось отключить уведомления по обращению');
  }
}

export async function unmuteAppeal(appealId: number): Promise<void> {
  const res = await apiClient(API_ENDPOINTS.NOTIFICATIONS.APPEAL_MUTE(appealId), { method: 'DELETE' });
  if (!res.ok) {
    throw new Error(res.message || 'Не удалось включить уведомления по обращению');
  }
}

export async function getAppealMuteStatus(appealId: number): Promise<boolean> {
  const res = await apiClient<void, { muted: boolean }>(
    API_ENDPOINTS.NOTIFICATIONS.APPEAL_MUTE(appealId)
  );
  return res.data?.muted ?? false;
}
