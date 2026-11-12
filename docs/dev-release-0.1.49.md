# Development release 0.1.49 / build 48

Development only. Runtime 0.1.49, signed ordinary Android package
com.leaderproduct.app; install over the previous development APK without clearing
application data. Production catalogs and deployments are outside this release.

The APK consolidates the published development app plus message multiselection
for human and AI messages: left checkboxes, selected-row tint, incoming slide,
copy and ordered forwarding with partial retry protection. Existing composer state
is retained. There is no message-deletion endpoint, so no trash action is exposed.
AI public progress opens by default for each run, supports manual collapse and the
shared web scrollbar, and disappears after the final answer.

Expo SDK 58 patch dependencies are aligned with the SDK recommendations; the
required SQLite config plugin is explicit. No React/Babel/TypeScript major upgrade.
Native runtime changes are delivered by this APK; its OTA is restricted to the new
runtime. Development Sentry stays disabled. Existing local application data,
server databases, emulators and production services are preserved.
