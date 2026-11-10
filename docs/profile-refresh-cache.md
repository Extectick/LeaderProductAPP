# Own profile refresh and avatar metadata

`ownProfileCache` coordinates only the signed-in employee's profile metadata.
Avatar bytes and stable asset URLs are handled by the separate avatar transport.

- Concurrent Home/Profile reads share one pending request. A successful response
  is reused for 30 seconds in this JS runtime. Persisted profile hydration is not
  treated as a fresh network response; Auth's background check remains active.
- `getProfile({force:true})` and `getProfileById(undefined,{force:true})` bypass the
  freshness interval. They can share a current, valid in-flight read.
- Upload, profile edits and active-profile changes fence older reads. Creation
  invalidates reads again after its server write before fetching the new profile.
- Explicit null avatar fields are preserved. No previous image URL is merged into
  a response that removes it; signed legacy URL query strings are not stripped.
- Known old response objects cannot be reapplied by a late Auth continuation.
  Profile storage writes are serialized and skipped if their revision is obsolete.
- Cached own-avatar bytes are primed locally before restored Auth is exposed; the
  avatar transport bounds startup waiting to 150ms and performs no network download.
  A session fence prevents a logout during this wait from restoring old identity.
  Manual sign out clears the in-memory avatar source; durable cache stays partitioned.
- Login/logout resets the session generation, including login to the same account.
  Token refresh keeps the session, but its profile response is accepted only if
  no newer profile change occurred while refresh was pending.
- API failure retains the displayed cached profile. Storage exhaustion must not
  turn an accepted server upload/read into a network failure; the in-memory result
  is still returned. Cache removal/session storage errors retain existing handling.

This is an in-process request coordinator, not an authorization cache. Server
permissions remain authoritative. It does not coordinate unrelated browser tabs
or background runtimes; they retain their existing token/storage behavior.

Tests: ownProfileCache, userProfileRefresh, profileCache and authManager cover
read deduplication, explicit refresh, upload/create races, session changes,
refresh-token/profile races, null removal, offline mode and storage exhaustion.
