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
  onPress?: () => void;
};

type Listener = (n: Required<NotificationPayload>) => void;

const listeners = new Set<Listener>();

export function subscribeToNotifications(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function pushNotification(payload: NotificationPayload) {
  const id = payload.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
    onPress: payload.onPress ?? (() => {}),
  };

  for (const l of listeners) {
    try {
      l(normalized);
    } catch {
      // ignore listener errors
    }
  }

  return id;
}

export function openNotificationLink(href?: string) {
  if (!href) return;
  try {
    Linking.openURL(href);
  } catch (e) {
    console.warn('Failed to open link', e);
  }
}
