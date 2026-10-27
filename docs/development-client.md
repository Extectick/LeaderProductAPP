# Android development client

Development client is a separate debug application: **Лидер Продукт DEV**, package
`com.leaderproduct.app.dev`, scheme `leaderproduct-dev`. It can coexist with the
ordinary application and uses `https://dev.leader-product.ru` for its API.
OTA is disabled in this client; JavaScript comes from Metro.

## Install and connect

1. Put the phone on a network that can reach the development computer (LAN or VPN).
2. Open `http://192.168.30.244:8098/` on the phone and download/install the APK.
3. Tap **Подключить приложение** on that page. Alternatively open DEV, choose
   manual server address, and enter `http://192.168.30.244:8081`.
4. Keep Fast Refresh enabled in the developer menu. Saving TypeScript/JavaScript
   or UI changes updates the running screen. Some changes reload the application
   and may reset its current screen/state; no APK installation is needed.

This client contains current native libraries including expo-audio. Authentication
is separate from the installed regular app because Android stores each package's
data separately.

## Start the servers again

From this checkout:

```powershell
cd C:\Share\GitRepositories\LeaderProductMobile\.worktrees\help-app-dev
$env:REACT_NATIVE_PACKAGER_HOSTNAME='192.168.30.244'
npm run start:dev-client
```

In another terminal, if APK download/connection page is needed:

```powershell
node scripts/serveDevClient.js
```

The helper sets the dev API explicitly. Override it with `LEADER_DEV_API_URL`
only when deliberately using another development backend. Other Expo commands
retain the existing ordinary app configuration.

## Rebuild when native code changes

Native dependencies, permissions, SDK, config plugins or application identity
require a new APK. Pure JavaScript/TypeScript/UI edits do not.

```powershell
npm run build:dev-client
```

Uses ASCII Gradle home/temp paths and arm64-v8a by default. For another ABI:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-dev-client.ps1 -Architectures 'arm64-v8a,x86_64'
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`.
After successful package/signature checks, the helper copies it to
`dev-builds/development-client/leader-product-dev-client.apk` for
the download server. The server does not expose an APK still being built.
Native output is generated for the DEV profile. Before building an ordinary
release again, run its normal prebuild with `LEADER_DEV_CLIENT` unset.
The original generated native directory was preserved in
`tmp/native-before-dev-client-20261027` for this setup.

LAN download and Metro are listening on ports 8098 and 8081. The Windows firewall
rule `LeaderProductDevClientLocal` permits these ports only from the local subnet
for Node. Device connection and Fast Refresh must also be checked on the phone;
HTTP/manifest and APK checks alone do not establish physical-device success.

## Published local build — 27 October 2026

- Android debug build succeeded, 738 Gradle tasks, version 0.1.34 (33), arm64-v8a.
- APK: 127,548,203 bytes; SHA-256
  `703ed21f68b7d719e4aaf8dc0db811329a7fb3bfd99be408567c06b7552d2b3d`.
- Package/debug flag/ABI, signature, development launcher and native AudioModule
  verified in the actual APK. The application JS bundle is not embedded.
- Download returned HTTP 200 and its streamed SHA-256 matched the local APK.
- Metro manifest advertises `192.168.30.244:8081`, DEV name/package/scheme and
  disabled OTA. Android dev bundle compiled (6,465 modules, 37,614,673 bytes at
  the first check); dev API and refresh client are present. HMR WebSocket connects.
- After the native build, excluded generated `.cxx`, `.gradle`, Android build,
  backup and APK output directories from Metro's file index. Restarted Metro and
  verified the final Android bundle: HTTP 200, 37,614,999 bytes, DEV package update
  guard present. Cold compilation took about 55 seconds; a repeated full-bundle
  download took 7.64 seconds. These full-download timings are not HMR latency.
- TypeScript and 5 Metro environment/cache tests passed. All 6 UpdateGate tests passed, including the regression that
  the separate development client must not check/install the ordinary APK.
- Ordinary configuration with the DEV flag absent still resolves to
  `com.leaderproduct.app`, `leaderproduct`, production OTA enabled. Remote dev
  remains at `f0a5d94`; no Git push, normal APK/OTA rollout or API deploy was done.
- Physical-phone installation, login and Fast Refresh interaction remain to be
  checked after the user installs and connects the client.
