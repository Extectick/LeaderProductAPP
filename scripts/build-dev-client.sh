#!/usr/bin/env bash
set -euo pipefail

app_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
architectures="${1:-arm64-v8a}"
: "${ANDROID_HOME:?Set ANDROID_HOME to an Android SDK directory}"
command -v javac >/dev/null || { echo 'A full JDK is required (javac was not found).' >&2; exit 1; }

export NODE_ENV=development LEADER_DEV_CLIENT=1 EXPO_PUBLIC_UPDATE_CHANNEL=dev
export EXPO_PUBLIC_API_URL_DEV="${LEADER_DEV_API_URL:-https://dev.lidprod.ru}"
export EXPO_PUBLIC_OTA_UPDATE_URL=''
export EXPO_NO_TELEMETRY=1
cd "$app_root"
node scripts/devClient.js prebuild
LEADER_ANDROID_PACKAGE=com.leaderproduct.app.dev node scripts/verifyLeaderNativeTrackingPrebuild.js

cd android
./gradlew --no-daemon --console=plain --max-workers=2 \
  -Dorg.gradle.parallel=false \
  "-Dorg.gradle.jvmargs=-Xmx${GRADLE_MAX_HEAP:-2560m} -XX:MaxMetaspaceSize=768m -Dfile.encoding=UTF-8" \
  -Pkotlin.compiler.execution.strategy=in-process \
  "-PreactNativeArchitectures=$architectures" -PreactNativeDevServerPort=8081 \
  app:assembleDebug

cd "$app_root"
apk="$app_root/android/app/build/outputs/apk/debug/app-debug.apk"
tools_version="$(node -e 'const fs=require("node:fs"),path=require("node:path"); const versions=fs.readdirSync(path.join(process.env.ANDROID_HOME,"build-tools")).filter(v=>/^\d+\.\d+\.\d+$/.test(v)); if(!versions.length)throw new Error("No stable Android build-tools installed"); console.log(versions.sort((a,b)=>a.localeCompare(b,"en",{numeric:true})).at(-1));')"
tools="$ANDROID_HOME/build-tools/$tools_version"
"$tools/apksigner" verify "$apk"
badging="$("$tools/aapt" dump badging "$apk")"
case "$badging" in *"package: name='com.leaderproduct.app.dev'"*) ;; *) echo 'Unexpected APK package.' >&2; exit 1;; esac
case "$badging" in *application-debuggable*) ;; *) echo 'Expected a debug development client.' >&2; exit 1;; esac

destination="$app_root/dev-builds/development-client"
mkdir -p "$destination"
filename="leader-product-dev-client-${architectures//,/-}.apk"
cp "$apk" "$destination/$filename"
printf '%s\n' "$badging" > "$destination/${filename%.apk}.badging.txt"
(cd "$destination" && sha256sum "$filename" > "${filename%.apk}.sha256")
printf 'Verified development client: %s\n' "$destination/$filename"
