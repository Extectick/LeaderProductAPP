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

The full viewer leaves Help mounted, including its draft, list position and
native keyboard/motion owner. Its header begins at the top safe area and matches
the chat header's 80 dp geometry: centered “Просмотр”, close icon right. The
preview expansion morph uses the measured square origin, a matching compact
layout crossfade and the full layout. Native-driver animation starts once both
local renderer surfaces have loaded; reduced motion uses the final position.
Link opening uses a bottom-up transition. Close and system back reverse the
presentation. On native, a downward gesture starts in the header or when content
was at the top at touch-start; other scroll gestures stay in the WebView.
On web, sandbox isolation means only header drag is available; iframe body
scroll/touch state is deliberately not bridged to the app. Escape closes there.

No new dependency or native module was added. Verify runtime compatibility and
ordinary dev OTA gates before publishing; source validation alone does not prove
on-device rendering or gestures.
