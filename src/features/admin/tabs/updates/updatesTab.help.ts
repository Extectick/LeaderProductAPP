export const UPDATES_HELP_TEXT = {
  platform: {
    title: 'Платформа',
    message:
      'Выберите платформу для обновления. Для Android можно загрузить APK, для iOS используется ссылка на App Store/TestFlight.',
  },
  channel: {
    title: 'Канал',
    message:
      'Канал обновлений. prod — основная ветка, dev — тестовая. Клиент берёт канал из EXPO_PUBLIC_UPDATE_CHANNEL.',
  },
  versionCode: {
    title: 'Код версии (versionCode)',
    message:
      'Целочисленный код сборки для сравнения версий (Android versionCode / iOS buildNumber). Должен быть больше текущего.',
  },
  versionName: {
    title: 'Имя версии (versionName)',
    message: 'Человекочитаемая версия, например 1.2.3.',
  },
  minSupportedVersionCode: {
    title: 'Минимальная поддерживаемая версия',
    message:
      'Если версия пользователя ниже этого значения, обновление считается обязательным.',
  },
  rolloutPercent: {
    title: 'Процент раскатки',
    message:
      'Сколько устройств получат обновление. 100 — всем, 10 — примерно 10% (по deviceId).',
  },
  mandatory: {
    title: 'Обязательное обновление',
    message:
      'Если включено, пользователь не сможет продолжить работу без обновления.',
  },
  active: {
    title: 'Активное обновление',
    message:
      'Только активные записи участвуют в проверке обновлений. Неактивные игнорируются.',
  },
  storeUrl: {
    title: 'Store URL',
    message:
      'Ссылка на App Store/TestFlight или Google Play. Для iOS обязательна, если нет APK.',
  },
  releaseNotes: {
    title: 'Release notes',
    message: 'Короткое описание изменений, показывается пользователю.',
  },
  apk: {
    title: 'APK файл',
    message: 'Файл APK для Android. Для iOS загрузка APK не используется.',
  },
  cleanupKeepLatest: {
    title: 'Оставить последних',
    message:
      'Сколько последних версий оставить (по платформе и каналу). Остальные будут удалены.',
  },
  cleanupPurge: {
    title: 'Удалять APK',
    message:
      'Если включено, файл APK будет удалён из хранилища вместе с записью.',
  },
} as const;

export type UpdateHelpKey = keyof typeof UPDATES_HELP_TEXT;
