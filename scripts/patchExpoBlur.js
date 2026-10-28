const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', 'node_modules', 'expo-blur');

// Opt-in Help surfaces: keep Expo defaults for other BlurViews. Normalize line
// endings before checking markers so reinstall/postinstall remains idempotent.
const files = new Map();
function read(file) {
  if (!files.has(file)) files.set(file, fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'));
  return files.get(file);
}
function patch(file, marker, before, after) {
  const original = read(file);
  if (original.includes(marker)) return;
  if (!original.includes(before)) throw new Error(`Review Expo blur patch after dependency upgrade: ${file}`);
  files.set(file, original.replace(before, after));
}

// Repair duplicate source lines left by the previous CRLF-sensitive patch.
const source = 'src/BlurView.tsx';
files.set(source, read(source)
  .replace(/(      noiseEnabled = true,\n)(?:      noiseEnabled = true,\n)+/g, '$1')
  .replace(/(          \{\.\.\.\(Platform\.OS === 'android' \? \{ noiseEnabled \} : \{\}\)\}\n)(?:          \{\.\.\.\(Platform\.OS === 'android' \? \{ noiseEnabled \} : \{\}\)\}\n)+/g, '$1'));

patch('build/BlurView.types.d.ts', 'noiseEnabled?: boolean;', 'export type BlurViewProps = {', 'export type BlurViewProps = {\n    noiseEnabled?: boolean;');
patch('build/BlurView.types.d.ts', 'frameClearColor?: string;', 'export type BlurViewProps = {', 'export type BlurViewProps = {\n    frameClearColor?: string;');
patch('src/BlurView.types.ts', 'noiseEnabled?: boolean;', 'export type BlurViewProps = {', 'export type BlurViewProps = {\n  /** Android: disable native grain independently from blur. */\n  noiseEnabled?: boolean;');
patch('src/BlurView.types.ts', 'frameClearColor?: string;', 'export type BlurViewProps = {', 'export type BlurViewProps = {\n  /** Android: hex color behind the captured target, instead of the window background. */\n  frameClearColor?: string;');

patch('build/BlurView.js', 'noiseEnabled = true,', "const { tint = 'default', intensity", "const { tint = 'default', noiseEnabled = true, intensity");
patch('build/BlurView.js', 'frameClearColor, intensity', 'noiseEnabled = true, intensity', 'noiseEnabled = true, frameClearColor, intensity');
patch('build/BlurView.js', "...(Platform.OS === 'android' ? { noiseEnabled } : {}),", 'ref: this.blurViewRef, tint: tint,', "ref: this.blurViewRef, tint: tint, ...(Platform.OS === 'android' ? { noiseEnabled } : {}),");
patch('build/BlurView.js', "...(Platform.OS === 'android' ? { frameClearColor } : {}),", 'blurTargetId: this.state.blurTargetId,', "...(Platform.OS === 'android' ? { frameClearColor } : {}), blurTargetId: this.state.blurTargetId,");
patch(source, 'noiseEnabled = true,', "      tint = 'default',", "      tint = 'default',\n      noiseEnabled = true,");
patch(source, '      frameClearColor,', '      noiseEnabled = true,', '      noiseEnabled = true,\n      frameClearColor,');
patch(source, "...(Platform.OS === 'android' ? { noiseEnabled } : {})", '          tint={tint}', "          tint={tint}\n          {...(Platform.OS === 'android' ? { noiseEnabled } : {})}");
patch(source, "...(Platform.OS === 'android' ? { frameClearColor } : {})", '          blurTargetId={this.state.blurTargetId}', "          {...(Platform.OS === 'android' ? { frameClearColor } : {})}\n          blurTargetId={this.state.blurTargetId}");

const native = 'android/src/main/java/expo/modules/blur/ExpoBlurView.kt';
patch(native, '  private var noiseEnabled = true', '  private var blurTargetId: Int? = null', '  private var noiseEnabled = true\n  private var blurTargetId: Int? = null');
patch(native, '  fun setNoiseEnabled(', '  fun setBlurTargetId(blurTargetId: Int?) {', '  fun setNoiseEnabled(enabled: Boolean) {\n    if (noiseEnabled == enabled) return\n    noiseEnabled = enabled\n    configureBlurView()\n    applyCurrentBlurSettings()\n  }\n\n  fun setBlurTargetId(blurTargetId: Int?) {');
patch(native, 'blurView.setupWith(dimezisBlurTarget, 4f, noiseEnabled)', 'blurView.setupWith(dimezisBlurTarget)', 'blurView.setupWith(dimezisBlurTarget, 4f, noiseEnabled)');
patch(native, 'import android.graphics.drawable.ColorDrawable', 'import android.graphics.Color', 'import android.graphics.Color\nimport android.graphics.drawable.ColorDrawable');
patch(native, '  private var frameClearColor: Int? = null', '  private var noiseEnabled = true', '  private var frameClearColor: Int? = null\n  private var noiseEnabled = true');
patch(native, '  fun setFrameClearColor(', '  fun setNoiseEnabled(enabled: Boolean) {', '  fun setFrameClearColor(color: String?) {\n    val parsed = color?.let { runCatching { Color.parseColor(it) }.getOrNull() }\n    if (frameClearColor == parsed) return\n    frameClearColor = parsed\n    configureBlurView()\n    applyCurrentBlurSettings()\n  }\n\n  fun setNoiseEnabled(enabled: Boolean) {');
patch(native, '.setFrameClearDrawable(frameClearColor?.let { ColorDrawable(it) } ?: decorView.background)', '.setFrameClearDrawable(decorView.background)', '.setFrameClearDrawable(frameClearColor?.let { ColorDrawable(it) } ?: decorView.background)');
// A late target used to leave the no-target fallback behind the actual blur.
patch(native, '    this.blurTargetId = blurTargetId\n    configureBlurView()\n    applyCurrentBlurSettings()', '    this.blurTargetId = blurTargetId\n    configureBlurView()', '    this.blurTargetId = blurTargetId\n    configureBlurView()\n    applyCurrentBlurSettings()');

const moduleFile = 'android/src/main/java/expo/modules/blur/BlurModule.kt';
patch(moduleFile, '      Prop("noiseEnabled")', '      Prop("intensity")', '      Prop("noiseEnabled") { view: ExpoBlurView, enabled: Boolean ->\n        view.setNoiseEnabled(enabled)\n      }\n\n      Prop("intensity")');
patch(moduleFile, '      Prop("frameClearColor")', '      Prop("blurTargetId")', '      Prop("frameClearColor") { view: ExpoBlurView, color: String? ->\n        view.setFrameClearColor(color)\n      }\n\n      Prop("blurTargetId")');

for (const [file, content] of files) {
  const target = path.join(root, file);
  if (fs.readFileSync(target, 'utf8') !== content) fs.writeFileSync(target, content);
}
console.log('[patch-expo-blur] noise and frame-clear opt-ins ready');
