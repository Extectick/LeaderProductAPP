import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { apiClient } from './apiClient';
import { API_ENDPOINTS } from './apiEndpoints';

const PUSH_TOKEN_KEY = 'pushToken';
const CHANNEL_ID = 'profile-status';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function initPushNotifications() {
  if (Platform.OS === 'web') return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Статусы профиля',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 200, 250],
      lightColor: '#22C55E',
      sound: 'default',
      enableVibrate: true,
    });
  }
}

async function requestPermissions(): Promise<boolean> {
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

export function getPushChannelId() {
  return CHANNEL_ID;
}
