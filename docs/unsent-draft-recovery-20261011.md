# Draft recovery and queue confirmation — 2026-10-11

Production incident `1a62a842`: editing a never-submitted API draft (60 -> 20 kg) was incorrectly treated as reducing an accepted order. The API fix exempts only unsubmitted drafts, retaining version conflicts and all exported-order protection. The user separately authorized recovery and production API/OTA release; the exact four-line revision was posted as `НОУТ-122474` for RUB 162064.

APP changes:

- Read-only reconciliation now also checks NEEDS_EDIT and PRICE_REVIEW submissions accepted later on the server. Only the exact owner/client identity and client revision in QUEUED/SYNCED state can replace the local row. SAVE drafts, different revisions, unaccepted server drafts and open unsaved edits are preserved. No automatic submission on reconnect.
- Explicit queue sending now reuses the editor's native/web confirmation for protected reductions. The exact approved payload is persisted before retry, with the same client ID, revision and geo event. Cancel and ordinary content conflict never authorize overwrite.
- No native dependencies/config changes: OTA targets the existing production runtime 0.1.34. The affected manager's latest server session reports Android 0.1.34.

Validation: 83 focused workspace/integrity/review tests and TypeScript check. Tests cover rejection/acceptance, exact persisted retry, no duplicate submission during recovery, and preserving a draft when API has a different revision or only SAVE. CI release verification follows. Physical-phone acceptance remains separate.
