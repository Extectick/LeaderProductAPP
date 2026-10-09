# Production error collection

## Production OTA configuration repair (2026-10-09)

- Production OTA 0.1.33.1 restored catalog price priority but the API served
  `extra.expoClient: {}`. With the installed Expo modules this reproduces the
  expo-linking manifest exception. A specific employee's rollback is not proven.
- APP release tooling now persists an allowlisted runtime config from the same
  build. API `e670d284f758630304ce3622672a2e994ec41275` validates it on both HTTP
  and database publication, repairs legacy manifests, and serves the config.
- Production API is pinned to that immutable image in `/opt/leader-api/.env`.
  The narrow image preserves the existing production base/dependencies/schema
  and changes only the OTA route, validator and publisher (three small layers).
  It was deployed healthy; do not replace the pin with an unverified `latest`.
- Config/image rollback: `/var/backups/leader-ota-manifest-20261009` and image
  `rollback-ota-20261009`. Full database archive is local under workspace
  `.artifacts/prod-ota-manifest-20261009/production.dump`, administrator-only;
  all archive entries were read/decompressed successfully, without a DB restore.
  SHA-256: `47a82e5e84ddddc5bd499a0a7260f9be418b97349fa3cf02c571abdc05faf2d7`.
- Published APP source `620f321128da63dc5d14731f150a9d79b4a80980`, runtime 0.1.33,
  display **0.1.33.2**, update `bfd24cb8-afe1-44cb-82c7-2420f3cc491c`, rollout 100%.
  New identity ensures a previously downloaded/rejected manifest is not reused.
  Workflow `37919823476` passed 202 APP tests, config/bundle verification and
  private symbolication (`55f4eb7721df4935e6c90b101ec98409`, `privacy.ts:14`).
  API workflow `37919576725` passed 76 tests and its guarded image build.
- Public download verified 17973620 bundle bytes, hash
  `e8YVYt-XvO6eO4bSXMDe6OoOqd9aXbPRBqCxmy7udCI`; current-update request returned
  204. No new APK, dev native diagnostics, 1C changes or runtime relabeling.
  Actual application on the employee's phone remains a user acceptance check.

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

### Staged release outcome

- API `d76204a` is deployed in production and healthy. Backup directory:
  `/var/backups/leader-release-20261008`; archive `production.dump` was restored
  to `LeaderAPI_releasecheck_20261008` before applying the reviewed schema diff.
  Production 1C remains unchanged (LP App API reports v53).
- APP workflow `37688741475` succeeded from `2261604`. CI passed 115 core tests,
  four source-map gate tests and the native build. Synthetic event
  `b80be0faa18be79e2185ac53150d49c9` resolved to `privacy.ts:14`.
- Candidate: `prod/updates/apk/leader-product-prod-0.1.33-32.apk`, 129526385 bytes,
  SHA-256 `29e9b91f2efe2bec369ad4fa0ac80f4d03463bed4ab667d44af88c42a0a54ee7`.
  Local APK verifier passed: existing certificate, prod API/OTA, both ABIs,
  release mode, metadata checksum, map and private-credential exclusion.
- **Published after source-data verification on 2026-10-08.** AppUpdate id 14,
  production APK 0.1.33/build32, optional update, rollout 100%. Permanent link:
  `https://api.leader-product.ru/download`. Full file download, size and SHA-256
  verified against the staged artifact. No additional APK build or OTA needed.
- `TRACKING_V2_ENABLED=true`. `CLIENT_ORDERS_OFFLINE_ENABLED=true` after the user
  authorized the initial outgoing production exchange. At staging time,
  selling prices, manager reserves, manager-counterparty links and offline export
  policy were absent. Do not mark an incomplete dataset ready or import dev data.
- Source coverage, 11 offline HTTP datasets under three authorized managers,
  complete delivery-address import, catalog scope and unchanged deltas verified.
  Actual outgoing queue and stock schedules ran successfully. Details and backup
  evidence: API `docs/production-reference-exchange.md`. Production extension and
  business documents unchanged; recurring order import was not enabled.
- Remaining acceptance is on a physical phone: install over the existing app,
  download data, create an offline draft, restore network, and verify tracking.
  Do not uninstall or clear app data; local unsent drafts must be retained.
