# Production error collection

Scope: runtime 0.1.26 / APK build 25; monitoring-only OTA. No unrelated dev,
offline-order, tracking or 1C changes are included.

- Uses the installed Sentry SDK with the separate production GlitchTip project.
- Bootstrap precedes router modules. Global fatal JS / unhandled rejections are
  SDK-owned; the router boundary additionally reports handled render failures.
- Associates numeric user ID (not email/name), route template, native build,
  runtime, OTA UUID and unique source-map release. Logout clears user identity.
- Removes request/body/extra context, network/console breadcrumbs, frame locals,
  arbitrary tags, credentials, email, URLs and structured data in messages.
- No screenshots, view hierarchy, session replay, tracing or profiling.
- The native transport/cache remains available, but native Java/NDK/ANR crash
  handling is disabled in this OTA. Old APKs have no early native privacy hook.
  A new APK is required for native/startup crash collection before JavaScript.
- Source maps stay private. CI uploads and verifies an exact original source
  frame through a synthetic event before publishing; failure blocks release.

Production credentials are GitHub environment secrets, never repository files.
Local provisioning and operation: API deploy/glitchtip-prod/README.md.
Diagnostics run on the existing Windows-hosted GlitchTip, so workstation,
Docker and tunnel availability matter. This is not a cloud monitoring migration.

Verification: seven monitoring regression tests and the six existing production
order/network suites passed (113 tests), and TypeScript passed. Transport smoke
is synthetic; no actual phone crash/native/offline acceptance test is claimed.

Production smoke on 2026-10-08: event `be63e3a66ebf5488ce441e5520ee9899`
resolved to `/src/shared/monitoring/privacy.ts:13`. Hermes uploads must use
`sentry-cli react-native gradle`; generic source-map upload skips the binary
bundle and is insufficient for GlitchTip symbolication.
