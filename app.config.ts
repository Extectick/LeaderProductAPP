// app.config.ts
import * as dotenv from "dotenv";
import { ConfigContext, ExpoConfig } from "expo/config";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, process.env.NODE_ENV === "production" ? ".env.production" : ".env") });

export default ({ config }: ConfigContext): ExpoConfig => ({
  name: "Лидер Продукт",
  slug: "leader-product",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  scheme: "leaderproduct",
  icon: "./assets/images/icon.png",

  ios: { bundleIdentifier: "com.leaderproduct.app", buildNumber: "2" },
  android: {
    package: "com.leaderproduct.app",
    versionCode: 2,
    edgeToEdgeEnabled: true,
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-foreground.png",
      backgroundColor: "#ffffff",
    },
  },

  plugins: [
    "expo-router",
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
});
