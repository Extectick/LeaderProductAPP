# Isolated native entity-card fixture

Uses the real EntityCardProvider/Host, HelpMarkdown, card registry and ProfileView.
All identities, profile fields, rows and relations are synthetic in-memory data.
The fixture Metro config substitutes auth, entity reads, presence, API config,
HTTP and theme persistence. Unexpected application HTTP fails locally. No real
account, personal 1C connection, database or message-send path is used.

Run with the existing Node24/development-client environment:

```sh
EXPO_OFFLINE=1 npm run start:native
```

Metro listens on8103. It is independent of ordinary Metro8081 and Help QA8100.
The development-client scheme/package remain leaderproduct-dev /
com.leaderproduct.app.dev. The host/device transport may need a scoped port
forward; use Device MCP for all UI actions. No APK build or package install needed.

Check Markdown product/order/user links, nested generic references, header close,
Android Back, downward dismissal, scroll handoff, history position restoration,
keyboard blur and retained parent draft. The order starts with100 of140 synthetic
rows; “Показать больше строк” loads the rest locally. Theme is memory-only.

None of these aliases is imported by the normal application or its OTA entry.
