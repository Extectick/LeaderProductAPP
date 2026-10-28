# Help messenger

## Data and navigation

`src/features/help/useHelpService.ts` owns one account-scoped socket connection and
the active history window. The server assigns message sequences. REST supports
exclusive `before` / `after` cursors and a bounded window around a sequence or
message ID. Search returns newest-first matches and a cursor; selecting a distant
result fetches its window directly, without loading intervening pages.

Opening priority is an explicit link/quote/search target, a saved history anchor,
the first unread incoming message, then the latest page. A viewport anchor stores
message ID, sequence, offset below the header and whether the user was following
the tail. Read receipts are sent only for visibly exposed messages while the
screen is active, not for fetched or recycled rows.

`helpHistoryDatabase.ts` stores downloaded messages, ranges, event cursors,
versioned tombstones and viewport anchors in Expo SQLite. Keys include API origin
and account ID. Cache writes and cursor advances are atomic; older HTTP responses
cannot resurrect deleted messages or replace newer edits. The web adapter keeps
the same contract. The rendered window targets 600 messages. Trimming waits for a fresh idle
viewport anchor, so a prepend can temporarily exceed this target without replacing
the visible row. Downloaded history remains available for offline paging. Attachment metadata is cached;
this change does not pre-download every media file.

## Realtime

Authenticated `help:event` notifications immediately trigger incremental
`GET /help/tickets/:id/sync?after=...`. The response contains durable ordered
events, changed message snapshots, deletions and ticket/read metadata. Wakeups
received during a request schedule another pass. Reconnection replays from the
persisted cursor; a periodic repair covers missed notifications. History readers
keep their anchor and see a jump-to-latest indicator; readers at the bottom follow
new messages. Typing uses the existing `help:typing` channel. Sender read checks
come from another participant's server read sequence.

The matching API changes are in `LeaderProductAPI/src/modules/help/` (see its
`docs/help-service.md`). Deploy APP and API together; the new history/search/sync
contract must be present on the API host. This work does not deploy production.

## Presentation

`HelpTimeline` virtualizes independent message/date/unread rows with FlashList.
History prepend uses visible-position preservation. Text-only windows do not
update image-priority state during scroll; measured bubble bodies are memoized
behind stable action forwarders. Local calendar keys, rather than localized
labels, drive date grouping and scroll comparisons. Explicit navigation settles
recycled row measurements before a bounded 280 ms transition; reduced-motion
settings disable it. Android's `leader-help-input` module owns composer resizing
and bottom padding in the same native frame. Transforms used by a search jump
are excluded from inset measurements.

Search keeps the same header instance, animates the more/close icon, replaces the
composer with a result counter, and shows vertical previous/next controls above
the right-hand action axis. Drafts survive entering and leaving search. Messages
by the same author within five minutes and the same day form visual groups: one
name at the top, one avatar at the bottom. Unread boundaries and system messages
split groups; individual message actions and timestamps remain intact.

## Dates, media and playback

The sticky date is an overlay outside the blur target. Its pill sits 4 dp below
the header capsule, or below the active voice strip. Tapping it resolves the first
message in the local calendar day through `/messages` navigation plus the `/date`
lookup, including DST boundaries. A `date` navigation target never highlights a
message. If the day's first message is already readable, tapping does not scroll;
a nearby measured target uses one native smooth scroll, and distant targets use
the bounded viewport transition. The outgoing snapshot is captured before lookup
but shown only after resolving the actual target. Manual scrolling cancels pending
explicit navigation.

Native tail following is released on the first upward movement. JS keeps it off
through drag and fling; only the settled physical bottom (within 2 dp) or explicit
Latest navigation can reacquire it. Programmatic momentum events do not count as
user gestures. Deferred history trimming runs only after idle; background/unmount
persists the latest anchor with `deferTrim` so leaving during a fling does not lose
the reading position or start another navigation.

Text bubbles measure the last line and timestamp/receipt width. They expand enough
to share the last line when space permits, with a rounding reserve for Android;
only genuine overflow keeps the timestamp in a separate row. Audio, photo overlays
and reaction rows retain their own timestamp layouts.

Albums contain up to ten ordered images. `helpAlbumLayout.ts` chooses balanced
rows from stored aspect ratios, with dedicated two/three/four-image layouts.
Server dimensions reserve space before image decoding. Tiny inline previews
appear with message text; Expo Image loads originals only in or near the viewport,
with native memory/disk caching and higher priority for visible images. This is
an independent implementation informed by Telegram's published album principles,
not a copy of its Java source. Legacy missing dimensions use stable square slots.

The API adds width, height, thumbnailDataUri and position through migration
`20261028120000_help_attachment_previews`. The guarded runner is
`node scripts/apply-help-migration.js --attachment-previews`; production migration
and deployment are separate from these local changes.

One shared audio player lives above the virtualized list. Messages resolve audio
only after Play; scrolling a row away does not stop playback. The header strip
provides pause/resume, 1/1.5/2 speed, jump to source and close. Account/chat changes
cancel pending resolution and stop playback. Starting a recording stops playback.
Progress consumers are isolated from the timeline and composer command context.

Android blur uses a theme-colored frame clear rather than the white window
background, and captures only after its target has a nonzero layout. This requires
the patched native development client.

## Validation entry points

- `npm run test:unit -- --runInBand --testPathPattern help`
- `npx tsc --noEmit`
- `qa/help-preview/README.md`: isolated native fixtures, SQLite restart probe,
  Hermes snapshots, ADB screenshots and native input/frame measurements.
- API: focused HTTP/PostgreSQL/WebSocket integration runner documented beside
  the history contract.

Native module changes require a rebuilt development client. The emulator x86_64
APK and physical-device APK are separate artifacts; replacing one does not
update the other. Production diagnostics expose no command interface.
