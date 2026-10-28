# Help — native composer and synchronized chat, 2026-10-28

The earlier JS clipping approach below still allowed one frame with a new text
line inside the old native layout. Android now uses a local Expo EditText module
with a pre-draw layout pass, bottom anchoring, interruptible native height
animation, and event-count acknowledgements that avoid resetting newer text or
selection. No invisible text mirror drives the new Android path.

A second native view updates the chat's scroll range and offset with the dock,
removing the onLayout -> React state -> content padding -> scrollToEnd delay.
Scrolling away releases the bottom anchor; returning near the end restores it.
The attachment glyph is now 24 dp, rotated 40 degrees clockwise; its hit target
and the composer's resting size are retained.

Validation: rebuilt and installed the x86_64 DEV APK on API 36 emulator-5554.
Native animations were disabled despite the missing settings key; animator scale
was explicitly enabled at 1.0 for motion validation. Hardware keyboard support
remains enabled; show_ime_with_hard_keyboard was restored to its original 0.
With animations enabled, the ordinary 1 -> 4 line typing run recorded 130 frames,
0 clipped-caret frames, and a constant chat/dock gap of 12.190476 dp. Eight-line
paste/overflow, insert at start, selection replacement, deletion to two lines,
explicit newlines, and clearing also reported 0 clipped frames. Scrolling to
history kept offset 0 while the composer grew. The final recorded grow/collapse
run likewise had 0 clipped frames and constant gap. Captured frames were visually
inspected. This is emulator fixture evidence, not a claim of exact Telegram
runtime parity, physical-device or expanded soft-keyboard validation.

Evidence: `tmp/help-design-qa/2026-10-28/native-motion.mp4`, `motion-frames.png`,
`native-composer-final.png`, `motion-metrics.json`, `wrap-metrics.json`, and
`edge-cases.json`. Direct ADB/Hermes commands were used; no Computer Use.
TypeScript check and 5 focused Jest suites (64 tests) passed. Main Metro 8081,
the API, phone ARM64 download and production were not changed.

The previous iteration is retained below for comparison; its composer mechanism
is superseded on Android clients containing the new local native module.

# Help — shared headers, continuous blur and direct diagnostics, 2026-10-27

## Scope and comparison

- Visual source: selected design `C:/Users/extec/.codex/generated_images/01a17c17-500e-7761-9fad-324a50cb140f/exec-50806137-bc12-4e21-96b2-9b56866d7314.png` (853 × 1844).
- Later user instructions override the source: center ellipsis/time/unread on one axis; remove body scope tabs; put the IT queue switch in the menu; transparent outer header with scrolling-content blur; apply the same blur below the new-ticket button and at both chat edges; use the shared capsule in chat.
- Actual implementation captured through ADB on `LeaderProduct_DEV_API36`, `emulator-5554`, DEV package `com.leaderproduct.app.dev`. The isolated QA entry renders real Help components with in-memory service data. Captures are 1080 × 2400, density 2.625, viewport width 411.43 dp.
- Side-by-side input inspected: `tmp/help-design-qa/2026-10-27/reference-comparison.png`. Both images scaled proportionally to 393 px wide; Android system chrome cropped at y=63 and y=2337. Different aspect ratios retained, not stretched. This checks composition and geometry, not exact raster equivalence of generated mock text.
- Actual scroll preview: `tmp/help-design-qa/2026-10-27/final-preview.png`. Original captures in the same directory: `final-list.png`, `final-menu.png`, `final-archive.png`, `final-list-scroll.png`, `final-light.png`, `final-chat-scroll.png`, `final-four-lines.png`, `final-one-line.png`.

## Findings resolved

1. [P2, fixed] Back/search separation and inconsistent right alignment. Shared 48 dp capsule, 44 dp back segment, one hairline only after Back, 16 dp list/header/CTA inset, fixed 48 dp metadata/menu column. Native measured maximum axis deviation is 0.38098 dp, approximately one physical pixel. Timestamp and unread badge share their column center.
2. [P2, fixed] Too many header/list controls. Small “Поддержка” caption retained; Archive opens from ellipsis. IT-only queue/mine switching is also in that menu. Read-all UI and body scope tabs removed. Chat uses the same frame with title, ticket metadata and ellipsis.
3. [P2, fixed] Header could not blur scrolling content. It now overlays the ScrollView, whose initial content inset follows the measured header height. Date/quote navigation and recording-area offsets account for the overlay. Both list and chat blur above and below content; the bottom CTA/composer sits over the same surface.
4. [P2, fixed] White, grainy and striped Android footer. Give the captured ScrollView its actual theme background; replace eight strip BlurViews with one alpha-masked pass; disable native Dimezis grain specifically for Help. Android Expo blur builds from patched source, because precompiled AARs ignore source modifications. Rebuilt/installed x86_64 DEV APK and visually verified the noise-free result. Other BlurViews retain their default.
5. [P2, fixed] Android placeholder shifted when typing and native input jumped during multiline resize. Font is 18/22; native input keeps a stable internal height and an interruptible 180 ms eased clipping surface grows around it. Placeholder uses matching metrics. Direct logs exposed a transient EditText viewport-size event before real text layout; Android now measures an invisible Text with matching width/font/break strategy, independent from the animated parent. A repeated native four → one → eight → empty run had no intermediate cap pulse. Native measurements: empty/one line outer height 48 dp, four lines 114.29 dp, returning to one/empty restores 48 dp. Eight-line native height is 158.86 dp with the 145 dp input cap and working overflow; reduced-motion behavior is covered by tests. No frame-rate claim is made.

## Fidelity review

- Typography: existing system font and product list/body scale retained; header search 16, chat title 15, caption 13, composer 18/22. Generated-image font rendering is not copied as bitmap typography.
- Spacing/layout: shared margins and axes measured above; independent rounded Back segment with square adjoining corners; menu has no right separator. Initial list and chat content clear the overlay; scrolling content passes under it.
- Colors/tokens: existing dark/light palette retained. Generated mock gradients/noise are not introduced; the user specifically requested transparent blur surfaces.
- Icons/imagery: existing Ionicons retained; fixture chat media and duplicate stress-test rows are local QA content, not production content. DEV overlay was hidden on the emulator for final list/chat captures.
- Copy: requested Russian labels preserved; IT switch is contextual. No “Прочитать все” control appears.
- Interaction: archive/open transitions and IT menu exercised through the same component handlers; unit coverage also checks outside/Android Back dismissal and query retention. Native light/dark scroll captures show continuous blur at both edges without white bands or grain.

## Diagnostics and verification

- `scripts/help-ui-diagnostics.mjs` connects to Metro/Hermes directly. Development snapshots include view bounds, screen/scope/theme, keyboard/composer dimensions and bounded animation events. QA-only actions allow deterministic navigation and local input; normal DEV is read-only, release exposes no bridge. Text, search strings, credentials and command arguments are excluded from logs. Instructions: `qa/help-preview/README.md`.
- After the user's request to stop Computer Use, final verification used only the diagnostic CLI, ADB screenshots/logcat and local image inspection.
- Jest: 102 suites / 899 assertions passed before the final animation follow-up; composer/screen regressions then passed 55 assertions, including the new viewport-event regression. TypeScript and `git diff --check` passed. Native Gradle source build passed; installed DEV app's crash log buffer was empty. Postinstall blur patch reapplication is idempotent.
- Source build APK: `dev-builds/emulator/leader-product-dev-client-x86_64.apk`. Existing ARM64 phone download was preserved. Phones need a rebuilt native DEV client for the new noise flag; Metro/OTA alone cannot deliver native changes.
- Limits: this verifies Android emulator component/layout behavior with QA fixtures, not real authentication/API/push delivery or physical-phone performance. iOS and older Android blur fallback were not runtime-tested. Earlier browser QA remains historical evidence, not a fresh pass for the new overlays.
- No remaining actionable P0/P1/P2 findings in the inspected Android scope. No commit, push, OTA or production deployment performed.

final result: passed (Android emulator UI scope)

---

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


## 2026-10-28 — Android API36 messenger follow-up

This run supersedes the old API35 boot-blocker above for the emulator only.
A rebuilt x86_64 DEV client was installed on emulator-5554. The physical-device
APK and production deployment were not changed.

- Header date is a separate unblurred overlay, 4dp below the capsule; an active
  voice strip adds48dp to the measured header and the date follows it.
- Shared native audio: Play, Pause, resume,1.5x, end/replay and an offscreen source
  message were exercised with a local eight-second WAV. Scope/URL ownership,
  1x/1.5x/2x, cancellation and recording handoff have unit coverage.
- Date navigation202→200 reaches the first message of that local day. Saved
  offset deviation was below0.001dp in the measured fixture.
- Ten-image PNG album: text and tiny previews visible while originals were
  delayed7seconds;10 resolves completed, with the exact same viewport anchor
  before/after decoding (34.74283316475794dp).
- Native composer three-line growth: zero clipped frames, constant12.190476dp
  tail gap; history anchor200 stayed unchanged during multiline paste.
- SQLite restart probe preserved rows, edit, deletion, cursor and viewport after
  force-stop/relaunch. Its isolated negative-ID fixture scope was then cleared.
- Initial blur recording:58 inspected frames, no white header flash. Cached
  native clear color and target readiness are included in the installed APK.
- Fast-scroll blank text reproduced before optimization. Hermes benchmark:
  300 localized date conversions647.23ms vs calendar identity0.097ms. Date
  grouping/comparisons now avoid localization; reusable formatters preserve
  device-local/DST semantics. Stable row/action boundaries eliminate scroll-only
  body work. Two subsequent captured runs contained no blank text samples.
- Final focused APP check:301 tests across29 suites passed; TypeScript passed.
  API checks:33 isolated PostgreSQL/S3/HTTP/WebSocket integration cases and8 unit
  cases passed. Required attachment-preview migration is prepared, not applied
  to the working API database.

Frame timing in the DEV emulator remained noisy/slow under extreme fling stress;
this is not a60fps or physical-phone performance sign-off. Raw native recordings,
Hermes JSON, frame statistics and gfxinfo reports are under the workspace's
`.local-tools/emulator-qa/`, outside the source repository.

### 2026-10-28: timestamp, tail gesture and date navigation follow-up

- Compared Telegram Android `ChatMessageCell.calcBackgroundWidth` and
  `ChatActivity.jumpToDate` / `scrollToMessageId` at commit
  `3de37c8cfb039452be7398909461da6288babf15`. Independent React Native logic;
  an already visible date intentionally remains stationary as requested.
- Rebuilt and installed the x86_64 DEV APK. The physical-device APK is unchanged.
- `help-short-time.png`: the sent fixture `132` shares one row with time/receipt.
- `scroll-tail-small-final.json`: 28 native-scroll events, every offset delta
  negative, follow stayed false; no return to the bottom during the upward drag.
- `chat-latest-final.json`: three repeated Latest operations end at the same
  bottom gap, 12.19 dp, without an inset-sized upward hop.
- `scroll-paging-before/after.json` and `help-paging-fixed.mp4`: older-page merge
  grows the fixture window from 60 to 120 messages while retaining user control.
  Recycled content-height estimates change during prepend, so raw absolute offset
  deltas are not a direct measure of screen movement. No 60fps claim is made.
- `chat-date-final.json`: visible-day and repeated-day offsets are unchanged;
  nearby day moves 590 to 588 with one short scroll; distant day opens message200.
  `help-date-no-highlight.png` records the unselected date target.
- `chat-composer-final.json`: three-line grow/collapse preserves the 12.19 dp
  tail gap with zero clipped native input frames.
- Regression coverage includes lifecycle persistence without trimming, gesture
  versus programmatic momentum, and cancellation of an older date transition.
- Final scoped check: 87 tests across six suites and a fresh TypeScript check
  passed. A concurrent task added
  the photo-picker modules during the broader run; that run had unrelated
  photo-library mock / picker type errors, so it is not an all-workspace pass.
  The later runtime snapshot also timed out while that shared Metro was changing;
  the recordings above describe the completed chat-specific validation window.

## Photo picker follow-up — 2026-10-28

- Scoped fixes: clip neighboring viewer pages during drag-to-close; close the gallery with a downward pull starting at scroll offset zero; enlarge draft photos to 80 dp with overlay remove controls.
- Gallery pull runs on the UI thread and coordinates with the native scroll recognizer. A completed pull releases the panel immediately after slide-out, without a second height-collapse animation. Draft attachments are retained.
- Targeted tests only: nine new gallery-pull cases and one new draft-thumbnail case passed. Other tests were deliberately skipped at the user’s request. Type checking passed for the three changed UI components.
- On emulator-5554, an adb swipe and mid-gesture screenshot confirmed the viewer no longer exposes adjacent full-size pages while shrinking. The viewer closed back to the gallery with all four selected photos retained.
- A second adb swipe from the gallery’s first row moved the whole panel downward, then closed it. Runtime diagnostics retained four selected attachments and showed the normal composer again. The larger thumbnails and upper-right remove controls were visually checked in that final state.
- Evidence is local only under the parent workspace `.local-tools/emulator-qa/`: `photos-dismiss-clipped.png`, `photos-after-dismiss.json`, `gallery-pull-middle.png`, `gallery-pull-after.json`, `photos-drafts-large.png`. No messages or photos were sent during these checks.
