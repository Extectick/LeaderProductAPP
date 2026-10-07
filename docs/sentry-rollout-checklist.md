# Dev crash reporting

## Scope and architecture

Dev only. SDK → dev nginx ingestion → private tunnel → local GlitchTip 6.2.6.
A signed, retrying reconciliation worker writes minimal summaries to dev API.
Production reporting remains disabled. Diagnostic UI is local-only.
Server migrated from Sentry on 2026-09-21 without changing the public DSN or APK.
The stopped Sentry server and its data remain available for rollback.

Android build 31+ initializes Sentry in MainApplication, before tracking and React.
JS initializes before Expo Router and does not replace the native scrubber.
The SDK caches failed uploads (native cap: 50 events); delivery resumes after
network recovery/restart. Force Stop, power loss and all OOM cases cannot be
guaranteed to produce a report. Native disablement requires another APK.

## Build

Run `scripts/build-dev-crash-reporting.ps1`. Private credentials live outside
the repository in `C:\ProgramData\LeaderProduct\GlitchTipDev\credentials.json`.
Only the public DSN may enter EXPO_PUBLIC variables. The CLI auth token must
remain private. Metro Debug IDs and the Sentry Gradle plugin upload matching
source maps. Verify symbolication before handing off the APK.

Cloud APP workflows currently disable Sentry. Do not publish OTA to this pilot
runtime until the workflow also performs private source-map upload. Every APK
and OTA requires its own matching maps. No replay, screenshots, request bodies,
precise coordinates, access tokens or user names should be collected.

For a retry after a native build failure use `-SkipPrebuild` only when generated
native sources are already current. On 2026-09-21 Gradle could not unlink old
hardlinked libraries under expo-modules-core/android/build/intermediates/cxx.
After confirming no Gradle build was active, that generated directory was moved
to cxx-before-sentry-20260921 (recoverable), without deleting sources or global
Gradle caches. Do not automatically wipe android or node_modules on retry.

Expo uses an asset serializer. Use `getSentryExpoConfig` at config creation, not
plain `withSentryConfig` around Expo's serializer: the latter expects `{code,map}`
and fails on `determineDebugIdFromBundleSource(undefined)`. Keep the existing SVG,
tslib resolver and public-environment cache key on the returned Expo config.

## Verification checklist

- [x] JS privacy/config/Metro unit tests (8, including Expo serializer regression).
- [x] APP TypeScript check.
- [x] New native APK compiles and maps upload (0.1.32 / 31, 2026-09-21).
- [x] Maps for `com.leaderproduct.app@0.1.32+31`, dist 31 uploaded. Debug ID:
  `7a0d98f7-9a34-4933-a190-03139effbb3a`. Synthetic mapped event
  `b4adbe6823c2c3f701930866352cd49e` resolves to
  `src/shared/monitoring/privacy.ts:5`, function `redactDiagnosticText`.
- [x] Synthetic public-ingress event reaches Sentry and dev API exactly once;
  replayed signed delivery remains one DB row (2026-09-21).
- [x] GlitchTip migration: same 0.1.32 APK/map/Debug ID. Public event
  `f0f91c460a1012e47ff102c65b0f405e` resolves exactly to `privacy.ts:5`.
  Java and native minidump fixtures accepted. The server has a guarded symbolic
  column compatibility patch; see API `deploy/glitchtip-dev/README.md`.
- [ ] Native crash on dedicated emulator is reported after restart.
- [ ] Offline crash remains queued and uploads after reconnect.
- [ ] Login, tracking and normal startup still work.

APK saved under `release-artifacts/sentry-dev-0.1.32`. Initially not published;
on explicit follow-up request published to dev on 2026-09-21 06:32 UTC:
AppUpdate ID 18, version 0.1.32 / code 31, optional, rollout 100%.
Full public download matches local SHA-256; update check returns available for
build 30 and unavailable for build 31. Production remains 0.1.26 / code 25.
Signature, standalone bundle, both ABIs, dev API/OTA and public DSN verified;
private build/webhook/read/admin credentials are absent from bundled JS/manifest.
Dedicated QA emulator stayed offline for 15 minutes and was stopped; native and
offline delivery must not be marked verified. Existing user devices were untouched.
