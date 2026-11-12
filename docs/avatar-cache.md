# Stable user avatars

Home, profile home, personal details and user cards share `UserAvatar`. The API
continues returning legacy `avatarUrl` for existing APKs and adds a stable
`avatarAssetUrl`/`avatarVersion`. A revision is derived from the owner, profile
kind and immutable object key; profile timestamps and signed URL tokens are not
image cache keys. Explicit `avatarAssetUrl:null` removes the photo. External
legacy images omit the new fields and retain their previous image behavior.

The authenticated `/users/:userId/avatars/:type/:version` route checks existing
profile access, object namespace and revision. Only owned raster avatar objects
are served, with ETag/304 and private immutable caching; errors use no-store.
The final version/access check occurs after the bounded S3 read. New uploads
are decoded, resized to at most 512px and stored as JPEG without EXIF. The server
keeps old signed URLs for compatibility and fixes the User.avatarUrl fallback.

The APP caches authenticated bytes under API environment + viewing account +
photo owner/type/revision. Android uses an app-private versioned file; web uses
IndexedDB Blob storage and temporary object URLs. Headers are sent only to the
exact avatar route on the configured API origin. No token is persisted in the
image cache or key. Concurrent Home/Profile requests share one load. Incomplete
native files use unique temporary names and are never restored as cached photos.
Persistent storage is bounded to32 photos; memory retains recent sources for
smooth transitions. Logout clears memory; persistent bytes remain partitioned
by account and are subject to normal cache eviction. This is not a promise of
secure erasure on logout.

On a new revision, the previous image for the same identity stays visible until
the replacement decodes; fades are disabled. Account/identity changes and explicit
removal clear the previous image immediately. Corrupt cached images receive one
bounded retry. Initial auth restoration warms local cache only, waiting at most
150ms, without holding startup for a network download. Profile metadata refresh
uses the existing5-minute/foreground check plus explicit refresh; reads are
coalesced with30-second freshness. Upload responses invalidate older reads and
persist the authoritative profile. See profile-refresh-cache.md.

Verified in an isolated browser fixture with real components/cache: one initial
download; zero additional downloads for Home/Profile navigation, remount and full
page reload; one download for a changed revision. A1.5-second replacement delay
kept the old image visible (200 sampled animation frames,0 empty frames). Cached
photo survived simulated API503 and reload. Missing image, deletion, viewer switch
and390px mobile web were checked. These are synthetic auth/images, not a claim
that missing historical photos were recovered. Native logic tests and Android
Metro bundle passed; visual Android QA was blocked by Device MCP screenshot failure
on emulator5554 after the advised state check and one retry. No ADB UI bypass.

Four historical avatars point to absent objects in the inspected dev/original
stores and migration inventory. The former files server192.168.30.206:3000 refused
connection for12 bounded requests to the four exact keys. No DB link was erased,
no placeholder was saved as a user's photo. The owner explicitly declined recovery. Missing photos use initials until a new
photo is uploaded to persistent S3. No production data was changed.

Dev API/worker: leaderproductapi:avatar-cache-dev-20261106-r1, scoped3-module layer
on actual help-web-links-dev-20261106-r2. Existing Help/1C/analyzer behavior remains.
Proofs: ../.dev-runtime/avatar-fix/. APP changes are in Metro source; no OTA or native
APK was published in this task. Main Metro and T3 were not restarted.
