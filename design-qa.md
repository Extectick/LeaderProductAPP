# Экран 404 — выбранный макет 1

## Evidence

- Source: `C:/Users/Администратор/.codex/generated_images/01a13901-0264-79d3-b404-1dbafcfc68ac/exec-114f67d3-75bd-4886-b3a4-93a0efe0da63.png` (853 × 1844).
- Implementation: `tmp/not-found-qa/implementation-final.png` (390 × 844, CSS 390 × 844, DPR 1).
- Same light fallback state, no device chrome. Reference normalized to 390 × 844 with bicubic scaling in `tmp/not-found-qa/comparison-final.png` (780 × 844 side-by-side).
- Local browser renders the actual `components/NotFoundView.tsx` via a development-only harness, not a recreated HTML mock. Harness callbacks display destinations; actual Expo Router actions are covered by unit tests. No authentication bypass was added to the application.
- Full-view comparison opened together. Text, icon, and controls are readable at this scale, so a separate focused crop was unnecessary.

## Comparison history

1. Initial capture `implementation-390.png` / `comparison.png`: P2 web header too close to top; paragraph wrapped later than reference; CTA block slightly too low.
2. Adjusted web-only header spacing, paragraph width, title line height, icon placement and action rhythm. Final capture compared again against the source.
3. Independent review caught stale last-service restoration on cold entry. Explicit catalog recovery now clears that user's remembered service before navigation; regression test uses real storage helpers. Darkened local action blue for normal-size text contrast and honored reduced-motion preference.

## Required fidelity surfaces

- Typography: native system font, 28/32 bold title, 16/24 secondary text, 18/24 actions. Two-line title and paragraph match reference wrapping. Native platform font rendering is an intentional product constraint.
- Layout: centered content, full-width primary action, plain secondary action, circular header back. Touch target is 44px (larger than reference) for accessibility. Narrow 320 × 568 viewport is scrollable; bottom action was reached and activated.
- Colors: existing light background/text tokens. Action blue is intentionally darker (#0068D9) than mock to meet 4.5:1 text contrast; decorative 404 excluded from accessibility reading.
- Assets: generated standalone document/question illustration, bundled locally with transparency; actual Ionicons back icon. Minor raster stroke differences from the concept are P3, no missing asset or placeholder.
- Copy: Russian copy matches the selected screen. No raw failing URL or sensitive details are displayed.

## Verification

- Primary and back callbacks clicked in browser; expected destination state appeared. Browser console: no error entries.
- 25 focused tests passed, including both back controls with/without history, stale service clearing, catalog routes and offline availability.
- Full TypeScript passed.
- Physical Android safe areas, system font scaling and device animation remain pilot checks, not claimed as browser-verified.

## Findings / follow-up

No remaining P0/P1/P2 visual or navigation findings. P3: platform font/raster stroke differences; physical-device pilot pending.

final result: passed
