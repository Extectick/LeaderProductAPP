# APK Release Phase 1

Phase 1 publishes full Android APK updates without requiring GitHub Actions to access a private/local API.

## GitHub Secrets

Add these secrets to the APP repository:

```text
BEGET_S3_ENDPOINT=https://s3.ru1.storage.beget.cloud
BEGET_S3_REGION=ru1
BEGET_S3_BUCKET=66f2164cfa3e-leader-cluster
BEGET_S3_ACCESS_KEY_ID=...
BEGET_S3_SECRET_ACCESS_KEY=...
EXPO_PUBLIC_API_URL_DEV=http://192.168.30.206:3000
EXPO_PUBLIC_TELEGRAM_BOT_USERNAME=...
EXPO_PUBLIC_MAX_BOT_USERNAME=...
```

Do not store real S3 keys in git.

For production APK builds, the workflow embeds `https://api.leader-product.ru` automatically.

## Build APK In GitHub

Run workflow:

```text
Actions -> Build Android APK Release -> Run workflow
```

Inputs:

```text
channel: dev | prod
versionName: 0.1.7
versionCode: 6
minSupportedVersionCode: 5
isMandatory: false
rolloutPercent: 100
releaseNotes: short release notes
buildType: release
architectures: arm64-v8a
```

The workflow:

- updates `app.config.ts` and `android/app/build.gradle` inside the CI checkout;
- builds APK;
- uploads APK to S3:
  - `dev/updates/apk/...` for dev;
  - `prod/updates/apk/...` for prod;
- creates `release-metadata.json`;
- uploads APK and metadata as a GitHub artifact.

## Publish AppUpdate Locally

There are two local publish paths:

- API publish: calls `POST /updates` and requires an admin access token.
- DB publish: writes `AppUpdate` directly with Prisma from `LeaderProductAPI`; useful when the API is local/private and GitHub Actions cannot reach it.

### Option A: Publish Through API

Download `release-metadata.json` from the workflow artifact, then run from `LeaderProductAPP`:

```powershell
$env:LEADER_PRODUCT_ACCESS_TOKEN = "<your-admin-access-token>"
npm run updates:publish-local -- path\to\release-metadata.json
```

For dev, the script uses `EXPO_PUBLIC_API_URL_DEV` from `.env`.

For production, either use metadata with `channel=prod` or pass the URL explicitly:

```powershell
$env:LEADER_PRODUCT_ACCESS_TOKEN = "<your-admin-access-token>"
npm run updates:publish-local -- path\to\release-metadata.json --api-url https://api.leader-product.ru
```

The token must belong to a user with `manage_updates`.

### Option B: Publish Directly To DB

Run from `LeaderProductAPI`:

```powershell
cd D:\GitRepositories\LeaderProduct\LeaderProductAPI
npm run updates:publish-apk-db -- ..\LeaderProductAPP\release-artifacts-gh\android-apk-dev-0.1.7-6\release-metadata.json
```

The script:

- loads `.env`, `.env.dev`, `.env.production` if present;
- uses `UPDATE_PUBLISH_DATABASE_URL` if set, otherwise `DATABASE_URL`;
- on Windows maps Docker service host `postgres` to `127.0.0.1` for local runs;
- upserts by `platform + channel + versionCode`, so rerunning the same metadata updates the row instead of failing.

For production DB publish, pass an explicit database URL or run it on the production host:

```powershell
$env:UPDATE_PUBLISH_DATABASE_URL = "<production-postgres-url>"
npm run updates:publish-apk-db -- path\to\release-metadata.json
```

## Dry Runs

```powershell
npm run updates:publish-local -- path\to\release-metadata.json --token test --dry-run
```

```powershell
cd D:\GitRepositories\LeaderProduct\LeaderProductAPI
node scripts\publish-apk-update-db.js path\to\release-metadata.json --dry-run true
```

## Dev Smoke Test

1. Build APK in GitHub with `channel=dev`, next `versionCode`, and `rolloutPercent=100`.
2. Download workflow artifact.
3. Publish metadata with API or DB publish.
4. Open old dev APK.
5. Confirm update prompt appears.
6. Download APK from app.
7. Confirm Android installer opens.
8. Install APK.
9. Restart Metro with cache reset:

```powershell
cd D:\GitRepositories\LeaderProduct\LeaderProductAPP
npx expo start --dev-client --host lan -c
```

10. Confirm `/updates/check` no longer prompts for the installed `versionCode`.

## Bridge APK For OTA

The APK workflow now embeds Expo OTA config:

```text
runtimeVersion: appVersion
updates.url: <api>/ota/update
updates.requestHeaders.expo-channel-name: dev | prod
```

Development default:

```text
http://192.168.30.206:3000/ota/update
```

Production default:

```text
https://api.leader-product.ru/ota/update
```

The API currently returns `204 No Content` from `/ota/update`, which means “no OTA update available”. Real OTA manifests and S3 bundle/assets are implemented in the next phase.

## Rollback

Use the existing admin Updates tab:

- deactivate the bad update;
- reactivate or create a previous known-good update;
- keep old APK objects in S3 until the rollback is verified.

Direct DB rollback is also possible from `LeaderProductAPI` if the admin UI/API is unavailable:

```powershell
npx prisma studio
```

Edit `AppUpdate.isActive` for the bad row. Keep APK files in S3 until devices are verified.
