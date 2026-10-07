// app.config.ts
import * as dotenv from "dotenv";
import { ConfigContext, ExpoConfig } from "expo/config";
import fs from "fs";
import path from "path";

dotenv.config({
  path: path.resolve(__dirname, process.env.NODE_ENV === "production" ? ".env.production" : ".env"),
  quiet: true,
});

type NativeVersionConfig = {
  versionName: string;
  versionCode: number;
  iosBuildNumber?: string;
};

const nativeVersion = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "app.version.json"), "utf8")
) as NativeVersionConfig;
const iosBuildNumber = nativeVersion.iosBuildNumber || String(nativeVersion.versionCode);

const sentryRuntimeEnabled = String(process.env.EXPO_PUBLIC_SENTRY_ENABLED || "").trim().toLowerCase() === "true";
const sentryUploadConfigured = !!(process.env.SENTRY_ORG && process.env.SENTRY_PROJECT && process.env.SENTRY_AUTH_TOKEN);
const enableSentryPlugin = sentryRuntimeEnabled || sentryUploadConfigured;
const updateChannel = process.env.EXPO_PUBLIC_UPDATE_CHANNEL || "prod";
const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_URL_DEV ||
  (updateChannel === "prod" ? "https://api.leader-product.ru" : "");
const otaUpdateUrl =
  process.env.EXPO_PUBLIC_OTA_UPDATE_URL ||
  (apiBaseUrl ? `${apiBaseUrl.replace(/\/+$/, "")}/ota/update` : undefined);

export default ({ config }: ConfigContext): ExpoConfig => ({
  name: "Лидер Продукт",
  slug: "leader-product",
  owner: "extectick",
  version: nativeVersion.versionName,
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  scheme: "leaderproduct",
  icon: "./assets/images/icon.png",
  runtimeVersion: {
    policy: "appVersion",
  },
  updates: {
    enabled: Boolean(otaUpdateUrl),
    url: otaUpdateUrl,
    checkAutomatically: "ON_LOAD",
    // Maximum network wait, not a minimum splash duration. Slow downloads
    // continue in the background and are exposed by the in-app update banner.
    fallbackToCacheTimeout: 8000,
    requestHeaders: {
      "expo-channel-name": updateChannel,
    },
  },
  web: {
    favicon: "./assets/images/favicon.png",
  },

  ios: { bundleIdentifier: "com.leaderproduct.app", buildNumber: iosBuildNumber },
  android: {
    package: "com.leaderproduct.app",
    versionCode: nativeVersion.versionCode,
    allowBackup: false,
    usesCleartextTraffic: true,
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-foreground.png",
      backgroundColor: "#ffffff",
    },
    permissions: [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "ACTIVITY_RECOGNITION",
      "RECEIVE_BOOT_COMPLETED",
      // foreground service для фонового трекинга (Android 10+ / SDK 34)
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_LOCATION",
      // нотификация обязательна для foreground service
      "POST_NOTIFICATIONS",
      // мультимедиа
      "CAMERA",
      "READ_MEDIA_IMAGES",
      "READ_MEDIA_VIDEO",
      "READ_MEDIA_AUDIO",
      "READ_EXTERNAL_STORAGE",
      "REQUEST_INSTALL_PACKAGES",
      // аудио/микрофон
      "RECORD_AUDIO",
      // bluetooth на будущее (скан/коннект)
      "BLUETOOTH_SCAN",
      "BLUETOOTH_CONNECT",
      // удобства
      "VIBRATE",
      "WAKE_LOCK"
    ],
    foregroundService: {
      notificationTitle: "Отслеживание маршрута",
      notificationBody: "Приложение собирает геоданные в фоне.",
      notificationColor: "#FF5722"
    }
  } as any,

  plugins: [
    // MainApplication mods run in reverse order: initialize before tracking/React.
    "./plugins/with-dev-crash-reporting",
    "expo-router",
    "@maplibre/maplibre-react-native",
    "./plugins/with-traccar-kotlin-compat",
    "expo-updates",
    "expo-asset",
    "expo-image",
    "expo-sharing",
    "expo-status-bar",
    "expo-web-browser",
    "expo-background-task",
    "./plugins/with-android-cleartext-network",
    "./plugins/with-leader-native-tracking",
    "./plugins/with-android-file-download",
    "expo-audio",
    "expo-font",
    "expo-secure-store",
    [
      "expo-location",
      {
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    "@kesha-antonov/react-native-background-downloader",
    ...(enableSentryPlugin ? [["@sentry/react-native/expo", {
      url: process.env.SENTRY_URL,
      organization: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
    }] as [string, Record<string, unknown>]] : []),
    "@react-native-community/datetimepicker",
    "expo-notifications",
    // MainActivity mods execute in reverse registration order: our cleanup must
    // run after Expo adds its splash registration, leaving one splash owner.
    "./plugins/with-android-native-ota-loader",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
      },
    ],
    // 👇 указываем модуль плагина как строку пути + опции
    // ["./plugins/with-cpp-flags", {
    //   createCMakeIfMissing: true,
    //   extraCppFlags: ["-Wno-dollar-in-identifier-extension"],
    //   mode: "both",
    // }],
  ],

  extra: {
    ...(config.extra || {}),
    eas: {
      projectId: "7c6d0fa1-6e18-4bf2-a6f4-b877e0b662e2",
      ...(config.extra as any)?.eas,
    },
  },
});
