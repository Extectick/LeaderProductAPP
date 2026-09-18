# Order integrity APP hotfix

Production base: main 4328bbc. Companion API hotfix is based on main b6587ad.

- Preserve API contentToken in drafts and requests.
- Ask explicit confirmation for removed/reduced/replaced/cancelled lines using the existing native Alert (web confirm).
- Do not retry content/revision conflicts with a silently refreshed revision.
- Serialize foreground saves against device queue sync; keep later edits when an older request completes.
- Consume only the matching local operation (id, revision, intent); conflicts require manual review, not endless background retries.
- Do not discard unrelated local-only drafts that also have a null serverGuid.
- Preserve structured API errors through the HTTP/client service layers.
- Release gate: order/HTTP/hook regression tests and TypeScript before OTA publication.

No native dependency changes: OTA for a compatible production runtime, after companion API rollout.
Keep offline dev additions when forward-porting. No production publication was performed during implementation.

Remaining QA: physical device confirmation/cancellation, simultaneous edits during a request, airplane mode/response loss, WMS15 end-to-end, user-visible stale conflict recovery.
