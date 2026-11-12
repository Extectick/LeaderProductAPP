# Isolated avatar QA

Run with the installed workspace Node24:

```
cd LeaderProductAPP/qa/avatar-preview
EXPO_OFFLINE=1 node ../../node_modules/expo/bin/cli start --dev-client --web --host lan --port 8124
```

This fixture uses the real `UserAvatar`, `ServicesHomeHeader`, `ProfileHome`,
`useAvatarSource`, versioned transport and web IndexedDB/native file storage.
Only AuthContext, theme, API origin, token service and the surrounding AppHeader
shell are replaced. PNG portraits and unsigned Bearer strings are synthetic;
there are no business records, real credentials, uploads or production requests.

Web API: same origin `/avatar-fixture`. Android emulator API:
`http://10.0.2.2:8124/avatar-fixture`; the operator must explicitly provide its
localhost forwarding and open this fixture with Device MCP. Keep the main Metro
8081 and unrelated QA ports intact. This is not a production app entry point.

`/avatar-fixture/stats` reports avatar request/download/404/401 counts. Counts are
shared across devices; run browser and Android sequences separately and record
baselines. UI controls change the fixture response availability, delay, revision,
viewer account and mounted screen. `Сеть выключена` simulates an unavailable
avatar API (503), not OS networking. `Сбросить кэш QA` only deletes the known
fixture origin/account/revision keys, never general application storage.

Suggested sequence: fresh v1 load; Home/Profile remount; browser reload from
IndexedDB; delayed v2 update retaining v1 until decode; unavailable API with
cached remount/reload; missing image fallback; immediate deletion; viewer change
of the same viewed profile (no former viewer image while fetching). v2 has a
1.5 second delay; returning network on resets it. Only v1, v2 and v3 exist.

Verified browser results and screenshot paths are recorded privately under
`.dev-runtime/avatar-fix/ui/web-proof.json`. They cover the actual image/cache
components in this isolated fixture, not real account authentication or uploads.
