# Production error collection

Initial scope: runtime 0.1.26 / APK build 25; monitoring-only OTA. That OTA
contains no unrelated dev, offline-order, tracking or 1C changes.

The new production APK 0.1.33 / build 32 includes the latest dev offline-order
and tracking features, with the same privacy-restricted JS monitoring. This is
a separate native release, not an OTA for runtime 0.1.26. Native Java/NDK/ANR
reporting remains disabled; installing this APK does not enable it implicitly.

- Uses the installed Sentry SDK with the separate production GlitchTip project.
- Bootstrap precedes router modules. Global fatal JS / unhandled rejections are
  SDK-owned; the router boundary additionally reports handled render failures.
- Associates numeric user ID (not email/name), route template, native build,
  runtime, OTA UUID and unique source-map release. Logout clears user identity.
- Removes request/body/extra context, network/console breadcrumbs, frame locals,
  arbitrary tags, credentials, email, URLs and structured data in messages.
- No screenshots, view hierarchy, session replay, tracing or profiling.
- The native transport/cache remains available, but native Java/NDK/ANR crash
  handling is disabled in production. Old APKs have no early native privacy
  hook. Native/startup crash collection before JavaScript needs a separately
  validated native privacy hook, not merely a version bump.
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

## APK promotion checks (2026-10-08)

- Production source is the full dev checkpoint `7c4ea228`, integrated into
  `4e94c5b`; production API source is `d76204a`.
- TypeScript and 142 APP tests passed, including offline queue/reconciliation,
  tracking lifecycle/reliability, offline service entry, SQLite serialization,
  production monitoring and native-startup configuration.
- Production API backup was restored into an isolated validation database;
  schema changes were applied there before production. API tests: 120 passed.
- APK CI must upload private Hermes symbols and resolve an original source
  frame before releasing the artifact. `publish=false` uploads the artifact
  without making it the update offered to production users.
- GlitchTip assembles artifact bundles asynchronously. An event accepted before
  assembly completes is not reprocessed when symbols arrive. The gate sends a
  fresh bounded synthetic probe after such a result; polling the same stored
  unresolved event is insufficient. A delayed APK probe resolved to
  `privacy.ts:14` (event `137c2da9259f492ebe1e0821fc419d02`).
- After download run `scripts/verify-prod-release-apk.ps1` against the APK and
  its metadata: package, signature, version, checksum, production API/OTA,
  map style, background location permissions and absence of private secrets.
- Preserve the signing certificate and install over the existing app. Do not
  uninstall: unsent SQLite drafts belong to the user.
- Production offline datasets require their own initial 1C exchange. A healthy
  API or successful APK build alone does not establish data readiness. Do not
  copy WMS15/dev datasets into production or bypass the manifest readiness guard.
- No physical-device or emulator runtime acceptance test is claimed by these
  static/unit/build checks.
