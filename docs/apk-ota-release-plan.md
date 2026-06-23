# APK and OTA Release Plan

Цель: сделать полностью рабочую систему обновлений приложения без лимитов Expo/EAS:

- полный APK update через GitHub Actions, API и S3/MinIO;
- OTA update для JS bundle/assets через собственный update server;
- хранение APK и OTA-файлов только в нашем S3/MinIO;
- контроль публикации, каналов и rollback через GitHub/API/admin UI.

## Current State

- [x] APP проверяет обновления через `UpdateGate`.
- [x] API имеет `/updates/check`, `/updates/upload`, `/updates/upload-url`.
- [x] APK хранится через `apkKey` в S3/MinIO.
- [x] Есть `AppUpdate` и `AppUpdateEvent` в Prisma.
- [x] Есть каналы `prod` и `dev`.
- [x] Есть `rolloutPercent`, `isMandatory`, `isActive`.
- [x] Есть admin UI для ручной загрузки APK.
- [ ] GitHub Actions не собирает Android APK автоматически.
- [ ] GitHub Actions не публикует APK в API/S3 автоматически.
- [ ] `expo-updates` отключен в Android manifest.
- [ ] OTA JS/assets обновления пока не реализованы.

## Target Architecture

```text
GitHub private repo
  -> GitHub Actions
  -> build APK or OTA bundle
  -> upload files to S3/MinIO
  -> write release metadata
  -> local publish script calls LeaderProductAPI
  -> APP checks API
  -> APP downloads APK or OTA update
```

S3/MinIO layout:

```text
dev/
  updates/
    apk/
      leader-product-0.1.8-dev.apk
    ota/
      android/runtime-0.1.8/update-20260623-001/
        manifest.json
        bundle.android.js
        assets/

prod/
  updates/
    apk/
      leader-product-0.1.7.apk
    ota/
      android/runtime-0.1.7/update-20260623-001/
        manifest.json
        bundle.android.js
        assets/
```

## Phase 1: Automated APK Releases

Goal: current full-APK update flow becomes repeatable without requiring a public dev API.

Chosen approach:

```text
GitHub Actions
  -> build APK
  -> upload APK to S3
  -> produce release-metadata.json

Local machine
  -> npm run updates:publish-local release-metadata.json
  -> call configured LeaderProductAPI URL
  -> create AppUpdate
```

API URLs:

- Development API: local LAN API, for example `http://192.168.30.206:3000`.
- Production API: `https://api.leader-product.ru`.

- [x] Add GitHub Actions workflow for Android APK build.
- [x] Build APK from `LeaderProductAPP/android`.
- [x] Read version metadata from generated release input.
- [x] Support manual workflow inputs:
  - [x] `channel`: `dev` or `prod`;
  - [x] `versionName`;
  - [x] `versionCode`;
  - [x] `minSupportedVersionCode`;
  - [x] `isMandatory`;
  - [x] `rolloutPercent`;
  - [x] `releaseNotes`.
- [x] Upload APK to S3/MinIO.
- [x] Calculate `sha256`, `md5`, file size.
- [x] Generate `release-metadata.json`.
- [x] Add local publish script for `release-metadata.json`.
- [x] Publish script creates `AppUpdate` through configured API URL.
- [x] Publish script supports dev API URL.
- [x] Publish script supports production API URL `https://api.leader-product.ru`.
- [ ] Add rollback procedure:
  - [ ] deactivate bad update;
  - [ ] reactivate previous update;
  - [ ] keep old APK files unless explicitly purged.
- [ ] Add documentation for release operator.

Acceptance checks:

- [ ] Manual GitHub workflow produces APK.
- [ ] APK appears in S3/MinIO.
- [ ] Workflow artifact contains `release-metadata.json`.
- [x] Local publish script can read metadata.
- [ ] `AppUpdate` row appears in DB.
- [ ] Installed old app sees update prompt.
- [ ] User downloads APK from app.
- [ ] Android installer opens.
- [ ] Mandatory update blocks normal app usage.
- [ ] Rollout percentage works by device id.
- [ ] Disabled update is ignored.

## Phase 2: Bridge APK for OTA

Goal: ship one full APK that enables future OTA updates.

- [ ] Add `expo-updates` dependency if missing.
- [ ] Enable `expo-updates` in native config.
- [ ] Define `runtimeVersion` policy.
- [ ] Point `updates.url` to our API update endpoint.
- [ ] Keep full APK updater as fallback for native/runtime changes.
- [ ] Add channel mapping:
  - [ ] `EXPO_PUBLIC_UPDATE_CHANNEL=dev`;
  - [ ] `EXPO_PUBLIC_UPDATE_CHANNEL=prod`.
- [ ] Build and publish bridge APK through Phase 1 pipeline.

Acceptance checks:

- [ ] Bridge APK installs on physical Android.
- [ ] App still checks full APK updates.
- [ ] App can contact OTA endpoint.
- [ ] Old APK can update to bridge APK through existing full APK flow.

## Phase 3: OTA Storage and Metadata

Goal: store OTA manifests, bundles and assets in our S3/MinIO.

API/DB:

- [ ] Add Prisma model `AppOtaUpdate`.
- [ ] Add Prisma model `AppOtaAsset` if separate asset rows are needed.
- [ ] Track fields:
  - [ ] `platform`;
  - [ ] `channel`;
  - [ ] `runtimeVersion`;
  - [ ] `updateId`;
  - [ ] `manifestKey`;
  - [ ] `launchAssetKey`;
  - [ ] `assetKeys` or asset relation;
  - [ ] `checksum`;
  - [ ] `isActive`;
  - [ ] `rolloutPercent`;
  - [ ] `createdAt`;
  - [ ] `commitSha`;
  - [ ] `releaseNotes`.
- [ ] Add protected publish endpoint for CI.
- [ ] Add public Expo Updates protocol endpoint.
- [ ] Add cleanup endpoint for old OTA assets.

S3:

- [ ] Upload manifest JSON.
- [ ] Upload Android JS bundle.
- [ ] Upload assets.
- [ ] Use immutable versioned object keys.
- [ ] Do not overwrite existing published update folders.

Acceptance checks:

- [ ] OTA files are uploaded to S3/MinIO.
- [ ] DB references all required S3 object keys.
- [ ] Public OTA endpoint returns correct update for channel/runtime.
- [ ] Incompatible runtime gets no OTA update.
- [ ] Rollout percentage works for OTA.

## Phase 4: GitHub Actions for OTA

Goal: publish JS/assets updates without rebuilding APK.

- [ ] Add manual GitHub workflow `publish-ota.yml`.
- [ ] Install dependencies with `npm ci`.
- [ ] Export/update bundle for Android.
- [ ] Generate Expo Updates compatible manifest.
- [ ] Upload bundle/assets to S3/MinIO.
- [ ] Call API to publish OTA metadata.
- [ ] Include `github.sha` in OTA metadata.
- [ ] Add workflow environments:
  - [ ] `development`;
  - [ ] `production`.
- [ ] Require manual approval for `production`.

Acceptance checks:

- [ ] Workflow publishes OTA to `dev`.
- [ ] Dev bridge APK receives OTA.
- [ ] Workflow publishes OTA to `prod` after approval.
- [ ] Production bridge APK receives OTA.
- [ ] OTA does not require reinstalling APK.

## Phase 5: Client OTA Runtime

Goal: app safely downloads and applies OTA updates.

- [ ] Configure automatic update check on launch or controlled manual check.
- [ ] Add update state logging.
- [ ] Add fallback if OTA check fails.
- [ ] Add reload/apply behavior.
- [ ] Keep full APK prompt for native/runtime updates.
- [ ] Add user/admin-visible update diagnostics if needed.

Acceptance checks:

- [ ] App starts normally if OTA endpoint is unavailable.
- [ ] App downloads compatible OTA.
- [ ] App reloads into new JS bundle.
- [ ] Bad OTA can be rolled back by deactivating DB record.
- [ ] Full APK update still works for native changes.

## Phase 6: Release Operations

Goal: predictable releases and rollback.

- [ ] Document version rules:
  - [ ] APK changes bump `versionCode`;
  - [ ] OTA changes keep same `runtimeVersion`;
  - [ ] native changes require new `runtimeVersion` and APK.
- [ ] Document release channels.
- [ ] Document rollback steps.
- [ ] Add smoke test checklist.
- [ ] Add production release checklist.
- [ ] Add monitoring/logging expectations.

Release checklist:

- [ ] API deployed.
- [ ] S3/MinIO reachable from app devices.
- [ ] APK workflow works.
- [ ] OTA workflow works.
- [ ] Admin can deactivate updates.
- [ ] Rollback tested.
- [ ] Physical Android test passed.

## Risks

- OTA cannot update native code, permissions, Expo SDK, Android config, or native modules.
- Old APKs without `expo-updates` must receive one full APK update before OTA works.
- Custom OTA server must correctly implement update compatibility and rollback behavior.
- S3/MinIO URLs must be reachable from real user devices, not only from the server network.
- Production OTA should not overwrite existing objects; immutable paths reduce rollback risk.

## Progress Log

- [x] 2026-06-23: Existing APK update architecture reviewed.
- [x] 2026-06-23: Release plan created.
- [x] 2026-06-23: Shared S3 bucket layout added in API with `dev`/`prod` prefixes.
- [x] Phase 1 started.
- [ ] Phase 1 completed.
- [ ] Phase 2 started.
- [ ] Phase 2 completed.
- [ ] Phase 3 started.
- [ ] Phase 3 completed.
- [ ] Phase 4 started.
- [ ] Phase 4 completed.
- [ ] Phase 5 started.
- [ ] Phase 5 completed.
- [ ] Phase 6 completed.
