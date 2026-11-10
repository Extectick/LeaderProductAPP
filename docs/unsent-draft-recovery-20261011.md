# Draft recovery and queue confirmation — 2026-10-11

Production incident `1a62a842`: editing a never-submitted API draft (60 -> 20 kg) was incorrectly treated as reducing an accepted order. The API fix exempts only unsubmitted drafts, retaining version conflicts and all exported-order protection. The user separately authorized recovery and production API/OTA release; the exact four-line revision was posted as `НОУТ-122474` for RUB 162064.

APP changes:

- Read-only reconciliation now also checks NEEDS_EDIT and PRICE_REVIEW submissions accepted later on the server. Only the exact owner/client identity and client revision in QUEUED/SYNCED state can replace the local row. SAVE drafts, different revisions, unaccepted server drafts and open unsaved edits are preserved. No automatic submission on reconnect.
- Explicit queue sending now reuses the editor's native/web confirmation for protected reductions. The exact approved payload is persisted before retry, with the same client ID, revision and geo event. Cancel and ordinary content conflict never authorize overwrite.
- No native dependencies/config changes: OTA targets the existing production runtime 0.1.34. The affected manager's latest server session reports Android 0.1.34.

Validation: 83 focused workspace/integrity/review tests and TypeScript check. Tests cover rejection/acceptance, exact persisted retry, no duplicate submission during recovery, and preserving a draft when API has a different revision or only SAVE. CI release verification follows. Physical-phone acceptance remains separate.

## Published and verified

- APP commit `69ffdab665988e4fb6a8a14de16344e641152ed8`; OTA workflow `38120625673` succeeded, including the full order-integrity check. Production API prerequisite `677d4bf` deployed successfully before publication.
- Production OTA `0.1.34.2`, sequence 2, runtime `0.1.34`, 100% rollout; update ID `4bfe614a-2840-410f-a7de-a6e199f6188a`. Served manifest config matches the build; the downloaded 18041380-byte bundle matches SHA-256 base64url `PixaZzYPretJmcium5nx2pP01LT7icx2ygSdGbE-ARE`. Already-current clients receive HTTP 204.
- Source-map verification event `f7c6e60b5b7eef182616d06e42118356` resolved to `/src/shared/monitoring/privacy.ts:14`, debug ID `83099801-00a8-4616-ae0c-91d7efb1d40c`.
- APK workflow `38120625638` explicitly skipped native compilation: no runtime change or new APK. Existing APK 0.1.34/build 33 remains current. Main web workflow `38120625649` succeeded.
- Production user-scoped GET confirms `НОУТ-122474`, posted, SYNCED, same clientRevision 6, four items and RUB 162064, with no 1C/export errors. The phone can reconcile that exact revision without another SUBMIT. No access to the physical phone was used or claimed.
