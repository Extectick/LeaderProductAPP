# HTML explanations in Help

Generated HTML is normal assistant-message content, without an application card,
border, padding, background or title row. The model can style its own HTML.
The compact viewport is square, spans the existing assistant text column, and
has no nested scrolling. An application-owned expansion button appears only when
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
fixes the document to its square viewport and hides nested scrollbars. Message
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
menu. The header renders the existing `HelpHeaderFrame` used by Help chat, with
its plain center variant and title “Просмотр”; the existing `HelpMoreCloseButton`
provides a permanent ellipsis. Back, spacing, title and control sizing therefore
have one implementation. Existing chat/search defaults remain unchanged.

The common floating header begins at the top safe area and shares the chat's
80 dp geometry, using `HelpBlurSurface`/`BlurTargetView` instead of a separate
solid header. The full document reserves
the header's initial inset and scrolls beneath it. Standalone HTML exports do
not contain this application header inset. The
preview expansion morph uses the measured square origin, a matching compact
layout crossfade and the full layout. Native-driver animation starts once both
local renderer surfaces have loaded; reduced motion uses the final position.
Link opening uses a bottom-up transition. Close and system back reverse the
presentation. On native, a downward gesture starts in the header or when content
was at the top at touch-start; other scroll gestures stay in the WebView.
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
neutral placeholder remain. Inline previews keep their fixed square geometry.

Image loading, entity actions and downloads share owner, resolver, descriptor
and abort scopes. Account changes/unmount abort late work; a stale image response
cannot render or export under another account. Standalone HTML download includes
the approved raster, with the same inert document policy.
