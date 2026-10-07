const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// LeaderProduct: Traccar Kotlin metadata compatibility';
const COMPATIBILITY_BLOCK = `${MARKER}
tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
    // Traccar SDK 1.0.10 is built with Kotlin 2.3 metadata while Expo 57 / RN
    // 0.86 currently compile the application with Kotlin 2.1. The SDK is
    // binary-compatible here, but the compiler otherwise rejects its metadata
    // before compiling our app module.
    compilerOptions.freeCompilerArgs.add("-Xskip-metadata-version-check")
}
`;

function withTraccarKotlinCompat(config) {
  return withAppBuildGradle(config, (modConfig) => {
    const contents = modConfig.modResults.contents;
    if (contents.includes(MARKER)) return modConfig;

    const pluginLine = 'apply plugin: "org.jetbrains.kotlin.android"';
    if (!contents.includes(pluginLine)) {
      throw new Error('with-traccar-kotlin-compat could not find the Kotlin Android plugin');
    }
    modConfig.modResults.contents = contents.replace(
      pluginLine,
      `${pluginLine}\n\n${COMPATIBILITY_BLOCK.trimEnd()}`
    );
    return modConfig;
  });
}

module.exports = withTraccarKotlinCompat;
