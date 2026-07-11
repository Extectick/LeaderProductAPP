const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function patchFile(relativePath, patches) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    console.warn(`[patch-expo-task-manager] skip missing ${relativePath}`);
    return;
  }

  let source = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  for (const patch of patches) {
    if (source.includes(patch.after)) {
      continue;
    }
    if (!source.includes(patch.before)) {
      console.warn(`[patch-expo-task-manager] pattern not found in ${relativePath}: ${patch.name}`);
      continue;
    }
    source = source.replace(patch.before, patch.after);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, source, 'utf8');
    console.log(`[patch-expo-task-manager] patched ${relativePath}`);
  }
}

patchFile('node_modules/expo-task-manager/android/src/main/java/expo/modules/taskManager/TaskService.java', [
  {
    name: 'keep application context',
    before: `  public TaskService(Context context) {
    super();
    mContextRef = new WeakReference<>(context);
    mTasksAndEventsRepository = TasksAndEventsRepository.create(context);
`,
    after: `  public TaskService(Context context) {
    super();
    Context applicationContext = context != null ? context.getApplicationContext() : null;
    Context safeContext = applicationContext != null ? applicationContext : context;
    mContextRef = new WeakReference<>(safeContext);
    mTasksAndEventsRepository = TasksAndEventsRepository.create(safeContext);
`,
  },
  {
    name: 'guard remove app config',
    before: `  private void removeAppFromConfig(String appScopeKey) {
    getSharedPreferences().edit().remove(appScopeKey).apply();
  }
`,
    after: `  private void removeAppFromConfig(String appScopeKey) {
    SharedPreferences preferences = getSharedPreferences();
    if (preferences != null) {
      preferences.edit().remove(appScopeKey).apply();
    }
  }
`,
  },
]);

patchFile('node_modules/expo-task-manager/android/build.gradle', [
  {
    name: 'use maven app loader when building task manager from source',
    before: `  implementation project(':unimodules-app-loader')
`,
    after: `  implementation "host.exp.exponent:org.unimodules.apploader:6.0.8"
`,
  },
]);

patchFile('node_modules/expo-task-manager/android/src/main/java/expo/modules/taskManager/repository/TasksPersistence.java', [
  {
    name: 'guard clear null preferences',
    before: `  public void clearTaskPersistence(SharedPreferences preferences, String but) {
    Map<String, ?> map = preferences.getAll();
`,
    after: `  public void clearTaskPersistence(SharedPreferences preferences, String but) {
    if (preferences == null) {
      return;
    }
    Map<String, ?> map = preferences.getAll();
`,
  },
  {
    name: 'guard read null preferences',
    before: `  public Map<String, TasksAndEventsRepository.AppConfig> readPersistedTasks(SharedPreferences preferences) {
    Map<String, TasksAndEventsRepository.AppConfig> result = new HashMap<>();

    Map<String, ?> appScopeKeyToAppConfigsMap = preferences.getAll();
`,
    after: `  public Map<String, TasksAndEventsRepository.AppConfig> readPersistedTasks(SharedPreferences preferences) {
    Map<String, TasksAndEventsRepository.AppConfig> result = new HashMap<>();

    if (preferences == null) {
      return result;
    }

    Map<String, ?> appScopeKeyToAppConfigsMap = preferences.getAll();
`,
  },
]);
