import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { runOrderOutboxInBackground } from './orderOutbox';

const TASK_NAME = 'leader-order-outbox';
if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(TASK_NAME)) {
  TaskManager.defineTask(TASK_NAME, async () => {
    try { await runOrderOutboxInBackground(); return BackgroundTask.BackgroundTaskResult.Success; }
    catch { return BackgroundTask.BackgroundTaskResult.Failed; }
  });
}
export async function registerOrderOutboxTask() {
  if (Platform.OS === 'web' || !await TaskManager.isAvailableAsync()) return;
  if (await BackgroundTask.getStatusAsync() !== BackgroundTask.BackgroundTaskStatus.Available) return;
  if (!await TaskManager.isTaskRegisteredAsync(TASK_NAME)) await BackgroundTask.registerTaskAsync(TASK_NAME, { minimumInterval: 15 });
}
