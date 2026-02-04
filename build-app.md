# Сборка APK для Expo / React Native


cd V:\GitProjects\LeaderProductAPP\android
$env:JAVA_HOME="C:\Program Files\Eclipse Adoptium\jdk-21.0.3.9-hotspot"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
Remove-Item -Recurse -Force "C:\Users\extec\.gradle\wrapper\dists\gradle-8.14.3-bin" -ErrorAction SilentlyContinue
.\gradlew.bat :app:assembleRelease --refresh-dependencies


---

# Web (Docker контейнер)

## Быстрый запуск контейнера

```bash
cd V:\GitProjects\LeaderProductAPP
docker build -f Dockerfile.web -t leader-product-web .
docker run -d -p 8080:80 --name leader-product-web leader-product-web
```

Открыть: http://localhost:8080

## Как это работает

- `Dockerfile.web` внутри собирает `npm run build:web` (Expo export).
- Затем Nginx раздаёт статику.
- `nginx.conf` настроен на SPA-роутинг (`try_files ... /index.html`).









## (через EAS и без него)

> Инструкция подходит для Expo (Managed) и для локальной сборки через Gradle/Android Studio.
> Если цель — выкладка в Google Play, используйте **AAB**. **APK** — для внутреннего распространения/сидeload.

---

## Предварительные требования

* Node.js LTS
* Expo CLI / EAS CLI:

  ```bash
  npm i -g expo-cli eas-cli
  ```
* Для локальных сборок (без EAS):

  * JDK **17** (рекомендуется Temurin)
  * Android SDK/Platform Tools (adb), принятие лицензий:

    ```bash
    sdkmanager --licenses
    ```
  * Установленный Gradle (идёт вместе с проектом) и Android Studio (по желанию)
  * В Windows используйте `gradlew.bat` вместо `./gradlew`

---

# 1) Сборка с помощью **EAS**

### 1.1. Инициализация проекта для EAS

```bash
eas login
eas init
```

### 1.2. Конфиг `eas.json`

Создайте/обновите `eas.json` в корне проекта:

```jsonc
{
  "cli": { "version": ">= 11.0.0" },
  "build": {
    // Профиль для прод-выкладки в Play (AAB)
    "production": {
      "android": {
        "buildType": "app-bundle",          // AAB
        "autoIncrement": "versionCode"      // авто+1
      }
    },
    // Профиль для APK (сидeload / тестерам)
    "apk": {
      "android": {
        "gradleCommand": ":app:assembleRelease", // собирать APK
        "buildType": "apk"
      }
    },
    // Локальная сборка тем же профилем
    "apk-local": {
      "android": {
        "gradleCommand": ":app:assembleRelease",
        "buildType": "apk"
      }
    }
  },
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./google-service-account.json",
        "track": "internal"
      }
    }
  }
}
```

> `:app:assembleRelease` заставляет EAS собрать **APK** вместо AAB.
> Для AAB достаточно `buildType: "app-bundle"` или дефолтного профиля.

### 1.3. Креды подписи

EAS может управлять keystore за вас:

```bash
eas credentials
```

Выберите **Generate new keystore** (или импортируйте свой).

### 1.4. Запуск сборки (в облаке EAS)

* **AAB для Play**:

  ```bash
  eas build -p android --profile production
  ```
* **APK для внутренней установки**:

  ```bash
  eas build -p android --profile apk
  ```

После завершения EAS даст ссылку на артефакт (скачайте .aab или .apk).

### 1.5. Локальная сборка через EAS (на своей машине)

> Требуются JDK/Android SDK локально.

```bash
eas build -p android --profile apk-local --local
```

Артефакт: `android/app/build/outputs/apk/release/app-release.apk`

---

# 2) Сборка **без EAS** (локально: Gradle/Android Studio)

> Для Expo Managed сначала сгенерируйте нативные проекты.

### 2.1. Сгенерировать android-папку (Expo Managed)

```bash
npx expo prebuild
```

Убедитесь, что в `app.json/app.config.ts` прописаны:

```jsonc
{
  "expo": {
    "android": {
      "package": "com.company.app",      // applicationId
      "versionCode": 12                  // увеличивайте для релизов
    }
  }
}
```

### 2.2. Подпись релизной сборки

**Вариант А. Создать ключ:**

```bash
keytool -genkeypair -v -storetype JKS -keystore my-release-key.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

Положите `my-release-key.jks` в `android/app/`.

В `android/gradle.properties` (создайте, если нет) добавьте:

```properties
MYAPP_UPLOAD_STORE_FILE=my-release-key.jks
MYAPP_UPLOAD_KEY_ALIAS=upload
MYAPP_UPLOAD_STORE_PASSWORD=*****   # ваш пароль keystore
MYAPP_UPLOAD_KEY_PASSWORD=*****     # ваш пароль alias
```

В `android/app/build.gradle` (раздел `android { ... }`) добавьте/активируйте:

```gradle
signingConfigs {
    release {
        storeFile file(MYAPP_UPLOAD_STORE_FILE)
        storePassword MYAPP_UPLOAD_STORE_PASSWORD
        keyAlias MYAPP_UPLOAD_KEY_ALIAS
        keyPassword MYAPP_UPLOAD_KEY_PASSWORD
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled true
        shrinkResources true
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
}
```

**Вариант Б. Debug APK (для теста)**
Ничего подписывать не нужно — Gradle сам использует debug keystore.

### 2.3. Сборка APK/AAB через Gradle

Из папки `android/`:

* **Release APK** (для сидeload):

  * macOS/Linux:

    ```bash
    ./gradlew :app:assembleRelease
    ```
  * Windows:

    ```bat
    .\gradlew.bat :app:assembleRelease
    ```

  Артефакт: `android/app/build/outputs/apk/release/app-release.apk`

* **Debug APK**:

  ```bash
  ./gradlew :app:assembleDebug
  ```

  Артефакт: `android/app/build/outputs/apk/debug/app-debug.apk`

* **AAB для Play**:

  ```bash
  ./gradlew :app:bundleRelease
  ```

  Артефакт: `android/app/build/outputs/bundle/release/app-release.aab`

### 2.4. Universal APK (один APK для всех ABI) — опционально

В `android/app/build.gradle` в `android { ... }` добавьте:

```gradle
splits {
  abi {
    enable true
    reset()
    universalApk true    // <-- создаст app-universal-release.apk
  }
}
```

Соберите `assembleRelease`, и получите также `app-universal-release.apk`.

### 2.5. Установка на устройство

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

(для debug — путь к debug APK)

### 2.6. Сборка через Android Studio (UI)

* Откройте каталог `android/` в Android Studio
* Меню **Build → Generate Signed Bundle/APK…**
* Выберите **APK**, укажите keystore/пароли, **Build**
* Готовый APK лежит в `app/build/outputs/apk/...`

---

## Частые вопросы и подсказки

* **Google Play требует AAB.** APK используйте только для внутреннего тестирования/распространения.
* **versionCode** в `app.json/app.config.ts` должен **увеличиваться** при каждом релизе.
* На RN/Expo последних версий нужен **JDK 17**; убедитесь, что `JAVA_HOME` указывает на него.
* Если в Expo Managed после `prebuild` Android-папка появилась, продолжайте как с обычным RN-проектом.
* Ошибки Gradle? Очистите сборку:

  ```bash
  cd android && ./gradlew clean && cd ..
  ```
* Конфликтные зависимости — посмотрите `android/gradle.properties`, `build.gradle`, синхронизируйте версии Kotlin/Gradle.

---

## Кратко: что выбрать?

* **Нужно быстро отдать APK тестерам** → `eas build -p android --profile apk`
* **Нужно в Google Play** → `eas build -p android --profile production` (AAB)
* **Без EAS** → `npx expo prebuild` → `./gradlew :app:assembleRelease` (получите APK локально)

Готово.
