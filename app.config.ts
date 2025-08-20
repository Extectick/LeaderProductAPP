import * as dotenv from "dotenv";
import { ConfigContext, ExpoConfig } from "expo/config";
import path from "path";

// Определяем какой env файл грузить
const envFile = process.env.NODE_ENV === "production" ? ".env.production" : ".env";

// Загружаем переменные окружения
dotenv.config({ path: path.resolve(__dirname, envFile) });

export default ({ config }: ConfigContext): ExpoConfig => ({
  owner: "extectick",
  name: "Лидер Продукт",
  slug: "leader-product",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  scheme: "leaderproduct",

  // 🔹 Основная иконка (должна быть квадратная 1024x1024)
  icon: "./assets/images/icon.png",

  extra: {
    // ⚡️ Берём из .env или .env.production
    EXPO_PUBLIC_API_URL_DEV: process.env.EXPO_PUBLIC_API_URL_DEV,
    router: {},
    eas: {
      projectId: "7c6d0fa1-6e18-4bf2-a6f4-b877e0b662e2",
    },
  },

  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.leaderproduct.app",
    infoPlist: {
      CFBundleURLTypes: [{ CFBundleURLSchemes: ["leaderproduct"] }],
    },
    buildNumber: "2", // увеличивай при каждом билде
  },

  android: {
    package: "com.leaderproduct.app",
    versionCode: 2, // увеличивай при каждом билде
    adaptiveIcon: {
      foregroundImage: "./assets/images/icon.png",
      backgroundColor: "#ffffff",
    },
    edgeToEdgeEnabled: true,
    intentFilters: [
      {
        action: "VIEW",
        data: [{ scheme: "leaderproduct", host: "*" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },

  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.ico",
  },

  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash.png",
        imageWidth: 200,
        resizeMode: "contain",
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
  },
});
