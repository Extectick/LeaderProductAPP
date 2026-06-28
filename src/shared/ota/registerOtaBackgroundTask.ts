import AsyncStorage from '@react-native-async-storage/async-storage';
import * as TaskManager from 'expo-task-manager';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

const TASK_NAME = 'leader-product-ota-prefetch';
const LAST_RUN_KEY = 'ota:backgroundPrefetch:lastRunAt';
const READY_KEY = 'ota:backgroundPrefetch:ready';
const MIN_RUN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const CHECK_TIMEOUT_MS = 15_000;
const FETCH_TIMEOUT_MS = 90_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Background OTA task timed out')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function readUpdateLabel(source: unknown) {
  const manifest = (source as any)?.manifest;
  const metadata = manifest?.metadata;
  const extra = manifest?.extra;
  return String(
    metadata?.displayVersion ||
      metadata?.releaseKey ||
      extra?.displayVersion ||
      extra?.releaseKey ||
      (source as any)?.updateId ||
      ''
  ).trim();
}

function isUpdatesDisabled(error: unknown) {
  const message = String((error as any)?.message || '').toLowerCase();
  return (
    (error as any)?.code === 'ERR_UPDATES_DISABLED' ||
    message.includes('development mode') ||
    message.includes('development builds') ||
    message.includes('not supported in development')
  );
}

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(TASK_NAME)) {
  TaskManager.defineTask(TASK_NAME, async () => {
    if (__DEV__ || !Updates.isEnabled) return 1;

    try {
      const lastRunRaw = await AsyncStorage.getItem(LAST_RUN_KEY);
      const lastRunAt = Number(lastRunRaw || 0);
      if (lastRunAt && Date.now() - lastRunAt < MIN_RUN_INTERVAL_MS) {
        return 1;
      }

      await AsyncStorage.setItem(LAST_RUN_KEY, String(Date.now()));

      const checkResult = await withTimeout(Updates.checkForUpdateAsync(), CHECK_TIMEOUT_MS);
      if (!checkResult.isAvailable && !checkResult.isRollBackToEmbedded) {
        return 1;
      }

      const fetchResult = await withTimeout(Updates.fetchUpdateAsync(), FETCH_TIMEOUT_MS);
      if (fetchResult.isNew || fetchResult.isRollBackToEmbedded) {
        await AsyncStorage.setItem(
          READY_KEY,
          JSON.stringify({
            readyAt: Date.now(),
            updateId: (fetchResult as any)?.updateId || null,
            displayVersion: readUpdateLabel(fetchResult) || readUpdateLabel(checkResult) || null,
          })
        );
      }

      return 1;
    } catch (error) {
      if (isUpdatesDisabled(error)) {
        return 1;
      }
      return 2;
    }
  });
}

export async function registerOtaBackgroundPrefetchTask() {
  if (Platform.OS === 'web' || __DEV__) return;

  const BackgroundTask = require('expo-background-task') as typeof import('expo-background-task');
  const taskManagerAvailable = await TaskManager.isAvailableAsync();
  if (!taskManagerAvailable) return;

  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;

  const registered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
  if (registered) return;

  await BackgroundTask.registerTaskAsync(TASK_NAME, {
    minimumInterval: 60,
  });
}
