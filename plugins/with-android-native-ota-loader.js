const { AndroidConfig, withAndroidManifest, withMainActivity, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const UPDATE_GATE_ACTIVITY = 'UpdateGateActivity';
const MAIN_ACTIVITY = 'MainActivity';
const CHECK_ON_LAUNCH_META = 'expo.modules.updates.EXPO_UPDATES_CHECK_ON_LAUNCH';
const LAUNCH_WAIT_META = 'expo.modules.updates.EXPO_UPDATES_LAUNCH_WAIT_MS';
const CUSTOM_INIT_PROPERTY = 'EX_UPDATES_CUSTOM_INIT';
const COROUTINES_DEPENDENCY = "implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3'";
const SPLASHSCREEN_DEPENDENCY = "implementation 'androidx.core:core-splashscreen:1.2.0'";

function normalizeActivityName(name, packageName) {
  if (!name) return name;
  if (name.startsWith('.')) return `${packageName}${name}`;
  return name;
}

function shortActivityName(name, packageName) {
  const normalized = normalizeActivityName(name, packageName);
  if (!normalized) return name;
  return normalized.startsWith(`${packageName}.`) ? `.${normalized.slice(packageName.length + 1)}` : normalized;
}

function findActivity(application, packageName, activityName) {
  const normalizedTarget = `${packageName}.${activityName}`;
  return (application.activity || []).find((activity) => {
    const name = activity.$?.['android:name'];
    return normalizeActivityName(name, packageName) === normalizedTarget;
  });
}

function hasAction(intentFilter, actionName) {
  return (intentFilter.action || []).some((action) => action.$?.['android:name'] === actionName);
}

function defaultIntentFilters() {
  return [
    {
      action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
      category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
    },
    {
      action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
      category: [
        { $: { 'android:name': 'android.intent.category.DEFAULT' } },
        { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
      ],
      data: [
        { $: { 'android:scheme': 'leaderproduct' } },
        { $: { 'android:scheme': 'exp+leader-product' } },
      ],
    },
  ];
}

function setMetaData(application, name, value) {
  application['meta-data'] = application['meta-data'] || [];
  let item = application['meta-data'].find((entry) => entry.$?.['android:name'] === name);
  if (!item) {
    item = { $: { 'android:name': name } };
    application['meta-data'].push(item);
  }
  item.$['android:value'] = value;
}

function updateManifest(androidManifest, packageName) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  application.activity = application.activity || [];

  setMetaData(application, CHECK_ON_LAUNCH_META, 'ALWAYS');
  setMetaData(application, LAUNCH_WAIT_META, '8000');

  const mainActivity = findActivity(application, packageName, MAIN_ACTIVITY);
  if (!mainActivity) {
    throw new Error('with-android-native-ota-loader could not find MainActivity');
  }

  const gateActivity = findActivity(application, packageName, UPDATE_GATE_ACTIVITY);
  const filters = [...(mainActivity['intent-filter'] || []), ...(gateActivity?.['intent-filter'] || [])];
  const uniqueFilters = [...new Map(filters.map((filter) => [JSON.stringify(filter), filter])).values()];
  if (!uniqueFilters.some((filter) => hasAction(filter, 'android.intent.action.MAIN'))) {
    uniqueFilters.unshift(defaultIntentFilters()[0]);
  }
  if (!filters.length) uniqueFilters.push(defaultIntentFilters()[1]);
  mainActivity['intent-filter'] = uniqueFilters;
  mainActivity.$['android:exported'] = 'true';
  mainActivity.$['android:name'] = shortActivityName(mainActivity.$['android:name'], packageName);
  mainActivity.$['android:launchMode'] = 'singleTask';
  application.activity = application.activity.filter((activity) => activity !== gateActivity);
  // Preserve explicit intents / pinned shortcuts created by older APKs without
  // instantiating a second Activity or exposing a second launcher icon.
  application['activity-alias'] = (application['activity-alias'] || []).filter((alias) =>
    normalizeActivityName(alias.$?.['android:name'], packageName) !== `${packageName}.${UPDATE_GATE_ACTIVITY}`);
  application['activity-alias'].push({ $: {
    'android:name': `.${UPDATE_GATE_ACTIVITY}`,
    'android:targetActivity': mainActivity.$['android:name'],
    'android:exported': 'true',
  } });
}

function updateMainActivity(contents) {
  let result = contents
    .replace(/^[ \t]*\/\/ @generated begin leader-startup-[^\n]*\r?\n[\s\S]*?^[ \t]*\/\/ @generated end leader-startup-[^\n]*\r?\n?/gm, '')
    .replace(/^[ \t]*\/\/ @generated begin expo-splashscreen[^\n]*\r?\n[\s\S]*?^[ \t]*\/\/ @generated end expo-splashscreen[^\n]*\r?\n?/gm, '')
    .replace(/^import expo\.modules\.splashscreen\.SplashScreenManager\r?\n/gm, '')
    .replace(/^[ \t]*SplashScreenManager\.registerOnActivity\(this\)\r?\n/gm, '');
  const splashImport = 'import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen';
  if (!result.includes(splashImport)) result = result.replace(/^(package [^\n]+\r?\n)/m, `$1${splashImport}\n`);
  const classPattern = /class MainActivity\s*:\s*ReactActivity\(\)\s*\{(?:\r?\n)?/;
  if (!classPattern.test(result) || !result.includes('super.onCreate(null)')) {
    throw new Error('Unsupported MainActivity template: refusing to replace application lifecycle');
  }
  result = result.replace(classPattern, (match) => `${match.trimEnd()}\n  // @generated begin leader-startup-state\n  private var startupOverlay: LeaderStartupOverlay? = null\n  // @generated end leader-startup-state\n`);
  result = result.replace('super.onCreate(null)', `// @generated begin leader-startup-create-before
    val splashScreen = installSplashScreen()
    splashScreen.setOnExitAnimationListener { it.remove() }
    if (!BuildConfig.DEBUG) startupOverlay = LeaderStartupOverlay(this)
    // @generated end leader-startup-create-before
    super.onCreate(null)
    // @generated begin leader-startup-create-after
    startupOverlay?.show()
    // @generated end leader-startup-create-after`);
  const dispose = '    startupOverlay?.dispose()\n    startupOverlay = null';
  if (/override fun onDestroy\(\)/.test(result)) {
    result = result.replace('super.onDestroy()', `// @generated begin leader-startup-destroy\n${dispose}\n    // @generated end leader-startup-destroy\n    super.onDestroy()`);
  } else {
    result = result.replace(/\n}\s*$/, `\n  // @generated begin leader-startup-destroy
  override fun onDestroy() {
${dispose}
    super.onDestroy()
  }
  // @generated end leader-startup-destroy
}\n`);
  }
  return result;
}

function upsertGradleProperty(contents, key, value) {
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(contents)) {
    return contents.replace(pattern, `${key}=${value}`);
  }
  const suffix = contents.endsWith('\n') ? '' : '\n';
  return `${contents}${suffix}${key}=${value}\n`;
}

function ensureCoroutinesDependency(buildGradle) {
  let result = buildGradle;
  for (const dependency of [COROUTINES_DEPENDENCY, SPLASHSCREEN_DEPENDENCY]) {
    if (!result.includes(dependency)) {
      result = result.replace(/dependencies\s*\{/, `dependencies {\n    ${dependency}`);
    }
  }
  return result;
}

function writeFileIfChanged(filePath, contents) {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === contents) {
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function startupOverlaySource(packageName) {
  return `package ${packageName}

import android.content.res.ColorStateList
import android.graphics.Color
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.facebook.react.bridge.ReactMarker
import com.facebook.react.bridge.ReactMarkerConstants
import expo.modules.updates.UpdatesController
import kotlin.math.roundToInt
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Presentation only. Expo owns initialization, waiting, rollback and JS events. */
class LeaderStartupOverlay(private val activity: MainActivity) {
  private lateinit var statusView: TextView
  private enum class Stage { LOGO, DOWNLOADING, APPLYING }
  private lateinit var progressBar: ProgressBar
  private lateinit var progressText: TextView
  private var rootView: View? = null
  private var progressJob: Job? = null
  private var disposed = false
  private val contentListener = ReactMarker.MarkerListener { name, _, _ ->
    if (name == ReactMarkerConstants.CONTENT_APPEARED) activity.runOnUiThread { dispose() }
  }

  init {
    ReactMarker.addListener(contentListener)
    Log.d(TAG, "Activity created; waiting for React content")
  }

  fun show() {
    if (disposed || rootView != null || activity.isFinishing || activity.isDestroyed) return
    buildContentView()
    progressJob = activity.lifecycleScope.launch {
      activity.repeatOnLifecycle(Lifecycle.State.STARTED) {
        while (isActive && !disposed) {
          // Read an SDK snapshot off the UI thread. Never replace its single
          // eventManager observer: that subscription belongs to UpdatesModule.
          val context = withContext(Dispatchers.IO) {
            try { UpdatesController.instance.getConstantsForModule().initialContext }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { null } // SDK may still be initializing.
          }
          if (disposed) return@repeatOnLifecycle
          when {
            context?.isDownloading == true -> renderStage(Stage.DOWNLOADING, context.downloadProgress)
            context?.isUpdatePending == true -> renderStage(Stage.APPLYING)
            else -> renderStage(Stage.LOGO)
          }
          delay(250) // Sampling interval, never a minimum display duration.
        }
      }
    }
  }

  fun dispose() {
    if (disposed) return
    disposed = true
    progressJob?.cancel()
    progressJob = null
    ReactMarker.removeListener(contentListener)
    rootView?.let { (it.parent as? ViewGroup)?.removeView(it) }
    rootView = null
    Log.d(TAG, "Startup presentation detached")
  }

  private fun buildContentView() {
    val root = FrameLayout(activity).apply {
      setBackgroundColor(Color.WHITE)
      layoutParams = ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
    }

    val logo = ImageView(activity).apply {
      setImageResource(R.drawable.splashscreen_logo)
      scaleType = ImageView.ScaleType.FIT_CENTER
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
      // Expo places the 200 dp artwork on a transparent 288 dp Android splash canvas.
      // Scaling that drawable to 132 dp used to shrink and shift the logo at handover.
      layoutParams = FrameLayout.LayoutParams(dp(288), dp(288), Gravity.CENTER)
    }

    statusView = TextView(activity).apply {
      setTextColor(Color.parseColor("#0F172A"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
      gravity = Gravity.CENTER
      typeface = android.graphics.Typeface.DEFAULT_BOLD
      accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
      layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
      ).apply {
        bottomMargin = dp(12)
      }
    }

    progressBar = ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal).apply {
      max = PROGRESS_MAX
      progress = 0
      isIndeterminate = true
      progressTintList = ColorStateList.valueOf(Color.parseColor("#2563EB"))
      progressBackgroundTintList = ColorStateList.valueOf(Color.parseColor("#E0ECFF"))
      indeterminateTintList = ColorStateList.valueOf(Color.parseColor("#2563EB"))
      layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        dp(8)
      ).apply {
        bottomMargin = dp(8)
      }
    }

    progressText = TextView(activity).apply {
      visibility = View.INVISIBLE
      setTextColor(Color.parseColor("#1E40AF"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
      gravity = Gravity.CENTER
      typeface = android.graphics.Typeface.DEFAULT_BOLD
      layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
      )
    }

    val statusColumn = LinearLayout(activity).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      addView(statusView)
      addView(progressBar)
      addView(progressText)
    }
    val statusArea = ScrollView(activity).apply {
      isVerticalScrollBarEnabled = false
      addView(statusColumn)
    }
    root.addView(logo)
    root.addView(statusArea)
    root.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
      val systemBottom = androidx.core.view.ViewCompat.getRootWindowInsets(root)
        ?.getInsets(WindowInsetsCompat.Type.systemBars())?.bottom ?: 0
      val columnWidth = minOf(dp(320), (root.width - dp(48)).coerceAtLeast(0))
      // Status/progress never participate in centering the logo.
      val statusTop = root.height / 2 + dp(128)
      val areaHeight = (root.height - statusTop - systemBottom - dp(16)).coerceAtLeast(0)
      val current = statusArea.layoutParams as FrameLayout.LayoutParams
      if (current.width != columnWidth || current.height != areaHeight || current.topMargin != statusTop) {
        statusArea.layoutParams = FrameLayout.LayoutParams(columnWidth, areaHeight, Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply {
          topMargin = statusTop
        }
      }
    }

    rootView = root
    activity.addContentView(root, root.layoutParams)
    renderStage(Stage.LOGO)
  }

  private fun renderStage(stage: Stage, progress: Double? = null) {
    if (!::statusView.isInitialized) return
    val downloading = stage == Stage.DOWNLOADING
    statusView.visibility = if (stage == Stage.LOGO) View.GONE else View.VISIBLE
    statusView.text = if (downloading) "Обновляем" else "Запускаем"
    progressBar.visibility = if (downloading) View.VISIBLE else View.GONE
    progressText.visibility = View.GONE
    if (!downloading) return

    val normalizedProgress = progress?.takeIf { it.isFinite() }?.coerceIn(0.0, 1.0)
    progressBar.isIndeterminate = normalizedProgress == null
    if (normalizedProgress != null) {
      progressBar.progress = (normalizedProgress * PROGRESS_MAX).roundToInt()
      progressText.text = "\${(normalizedProgress * 100).roundToInt()}%"
      progressText.visibility = View.VISIBLE
    }
  }

  private fun dp(value: Int): Int = (value * activity.resources.displayMetrics.density).roundToInt()

  companion object {
    private const val TAG = "LeaderStartup"
    private const val PROGRESS_MAX = 1000
  }
}
`;
}
function withAndroidNativeOtaLoader(config) {
  config = withAndroidManifest(config, (modConfig) => {
    const packageName = AndroidConfig.Package.getPackage(modConfig) || 'com.leaderproduct.app';
    updateManifest(modConfig.modResults, packageName);
    return modConfig;
  });

  config = withMainActivity(config, (modConfig) => {
    if (modConfig.modResults.language !== 'kt') throw new Error('Leader startup requires Kotlin MainActivity');
    modConfig.modResults.contents = updateMainActivity(modConfig.modResults.contents);
    return modConfig;
  });

  return withDangerousMod(config, [
    'android',
    (modConfig) => {
      const projectRoot = modConfig.modRequest.platformProjectRoot;
      const packageName = AndroidConfig.Package.getPackage(modConfig) || 'com.leaderproduct.app';

      const gradlePropertiesPath = path.join(projectRoot, 'gradle.properties');
      const gradleProperties = fs.existsSync(gradlePropertiesPath)
        ? fs.readFileSync(gradlePropertiesPath, 'utf8')
        : '';
      writeFileIfChanged(
        gradlePropertiesPath,
        upsertGradleProperty(upsertGradleProperty(gradleProperties, CUSTOM_INIT_PROPERTY, 'false'), 'EX_UPDATES_ANDROID_DELAY_LOAD_APP', 'true')
      );

      const appBuildGradlePath = path.join(projectRoot, 'app', 'build.gradle');
      writeFileIfChanged(
        appBuildGradlePath,
        ensureCoroutinesDependency(fs.readFileSync(appBuildGradlePath, 'utf8'))
      );

      const kotlinPath = path.join(
        projectRoot,
        'app',
        'src',
        'main',
        'java',
        ...packageName.split('.'),
        'LeaderStartupOverlay.kt'
      );
      writeFileIfChanged(kotlinPath, startupOverlaySource(packageName));

      return modConfig;
    },
  ]);
}

module.exports = withAndroidNativeOtaLoader;
