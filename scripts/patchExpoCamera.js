const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', 'node_modules', 'expo-camera');
const files = new Map();
function read(file) {
  if (!files.has(file)) files.set(file, fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'));
  return files.get(file);
}
function patch(file, marker, before, after) {
  const original = read(file);
  if (original.includes(marker)) return;
  if (!original.includes(before)) throw new Error(`Review Expo camera patch after dependency upgrade: ${file}`);
  files.set(file, original.replace(before, after));
}

// Optional per-view feature: do not change CameraX defaults in other screens.
// A supplied zero opts into TextureView too, so expanding never swaps surfaces.
for (const [file, indent] of [['src/Camera.types.ts', '  '], ['build/Camera.types.d.ts', '    ']]) {
  const publicType = 'export type CameraViewProps = ViewProps & {';
  patch(file, `${publicType}\n${indent}/** Android: opt into`, publicType,
    `${publicType}\n${indent}/** Android: opt into a compositable live preview. Blur radius in dp (0..32).\n${indent} * Zero clears blur while retaining TextureView. API31+ blurs; older Android dims.\n${indent} * Omit this prop to preserve the standard camera rendering mode. */\n${indent}previewBlurRadius?: number;`);
  const nativeType = 'export type CameraNativeProps = {';
  patch(file, `${nativeType}\n${indent}previewBlurRadius?: number;`, nativeType,
    `${nativeType}\n${indent}previewBlurRadius?: number;`);
}
// ensureNativeProps already forwards all supplied props. Keep this opt-in Android-only.
for (const [file, indent] of [['src/utils/props.ts', '  '], ['build/utils/props.js', '    ']]) {
  const before = `${indent}if (Platform.OS !== 'web') {`;
  patch(file, 'delete newProps.previewBlurRadius;', before,
    `${indent}if (Platform.OS !== 'android') {\n${indent}  delete newProps.previewBlurRadius;\n${indent}}\n\n${before}`);
}

const native = 'android/src/main/java/expo/modules/camera/ExpoCameraView.kt';
patch(native, 'import android.graphics.RenderEffect', 'import android.graphics.ImageFormat',
  'import android.graphics.ImageFormat\nimport android.graphics.RenderEffect\nimport android.graphics.Shader');
patch(native, 'import android.os.Build', 'import android.os.Bundle', 'import android.os.Build\nimport android.os.Bundle');
patch(native, '  fun setPreviewBlurRadius(radius: Float?)', '  private val scope = CoroutineScope(', `  // Once opted in, keep the same TextureView while switching tile/full camera.
  private var compatiblePreviewEnabled = false
  private var appliedPreviewBlurRadius = -1f

  fun setPreviewBlurRadius(radius: Float?) {
    if (radius == null && !compatiblePreviewEnabled) return
    if (!compatiblePreviewEnabled) {
      compatiblePreviewEnabled = true
      previewView.implementationMode = PreviewView.ImplementationMode.COMPATIBLE
      // Also support opting in after the first camera session was already bound.
      shouldCreateCamera = true
    }
    val next = if (radius != null && radius.isFinite()) radius.coerceIn(0f, 32f) else 0f
    if (appliedPreviewBlurRadius == next) return
    appliedPreviewBlurRadius = next
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val pixels = next * resources.displayMetrics.density
      previewView.setRenderEffect(
        if (pixels > 0f) RenderEffect.createBlurEffect(pixels, pixels, Shader.TileMode.CLAMP) else null
      )
    } else {
      // No camera captures/bitmap readback or per-frame CPU work on older phones.
      // This is deliberately a dimmed live preview fallback, not a fake blur.
      previewView.foreground = if (next > 0f) Color.argb(90, 0, 0, 0).toDrawable() else null
    }
  }

  private val scope = CoroutineScope(`);

const moduleFile = 'android/src/main/java/expo/modules/camera/CameraViewModule.kt';
patch(moduleFile, '      Prop("previewBlurRadius")', '      Prop("facing")',
  '      Prop("previewBlurRadius") { view, radius: Float? ->\n        view.setPreviewBlurRadius(radius)\n      }\n\n      Prop("facing")');

for (const [file, content] of files) {
  const target = path.join(root, file);
  if (fs.readFileSync(target, 'utf8') !== content) fs.writeFileSync(target, content);
}
console.log('[patch-expo-camera] opt-in compositable live preview blur ready');
