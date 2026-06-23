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

## Dry Run

```powershell
npm run updates:publish-local -- path\to\release-metadata.json --token test --dry-run
```

## Rollback

Use the existing admin Updates tab:

- deactivate the bad update;
- reactivate or create a previous known-good update;
- keep old APK objects in S3 until the rollback is verified.
