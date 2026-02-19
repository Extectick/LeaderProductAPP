import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { apiClient } from './apiClient';
import { API_ENDPOINTS } from './apiEndpoints';

const PUSH_TOKEN_KEY = 'pushToken';
const PROFILE_CHANNEL_ID = 'profile-status';
const APPEAL_MESSAGE_CHANNEL_ID = 'appeal-message';

let notificationsModule: typeof import('expo-notifications') | null = null;
let handlerInitialized = false;
let responseListener: { remove: () => void } | null = null;

function isExpoGo() {
  const ownership = (Constants as any).appOwnership;
  const execution = (Constants as any).executionEnvironment;
  return ownership === 'expo' || execution === 'storeClient';
}

async function getNotificationsModule() {
  if (Platform.OS === 'web') return null;
  if (isExpoGo()) return null;
  if (notificationsModule) return notificationsModule;
  try {
    const mod = await import('expo-notifications');
    notificationsModule = mod;
    return mod;
  } catch (error) {
    console.warn('[push] expo-notifications unavailable', error);
    return null;
  }
}

export async function initPushNotifications() {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;

  if (!handlerInitialized) {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => ({
        shouldShowAlert: notification.request.content.data?.type !== 'APPEAL_MESSAGE',
        shouldShowBanner: notification.request.content.data?.type !== 'APPEAL_MESSAGE',
        shouldShowList: notification.request.content.data?.type !== 'APPEAL_MESSAGE',
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    handlerInitialized = true;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(PROFILE_CHANNEL_ID, {
      name: 'Статусы профиля',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 200, 250],
      lightColor: '#22C55E',
      sound: 'default',
      enableVibrate: true,
    });
    await Notifications.setNotificationChannelAsync(APPEAL_MESSAGE_CHANNEL_ID, {
      name: 'Сообщения обращений',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 200, 250],
      lightColor: '#2563EB',
      sound: 'default',
      enableVibrate: true,
    });
  }
}

async function requestPermissions(): Promise<boolean> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return false;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  return finalStatus === 'granted';
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const Notifications = await getNotificationsModule();
  if (!Notifications) return null;

  const ok = await requestPermissions();
  if (!ok) return null;

  const projectId =
    (Constants.expoConfig as any)?.extra?.eas?.projectId ||
    (Constants as any)?.easConfig?.projectId;

  try {
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    return token.data;
  } catch (error) {
    console.warn('Failed to get Expo push token:', error);
    return null;
  }
}

export async function syncPushToken() {
  const token = await registerForPushNotificationsAsync();
  if (!token) return null;

  const stored = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  if (stored === token) return token;

  await apiClient(API_ENDPOINTS.USERS.DEVICE_TOKENS, {
    method: 'POST',
    body: { token, platform: Platform.OS },
  });

  await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
  return token;
}

export async function unregisterPushToken() {
  const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  if (!token) return;

  await apiClient(API_ENDPOINTS.USERS.DEVICE_TOKENS, {
    method: 'DELETE',
    body: { token },
  });

  await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
}

function parseAppealId(value: any): number | null {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function parseAppealIdFromData(data: any): number | null {
  if (!data) return null;
  const type = String(data.type || '').toUpperCase();
  if (!type.startsWith('APPEAL_')) return null;
  return parseAppealId(data.appealId);
}

export async function bindPushNavigation(onOpenAppeal: (appealId: number) => void) {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return () => {};

  responseListener?.remove();
  responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
    const appealId = parseAppealIdFromData(response.notification.request.content.data);
    if (appealId) onOpenAppeal(appealId);
  });

  try {
    const coldStart = await Notifications.getLastNotificationResponseAsync();
    if (coldStart) {
      const appealId = parseAppealIdFromData(coldStart.notification.request.content.data);
      if (appealId) onOpenAppeal(appealId);
      await Notifications.clearLastNotificationResponseAsync?.();
    }
  } catch (error) {
    console.warn('[push] failed to parse cold start notification', error);
  }

  return () => {
    responseListener?.remove();
    responseListener = null;
  };
}

export async function dismissAppealSystemNotifications(opts: {
  appealId?: number;
  messageIds?: number[];
}) {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;

  const appealId = parseAppealId(opts.appealId);
  const messageIdSet = new Set(
    (opts.messageIds || [])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0)
  );
  if (!appealId && !messageIdSet.size) return;

  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      presented.map(async (notification) => {
        const data: any = notification.request.content.data || {};
        if (data.type !== 'APPEAL_MESSAGE') return;
        const sameAppeal = appealId ? parseAppealId(data.appealId) === appealId : false;
        const sameMessage = messageIdSet.size
          ? messageIdSet.has(Number(data.messageId))
          : false;
        if (!sameAppeal && !sameMessage) return;
        await Notifications.dismissNotificationAsync(notification.request.identifier);
      })
    );
  } catch (error) {
    console.warn('[push] failed to dismiss system notifications', error);
  }
}

export function getPushChannelId() {
  return PROFILE_CHANNEL_ID;
}

export function getAppealPushChannelId() {
  return APPEAL_MESSAGE_CHANNEL_ID;
}
