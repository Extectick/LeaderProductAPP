# Admin — application integration, 2026-11-03

The accepted design is now the actual `admin` route. UI lives in `src/features/admin/redesign`; the isolated preview exports those same components and injects FixtureAdminProvider. Application data comes only from LiveAdminProvider and the existing authenticated API; no fixtures/example releases are imported into the main entry. The legacy outer admin header is disabled before rendering the route. Common Help scene motion and transparent header/blur remain shared.

User profile editing loads full details first, includes channel IDs, 1C mapping, optional email, phone/middle name and existing profile statuses. Save/moderate/reset use actual endpoints, serialized actions and visible errors. Role permissions are loaded from the API. Service metadata edits do not rewrite access; changes to role/department grants retain existing denies, individual and department-role exceptions. Knowledge and release history load on demand. APK/OTA grouping uses platform/channel/runtime; Git changes use actual published commit SHAs with ancestry and exclude merge subjects. Preview OTA examples cannot enter application history.

Evidence: `67-app-shared-directory-native.png`, `68-app-shared-profile-native.png`, presentation copy `69-app-profile-preview.png`. Browser opened the same source components through fixture injection and showed the complete profile including newly retained middle-name/phone fields. Native opened the shared directory and loaded the user card. The first native observation preceded the JS bundle finishing and was empty; the next observation was stable, with no render error. Pixel geometry remains the accepted grid; native screenshots are unscaled 1080x2400.

Validation: complete application TypeScript program has zero diagnostics; 22 focused model/provider/navigation tests passed. Read-only live dev API inspection confirmed users, roles, departments, permissions, services, APK and OTA endpoints return HTTP 200. `/knowledge/documents` returns 404 on this dev deployment; the UI reports that the knowledge source is not connected and offers retry. No real user password, permissions, orders or documents were modified by verification. Browser/native UI validation uses synthetic data; API integration contracts are separately covered by provider tests and live read-only requests. Main Metro on 8081 could not be started because automatic command approval rejected that action; no claim of an authenticated main-app end-to-end test is made. Dev publication is tracked separately by CI/release evidence.

final result: passed (UI/integration scope; knowledge backend unavailable)

---

# Admin — shared scene navigation and transparent card headers, 2026-11-03

Scope: the user's requested Help-style section transitions, followed by removing the opaque user-card header and applying the same header style to all admin cards. Reference behavior is the existing Help chat entry source; visual references are the accepted directory (`20-directory-final-native.png`) and previous user card (`16-user-card-native.png`).

One motion implementation now lives in `components/Navigation/AppSceneTransition.tsx`. HelpChatEntry adapts it; HelpScreen and the admin directory share its underlay hook. The six admin section screens include their headers in the translated scene. The directory remains mounted underneath, preserving search and scroll state; it cannot accept input while covered. Exit awaits completion before unmounting. Existing 240/220 ms timing, cubic-out curve, reduced-motion behavior and double-dismiss protection are preserved.

One `qa/admin-preview/AdminSceneHeader.tsx` now provides the transparent absolute header, caption, toolbar grid and actual shared AppEdgeBlur for directory, section lists and editors. The user card now uses DesignEditor, matching department, role, service, document, 1C selection and password forms. Its ScrollView occupies the whole screen with a top content inset; content can pass behind the header's blur. Each retained scene/editor has its own blur provider/target. There is no opaque header wrapper.

Evidence: native 58/59 show section and return, `60-section-motion-native.mp4` records both directions, and `61-motion-contact-sheet.png` samples entry frames. Native captures 62/63 show the user card before/after scrolling, 64 shows the department card. `66-header-comparison.png` opens accepted directory/old card/new card/scrolled card/department together, using identical native scale and top crops (1080px source -> 270px columns); `65-user-header-preview.png` is a presentation crop. The scrolled capture visibly shows blurred content behind the caption and toolbar. No text/controls shift vertically between header variants; 48dp controls and shared 8/16dp grid remain intact.

Validation: isolated admin TypeScript program reports 0 diagnostics. 68 focused tests pass across HelpScreen, HelpChatEntry and helpNavigationMotion; the latter's obsolete RN Animated/150ms expectations were updated to the existing Reanimated completion contract. Browser verified section open/back with the directory query retained, no console errors, and the user header's computed transparent background, absolute positioning, blur(10px) and shared gradient mask. Android verified section opening, double Back returning to the directory, scrolled user-card blur, department card and normal return. Browser also opened the role bottom sheet from the refactored user card. Screen recording is visual transition evidence, not a frame-time performance benchmark. No unrelated product tests or releases performed.

Resolved P1: user profile used a separate in-flow static header, preventing content from passing under a blur. Resolved P2: section navigation replaced the page instantly rather than reusing Help's transition. No actionable P0/P1/P2 visual mismatches remain in this scope. Actual admin app routes are not yet replaced by the QA redesign; shared Help motion extraction is in application source.

final result: passed

---

# Admin — read-only release history, 2026-11-03

Source: accepted shared admin style and `docs/design/admin-redesign/screenshots/36-updates-native.png`. Latest instruction replaces release editing with a version/date list, nested collapsible OTA history and Git comments. This content/interaction override supersedes the earlier update cards.

Implemented in `qa/admin-preview/AdminUpdatesPreview.tsx`: collapsed APK rows -> nested OTA rows -> original Git comments; separate fold for APK changes. Both levels expose expanded state. Search matches versions and commit text. Removed update creation from the section menu and removed the release editor/upload/publication flow from this preview.

Evidence: browser captures `49-release-history-list-web.png`, `50-release-history-ota-web.png`, `51-release-history-comments-web.png`; native captures 52/53/54 with corresponding names. Native pixels 1080 × 2400, density 2.625, width 411.43 dp. Comparison source and new states cropped only at system chrome y=63..2337 and downsampled proportionally to 390 × 821. Full comparison input opened: `56-release-history-comparison.png`; focused header input opened: `57-release-history-header-comparison.png`. Presentation copy: `55-release-history-preview.png`.

Fidelity: same platform type hierarchy, 48 dp toolbar, 50 dp row circles, text/chevron columns, Help colors and edge blur. Nested content aligns to the main text column, with smaller standard Ionicons for OTA/Git. Copy now shows versions and dated history rather than draft/rollout management. Long original Git subjects wrap without clipping in the opened Android view. Debug gear is native development chrome. No custom image assets are needed.

Resolved [P1]: update management UI contradicted the requested history-only flow. The before/after comparison shows only version/date rows initially, and nested history after expansion. No actionable P0/P1/P2 visual mismatches remain for this scope.

Data provenance: 2 APK versions from actual local build metadata; 53 original non-merge Git subjects from bounded commit ranges. Metadata has build dates, so they are labeled “Собрано”, not publication dates. OTA examples are explicitly marked “Пример”; their dates are labeled “Изменения от”. An actual OTA publication ledger is not connected, and the examples are not asserted to be factual releases. All dates render in Asia/Novosibirsk.

Validation: isolated preview TypeScript program returned 0 diagnostics. Browser opened both hierarchy levels and searched an actual Git fix (`composer resizing`), with no console errors. Android opened the version and OTA, rendered comments, then collapsed the version and removed nested OTA rows from its accessibility tree. No unrelated tests rerun. Real publication, API data and production are unchanged.

final result: passed

---

# Admin — remaining sections, integrations and shared HelpSheet, 2026-11-03

## Comparison targets and scope

- Visual truth: selected `docs/design/admin-redesign/concepts/02.png` plus the already accepted users list/card, captured in `screenshots/24-users-preview.png` and `16-user-card-native.png` under the same admin-redesign directory. This is an extension of that selected system, not an independently approved pixel mock for every new form.
- Latest overrides: extend the design to departments, roles, services, knowledge and updates; add original 1C user/physical-person mapping with easier search; display Telegram/MAX user IDs and 1C full name; add a convenient app-password reset form; replace every bottom selector/menu/confirmation with the actual Help bottom sheet.
- Source contracts inspected: `UsersEditorModal.tsx`, `useUsersActions.ts`, `onecLpAppService.ts`, `userService.ts`. Original 1C selection automatically fills an empty physical-person binding; app password minimum is 6 characters. Preview retains these contracts and separates password reset from general profile saving.
- Primary implementation: `qa/admin-preview`, browser `http://127.0.0.1:8110/?theme=light`, separate installed Android package `com.leaderproduct.admin.dev`.

## Rendered comparison evidence

- Native raw captures `36-{departments,roles,services,knowledge,updates}-native.png` and `37-*-card-native.png`: 1080 × 2400, density 2.625, 411.43 dp screen width. For composition boards, crop only system chrome at y=63..2337 and downsample proportionally to 390 × 821. No aspect stretching. Accepted user-reference and new native screens therefore use equal viewport/density normalization.
- Source and implementation opened in the same comparison inputs: `44-admin-lists-comparison.png`, `45-admin-content-comparison.png`, `46-admin-cards-comparison.png`, `47-admin-content-cards.png`. Boards compare toolbar geometry, row axes, type hierarchy, circles and grouped forms across sections.
- Focused integration evidence: browser captures `38-onec-search-web.png`, `40-user-links-web.png`; IDs are explicitly synthetic fixture values. The first reset capture `39-password-reset-web.png` was taken during opening transition and is retained only as intermediate evidence, not as a stable full-screen geometry comparison.
- Shared bottom-sheet evidence: browser `41-shared-help-sheet-web.png`, Android `42-help-role-sheet-native.png` and `43-help-sheet-dismissed-native.png`. Actual `resource-id=help-sheet-surface` observed at `[0,1518][1080,2400]`. A downward drag dismissed it; the native tree subsequently had no such surface. `48-help-sheet-preview.png` is the proportionally resized presentation copy.
- Browser screenshots retain the previously documented Windows/IAB density resampling; native captures establish crisp type and actual geometry. No duplicate device chrome is drawn in the app.

## Findings, fixes and iterations

1. [P1, fixed] Five sections still used the legacy interfaces. Replaced QA section views with flat lists and grouped cards, a shared search toolbar and menu-only filters/create actions. Post-fix boards 44–47 show matching horizontal axes and typography.
2. [P2, fixed] Service role/department switches all appeared off while access was open to everyone. Added explicit “Ограничить доступ”; choices appear only when restricting. Empty restricted selection is rejected. Availability changes update the corresponding local list entry.
3. [P2, fixed] Validation feedback could fall below the visible part of long forms. Shared editor displays an immediately visible error above the bottom inset. Browser verified invalid rollout 101 -> visible error, then 25 -> saved draft. Permission-count grammar was corrected.
4. [P1, fixed] Initial Fast Refresh retained user drafts without the newly added channel-account shape, causing a null-property render error. Added a guarded fallback to the current fixture record. Reloaded the verification tab; then opened profiles, searched 1C, selected a user, observed auto-filled physical person and saved without recurrence. The console retains the resolved earlier error; no new matching errors occurred during subsequent verification.
5. [P2, fixed by latest request] Handcrafted fade modals differed from the Help interaction. Every bottom menu/filter/selector/confirmation now routes through `DesignSheet` -> the existing `HelpSheet`; no copy of its animation or gesture implementation was created. Native capture 42 and actual swipe dismissal verify the post-fix state. Full-screen editors remain full-screen.

## Required fidelity surfaces

- Typography: platform system family, 12/18 captions, 16/22 semibold list titles, 14/20 secondary text, 22/28 card titles; full 1C names wrap, messenger IDs remain selectable. Standard count inflections corrected.
- Spacing/layout: shared 48 dp header circles, 8 dp gaps, 16 dp outer inset; 50 dp row icons, 76 dp card icons, flat rows without separators. Content scrolls beneath the common edge blur. Native comparison boards show no clipping or horizontal overflow in captured states.
- Colors/tokens: `useHelpTheme`, shared toolbar and blur tokens used throughout. Switch thumbs explicitly white with blue active tracks; older card captures predate that final thumb adjustment, with post-fix native user-switch evidence visible behind sheet 42. Sheet material/radius/handle/backdrop come directly from `HelpSheet`.
- Images/assets: all visible symbols use existing Ionicons/MaterialCommunityIcons; no custom raster assets or hand-drawn substitutes. Debug Tools gear remains development-only chrome.
- Copy/content: section labels and user overrides retained. Knowledge preview stays read-only, with documents, drafts and archive; no live document publishing workflow is revived. Release versions, 1C directory people and channel IDs are local example records.

## Focused validation

- Browser: department creation; role-parent selection with inherited permissions disabled; save service availability; read a knowledge document and filter AI drafts; validate/update a release draft; search 1C by partial surname, select matching full name, auto-fill physical person; view Telegram/MAX IDs; validate empty reset password, enter a fictional matching pair and open the confirmation, then cancel without changing a credential.
- Android: opened all five new lists and their cards, recorded in `native-section-check.json`; opened the shared role sheet, dragged it down and verified dismissal. Existing APK received all changes through Fast Refresh.
- TypeScript: isolated admin-preview program and its imported dependencies returned 0 diagnostics after the latest shared-sheet changes. No unrelated historical test suites were rerun.
- This is design-preview acceptance. Password reset stores only local metadata, never the entered password; account resets, real 1C/Telegram/MAX requests, file upload and release publication do not run against a server.

## Follow-up polish / boundaries

Physical-device keyboard behavior, large production directories and exhaustive screen-reader traversal are not covered. Android system chrome and the debug gear are intentionally retained. UI state and fixtures reset on a full reload. Main APP admin routes and production are unchanged.

final result: passed

---

# Admin — selected directory and users prototype, 2026-11-03

## Scope and visual evidence

- Source visual truth: `docs/design/admin-redesign/concepts/02.png`, 852 × 1846, identical selected composition to the user's attachment `codex-clipboard-7aeabdd8-7f84-4600-b8d8-2809e0685c45.png`.
- Subsequent user instructions extend that style to users and cards, remove the inline status/count panel, move it into filters, and place pending users first. These override the earlier users screenshot; no separate approved card mock was supplied.
- Browser: `http://127.0.0.1:8110/?theme=light`. Measured CSS viewport 390 × 844, devicePixelRatio 1.4, Windows viewport override 546 × 1182. Raw IAB captures are 390 × 844 with the browser's scaled page in their upper-left 279 × 603 region; preserved originals and normalized copies are distinct. This capture resampling softens glyphs and does not establish exact font raster parity.
- Full-view source/implementation comparison opened together: `docs/design/admin-redesign/screenshots/22-directory-final-comparison.png`. Source downsampled proportionally to 390 × 844; implementation's rendered region normalized to that size. Focused header comparison: `23-directory-header-detail.png`.
- Native evidence: `20-directory-final-native.png`, `19-users-final-native.png`, `16-user-card-native.png`, 1080 × 2400, density 2.625, emulator-5554 / com.leaderproduct.admin.dev. Native screenshots verify crisp type, controls and actual rendering independently of IAB capture scaling. `24-users-preview.png` and `25-user-card-preview.png` crop only Android system chrome and resize proportionally (390 × 821); they are presentation copies, not 1:1 reference comparisons.

## Findings and comparison history

1. [P1, fixed] Legacy purple tabs/cards remained after the directory design selection. Replaced the QA landing page with the selected flat section directory, Help palette, 48 dp toolbar actions, 8 dp toolbar gaps and 16 dp header inset. The actual APP admin entry is unchanged.
2. [P2, fixed] The first comparison showed icon variants and the trailing chevron column drifting from the shared header grid. Reused closer Ionicons/MaterialCommunityIcons and moved the trailing column onto the toolbar action axis. Post-fix evidence: comparisons 22/23 and native capture 20.
3. [P1, fixed] Users still opened the legacy list/editor. Added the flat users list and grouped profile/editor to the isolated fixture app. Search, filtering, editing, department/role pickers and moderation remain interactive. Pending first ordering is stable; other users retain their order.
4. [P2, fixed] Inline status tabs and employee count were unwanted. Removed the list header entirely; moved status choices and counts to the filter sheet. Browser snapshot and native capture 19 show pending Кузнецова Анна first, with no inline filter panel. Filter-sheet evidence: `21-users-filters-final-web.png`.
5. [P2, fixed] Closing a nested picker could briefly render fallback rejection copy. Picker/confirmation modals now mount only for their actual state; choosing IT then saving returned to the list with the updated department. Pending text contrast increased for both theme palettes. The pending callout can grow for wrapped text instead of clipping at fixed height.

## Required fidelity surfaces

- Typography: platform system type; caption 12/18, section labels 17/22 bold, secondary text 14/20, users 16/22 semibold. Native rendering inspected for wrapping, glyph clipping and hierarchy. Generated mock antialiasing and browser capture blur are not copied into the UI.
- Spacing/layout: shared Help toolbar geometry; flat full-width press/hover rows, 50 dp section/user circles, aligned text columns, scroll-under-header list and shared edge blur. Cards group editable fields and review actions. Device chrome is native and retained.
- Colors/tokens: actual `useHelpTheme`, `APP_TOOLBAR_LAYOUT`, `AppEdgeBlur` and ScreenBlurTarget; no screenshot background or custom gradient approximation. Light reference hierarchy preserved; solid shared background intentionally replaces the generated mock's subtle texture.
- Images/icons: supplied design contains standard icons and initial avatars, no custom raster artwork to synthesize. Real Ionicons/MaterialCommunityIcons used; avatar colors deterministic between list and profile. Minor standard glyph shape differences are P3.
- Copy/content: directory labels match the chosen mock. Users are explicitly local fixture identities; status, department and count reflect fixture state. Latest instruction removes status controls/count from the list and retains them only in filters.

## Primary interactions checked

Browser: open users; search Кузнецова (one result); open profile; choose IT; save and observe changed row; reopen and confirm pending profile (count 1 -> 0 and updated status); clear search; filter Склад (3 results); reload disposable fixture; verify pending user first; open filter sheet and verify moved status/count. Browser error log contained no errors. Android: open updated directory/users/profile without reinstall; verify pending first and absence of inline status panel using the native accessibility tree. Four edited TSX files passed syntax transpilation; no unrelated historical test suites rerun.

## Boundaries and follow-up polish

This passes the requested design-preview scope. Live authorization, server CRUD, notification delivery and exhaustive role management are not tested by this fixture. Other admin sections retain existing forms. Physical-device accessibility/font scaling and platform-specific keyboard feel remain follow-up checks. Debug Tools floating gear belongs to the dev client and is visible only in native development captures.

final result: passed

---

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


---

# Services home brand header — 2026-11-01

## Source and scope

- Brand reference: `C:/Users/extec/AppData/Local/Temp/codex-clipboard-559c1f9b-501f-485b-99c8-033743af3e32.png` (309x71).
- Alignment reference: `C:/Users/extec/AppData/Local/Temp/codex-clipboard-fe9e976d-a098-4806-9c6f-7628a4a7226d.png` (576x201).
- Final user instructions: brand belongs ONLY on the main services catalogue; one row with company symbol left, name/tagline in the middle, circular account avatar right; all control positions match the Help list toolbar. Exact tagline: `мы всегда в рынке`.
- Source image contains the previous two-row arrangement; that arrangement and its earlier tagline are superseded by these instructions. This is an adaptation of the brand reference, not a full-screen clone.

## Captures and normalization

Evidence folder: `D:/LeaderProductProjects/LeaderProductMobileAPP/.local-tools/emulator-qa/services-brand/`.

- `home-full-final.png`: browser screenshot, 520x846 pixels.
- `home-final.png`: unchanged rendered pixels cropped to the app content (389x744), excluding the QA control panel.
- `help-final.png`: unchanged Help list after the correction.
- `home-light-320.png`, `home-dark-320.png`: compact layout checks.
- `design-comparison.png`: single comparison board containing the source brand, the user positioning reference, the final main header, and the Help toolbar. Full context and readable header detail are both present.
- Requested app width: 390 CSS px (observed content width 388.57 due to the fixture frame). No simulated device bezel/status bar was added. The provided alignment reference uses a larger raster scale and is normalized on the comparison board; geometry is verified directly from DOM bounds as well.

## Findings and iterations

1. Earlier version put the company lockup in the Help list. User corrected the target. Removed all identity/viewer changes from HelpScreen, HelpListHeader, useHelpService and the service data fixture. Help keeps its original toolbar.
2. Earlier version used system text for the wordmark, smaller symbol and a separate row. Replaced the name with a transparent wordmark image prepared from the supplied reference, retained the existing company symbol, and moved branding into the 48px shared toolbar grid on the services screen.
3. QA found the fixture avatar initials too dark in dark mode. Updated their theme color and captured the revised state.
4. The refreshed upstream Help screen calls `router.dismissTo`; the old local fixture lacked it. Added that fixture alias, then verified home -> Help -> home through the UI.

## Required fidelity surfaces

- **Fonts/typography:** company name is rendered as a brand image, not a system-font approximation. Tagline uses the exact latest user copy, 12px/16px. Narrow 320px state shows the full name and tagline without horizontal overflow. The source is a small raster and is not treated as a supplied vector master.
- **Spacing/layout:** shared constants define inset16, action48, gap8, top4 and bottom16. At 390px the home logo and profile avatar bounds are x82.0647 and x390.6585, y106.1049, 47.9911 square. Help Back/menu have exactly the same bounds: measured difference 0px on both axes. Header content height is 68px before safe-area insets.
- **Colors/tokens:** company green and orange are retained instead of the earlier dark green/brown system heading. The same brand asset is used in both themes; the account action respects theme colors. Existing shared AppHeader edge blur remains in use.
- **Image quality:** the existing transparent company symbol is enlarged to a 48px slot. The transparent wordmark is bundled locally, remains sharp at the displayed size, and introduces no white rectangle in dark mode. The actual account avatar continues to use the existing memory/disk image cache in ServicesLayout.
- **Copy/content:** `Лидер Продукт` and `мы всегда в рынке`; no company identity added to Help or chat headers.

## Validation and boundaries

- Browser: 320/390 light, 320 dark; home -> Help -> home; original Help header preserved; final main menu left open.
- Browser console: no new error entries after the final navigation checkpoint. Earlier live-edit errors (asset copy timing and missing fixture dismissTo) were resolved before final navigation.
- TypeScript: passed. Targeted existing services/access, header ownership and Help screen checks: 3 suites / 63 tests passed.
- The profile action retains the existing application route `/profile`; actual authenticated profile data/network are outside this fixture. No native APK rebuild is required for this JS/UI change, and no release was triggered during the design review.

## Implementation checklist

- [x] Brand only on main catalogue.
- [x] Larger real company symbol and wordmark image.
- [x] Correct tagline.
- [x] Same navigation axes and 48px circles as Help.
- [x] Existing avatar cache and profile route preserved.
- [x] Shared blur and flat service rows preserved.
- [x] Light/dark compact checks and final visual comparison.

final result: passed


---

# Confirmed shared catalogue grid — 2026-11-01

## Source and user decision

- Selected revised concept: `C:/Users/extec/.codex/generated_images/01a17c17-500e-7761-9fad-324a50cb140f/exec-ea9de6d6-3d27-408a-a9de-495973cda647.png`.
- Annotated source: `C:/Users/extec/AppData/Local/Temp/codex-clipboard-797376ca-cefa-4a02-ad2c-355ca274883e.png`.
- User explicitly confirmed: align BOTH the icons and the text. Preserve 48px header navigation positions and use the same left column in catalogue rows. The generated image is a composition reference; confirmed 48px control geometry governs implementation rather than inferred raster dimensions.

## Evidence

Folder: `D:/LeaderProductProjects/LeaderProductMobileAPP/.local-tools/emulator-qa/services-brand-grid/`.

- `comparison.png`: source and rendered implementation in the same visual comparison board, including dark/compact state.
- `final-full.png`: full 520x846 browser capture; `final.png`: app-only crop389x744.
- `light-320-full.png`, `dark-320-full.png`, `help-header-preserved.png`, `geometry-390.json`.
- App width390 CSS px; observed inner content388.57px with the fixture frame. Pixel capture is at browser screenshot density; source is scaled only for the comparison board. UI bounds, not differently scaled rasters, establish exact axes.

## Findings, fixes, final fidelity pass

- [fixed] Service rows used24px inset,56px icon backgrounds and16px gap, whereas the header used16/48/8. Services now read the shared toolbar values. Both text blocks begin at72px relative to the app surface.
- [fixed] Trailing chevron lacked a fixed action column. It now occupies a48px slot aligned below the avatar.
- [fixed] A measured numeric row width introduced0.424px drift on the right edge in the browser. Rows now fill their parent's width directly; final icon-left, icon-width, text-left and trailing-left deltas are all exactly0px.
- **Typography:** wordmark reduced from240px maximum width /26px frame to164px /20px. Tagline reduced to11px/14px; exact copy remains `мы всегда в рынке`. Catalogue body type remains16px/22px and13px/19px.
- **Layout:**48x48 leading slots,8px gaps,16px margins. Full-width hover/press remains; no separators or visible row cards introduced. Loading placeholders follow the same icon and text columns.
- **Colors:** existing company green/orange, theme colors and icon accent colors preserved.
- **Assets:** existing local logo and transparent wordmark retained; no new generated asset needed for this implementation pass.
- **Content:** company identity remains on the main catalogue only; the Help toolbar retains Back/search/menu.

## Verification

- Browser:390 light;320 light/dark; home -> Help -> home; final catalogue left open. No new console errors after the verification checkpoint.
- Measured final leading slots x82.0647,width47.9911; text x138.0469; trailing slots x390.6585,width47.9911, identical between header and rows.
- Existing targeted service/access and header-ownership checks:2 suites /16 tests passed. TypeScript passed for the grid update.
- Existing application profile route/cache retained. No authenticated network or native APK release was exercised for this styling change.

final result: passed


---

# Client Orders web redesign QA — 2026-11-07

Final result: passed for the local redesigned UI and scoped regression checks.

Reference: approved layout in `.dev-runtime/orders-web-redesign-20261107/concept.html`, current Help tokens/shared toolbar and the existing order business workflow. This is an adaptation of the approved schematic, not a pixel-identical image clone. The authenticated original production page was not available; no before/after task-speed improvement is claimed.

Actual ClientOrdersWebScreen was opened through `qa/orders-preview` with isolated synthetic state and no real API calls. Browser checks covered1280/1366/1440/1920, navigation72/216, narrow768/390, light/dark, readOnly/error/offline, requisites/calendar/menu, keyboard customer selection,12-product batch, invalid quantity focus and empty search. Root inspected final light and dark screenshots. Product photos in QA deliberately use a local demo icon; real image loading was not verified against business data.

Fixed P1/P2 findings: resize replaced numeric input nodes; quantity increment dropped integer zeroes; dark icons were black; product transfer scrolled an obsolete parent; list empty/loading/refresh states were missing. Rechecked focus/caret preservation,9→10, batch destination scroll, dark icons, empty results and refresh.

No outstanding P0/P1/P2 defect in checked flows. Practical boundaries: very narrow web uses horizontal table scrolling and truncates the document title; the native layout is unchanged. Error quick filter covers loaded orders, explicitly labeled. Current order URL is replaced without an extra history entry per click. No real business export, production account access, native-device visual QA or complete console audit is asserted.

Evidence: `.dev-runtime/orders-web-redesign-20261107/browser-proof.json`, `qa/orders-preview/dark-qa.json`, `docs/client-orders-web.md`. Own browser QA tab is closed at handoff; normal Metro8081 remains available.


---

# Client Orders WEB fast creation follow-up — 2026-11-07

Final result: passed for the client-first UI on the isolated fixture. Supersedes the preceding permanent master/detail layout after owner feedback.

The document now occupies the workspace. Client/organization/date are visible; defaults load through the existing workspace; advanced conditions are collapsed. Inline search → quantity → Enter adds a product without opening a drawer and returns focus to search. Repeated products increment the existing line. History is a separate view with Continue order; both panes retain the same workspace. Submit is beside the total and retains confirmation/validation.

Browser evidence: actual production component with synthetic state. Root checked New → focused client → keyboard selection → defaults → focused product search → quantity12 → Enter → repeat13 → second product1, history return preserving both lines, submit confirmation/cancel with zero export actions, and stable quantity DOM/focus1280→1440. Independent review checked dark1440/readOnly, missing contract/address focusing Contract on submit, delayed800ms defaults, mutation locks, compact768 layout and cached image loading. No page overflow at768; table uses internal horizontal scrolling; total/submit remain visible.

Fixed review findings: shipping date/advanced fields were mutable during an operation; now they share editingLocked. Cached product onLoad was followed by an effect resetting loaded=false; image load state now belongs to its keyed source and no spinner remains after successful load. Both fixes were rechecked in the browser.

152 tests/9 suites,3 network-boundary tests, TypeScript, Expo Doctor20/20; full main Metro web/Android bundles. No live API/1C send, native-device UI verification or task-speed metric claimed. Out-of-order search response fences are exercised by unit tests; the browser slow-default case does not simulate a reordered product backend response. Photos use demo assets. Existing shared headers/theme and native screen are preserved.

Evidence: .dev-runtime/orders-fast-web-20261107/browser-proof.json, review-proof.json and final-proof.json; qa/orders-preview/fast-flow-review-qa.json. Own root/reviewer browser tabs closed. Main Metro8081 remains PID34140. No OTA/API release.
