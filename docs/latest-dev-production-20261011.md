# Full dev promotion to production — 2026-10-11

User requested latest APP and API in production, committed separately. Preserve production-only hotfixes and unrelated local work. No 1C changes.

- [x] Merge dev 9f646b3 onto production afe4029 without dropping prior OTA/purchase-history fixes.
- [x] Prepare prod public-order web deployment and enable the tested native diagnostics with channel-isolated DSN/environment.
- [ ] Run types/tests, APK build and private JS/native-symbol verification.
- [ ] Deploy API first with backup; configure production /order/ without touching dev.
- [ ] Publish production APK 0.1.34/build 33 and compatible OTA; verify signatures, hashes, channels and permanent download.
- [ ] Record exact deployed commits and release evidence.

Physical-device acceptance remains separate. Install over the existing production app; do not uninstall or clear local draft data. Old runtime 0.1.33 must not receive a relabelled 0.1.34 OTA.
