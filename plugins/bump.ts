import { execSync } from "child_process";

type Platform = "android" | "ios" | "all";

// простая обёртка над expo-version
function bump(platform: Platform) {
  try {
    console.log(`🔼 Поднимаю версию для ${platform}...`);
    execSync(`npx expo-version bump:${platform}`, {
      stdio: "inherit",
    });
    console.log(`✅ Готово! Версия обновлена для ${platform}`);
  } catch (err) {
    console.error("❌ Ошибка при bump версии:", err);
    process.exit(1);
  }
}

// читаем аргумент (по умолчанию all)
const arg = (process.argv[2] as Platform) || "all";
if (!["android", "ios", "all"].includes(arg)) {
  console.error("❌ Неверный аргумент. Используй: android | ios | all");
  process.exit(1);
}

bump(arg);
