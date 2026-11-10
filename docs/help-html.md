# HTML explanations in Help

Generated HTML is normal assistant-message content, without an application card,
border, padding, background or title row. The model can style its own HTML.
The compact viewport spans the existing assistant text column and has no
nested scrolling. A fixed root HTML/CSS height (48–1200 px) sets its height;
materials without a supported fixed height retain their previous square shape. An application-owned expansion button appears only when
the stored material also has a full variant. A full-only material appears as a
plain title link. Both variants may use independent layouts.

## Descriptor and links

HTML materials are ordinary private FILE attachments. MIME is
`application/vnd.leaderproduct.help-html+json`; filename is
`<UUID>.help-html.json`. The payload is version 1 with matching `id`, `title`,
`description`, and at least one of `compact`/`full`, each `{html, css}`.
Descriptors are limited to 192 KiB, HTML to 48,000 characters per variant and
CSS to 24,000. Titles are at most 200 characters, descriptions at most 2,000.

Only `leaderproduct://help-html/<UUID>` links matching an attachment of the same
assistant message are actionable. Unknown/malformed references stay ordinary
text. These URLs never go to external Linking. This binding is intentionally
narrow: older materials in other messages must be reattached by the server when
referenced from a new answer.

`loadHelpAttachmentText` uses the existing authenticated Help attachment path,
account identity fences, bounded response checks, token refresh and abortable
requests. Account, resolver, attachment descriptor and component lifetime changes
cancel pending reads, hide old rendered content and close the viewer. Tokens and
attachment URLs never enter the HTML document or WebView source.

“Ссылка” copies a private app route with ticketId, messageId and htmlId. Opening
it first uses normal chat authorization and history navigation, then opens only
the matching attachment of the matching message. The route is consumed once;
closing the viewer does not reopen it. It grants no additional access.

## Renderer and presentation

Native rendering lazily loads the existing react-native-webview module. Only
inline local HTML is rendered. JavaScript, the application message bridge,
storage, shared/third-party cookies and file access are disabled. Navigation
stays within about:blank and its fragment anchors. A restrictive CSP denies
scripts, external resources, fonts, network connections, forms and frames.
The descriptor rejects document control tags and CSS style-element escapes in
addition to the server-side sanitizer.

Web rendering uses an iframe with empty sandbox, inline srcDoc, no referrer,
the same restrictive CSP and zero application border/background. It grants
neither scripts nor same-origin privileges.

The compact surface has an actual outer native View with pointerEvents=none;
setting the prop only on WebView does not disable its own outer wrapper. Only
the expansion control beside that surface accepts touches. Scroll and zoom
controls/indicators are disabled, and enforced CSS after the model stylesheet
fixes the document to its allocated viewport and hides nested scrollbars. Message
geometry does not depend on DOM content measurements.

The renderer memoizes the local source, styles, origin whitelist and callbacks.
Parent scroll/layout/menu renders and equal recreated variant objects do not
commit a new source to Android's loadDataWithBaseURL. HTML rows use one separate
FlashList recycle pool shared between HTML messages, preserving their native
surfaces when ordinary text cells recycle. Pool types are not unique per ID;
the chat's existing native motion/anchor owner is unchanged.

The full viewer leaves Help mounted, including its draft, list position and
native keyboard/motion owner. HTML and linked profile/product/order cards render
the same `HelpViewerLayout`. It owns content capture, floating header and action
menu. List, chat and viewer mount the same `HelpHeaderOverlay`, which owns the
status inset, blur target and bottom feather. The header renders the existing `HelpHeaderFrame` used by Help chat, with
the same themed center surface as the chat, with the material's short title; the existing `HelpMoreCloseButton`
provides a permanent ellipsis. Back, spacing, title and control sizing therefore
have one implementation. Existing chat/search defaults remain unchanged.

The viewer background extends to the screen's top edge. Only the floating
header controls are inset below the status bar; its content reserves that same
safe inset plus the chat's 80 dp geometry, using `HelpBlurSurface`/`BlurTargetView` instead of a separate
solid header. The full document reserves
the header's initial inset and scrolls beneath it. Standalone HTML exports do
not contain this application header inset. The
full viewer always slides upward from the bottom, including expansion of a
compact preview. It uses no origin scaling or second compact renderer. The native
driver starts after the full local document loads; reduced motion uses the final
position. Close and system back reverse the
presentation. On native, a downward gesture starts in the header or when content
was at the top (within 1 dp) at touch-start; other scroll gestures stay in the WebView.
On web, sandbox isolation means only header drag is available; iframe body
scroll/touch state is deliberately not bridged to the app. Escape closes there.

The ellipsis menu contains “Скачать” and “Ссылка”. Download exports the complete
inert full HTML/CSS document as a genuine .html file, not the JSON attachment.
Native sharing uses a uniquely scoped cache directory and removes only that
operation's temporary files; Web uses a Blob download. Clipboard/export actions
validate current account, token identity, viewer lifetime and cancellation before
each disclosure. Errors appear inside the viewer; menu/back/close remain usable.

No new dependency or native module was added. Verify runtime compatibility and
ordinary dev OTA gates before publishing; source validation alone does not prove
on-device rendering or gestures.


## Clickable entity cards

A version 1 descriptor may contain `entity: {url}`, using the exact canonical
entity URL confirmed by a tool. An entity card always has a compact variant.
The whole square is a native press target that opens the existing entity-card
provider; its WebView remains inert and touch-through, so a drag can scroll the
conversation. The optional expansion icon still opens the HTML page. Its common
viewer menu additionally offers “Открыть карточку”. No JavaScript or HTML bridge
is enabled for actions.

HTML can place up to two `<img src="help-entity-image" alt="…">` slots per
variant. The client requests `/entity-links/preview` through the authenticated,
account-pinned transport and accepts only the exact target and a bounded raster
data URL (PNG/JPEG/WebP, at most 256 KiB decoded, matching file signature). The
server rechecks normal profile or personal 1C access. The photo is passed to the
renderer separately from the stored descriptor and substituted locally; neither
tokens nor storage/source URLs enter the HTML. CSP permits data images only when
an approved raster exists and still forbids scripts, remote assets and network.
When no photo is available, image tags are removed and the HTML's initials or
neutral placeholder remain. Inline previews keep their allocated geometry.

Image loading, entity actions and downloads share owner, resolver, descriptor
and abort scopes. Account changes/unmount abort late work; a stale image response
cannot render or export under another account. Standalone HTML download includes
the approved raster, with the same inert document policy.


## Shared viewer material — Metro, 2026-11-05

The title comes from the HTML descriptor or the loaded entity, normalized and
bounded to 44 Unicode characters by helpViewerTitle. Full names remain in the
body. The viewer header explicitly owns blur/activity while a portal is open;
it does not inherit the covered route's focus. Ordinary route blur remains
focus-scoped. Android's HTML Modal uses hardware acceleration, matching the main
window. There is still one HelpHeaderOverlay / HelpBlurSurface / AppEdgeBlur
implementation and one content capture target per viewer. Different page content
can affect the sampled blur; no separate viewer intensity/tint is configured.

These changes are in Metro only; no OTA was requested. Tests and bundle checks
passed. Physical/native visual equivalence is not claimed: Device MCP returned
DEVICE_IN_USE again after the prescribed wait; the other session was untouched.


## HTML-only timeline loading and fixed height — Metro, 2026-11-05

HTML descriptors participate in the same visible/near/deferred/retained priority
calculation as original images. An HTML-only conversation must update the visible
media range; the previous image-only fast-path left its previews permanently
near/deferred and blank (ticket60). Text/voice/ordinary-file conversations retain
the fast path. Visible HTML still waits two cancellable frames; retained copies
do not download or mount WebViews. Normal account/lifetime fences are unchanged.

helpHtmlCompactHeight accepts a single balanced outer element with bounded
inline px height, or a simple matching tag/class/id CSS rule. It respects basic
specificity/important ordering and does not borrow child/sibling heights.
Conditional/responsive-only, dynamic, unknown or out-of-bounds sizing falls back
to the original square; no DOM measurement, JavaScript or message bridge added.
Use a single root div with inline height for generated fixed-height materials.
The descriptor stays {html,css}, preserving old client parser compatibility.

A real Sol/medium tool output with180px root height passed the APP parser and
height helper.135 targeted APP tests,30 API tests, types, Android Metro bundle
and Expo Doctor20/20 passed. Device visual QA unavailable: DEVICE_IN_USE after
the prescribed wait. No OTA/native rebuild; the owner uses Metro.

### Loading placeholders

Help widgets use the shared `LoadingPlaceholder`: neutral gray surfaces and static
rounded skeleton bars in light/dark themes, without timers or per-row animations.
HTML previews reserve their existing compact bounds while fetching; the renderer
keeps an overlay until its current document loads. Stale document callbacks cannot
remove a newer document's placeholder. Short compact cards use a smaller skeleton.
Entity/profile links show the same skeleton while their authorized data loads.

### Reopening compact cards — 2026-11-07

The Help screen owns a volatile HTML presentation cache (32 entries, 4 MiB,
five-minute non-sliding TTL). Its account/API, resolver, ticket, message and
attachment descriptor partitions prevent reuse across identities or replacement
attachments. Unmounting Help or changing the account/resolver clears it. Only
completed validated descriptor/photo loads enter it; aborted or failed requests
do not. Entity opening still uses the protected viewer's authorization path.

A cached row remount reserves the parsed compact height immediately and reuses
its descriptor/photo without another download or renderer loading overlay.
This does not retain a live iframe/WebView: it renders the cached inert document
locally. Unseen offscreen rows still do not fetch or mount a renderer.

On a cold load, a bounded attachment height hint is used if available; otherwise
the unknown-size indicator is 48 px rather than a speculative square. Parsed HTML
sets the real fixed height before the optional entity-photo request completes.
Legacy HTML without a declared fixed height retains its square content viewport
after parsing. No script bridge, remote HTML resources or persistent private
HTML/photo storage is introduced. A full browser reload starts a new cache.
Images retain their reserved bounds until decode, audio retains its seek/caption
layout, and file loading keeps progress, retry and cancellation controls available.


## Ссылки и общий просмотрщик — 2026-11-06

Полные HTML теперь открываются через общий provider с учётом source/account leases. Валидные http/https-ссылки открывают общий просмотрщик сайтов. Единственная веб-ссылка в компактном HTML получает внешний press-target; entity-действие имеет приоритет. В HTML не включаются JS/bridge/сеть. На web ссылки полного HTML представлены кнопками приложения за пределами sandbox. См. [app-viewer.md](app-viewer.md).


## Списки карточек и фото — 2026-11-07

До12 материалов в одном ответе, общий бюджет384КиБ; сервер поддерживает batch items и проверяет каждый entity отдельно. Исторические ключи изображений в настроенном bucket читаются только из точной директории товара с повторной проверкой прав. Нет OTA/native изменения. См. API docs/help-html-card-lists.md и материалы Nextcloud «Карточки ИИ — 2026-11-07».
