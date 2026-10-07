/** SDK 1.0.10 emits this exact response after an upload (also for heartbeat).
 * Never turn "Upload error" or "requesting position" into a successful fix. */
export function trackingLogDiagnostics(logs: Array<{ time: number; message: string }>) {
  let lastSentAt: string | undefined;
  let lastError: string | undefined;
  for (const entry of [...logs].sort((a, b) => b.time - a.time)) {
    if (!Number.isFinite(entry.time) || !Number.isFinite(new Date(entry.time).getTime())) continue;
    if (/^Upload response 2\d\d$/.test(entry.message)) {
      lastSentAt = new Date(entry.time).toISOString();
      break;
    }
    if (!lastError && /^Upload (error:|failed,|response [45]\d\d)/.test(entry.message)) {
      lastError = 'Точки ожидают отправки. Проверьте интернет и состояние устройства';
    }
  }
  return { lastSentAt, lastError };
}

export type TrackingReliability = {
  batteryOptimizationExempt?: boolean;
  powerSaveMode?: boolean;
  notificationsEnabled?: boolean;
  commandsRunning?: boolean;
  lastCommandPollAt?: number;
  nextRetryAt?: number;
  commandError?: string | null;
};

export function trackingCommandConnectionLabel(lastPollAt?: string | null, now = Date.now()) {
  if (!lastPollAt) return null; // Older APIs do not expose command telemetry.
  const age = now - Date.parse(lastPollAt);
  return Number.isFinite(age) && age >= 0 && age < 90_000
    ? 'Телефон отвечает на команды'
    : 'Свежая связь с телефоном не подтверждена';
}
