# Release and Update Guide

This document is the operator checklist for APP releases.

## Version Rules

- Full APK release: bump `versionName` and `versionCode`.
- OTA JS/assets release: keep the same APK `versionName`/`runtimeVersion`.
- Native dependency, permissions, Android config, Expo SDK, or `app.config.ts` changes require a new APK.
- The GitHub APK workflow refuses to build if `app.config.ts` does not match workflow `versionName` and `versionCode`.

## APK Release Flow

1. Prepare the next version in git:

```powershell
cd D:\GitRepositories\LeaderProduct\LeaderProductAPP
node ./scripts/setNativeVersion.js --versionName 0.1.9 --versionCode 8
npm run release:check-version -- 0.1.9 8
git add app.config.ts
git commit -m "Bump app version to 0.1.9"
git push
```

2. Run GitHub Actions:

```text
Actions -> Build Android APK Release -> Run workflow
```

Use the same version values:

```text
channel: dev
versionName: 0.1.9
versionCode: 8
minSupportedVersionCode: 7
isMandatory: false
rolloutPercent: 100
releaseNotes: ...
buildType: debug
architectures: arm64-v8a
```

3. Download artifact or use `gh run download`.

4. Publish metadata to dev DB:

```powershell
cd D:\GitRepositories\LeaderProduct\LeaderProductAPI
npm run updates:publish-apk-db -- ..\LeaderProductAPP\release-artifacts-gh\android-apk-dev-0.1.9-8\release-metadata.json
```

5. Verify API:

```powershell
Invoke-RestMethod "http://192.168.30.206:3000/updates/check?platform=android&versionCode=7&version=0.1.8&channel=dev&deviceId=release_test" | ConvertTo-Json -Depth 10
Invoke-RestMethod "http://192.168.30.206:3000/updates/check?platform=android&versionCode=8&version=0.1.9&channel=dev&deviceId=release_test" | ConvertTo-Json -Depth 10
```

Expected:

- old version returns `updateAvailable: true`;
- new version returns `updateAvailable: false`.

## Dev Client Check

After installing the new APK, restart Metro with cache reset:

```powershell
cd D:\GitRepositories\LeaderProduct\LeaderProductAPP
npx expo start --dev-client --host lan -c
```

If the app asks to update to the same version, check local config:

```powershell
npm run release:read-version
```

## OTA Bridge

Bridge APKs include:

```text
runtimeVersion: appVersion
updates.url: <api>/ota/update
updates.requestHeaders.expo-channel-name: dev | prod
```

`/ota/update` returns `204 No Content` when no compatible OTA exists. When an active OTA row exists for the same `platform`, `channel`, and `runtimeVersion`, API returns an Expo Updates manifest.

OTA publishing requires:

- exported JS bundle/assets in S3 under `dev/updates/ota/...` or `prod/updates/ota/...`;
- `AppOtaUpdate` metadata created through `POST /ota/publish`;
- same `runtimeVersion` as the installed bridge APK.

## Rollback

Use admin Updates tab or Prisma Studio:

- deactivate the bad `AppUpdate`;
- reactivate the previous known-good update if needed;
- keep APK files in S3 until devices are verified.

Do not delete S3 APK files during rollback unless no `AppUpdate` references them.
