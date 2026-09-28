# Production-only OTA: stale device drafts

## Isolation

- Base: production/main `2b865b4e7cb6b33217f4caed95cf2eebb1a0a0ec` (OTA 0.1.26.4).
- Separate worktree/branch; no dev changes, SQLite migration, tracking, startup, native dependencies or configuration included.
- Android runtime stays 0.1.26. APK, API and 1C deployments are not required.

## Incident and fix

Production logs showed five failed attempts for one clientOrderId, followed by successful persistence. Each rejected attempt left another device-order record because staging looked up only the form GUID. Successful persistence removed only the newest local GUID.

- Staging also looks up clientOrderId, reuses the local identity, and advances its revision.
- Successful persistence consumes matching acknowledged operations, not newer or different local content.
- AsyncStorage snapshots are serialized per user/storage key; staging and successful removal are awaited.
- Local document labels show the meaningful unique identifier, not the constant `device-o` prefix.

## Existing stuck drafts

Recovery runs on hydration/reconnection/list refresh, does GET reads only, and is throttled. Old production has no GET by-client-id and merged summaries omit clientOrderId. The fallback uses existing list/detail endpoints, scoped by organization/counterparty, with bounded pagination (4 x 100 per group, up to 3 groups and 12 detail reads per pass).

Header/date narrow down detail reads; neither date nor amount confirms identity. Confirmed removal requires the detail response's exact clientOrderId, current user, sufficient clientRevision, acknowledged intent and matching editable header/line content. Newer or ambiguous drafts and unavailable documents are retained. In-flight changes, unmount and account changes invalidate recovery. Recovery never re-sends a document to 1C.

Read-only production compatibility checks covered the actual affected document and request shape, including a date-only payload, nullable response defaults, and a merged-list amount differing from the persisted API amount. Full reconciliation cannot be confirmed on the manager's phone until it installs this OTA and opens the list online.

## Checks

- Regression: five HTTP 502 failures followed by success leave no duplicate draft.
- Recovery of five persisted legacy copies uses GET only; real number/status replace local rows.
- Preserve newer revisions, differing content, another user's document, offline/failed lookups and edits during recovery.
- Ignore late responses after unmount; serialize delayed storage writes.
- Unit tests and TypeScript check gate the OTA workflow.

## Publish

Commit with `[skip ci]` and fast-forward main; explicitly dispatch only `publish-ota.yml` for prod/android/runtime 0.1.26. This avoids the unrelated automatic web/APK workflows. Verify the successful workflow and the production manifest's updateId, displayVersion and commitSha.
