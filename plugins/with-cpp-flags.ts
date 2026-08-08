import { ConfigPlugin, withDangerousMod } from "expo/config-plugins";
import fs from "fs";
import path from "path";

/** Опции плагина */
export type WithCppFlagsOptions = {
  /** Создавать android/app/CMakeLists.txt, если его нет */
  createCMakeIfMissing?: boolean;
  /** Набор C++ флагов, которые нужно добавить */
  extraCppFlags?: string[];
  /** Как именно внедрять флаги:
   * - "targetCompileOptions": пытаться вставить в существующие target_compile_options(... PRIVATE ...)
   * - "addCompileOptions": если нет target_* — добавлять add_compile_options(...)
   * - "both": сначала targetCompileOptions (если нашли), иначе addCompileOptions
   */
  mode?: "targetCompileOptions" | "addCompileOptions" | "both";
};

/** Значения по умолчанию */
const defaultOptions: Required<WithCppFlagsOptions> = {
  createCMakeIfMissing: true,
  extraCppFlags: ["-Wno-dollar-in-identifier-extension"],
  mode: "both",
};

const HEADER = "# Added by with-cpp-flags Expo config plugin";

const withCppFlags: ConfigPlugin<WithCppFlagsOptions> = (config, userOptions) => {
  const options = { ...defaultOptions, ...(userOptions ?? {}) };

  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const cmakePath = path.join(
        cfg.modRequest.projectRoot,
        "android",
        "app",
        "CMakeLists.txt"
      );

      // 1) создать CMakeLists.txt при необходимости
      if (!fs.existsSync(cmakePath)) {
        if (!options.createCMakeIfMissing) {
          console.warn("[with-cpp-flags] CMakeLists.txt не найден. Создание отключено опцией.");
          return cfg;
        }
        const content = [
          "cmake_minimum_required(VERSION 3.4.1)",
          "",
          `${HEADER}`,
          options.mode !== "targetCompileOptions"
            ? `add_compile_options(${options.extraCppFlags.join(" ")})`
            : `# target_compile_options будет добавлен позднее`,
          "",
        ]
          .filter(Boolean)
          .join("\n");

        fs.mkdirSync(path.dirname(cmakePath), { recursive: true });
        fs.writeFileSync(cmakePath, content + "\n", "utf-8");
        console.log("[with-cpp-flags] 🆕 Создан android/app/CMakeLists.txt");
        return cfg;
      }

      // 2) Патч существующего CMakeLists.txt
      let cmake = fs.readFileSync(cmakePath, "utf-8");

      // Уже вставляли?
      const alreadyHasAll = options.extraCppFlags.every((f) => cmake.includes(f));
      if (alreadyHasAll) {
        console.log("[with-cpp-flags] ⚡ Флаги уже присутствуют — пропускаю");
        return cfg;
      }

      const flagsString = options.extraCppFlags.join(" ");

      const hasTargetCompileOptions = /(target_compile_options\s*\([^\)]*PRIVATE[^\)]*\))/s.test(cmake);
      const hasAddCompileOptions = /add_compile_options\s*\(([^)]*)\)/s.test(cmake);

      const addHeaderOnce = (text: string) =>
        text.includes(HEADER) ? text : `${HEADER}\n${text}`;

      const tryInjectIntoTarget = (text: string): string | null => {
        if (!hasTargetCompileOptions) return null;
        // Вставим флаги в первый встретившийся target_compile_options(... PRIVATE ...)
        return text.replace(
          /(target_compile_options\s*\([^\)]*PRIVATE)([^\)]*\))/s,
          (_m, p1, p2) => `${addHeaderOnce(p1)} ${flagsString}${p2}`
        );
      };

      const tryAddCompileOptions = (text: string): string | null => {
        if (hasAddCompileOptions) {
          // Допишем недостающие флаги к существующим add_compile_options(...)
          return text.replace(
            /add_compile_options\s*\(([^)]*)\)/s,
            (_m, inner) => {
              const existing = inner.split(/\s+/).filter(Boolean);
              const missing = options.extraCppFlags.filter((f) => !existing.includes(f));
              if (missing.length === 0) return _m; // всё уже есть
              return addHeaderOnce(`add_compile_options(${inner.trim()} ${missing.join(" ")})`);
            }
          );
        }
        // Иначе добавим новый блок add_compile_options(...)
        const insertPoint = text.includes("cmake_minimum_required")
          ? text.replace(/cmake_minimum_required[^\n]*\n?/, (line) => line + addHeaderOnce("") + `add_compile_options(${flagsString})\n`)
          : addHeaderOnce(`add_compile_options(${flagsString})\n`) + text;

        return insertPoint;
      };

      let patched = cmake;

      if (options.mode === "targetCompileOptions") {
        patched = tryInjectIntoTarget(patched) ?? patched;
      } else if (options.mode === "addCompileOptions") {
        patched = tryAddCompileOptions(patched) ?? patched;
      } else {
        // both
        const t1 = tryInjectIntoTarget(patched);
        patched = t1 ?? tryAddCompileOptions(patched) ?? patched;
      }

      // Финальная проверка: флаги добавились?
      const nowHasAll = options.extraCppFlags.every((f) => patched.includes(f));
      if (!nowHasAll) {
        console.warn("[with-cpp-flags] ⚠️ Не удалось гарантированно внедрить все флаги — проверь CMakeLists вручную.");
      } else {
        if (patched !== cmake) {
          fs.writeFileSync(cmakePath, patched, "utf-8");
          console.log("[with-cpp-flags] ✅ Флаги добавлены в CMakeLists.txt:", options.extraCppFlags.join(" "));
        } else {
          console.log("[with-cpp-flags] ⚡ Изменений не требуется");
        }
      }

      return cfg;
    },
  ]);
};

export default withCppFlags;
