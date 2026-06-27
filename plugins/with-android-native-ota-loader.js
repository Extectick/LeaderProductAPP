const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const UPDATE_GATE_ACTIVITY = 'UpdateGateActivity';
const MAIN_ACTIVITY = 'MainActivity';
const CHECK_ON_LAUNCH_META = 'expo.modules.updates.EXPO_UPDATES_CHECK_ON_LAUNCH';
const LAUNCH_WAIT_META = 'expo.modules.updates.EXPO_UPDATES_LAUNCH_WAIT_MS';
const CUSTOM_INIT_PROPERTY = 'EX_UPDATES_CUSTOM_INIT';
const COROUTINES_DEPENDENCY = "implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3'";

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

  setMetaData(application, CHECK_ON_LAUNCH_META, 'NEVER');
  setMetaData(application, LAUNCH_WAIT_META, '30000');

  const mainActivity = findActivity(application, packageName, MAIN_ACTIVITY);
  if (!mainActivity) {
    throw new Error('with-android-native-ota-loader could not find MainActivity');
  }

  const movedIntentFilters = mainActivity['intent-filter']?.length
    ? mainActivity['intent-filter']
    : defaultIntentFilters();

  delete mainActivity['intent-filter'];
  mainActivity.$['android:exported'] = 'false';
  mainActivity.$['android:name'] = shortActivityName(mainActivity.$['android:name'], packageName);

  let gateActivity = findActivity(application, packageName, UPDATE_GATE_ACTIVITY);
  if (!gateActivity) {
    gateActivity = { $: { 'android:name': `.${UPDATE_GATE_ACTIVITY}` } };
    application.activity.unshift(gateActivity);
  }

  gateActivity.$ = {
    ...gateActivity.$,
    'android:name': `.${UPDATE_GATE_ACTIVITY}`,
    'android:configChanges': mainActivity.$['android:configChanges'] || 'keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode',
    'android:launchMode': 'singleTask',
    'android:theme': '@style/AppTheme',
    'android:exported': 'true',
    'android:screenOrientation': mainActivity.$['android:screenOrientation'] || 'portrait',
  };

  const hasLauncherFilter = movedIntentFilters.some((filter) => hasAction(filter, 'android.intent.action.MAIN'));
  gateActivity['intent-filter'] = hasLauncherFilter ? movedIntentFilters : defaultIntentFilters();
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
  if (buildGradle.includes(COROUTINES_DEPENDENCY)) {
    return buildGradle;
  }
  return buildGradle.replace(/dependencies\s*\{/, `dependencies {\n    ${COROUTINES_DEPENDENCY}`);
}

function writeFileIfChanged(filePath, contents) {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === contents) {
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function updateGateActivitySource(packageName) {
  return `package ${packageName}

import android.app.Activity
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.os.Bundle
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import expo.modules.updates.IUpdatesController
import expo.modules.updates.UpdatesController
import expo.modules.updates.events.IUpdatesEventManagerObserver
import expo.modules.updates.statemachine.UpdatesStateContext
import java.lang.ref.WeakReference
import kotlin.math.roundToInt
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

class UpdateGateActivity : Activity(), IUpdatesEventManagerObserver {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private lateinit var statusView: TextView
  private lateinit var hintView: TextView
  private lateinit var progressBar: ProgressBar
  private lateinit var progressText: TextView
  private var launchedMain = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    if (BuildConfig.DEBUG) {
      openMainActivity()
      return
    }

    window.statusBarColor = Color.WHITE
    window.navigationBarColor = Color.WHITE
    buildContentView()
    runUpdateGate()
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    setIntent(intent)
  }

  override fun onDestroy() {
    clearUpdatesObserver()
    scope.cancel()
    super.onDestroy()
  }

  override fun onStateMachineContextEvent(context: UpdatesStateContext) {
    runOnUiThread {
      when {
        context.isChecking -> showStatus("Проверяем обновления", "Связываемся с сервером обновлений.", null)
        context.isDownloading -> showStatus(
          "Загружаем обновление",
          "Скачиваем новый интерфейс перед запуском.",
          context.downloadProgress
        )
        context.isUpdatePending -> showStatus("Обновление готово", "Запускаем свежую версию.", 1.0)
        context.checkError != null || context.downloadError != null -> showStatus(
          "Обновление недоступно",
          "Запускаем текущую установленную версию.",
          null
        )
      }
    }
  }

  private fun runUpdateGate() {
    scope.launch {
      var controller: IUpdatesController? = null

      try {
        showStatus("Запускаем приложение", "Подготавливаем рабочее пространство.", 1.0)

        controller = withContext(Dispatchers.IO) {
          UpdatesController.initializeWithoutStarting(applicationContext)
          UpdatesController.instance
        }

        if (controller?.isActiveController != true) {
          showStatus("Запускаем приложение", "OTA недоступно для этой сборки.", 1.0)
          return@launch
        }

        controller.eventManager.observer = WeakReference(this@UpdateGateActivity)
        controller.onEventListenerStartObserving()

        showStatus("Проверяем обновления", "Связываемся с сервером обновлений.", null)
        val updateFetched = checkAndFetchUpdate(controller)
        if (updateFetched) {
          showStatus("Обновление готово", "Запускаем свежую версию.", 1.0)
        } else {
          showStatus("Запускаем приложение", "Текущая версия уже готова к работе.", 1.0)
        }
      } catch (error: Throwable) {
        Log.w(TAG, "Native update gate failed; launching current app", error)
        showStatus("Запускаем приложение", "Обновление временно недоступно.", 1.0)
      } finally {
        startUpdatesAndOpenMain(controller)
      }
    }
  }

  private suspend fun checkAndFetchUpdate(controller: IUpdatesController): Boolean {
    val checkResult = withTimeoutOrNull(OTA_CHECK_TIMEOUT_MS) {
      controller.checkForUpdate()
    }

    return when (checkResult) {
      is IUpdatesController.CheckForUpdateResult.UpdateAvailable,
      is IUpdatesController.CheckForUpdateResult.RollBackToEmbedded -> {
        showStatus("Загружаем обновление", "Скачиваем новый интерфейс перед запуском.", 0.0)
        val fetchResult = withTimeoutOrNull(OTA_FETCH_TIMEOUT_MS) {
          controller.fetchUpdate()
        }
        when (fetchResult) {
          is IUpdatesController.FetchUpdateResult.Success,
          is IUpdatesController.FetchUpdateResult.RollBackToEmbedded -> true
          else -> false
        }
      }
      else -> false
    }
  }

  private suspend fun startUpdatesAndOpenMain(controller: IUpdatesController?) {
    showStatus("Запускаем приложение", "Подготавливаем рабочее пространство.", 1.0)

    withContext(Dispatchers.IO) {
      runCatching {
        val activeController = controller ?: run {
          UpdatesController.initializeWithoutStarting(applicationContext)
          UpdatesController.instance
        }
        activeController.start()
        activeController.launchAssetFile ?: activeController.bundleAssetName
      }.onFailure {
        Log.w(TAG, "Failed to complete expo-updates startup", it)
      }
    }

    openMainActivity()
  }

  private fun openMainActivity() {
    if (launchedMain || isFinishing) return
    launchedMain = true
    clearUpdatesObserver()

    val sourceIntent = intent
    val nextIntent = Intent(this, MainActivity::class.java).apply {
      action = sourceIntent?.action
      data = sourceIntent?.data
      sourceIntent?.categories?.forEach { addCategory(it) }
      sourceIntent?.extras?.let { putExtras(it) }
      flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
    }

    startActivity(nextIntent)
    finish()
    overridePendingTransition(0, 0)
  }

  private fun clearUpdatesObserver() {
    runCatching {
      val observer = UpdatesController.instance.eventManager.observer?.get()
      if (observer === this) {
        UpdatesController.instance.eventManager.observer = null
      }
    }
  }

  private fun buildContentView() {
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(Color.WHITE)
      setPadding(dp(28), dp(28), dp(28), dp(28))
      layoutParams = ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
    }

    val logo = ImageView(this).apply {
      setImageResource(R.drawable.splashscreen_logo)
      scaleType = ImageView.ScaleType.FIT_CENTER
      layoutParams = LinearLayout.LayoutParams(dp(132), dp(132)).apply {
        bottomMargin = dp(22)
      }
    }

    val title = TextView(this).apply {
      text = getString(R.string.app_name)
      setTextColor(Color.parseColor("#0F172A"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 28f)
      gravity = Gravity.CENTER
      typeface = android.graphics.Typeface.DEFAULT_BOLD
      layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
      ).apply {
        bottomMargin = dp(10)
      }
    }

    statusView = TextView(this).apply {
      setTextColor(Color.parseColor("#0F172A"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
      gravity = Gravity.CENTER
      typeface = android.graphics.Typeface.DEFAULT_BOLD
      layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
      ).apply {
        bottomMargin = dp(6)
      }
    }

    hintView = TextView(this).apply {
      setTextColor(Color.parseColor("#475569"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      gravity = Gravity.CENTER
      layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
      ).apply {
        bottomMargin = dp(22)
      }
    }

    progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
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
        marginStart = dp(20)
        marginEnd = dp(20)
        bottomMargin = dp(8)
      }
    }

    progressText = TextView(this).apply {
      visibility = View.GONE
      setTextColor(Color.parseColor("#1E40AF"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
      gravity = Gravity.CENTER
      typeface = android.graphics.Typeface.DEFAULT_BOLD
      layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
      )
    }

    root.addView(logo)
    root.addView(title)
    root.addView(statusView)
    root.addView(hintView)
    root.addView(progressBar)
    root.addView(progressText)

    setContentView(root)
    showStatus("Проверяем обновления", "Связываемся с сервером обновлений.", null)
  }

  private fun showStatus(status: String, hint: String, progress: Double?) {
    if (!::statusView.isInitialized) return
    runOnUiThread {
      statusView.text = status
      hintView.text = hint

      val normalizedProgress = progress?.takeIf { it.isFinite() }?.coerceIn(0.0, 1.0)
      progressBar.isIndeterminate = normalizedProgress == null

      if (normalizedProgress == null) {
        progressText.visibility = View.GONE
        return@runOnUiThread
      }

      val progressValue = (normalizedProgress * PROGRESS_MAX).roundToInt()
      val percentValue = (normalizedProgress * 100).roundToInt()
      progressBar.progress = progressValue
      progressText.text = "$percentValue%"
      progressText.visibility = View.VISIBLE
    }
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).roundToInt()

  companion object {
    private const val TAG = "UpdateGateActivity"
    private const val PROGRESS_MAX = 1000
    private const val OTA_CHECK_TIMEOUT_MS = 8_000L
    private const val OTA_FETCH_TIMEOUT_MS = 120_000L
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
        upsertGradleProperty(gradleProperties, CUSTOM_INIT_PROPERTY, 'true')
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
        `${UPDATE_GATE_ACTIVITY}.kt`
      );
      writeFileIfChanged(kotlinPath, updateGateActivitySource(packageName));

      return modConfig;
    },
  ]);
}

module.exports = withAndroidNativeOtaLoader;
