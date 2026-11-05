# Local Help history opening

Existing conversations display downloaded messages before checking the server.
`HelpScreen.open` starts `openTicket` at the tap, including while the page enters.
Initial missing-window fetches run during entry; only quiet server synchronization
waits for its completion. Leaving resolves that promise with `false`; account and
detail generations reject late results.

`useHelpService` uses the account/server-scoped memory window first, then the
SQLite WAL snapshot at the saved viewport or first unread message. The list warms
its first six windows and prepares visible rows as the user scrolls. Existing disk
windows are reused; a missing window is fetched and saved ahead of the tap. Opening
and preparation share one inflight detail request. Snapshot reads do not send read
receipts. The existing 30-window memory cache bounds retained windows.

The 180 ms online / 1500 ms offline storage budget permits a server fallback when
storage is stuck. It no longer discards the pending read: a local snapshot that
finishes while the server request is outstanding is installed immediately. A
later detail response is persisted and reconciled through the normal versioned
history path, without issuing another navigation or resetting the visible list.
Once a server window is installed, a stale disk result cannot replace it.

Background reconciliation preserves unchanged message references and the current
viewport. Explicit message links still require a window containing the target.
Access revocation continues to clear memory and persisted downloaded history;
a failed network request alone retains an already installed local conversation.
Scopes, cursor/version checks, outbox data and drafts retain their existing owners.
A conversation/window never downloaded on this device still needs a first fetch.

Regression checks are in `helpCacheOpening.unit.test.ts`, `helpScreen.unit.test.ts`,
`helpServiceHistory.unit.test.ts` and `helpServiceCommitted.unit.test.ts`.
This change is JavaScript-only and does not change the native runtime or schema.

FlashList keeps unmeasured or misaligned initial windows hidden while restoring
the saved anchor. A fully measured initial window already at its requested offset
(or fitting entirely within the viewport) can reveal directly on `onLoad`, without
an extra frame/signature pass. This does not remove native layout/position checks
for larger histories or unresolved targets. Cache access time and complete message
paint are distinct metrics; a fast memory hit does not prove instant rendering.

## Opening latency audit (2026-11-05)

Saved QA2 DEV samples separated the stages: cached data installed in1–7ms,
first list layout345–693ms, positioning649–1295ms from tap, and React's final
visibility metric732–1609ms. Positioning-to-visibility alone added83–314ms.
These are two exploratory software-emulator samples from before this audit,
not physical-device measurements or an after-change benchmark.

The audit removed these concrete critical-path costs:

- Ready opacity used to wait for React's next commit. A native Animated.Value
  now reveals only the measured/aligned list before ancillary ready state commits.
  The existing first optimistic-row geometry guard remains in force.
- The same ready commit expanded FlashList drawDistance320→>=1200. Expansion
  now runs after two paint frames at transition priority; first paint stays bounded.
- Date measurement updates in a layout effect used to rerender HelpScreen.
  HelpTimelineDatesHost owns those updates at the existing external date layer.
- No-op committed repairs replaced selectedTicket and an empty outbox array,
  invalidating chat renderers. Equal ticket metadata and an empty outbox retain
  identity; real metadata/rights changes still replace their values.
- Theme palettes now retain identity, avoiding HTML-context invalidations.
- Completed historical answers skip streaming block segmentation and render one
  Markdown document. Answers that actually streamed retain their block tree
  through completion; current streaming behavior is preserved.
- HTML previews obey media priority and defer eager work until after paint.
  Invisible rows retain their square geometry without WebViews or auto-downloads.
  Explicit links/routes still work immediately with the same account fences.
- A known measured scene width starts entry in a layout effect, avoiding another
  native onLayout/passive-effect round trip. Per the owner clarification, existing
  chats retain the same240ms slide as new chats; rich history mounts in the next
  React commit while the native animation runs. New-chat keyboard policy is unchanged.

Checks:219suites/1997tests passed in the shared workspace,201 targeted checks,
28 quiet-sync/cache checks after the last state-identity change, TypeScript,
Android Metro bundle, Expo dependencies and Doctor20/20. No OTA/native/API release.

React DevTools profiling failed to attach (first a server/runtime selector issue,
then the runtime closed its debugger connection). It was not retried further.
The idle Simpleperf capture had no focused interaction and is excluded from
causal evidence. No post-fix first-painted-frame measurement is claimed; instant
complete rendering remains unverified. QA2 was closed and left booted. Safe
baseline stages and proof are under `.dev-runtime/help-opening-audit/`.

## Owner clarification: animate immediately, show history at the end

The zero-duration experiment was removed. All ordinary chat entries use the
existing240ms transition, starting from the known measured scene width in the
layout effect. The first commit is lightweight; rich history mounts in the next
React commit while the native slide progresses, without waiting for onEntered.
Local windows are prepared before the tap; missing visible windows are fetched
and persisted from the list. A tap joins that same detail request if still pending.
Background synchronization alone waits until onEntered. Existing account, access
revocation, page-version, cancellation and saved-anchor guards remain in force.

Tests verify cached messages mount during the held entrance and remain present
without a loading placeholder after its completion; known-width motion starts
without another native layout; preparation neither selects a ticket nor marks
messages read, persists its window, and does not duplicate the opening request.
The full shared run passed2005tests/219suites; types/Androidbundle/Doctor20/20
passed. No fresh device timing or universal guarantee for an uncached conversation
on a slow/offline network is claimed. Metro only; no new OTA/native/API release.
