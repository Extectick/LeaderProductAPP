// app.config.ts
import * as dotenv from "dotenv";
import { ConfigContext, ExpoConfig } from "expo/config";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, process.env.NODE_ENV === "production" ? ".env.production" : ".env") });

export default ({ config }: ConfigContext): ExpoConfig => ({
  name: "Лидер Продукт",
  slug: "leader-product",
  owner: "extectick",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  scheme: "leaderproduct",
  icon: "./assets/images/icon.png",

  ios: { bundleIdentifier: "com.leaderproduct.app", buildNumber: "3" },
  android: {
    package: "com.leaderproduct.app",
    versionCode: 3,
    edgeToEdgeEnabled: true,
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-foreground.png",
      backgroundColor: "#ffffff",
    },
    permissions: [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
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
  },

  plugins: [
    "expo-router",
    "expo-audio",
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
