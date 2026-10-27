# Help — composer and context-menu follow-up, 2026-10-23

## Latest comparison target

- Source visual truth: `C:/Users/836D~1/AppData/Local/Temp/codex-clipboard-05d6acca-3757-4244-97d2-e3c9e0d4bd34.png`, 471 × 614 pixels. The left Telegram card is the requested composer reference; the right card demonstrates the previous defect.
- Implementation: actual HelpScreen via isolated `qa/help-preview`, no API writes. Browser URL: `http://127.0.0.1:8100/?screen=list&theme=light&width=393&height=852&insetTop=24&insetBottom=24`.
- Full-view evidence: `tmp/help-design-qa/composer-comparison-full.png`. Source card crop 254 × 548 normalized to 393 × 848; implementation crop 393 × 852 from a 1265 × 920 full-page browser screenshot, CSS surface 393 × 852, 1 screenshot pixel per CSS px. The low-resolution Android task-switcher reference cannot establish exact original device font metrics.
- Focused evidence: `tmp/help-design-qa/composer-comparison-detail.png`; the same-width crops compare the actual input shape, padding, type scale, and buttons.
- Additional implementation captures: `composer-empty-fixed.png`, `composer-multiline-fixed.png`, `composer-long-dark-320-fixed.png`, `context-menu-fixed.png` in that directory.

## Findings and comparison history

1. [P2, fixed] Composer looked flat and its input type was too small in the supplied current-state screenshot. Increased input font 14 → 16, message body 14/19 → 15/21, composer radius 20 → 24, shared dock side inset 4 → 8. Resting height remains 48; new-ticket button retains matching geometry. Post-fix focused comparison shows the floating pill and larger text.
2. [P1, fixed] Selected messages changed geometry because the border and menu participated in normal layout. Border is now a pointer-transparent absolute overlay; the anchored action menu is in a transparent Modal. Rendered message 8 remained exactly 369 × 102 before/after selection. Clicking the dismiss backdrop removed the menu; selecting Reply removed it and populated the quote preview. Android Back uses onRequestClose.
3. [P2, fixed in implementation; native feel still requires device QA] Replaced global 180 ms LayoutAnimation with interruptible, composer-only 260 ms eased height animation, with reduced-motion fallback. The chat follows animated dock height without restarting a competing scroll animation each frame. Browser height checkpoints: empty 48, three lines 92, four lines 114, capped input 145 / outer composer 159. Maximum remains 6.5 lines with overflow fades. Automated tests cover retarget/cancel and reduced-motion behavior; browser tooling did not expose frame sampling, so no FPS claim is made.

## Required fidelity surfaces

- Typography: system family retained, input 16/22, body 15/21, small time labels unchanged; long content wraps without timestamp collision in tested states.
- Spacing/layout: 48 px empty pill, 24 px radius, 8 px dock inset; 320 and 393 px surfaces exercised. Menu no longer changes message layout.
- Colors/tokens: existing light/dark product palettes preserved; no input glow. Reference wallpaper is not copied because only the composer is in scope.
- Images/icons: existing vector icon library preserved. Paperclip remains on the previously requested left side, no new emoji-picker feature. Fixture media is test content, not an attempted replacement for reference artwork.
- Copy: Russian placeholder and action labels retained; icon-only copy/edit keep accessible labels.

## Verification and limits

- 109 Help assertions in 9 suites pass; TypeScript passes. New regressions cover menu dismissal/layout neutrality and composer animation/reduced motion.
- Browser console error check returned no errors. Tested empty/multiline/capped input, light/dark, narrow layout, right-click menu, outside dismissal, Reply and cancel quote.
- Physical Android keyboard, native long-press and perceived animation smoothness were not re-tested on a phone in this follow-up. Browser evidence is not native-device certification.
- Scope-specific browser visual QA: no remaining actionable P0/P1/P2 visual findings. No deployment performed in this follow-up.

final result: passed

---

# Historical QA before this follow-up (superseded composer dimensions below)

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
