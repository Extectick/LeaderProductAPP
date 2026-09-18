# Order integrity APP hotfix

Production base: main 4328bbc. Companion API hotfix is based on main b6587ad.

- Preserve API contentToken in drafts and requests.
- Ask explicit confirmation for removed/reduced/replaced/cancelled lines using the existing native Alert (web confirm).
- Do not retry content/revision conflicts with a silently refreshed revision.
- Serialize foreground saves against device queue sync; keep later edits when an older request completes.
- Consume only the matching local operation (id, revision, intent); conflicts require manual review, not endless background retries.
- Preserve rejected staged drafts locally; do not discard the only durable copy after a conflict.
- Do not discard unrelated local-only drafts that also have a null serverGuid.
- Preserve structured API errors through the HTTP/client service layers.
- Release gate: order/HTTP/hook regression tests and TypeScript before OTA publication.

No native dependency changes: OTA for a compatible production runtime, after companion API rollout.
Keep offline dev additions when forward-porting. No production publication was performed during implementation.

Remaining QA: physical device confirmation/cancellation, simultaneous edits during a request, airplane mode/response loss, WMS15 end-to-end, user-visible stale conflict recovery.

## Verification / delivery, 2026-09-18

- Production-base: TypeScript and 77 tests passed (5 suites).
- Dev forward-port: TypeScript and 98 tests passed (7 suites), including offline sync.
- Hook regressions verify delayed responses preserve later edits, simultaneous saves are excluded, ordinary conflicts are not retried, and confirmed reductions retain the same client revision.
- Dev retains manual-only offline submission. Reconciliation requires the same client identity/revision and an accepted submission state.
- Dev persists the submission geo event before HTTP and reuses it on retry.
- Local branches: hotfix/order-integrity-prod and integration/order-integrity-dev. No push or OTA publication.
