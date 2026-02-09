import { Linking } from 'react-native';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export type NotificationPayload = {
  id?: string;
  title?: string;
  message: string;
  type?: NotificationType;
  icon?: string;
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
  durationMs?: number; // 0 или undefined = авто по умолчанию, <0 = без авто-скрытия
  actionLabel?: string;
  actionHref?: string;
  avatarUrl?: string;
  dismissKeys?: string[];
  onPress?: () => void;
};

type Listener = (n: Required<NotificationPayload>) => void;
type DismissListener = (id: string) => void;

const listeners = new Set<Listener>();
const dismissListeners = new Set<DismissListener>();
const notificationToKeys = new Map<string, string[]>();
const keyToNotifications = new Map<string, Set<string>>();

function normalizeKeys(keys: string[] | undefined) {
  return Array.from(new Set((keys || []).map((k) => String(k || '').trim()).filter(Boolean)));
}

function cleanupNotificationIndex(id: string) {
  const keys = notificationToKeys.get(id) || [];
  keys.forEach((key) => {
    const idSet = keyToNotifications.get(key);
    if (!idSet) return;
    idSet.delete(id);
    if (!idSet.size) keyToNotifications.delete(key);
  });
  notificationToKeys.delete(id);
}

export function subscribeToNotifications(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function subscribeToNotificationDismiss(fn: DismissListener) {
  dismissListeners.add(fn);
  return () => dismissListeners.delete(fn);
}

export function pushNotification(payload: NotificationPayload) {
  const id = payload.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const dismissKeys = normalizeKeys(payload.dismissKeys);
  const normalized: Required<NotificationPayload> = {
    id,
    title: payload.title ?? '',
    message: payload.message,
    type: payload.type ?? 'info',
    icon: payload.icon ?? '',
    backgroundColor: payload.backgroundColor ?? '',
    textColor: payload.textColor ?? '',
    borderColor: payload.borderColor ?? '',
    durationMs: payload.durationMs ?? 5200,
    actionLabel: payload.actionLabel ?? '',
    actionHref: payload.actionHref ?? '',
    avatarUrl: payload.avatarUrl ?? '',
    dismissKeys,
    onPress: payload.onPress ?? (() => {}),
  };

  cleanupNotificationIndex(id);
  if (dismissKeys.length) {
    notificationToKeys.set(id, dismissKeys);
    dismissKeys.forEach((key) => {
      const idSet = keyToNotifications.get(key) || new Set<string>();
      idSet.add(id);
      keyToNotifications.set(key, idSet);
    });
  }

  for (const l of listeners) {
    try {
      l(normalized);
    } catch {
      // ignore listener errors
    }
  }

  return id;
}

export function dismissNotification(id: string) {
  if (!id) return;
  cleanupNotificationIndex(id);
  for (const l of dismissListeners) {
    try {
      l(id);
    } catch {
      // ignore listener errors
    }
  }
}

export function dismissNotificationsByKeys(keys: string[]) {
  const normalized = normalizeKeys(keys);
  if (!normalized.length) return;
  const ids = new Set<string>();
  normalized.forEach((key) => {
    const idSet = keyToNotifications.get(key);
    if (!idSet) return;
    idSet.forEach((id) => ids.add(id));
  });
  ids.forEach((id) => dismissNotification(id));
}

export function markNotificationClosed(id: string) {
  cleanupNotificationIndex(id);
}

export function openNotificationLink(href?: string) {
  if (!href) return;
  try {
    Linking.openURL(href);
  } catch (e) {
    console.warn('Failed to open link', e);
  }
}
