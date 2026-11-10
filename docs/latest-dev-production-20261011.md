# Full dev promotion to production — 2026-10-11

User requested latest APP and API in production, committed separately. Preserve production-only hotfixes and unrelated local work. No 1C changes.

- [x] Merge dev 9f646b3 onto production afe4029 without dropping prior OTA/purchase-history fixes.
- [x] Prepare prod public-order web deployment and enable the tested native diagnostics with channel-isolated DSN/environment.
- [x] Run types/tests, APK build and private JS/native-symbol verification.
- [x] Deploy API first with backup; configure production /order/ without touching dev.
- [x] Publish production APK 0.1.34/build 33 and compatible OTA; verify signatures, hashes, channels and permanent download.
- [x] Record exact deployed commits and release evidence.

Physical-device acceptance remains separate. Install over the existing production app; do not uninstall or clear local draft data. Old runtime 0.1.33 must not receive a relabelled 0.1.34 OTA.

## Release evidence

- APP promotion commit `0b934893ae11bd243362f21e52c3073c7c5e97a0`, followed by web-only Metro WASM asset fix `abf5deae2602ebd6842acdb76c0aeb5494bc65cc`. Both pushed to main; APK and OTA use the promotion commit. The web fix does not change their native behavior.
- API promotion `26af3b4bea545a66d1681f046d5166e36aab7358` deployed successfully with a validated fresh database backup, additive schema changes and read-only production 1C v55 verification. See the separate API release record; no 1C changes in this release.
- Typecheck and 157 targeted tests across 10 suites passed locally; production workflow checks also passed. Public-order web typecheck/build passed.
- APK workflow `38090494152` succeeded: standalone production `com.leaderproduct.app`, version `0.1.34`, build `33`, ABIs `arm64-v8a,x86_64`. Native build took 24m 51s. Verified non-debuggable manifest, production API/OTA/map/diagnostic configuration and absence of private diagnostic credentials.
- APK bytes `129593865`; SHA-256 `ac5ac1395d5ae8ee6d1fd54ef7662fdf63574fef34cff59b9e8507704405a6bf`. Signing certificate matches the existing production app: `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`. Artifact `android-apk-prod-0.1.34-33`, GitHub artifact ID `11685100164`.
- Private diagnostics gate uploaded 108 native ABI/library files. Synthetic event `dd655c8c37cbd502b0ae4f6317a79cfc` resolved to `/src/shared/monitoring/privacy.ts:14`, debug ID `a8ec8dfe-3dd7-49a0-b2f1-7a8e49f741b7`. This proves symbol transport/resolution, not an actual crash on a physical phone.
- OTA workflow `38090494154` succeeded: production display `0.1.34.1`, runtime `0.1.34`, update ID `ddcdfe36-7654-44bd-83e9-4b8dc7e022f9`, 100% rollout. Manifest and downloaded 18039432-byte bundle hash verified; an already-current client receives HTTP 204.
- Runtime isolation verified: production `0.1.33` continues to receive its unchanged `0.1.33.3` update `26737e69-a8b2-4317-a18a-a96c11e24398`; dev `0.1.34` remains on `0.1.34.12`, update `8420a844-0a59-4556-acb1-26e77616d12a`.
- Public-order web workflow `38090494167` succeeded at `https://api.leader-product.ru/order/`; served assets match the build and no-index/no-referrer policies are present. Main employee web workflow `38090777797` succeeded using `abf5dea`, after fixing missing WASM asset packaging. SQLite catalog remains disabled on web, so no unrelated cross-origin isolation change was applied.
- Permanent download entry point: `https://api.leader-product.ru/download` (HTTP 200). The public update endpoint offers build 33 to build 32, and does not offer another update to build 33. Published size/hash match CI metadata; the public download is verified separately from the GitHub artifact.
- Unrelated dirty work in the primary/dev worktrees was preserved. No dev deployment, uninstall, local-draft cleanup or production business-order mutation was performed.

The existing production diagnostic backend still depends on its private workstation/tunnel; this release did not migrate it to an always-on VPS service. Physical-phone profile, geolocation and order acceptance remains a separate check.
