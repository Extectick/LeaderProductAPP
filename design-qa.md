# Help — fidelity and interaction QA, 2026-10-23

## Scope and evidence

- Reference: approved running prototype at `http://192.168.30.244:8095/`, source in `DocsForAI/help-service/mobile-prototype`. Prototype runtime check passed; protected source was not edited.
- Implementation: actual `HelpScreen`, composer, message, media and primitive components, rendered by isolated `qa/help-preview`. Its service/router fixtures are QA-only; production authentication and API routes are not bypassed.
- Matched dark-list comparison: `tmp/help-design-qa/comparison-list-dark.png`, normalized to 393 × 852. Source device chrome is retained; QA safe areas are 54/34. Different ticket contents, times and assignees are fixture differences, not a claim of identical backend state.
- Additional browser evidence: `app-reply-dark-full.jpg`, `app-gallery-dark.jpg`, `app-close-dark-full.jpg`, `app-composer-light-320-full.jpg`, `app-long-message-light-320.png` in the same directory.
- Chat comparison `comparison-chat-dark.png` was inspected and exposed a duplicate sticky/inline date at scrollTop=0; this snapshot is pre-fix evidence, not final sign-off.
- Final chat comparison `comparison-chat-dark-final.png` was inspected after the fix: one inline date at the start; floating date only after its separator leaves the top.
- Previous 404 report preserved at `docs/design-qa/not-found-2026-10-23.md`.

## Corrections verified in rendered UI

- Prototype palette, 56px header, 76px ticket rows, typography, avatar grouping, unread badges, search and action geometry.
- Composer and new-ticket action share 48px resting height, 4px horizontal inset and bottom safe-area offset. Final list action is y=762, width=385 at 393 × 852, matching the prototype.
- Transparent text area, no focus glow, 6.5-line cap and symmetric overflow fades. Browser measurement: four lines 88px → one line 22px; after a long message is sent, empty input returns to 22px (48px outer composer).
- Long unbroken messages at 320px wrap without covering timestamps. Timestamp placement uses actual last-line metrics; reactions remain inside the bubble.
- Reply actions and quoted-image preview, quote navigation, photo opening/closing, and close-ticket composer with focus after “Помогло” were exercised.
- Voice bubble uses compact play/seek/caption layout; progress is interpolated between audio updates. Recording uses actual metering, not decorative playback bars.
- Image-load callback crash on web and the photo timestamp overlay intercepting taps were found and corrected during QA.

## Automated / implementation checks

- Targeted Help tests cover permission interruption, cancellation/unmount cleanup, composer shrink, right-only reply gesture and reversal cancellation, timestamp fit, audio layout, media/gallery, list/draft/navigation, service and websocket behavior.
- Final targeted run: **107/107 tests, 9/9 Help suites, exit 0**, including the 7 scroll/date regressions. Full TypeScript recheck after the final screen changes also passed (exit 0).
- Full Jest assertions passed (100 suites, 869 tests), but the full process exited 1 due to unrelated asynchronous OTA console output after test completion. This is not reported as a green full-suite run.
- QA Android Metro/Hermes export passed. This does not prove native runtime interaction.
- Final **actual APP** Android/Hermes export passed with dev API/channel configuration: 6295 modules, 52 assets, 21MB HBC in `tmp/help-final-android`. QA entry is not included. No upload/publication was performed.
- Browser archive/back flow, old-ticket new-draft source link and cancelling that empty draft were exercised successfully with QA fixtures.
- Actual expo-audio web playback of the locally generated 8-second WAV completed successfully (play → pause state → 0:08/0:08 and play state).
- Browser wheel/layout regression verified: at history top, growing composer increased scrollHeight 1015→1103 while scrollTop stayed 0; at bottom, the same growth moved scrollTop 273→361 with viewport 742 (still exactly at bottom). Date duplication disappeared when scrolled to top.

## Remaining verification / constraints

- Native Android keyboard movement and first microphone-permission/hold lifecycle remain unverified. API35 AVD entered a system_server Watchdog boot loop before app installation; the existing API30 fallback remained ADB offline after ~7 minutes. Only our two emulator processes were stopped; no AVD data/config was reset. The emulator-only x86_64 debug APK build was requested to stop after the fallback failed, before its C++ phase; no debug APK success is claimed. Generated files/caches are preserved. Physical-device QA is not performed.
- Native system fonts/icons and blur rendering may differ from browser prototype. No pixel-perfect/native 1:1 claim is made before the native comparison.
- AI integration remains disabled by requirement. QA list participants and content are local fixtures, not live API data.
- Multiple-image download uses the current platform download/share flow, not a ZIP archive.

Final result: **BLOCKED for full native sign-off**; browser fidelity and targeted interaction checks completed, native QA pending.
