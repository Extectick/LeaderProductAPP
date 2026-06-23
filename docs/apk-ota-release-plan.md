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
- [x] GitHub Actions собирает Android APK автоматически по manual workflow.
- [x] GitHub Actions публикует APK в S3.
- [x] Локальный publish-скрипт регистрирует APK metadata в API.
- [x] Локальный DB publish-скрипт регистрирует APK metadata напрямую в БД без public API.
- [ ] `expo-updates` отключен в Android manifest.
- [ ] OTA JS/assets обновления пока не реализованы.

## Target Architecture

```text
GitHub private repo
  -> GitHub Actions
  -> build APK or OTA bundle
  -> upload files to S3/MinIO
  -> write release metadata
  -> local publish script calls LeaderProductAPI or writes DB directly
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
     or
  -> cd LeaderProductAPI && npm run updates:publish-apk-db -- release-metadata.json
  -> call configured LeaderProductAPI URL or upsert DB row
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
- [x] Add direct DB publish script for local/private API environments.
- [x] Add release version guard so CI refuses APK builds when `app.config.ts` is not bumped in git.
- [ ] Add rollback procedure:
  - [x] deactivate bad update;
  - [x] reactivate previous update;
  - [x] keep old APK files unless explicitly purged.
- [x] Add documentation for release operator.

Acceptance checks:

- [x] Manual GitHub workflow produces APK.
- [x] APK appears in S3/MinIO.
- [x] Workflow artifact contains `release-metadata.json`.
- [x] Local publish script can read metadata.
- [x] `AppUpdate` row appears in DB.
- [x] Installed old app sees update prompt.
- [x] User downloads APK from app.
- [x] Android installer opens.
- [ ] Mandatory update blocks normal app usage.
- [x] Rollout percentage works by device id.
- [x] Disabled update is ignored.

## Phase 2: Bridge APK for OTA

Goal: ship one full APK that enables future OTA updates.

- [x] Add `expo-updates` dependency if missing.
- [x] Enable `expo-updates` in native config.
- [x] Define `runtimeVersion` policy.
- [x] Point `updates.url` to our API update endpoint.
- [ ] Keep full APK updater as fallback for native/runtime changes.
- [ ] Add channel mapping:
  - [x] `EXPO_PUBLIC_UPDATE_CHANNEL=dev`;
  - [x] `EXPO_PUBLIC_UPDATE_CHANNEL=prod`.
- [x] Add no-op API endpoint `/ota/update` so bridge APK can check OTA safely before real manifests exist.
- [ ] Build and publish bridge APK through Phase 1 pipeline.

Acceptance checks:

- [ ] Bridge APK installs on physical Android.
- [ ] App still checks full APK updates.
- [x] App config points to OTA endpoint.
- [ ] App can contact OTA endpoint from installed bridge APK.
- [ ] Old APK can update to bridge APK through existing full APK flow.

## Phase 3: OTA Storage and Metadata

Goal: store OTA manifests, bundles and assets in our S3/MinIO.

API/DB:

- [x] Add Prisma model `AppOtaUpdate`.
- [x] Use JSON asset list in `AppOtaUpdate.assets`; separate `AppOtaAsset` table deferred until needed.
- [ ] Track fields:
  - [x] `platform`;
  - [x] `channel`;
  - [x] `runtimeVersion`;
  - [x] `updateId`;
  - [x] `manifestKey`;
  - [x] `launchAssetKey`;
  - [x] `assetKeys` or asset relation;
  - [x] `checksum`;
  - [x] `isActive`;
  - [x] `rolloutPercent`;
  - [x] `createdAt`;
  - [x] `commitSha`;
  - [x] `releaseNotes`.
- [x] Add protected publish endpoint for CI.
- [x] Add public Expo Updates protocol endpoint.
- [ ] Add cleanup endpoint for old OTA assets.

S3:

- [ ] Upload manifest JSON.
- [ ] Upload Android JS bundle.
- [ ] Upload assets.
- [ ] Use immutable versioned object keys.
- [ ] Do not overwrite existing published update folders.

Acceptance checks:

- [ ] OTA files are uploaded to S3/MinIO.
- [x] DB references all required S3 object keys.
- [x] Public OTA endpoint returns correct update for channel/runtime.
- [ ] Incompatible runtime gets no OTA update.
- [x] Incompatible runtime gets no OTA update.
- [x] Rollout percentage works for OTA.

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
- [x] 2026-06-23: GitHub Actions APK workflow publishes dev APK to S3.
- [x] 2026-06-23: Dev `AppUpdate` published and verified through app update prompt.
- [x] 2026-06-23: Local DB publish script added for private/local API release registration.
- [x] 2026-06-23: CI version guard added to prevent Metro/API version drift after APK releases.
- [ ] Phase 1 completed. Remaining: mandatory update smoke test.
- [x] Phase 2 started.
- [x] 2026-06-23: `expo-updates` installed and bridge APK config added.
- [x] 2026-06-23: API no-op `/ota/update` endpoint added for safe pre-manifest OTA checks.
- [ ] Phase 2 completed.
- [x] Phase 3 started.
- [x] 2026-06-23: `AppOtaUpdate` model and migration added.
- [x] 2026-06-23: OTA publish/list/update endpoints added.
- [x] 2026-06-23: Public OTA manifest endpoint smoke-tested with temporary update row.
- [ ] Phase 3 completed.
- [ ] Phase 4 started.
- [ ] Phase 4 completed.
- [ ] Phase 5 started.
- [ ] Phase 5 completed.
- [ ] Phase 6 completed.
