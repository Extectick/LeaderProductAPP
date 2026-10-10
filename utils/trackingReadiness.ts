import type { TrackingV2Diagnostics } from './trackingV2Service';

export type TrackingSetupAction = 'permissions' | 'app' | 'location' | 'battery' | 'power';
export function trackingRequirements(d: TrackingV2Diagnostics) {
  return [
    { key: 'device', title: 'Фоновый сервис', ready: d.available, detail: d.available ? 'Android поддерживается' : 'Доступен только на Android', action: null },
    { key: 'location', title: 'Геолокация телефона', ready: d.locationServicesEnabled, detail: 'Включите геолокацию телефона', action: 'location' },
    { key: 'foreground', title: 'Доступ к геопозиции', ready: d.permission === 'granted', detail: 'Разрешите доступ к геопозиции', action: 'permissions' },
    { key: 'precise', title: 'Точная геопозиция', ready: d.preciseLocation === true, detail: 'Выберите точную, не приблизительную геопозицию', action: 'app' },
    { key: 'background', title: 'Доступ в фоне', ready: d.backgroundPermission === 'granted', detail: 'Разрешите геопозицию «Всегда»', action: 'permissions' },
    { key: 'activity', title: 'Физическая активность', ready: d.activityRecognitionPermission === 'granted' || d.activityRecognitionPermission === 'unavailable', detail: 'Разрешите распознавание движения', action: 'permissions' },
    { key: 'notifications', title: 'Уведомления', ready: d.notificationsEnabled === true, detail: 'Разрешите уведомления приложения', action: 'permissions' },
    { key: 'battery', title: 'Работа без ограничений', ready: d.batteryOptimizationExempt === true, detail: d.batteryOptimizationExempt === undefined ? 'Не удалось проверить. Повторите проверку или обновите приложение' : 'Снимите ограничения батареи для приложения', action: 'battery' },
    { key: 'power', title: 'Энергосбережение', ready: d.powerSaveMode === false, detail: 'Отключите энергосбережение телефона', action: 'power' },
  ] as const;
}
export function isTrackingReady(d: TrackingV2Diagnostics) {
  return trackingRequirements(d).every(item => item.ready);
}
export class TrackingSetupRequiredError extends Error {
  readonly code = 'TRACKING_SETUP_REQUIRED';
  constructor(d: TrackingV2Diagnostics) {
    super(`Сначала завершите настройку геолокации: ${trackingRequirements(d).filter(item => !item.ready).map(item => item.title.toLowerCase()).join(', ')}.`);
    this.name = 'TrackingSetupRequiredError';
  }
}
