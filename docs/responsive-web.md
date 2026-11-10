# Responsive Home and Help

The web app shares the mobile catalog, Help components, `appSurfaceTokens` and
`AppScreenBlur`. There is no separate desktop dashboard. `/home` redirects to
`/services`; explicit web Home navigation does not restore the last service.
Native startup still restores it.

## Layout

`src/shared/layout/appLayout.ts` owns the shared breakpoints and widths:

| Window width | Navigation | Help |
| --- | --- | --- |
| up to 767 px | Mobile, without sidebar | List or chat |
| 768–1099 px | 72 px navigation rail | Chat with a toggleable list drawer |
| from 1100 px | 72 px rail, expandable to 216 px | 320 px list beside chat when the available workspace is at least 960 px |

Chat content is capped at 800 px. Home uses one column on narrow surfaces and
two columns when its measured content is at least 900 px, capped at 1120 px.
The router outlet, providers, composer and timeline keep their identities across
resize. Changing width must not open a ticket again or replace the input.

The hidden list has `visibility: hidden` on web so its controls leave the tab
order. While the medium-width drawer covers the chat, that pane is inert;
Escape or the backdrop dismisses the drawer. Focus indicators are shared by all
web controls. Mobile web uses VisualViewport overlap for keyboard avoidance,
excluding pinch zoom and avoiding a second inset when the layout already shrank.

## Chat navigation and input

`helpWebNavigation.ts` owns ticket/list/new-draft URLs. Ticket selection updates
browser history; Back/Forward restores selection, and text drafts stay local.
Router-owned history state and unrelated query parameters are preserved. No
message text, credentials or file contents enter URLs. Leaving Help flushes the
current draft through the existing service.

On a fine-pointer browser, Enter sends and Shift+Enter inserts a newline. The
attachment menu can change this to Ctrl/Command+Enter; the setting is local to
that browser. On a coarse-pointer device Enter remains a newline. Composition
events, IME key code 229 and held-key repeats do not send accidentally.

Pasted and dropped files use the normal attachment/send path (10 attachments,
20 MiB per file). Drop handling is scoped to the composer. Blob URLs have explicit
ownership through the composer and in-flight send; revoked previews are recreated
from retained Files when returning to a linked-chat draft. Browser Files survive
resize and in-session draft changes, but are not durably stored across reload.
Text drafts continue to use the existing durable service storage.

## HTML and linked cards

Both viewers use `helpWebViewerFrame` and the shared `HelpViewerLayout` header.
At desktop/tablet widths they open in a right panel up to 720 px wide, with an
expand/collapse action. Compact screens use the entire viewport. Resizing or
expanding does not recreate the content. Desktop mouse drags select/scroll;
compact touch retains pull-to-close where the content delivers the gesture.
HTML stays sandboxed. Escape closes the action menu first, then the viewer when
focus is in the host; keyboard events inside a sandboxed iframe do not bubble
to its parent.

This is a reusable web UI foundation for a future Windows wrapper. It does not
add a Windows installer, native Windows integration or a PWA installation flow.

## Shared desktop controls

`WebSidebar` reads the same permitted services, icon names and accent colors as
Home. Collapsed controls expose their names on hover and keyboard focus. Only
the selected/hovered row has a surface; service icons have no extra tile behind
them. `appWebInteraction` and `WebInteractionStyles` own mouse, keyboard and
pressed feedback, reduced-motion handling and the system font fallback. Native
input containers retain their styling; browser inputs do not add an inner
rectangular focus outline. All web controls use the same outline-free feedback;
keyboard focus remains visible through surface/text colors. Decorative AI and
company SVGs omit `focusable` because RN-web converts `false` into a clickable
`tabindex=-1`; they use `aria-hidden` and `pointerEvents=none` instead.

At web widths of 768 px and above, `AppDesktopDialog` presents Help sheets,
expanded editing and generic action dialogs in a bounded centered window.
Long content scrolls inside the window. RN-web Modal owns focus trapping,
return focus and topmost Escape; the dismiss backdrop is not a tab stop.
Compact web/native retain the existing sheet presentation. IT transfer still
requires its explicit confirmation; opening or cancelling a dialog does not
transfer a ticket. `HelpContinueAi` has an opaque 48 px capsule and keeps that
surface while disabled/loading.

Ticket right-click and Shift+F10 use a pointer/row-anchored dropdown clamped to
the viewport. The Help list scroll viewport fills the entire scene behind both
floating blurred panels. Content padding reserves the measured header and dock
at the scroll endpoints; the initial header estimate includes the desktop title.
Only the web scrollbar track starts below the header and ends above the dock.
It is a separate accessible layer above the common feathered blur, driven by
the actual list's scroll offset and content size. Never inset/clip the list
viewport to match this track: that removes content from behind the blur. Keep
the underlying web indicator hidden so there is only one scrollbar. Native
retains its platform indicator.

HTML preview documents and host iframes receive the same explicit application
color scheme. This prevents the browser's dark canvas from showing through
transparent rounded corners; sandbox/CSP restrictions remain unchanged.

Browser voice recording uses a compact composer row with the shared waveform,
timer, cancel/stop and preview/send controls. A mouse click starts a locked
recording; touch keeps hold/lock gestures. Stopping finalizes the recording into
an owned File draft; retry preserves it. Native recorder behavior is separate.

## Verification

Focused unit tests cover responsive shell identity, permissions, catalog,
Help state preservation, navigation motion, URL selection, keyboard overlap,
composer/attachments and viewer layout. Browser fixtures import actual production
components while substituting service data/routing: see `qa/help-preview/README.md`.
They verify layout and local interaction, not authenticated API/socket delivery
or a physical phone keyboard. Changes require normal web/Android bundle checks;
these JS-only changes do not themselves require a new native module.

2026-11-06 parity follow-up: 655 distinct tests across 30 suites, TypeScript,
Expo dependency check, Doctor 20/20 and web/Android exports passed. Browser
checks covered 390/1440 px, HTML corners in both themes, the real Metro login
input, Continue-AI, header/scrollbar, pointer menus, dialogs and editor focus.
Tracking/password-reset actions used mocks only. Android visual QA could not
start because Device MCP returned DEVICE_IN_USE again after its wait; no other
session was reused or closed. Evidence is private under
`.dev-runtime/web-parity-20261106/final-proof.json` in the workspace root.

Follow-up correction: the scroll viewport must fill the scene, with only its
content padding and scrollbar track reserving panel space. The previous inset
viewport prevented rows from appearing under either blur. Verified actual row
overlap with both panels at intermediate scroll positions on 1280/390 px web,
Home/End, last-row access and a fully contained thumb. Page steps/thumb ratio
use the unobscured track height while seeking the full underlying scroll range.
119 focused tests, TypeScript and Doctor 20/20 passed; evidence:
`.dev-runtime/help-list-underlay-proof.json`.
