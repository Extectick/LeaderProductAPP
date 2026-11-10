import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import {createPushRegistrationStore} from './pushRegistrationAccount';
import {emitPushRegistrationChanged} from './pushRegistrationEvents';
import {createPushNavigationIntent} from './pushNavigationIntent';
import {getAccessToken,getAccessTokenForRequest} from './tokenService';

import { apiClient } from './apiClient';
import { API_ENDPOINTS } from './apiEndpoints';
import { emitHelpPushReceived } from '@/src/features/help/helpNotificationEvents';
import { parseTrackingPush } from '@/src/features/tracking/trackingPushPayload';
import { type HelpPushTarget, parseHelpPush } from '@/src/features/help/helpPush';

const PUSH_TOKEN_KEY = 'pushToken';
const PROFILE_CHANNEL_ID = 'profile-status';
const APPEAL_MESSAGE_CHANNEL_ID = 'appeal-message';
const HELP_MESSAGE_CHANNEL_ID = 'help-message';
const HELP_IT_REQUEST_CHANNEL_ID = 'help-it-request';
const TRACKING_PUSH_TASK = 'TRACKING_V2_LOCATION_REQUEST';

let notificationsModule: typeof import('expo-notifications') | null = null;
let handlerInitialized = false;
let responseListener: { remove: () => void } | null = null;
type NativePushResponse = import('expo-notifications').NotificationResponse;
const pushNavigation = createPushNavigationIntent<NativePushResponse>({
  read: async () => (await getNotificationsModule())?.getLastNotificationResponseAsync() ?? null,
  clear: async () => { await (await getNotificationsModule())?.clearLastNotificationResponseAsync?.(); },
  identity: response => JSON.stringify([response.notification.request.identifier, response.actionIdentifier, response.notification.date]),
});
export type StartupHelpNotification = { target: HelpPushTarget; response: NativePushResponse };
export function helpPushNavigationTarget(target: HelpPushTarget) {
  return { pathname: '/services/help' as const, params: {
    ticketId: String(target.ticketId), messageId: target.messageId ? String(target.messageId) : undefined,
    eventId: target.eventId ? String(target.eventId) : undefined, htmlId: undefined, entry: 'notification',
  } };
}
export async function readStartupHelpNotification(): Promise<StartupHelpNotification | null> {
  const response = await pushNavigation.initial();
  if (!response || pushNavigation.accepted(response)) return null;
  const target = parseHelpPush(response.notification.request.content.data);
  return target ? { target, response } : null;
}
/** Called after the target route committed, never merely after reading metadata. */
export function acceptStartupHelpNotification(intent: StartupHelpNotification, userId: number) {
  return pushNavigation.deliver(intent.response, () => true,
    () => Number.isSafeInteger(userId) && userId > 0 && (intent.target.recipientUserId === undefined || intent.target.recipientUserId === userId));
}
const trackingRequests = new Map<string, number>();

async function handleTrackingPush(data: unknown) {
  const payload = parseTrackingPush(data);
  if (!payload) return;
  for (const [id, expiresAt] of trackingRequests) if (expiresAt < Date.now()) trackingRequests.delete(id);
  if (trackingRequests.has(payload.requestId)) return;
  trackingRequests.set(payload.requestId, payload.expiresAt);
  try {
    const { requestTrackingPosition } = await import('./trackingV2Service');
    await requestTrackingPosition(payload.requestId);
  } catch {
    console.warn('[tracking-v2] could not capture requested location');
  }
}

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(TRACKING_PUSH_TASK)) {
  TaskManager.defineTask(TRACKING_PUSH_TASK, async ({ data, error }) => {
    if (error) return;
    await handleTrackingPush(data);
  });
}

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

  try {
    await Notifications.registerTaskAsync(TRACKING_PUSH_TASK);
  } catch (error) {
    console.warn('[tracking-v2] push background task unavailable', error);
  }

  if (!handlerInitialized) {
    Notifications.addNotificationReceivedListener((notification) => { void handleTrackingPush(notification); const help=parseHelpPush(notification.request.content.data);if(help)emitHelpPushReceived({...help,title:notification.request.content.title??undefined,body:notification.request.content.body??undefined}); });
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => ({
        shouldShowAlert: !['APPEAL_MESSAGE', 'HELP_MESSAGE', 'TRACKING_LOCATION_REQUEST'].includes(String(notification.request.content.data?.type)),
        shouldShowBanner: !['APPEAL_MESSAGE', 'HELP_MESSAGE', 'TRACKING_LOCATION_REQUEST'].includes(String(notification.request.content.data?.type)),
        shouldShowList: !['APPEAL_MESSAGE', 'HELP_MESSAGE', 'TRACKING_LOCATION_REQUEST'].includes(String(notification.request.content.data?.type)),
        shouldPlaySound: !['HELP_MESSAGE','HELP_TICKET','TRACKING_LOCATION_REQUEST'].includes(String(notification.request.content.data?.type)),
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
      enableVibrate: true,
    });
    await Notifications.setNotificationChannelAsync(APPEAL_MESSAGE_CHANNEL_ID, {
      name: 'Сообщения обращений',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 200, 250],
      lightColor: '#2563EB',
      enableVibrate: true,
    });
    await Notifications.setNotificationChannelAsync(HELP_MESSAGE_CHANNEL_ID, {
      name: 'Помощь — сообщения IT', importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 200, 250], lightColor: '#3289FF', enableVibrate: true,
    });
    await Notifications.setNotificationChannelAsync(HELP_IT_REQUEST_CHANNEL_ID, {
      name: 'Помощь — вызов IT-специалиста', importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 200, 250], lightColor: '#3289FF', enableVibrate: true,
    });
  }
}

async function requestPermissions(askPermission=true): Promise<boolean> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return false;

  const { status: existingStatus,canAskAgain } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted'&&askPermission&&canAskAgain!==false) {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  return finalStatus === 'granted';
}

export async function registerForPushNotificationsAsync(askPermission=true): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const Notifications = await getNotificationsModule();
  if (!Notifications) { if(__DEV__)console.info('[push] notifications module unavailable'); return null; }

  const ok = await requestPermissions(askPermission);
  if (!ok) { if(__DEV__)console.info('[push] notification permission not granted'); return null; }

  const projectId =
    (Constants.expoConfig as any)?.extra?.eas?.projectId ||
    (Constants as any)?.easConfig?.projectId;

  try {
    if(__DEV__)console.info('[push] requesting Expo token');
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    if(__DEV__)console.info('[push] Expo token ready');
    return token.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || '');
    if (/Default FirebaseApp is not initialized|fcm-credentials|FirebaseApp\.initializeApp/i.test(message)) {
      if(__DEV__)console.info('[push] Firebase native configuration unavailable');
      return null;
    }
    throw Object.assign(new Error('Не удалось получить push-токен'),{retryable:true});
  }
}

/** Native token changes require fetching a fresh Expo token; native values are never posted as Expo tokens. */
export async function subscribePushTokenChanges(listener:()=>void){
  const Notifications=await getNotificationsModule();if(!Notifications)return()=>{};
  let previous:string|undefined;
  const subscription=Notifications.addPushTokenListener(token=>{const fingerprint=JSON.stringify(token);if(fingerprint===previous)return;previous=fingerprint;listener();});
  return()=>subscription.remove();
}
const pushRegistration=createPushRegistrationStore({
  acquireCredential:getAccessTokenForRequest,readCredential:getAccessToken,
  fetchExpoToken:registerForPushNotificationsAsync,
  request:(method,token,credential)=>apiClient(API_ENDPOINTS.USERS.DEVICE_TOKENS,{method,body:{token,...(method==='POST'?{platform:Platform.OS}:{})},skipAuth:true,headers:{Authorization:`Bearer ${credential}`},timeoutMs:10000}),
  readSavedToken:()=>AsyncStorage.getItem(PUSH_TOKEN_KEY),saveToken:async token=>{await AsyncStorage.setItem(PUSH_TOKEN_KEY,token);emitPushRegistrationChanged();},removeToken:async()=>{await AsyncStorage.removeItem(PUSH_TOKEN_KEY);emitPushRegistrationChanged();},
});
export const syncPushToken=pushRegistration.sync;
export const unregisterPushToken=pushRegistration.unregister;

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

export async function bindPushNavigation(onOpenAppeal: (appealId: number) => boolean|void, onOpenHelp?: (ticketId: number, target?: HelpPushTarget) => boolean|void) {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return () => {};
  if(__DEV__)console.info('[push] navigation binding ready');

  responseListener?.remove();
  const dispatch = (response: NativePushResponse) => {
    const help = parseHelpPush(response.notification.request.content.data);
    if (help) return Boolean(onOpenHelp) && onOpenHelp!(help.ticketId,help) !== false;
    const appealId = parseAppealIdFromData(response.notification.request.content.data);
    return Boolean(appealId) && onOpenAppeal(appealId!) !== false;
  };
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    pushNavigation.deliver(response, dispatch, () => responseListener === subscription);
  });
  responseListener=subscription;

  try {
    await pushNavigation.restore(dispatch, () => responseListener === subscription);
  } catch (error) {
    console.warn('[push] failed to parse cold start notification', error);
  }

  return () => {
    subscription.remove();
    if(responseListener===subscription)responseListener = null;
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
