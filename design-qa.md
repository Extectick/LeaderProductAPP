# Stock list and product detail: design QA, 2026-10-22

final result: passed

## Target and evidence

- List source visual truth: `C:/Users/Администратор/.codex/generated_images/01a0c238-6b9e-7d31-9314-b4855b4ce50e/exec-260d2f9f-6efc-40a7-a5d2-521ad0f57147.png`.
- Detail source visual truth, including the user's subsequent simplification: `C:/Users/Администратор/.codex/generated_images/01a16315-2ebe-70d3-841b-68ca2cb14e83/exec-177a7c8c-d54e-4f17-bbd9-3e653f9ed2d8.png`.
- Implementation: actual APP components rendered by Expo at `http://localhost:8095/`; only authentication/network are QA fixtures, not a separately drawn prototype.
- Evidence root: `C:/Share/GitRepositories/LeaderProductMobile/.artifacts/stock-incoming-cost-20261022/`.
- Browser screenshots: `list-390.jpg`, `detail-390.jpg`, `detail-320.jpg`, `receipt-390.jpg`, `expense-390.jpg`, `expense-320.jpg`.
- Full-view combined comparison inputs: `list-comparison.png`, `detail-comparison.png`; focused comparisons: `list-focused.png`, `detail-focused.png`. Opened and inspected together, not judged from paths alone.
- Sources are 853 × 1844 px; normalized to 390 × 844. Implementation CSS viewport and screenshot are 390 × 844, DPR 1. Additional narrow test is 320 × 740, DPR 1. No browser/device chrome included.

## Content alignment and intentional constraints

The selected product and warehouse names in the fixture are longer than the mock, and the fixture has more warehouses/products. This intentionally exercises wrapping and scrolling. Do not infer pixel-equivalent row heights or compare the number of rows. The repeated eel asset is QA fixture data; production retains each product's existing catalog image URL. The first product uses the existing sharp catalog photograph, not a CSS/SVG approximation. Missing photos retain the existing image placeholder.

The later explicit human instructions override the early list/detail mock: current common incoming price, no warehouse-specific costs, no ranges, no “Все склады … в наличии” summary and no explanatory footer. Existing shared search/back chrome and MaterialCommunityIcons remain consistent with the application. The common price is not labelled as a warehouse VAT valuation. Receipts and sales retain their separate VAT/document cost semantics.

## Findings and comparison history

1. [P2, resolved] Paper's segmented controls truncated “Поступления” at mobile widths and inherited a purple selected fill. Replaced with full-width, labelled, selected-state tabs, minimum 44 px touch height, explicit blue tokens. Post-fix `detail-320.jpg` and `detail-390.jpg` show all three labels in full.
2. [P2, resolved] Tooltip wrappers prevented flex metrics from filling the row, leaving an unbalanced blank right region. Moved layout/flex ownership outside Tooltip. Post-fix `detail-390.jpg` and `detail-focused.png` show three equal-width warehouse metrics and correctly spaced two-column list metrics.
3. [P2, resolved] Early header had excess flex space and insufficient typographic hierarchy. Removed header flex, used a compact photo/name/current-price hero, 16/21 bold product title and 20 px bold page title with blue back action. Post-fix focused comparison shows no empty header panel.

No actionable P0/P1/P2 issues remain within the approved adapted application design.

## Required fidelity surfaces

- Typography: native/system sans family retained, bold dark product names and prices, muted secondary labels, blue available quantity. Longer names wrap without hiding controls. Tabs remain legible and complete at 320 px. App-specific family/antialiasing differs slightly from the raster mock by design; no new remote fonts introduced.
- Spacing/layout: flat white divided rows; image spans left side, title above two metrics; three warehouse columns fill width with light separators. Shared list thumbnail remains 80 px for consistency with the product picker, detail photo is 100 px. These application constraints are intentional rather than a pixel clone.
- Colors: dark `#0F172A`, blue `#2563EB`, muted `#64748B`, dividers `#E2E8F0`; pale blue selected tab. Receipt quantity green and sales quantity blue; no purple selected token remains.
- Image/icon fidelity: actual catalog raster image displayed with contain fit; standard existing icon family for warehouse/reserve/current price. No custom vector or CSS product substitutions. Fixture-only repeated photographs are not production data.
- Copy/content: current common incoming price with currency per base unit; unknown is `—`, never a fabricated zero. No per-warehouse price, obsolete total-stock summary, range, or bottom legend. Sales document prices are explicitly “Цена продажи, с НДС”, not incorrectly called incoming cost.

## Behaviour and accessibility

Tested opening product, switching balances/receipts/sales, series switch, leaving/reopening product, long client/warehouse text, missing incoming price, retained offline stock with stale-data banner, and 320/390 px layouts. Existing unit tests cover warehouse selection, caching, requests/pagination, pull-to-refresh and tab reset. Tabs expose `tab` role and selected state; price, stock, reserve and images have accessible labels. Browser console error entries: none. Physical Android device, TalkBack and extreme font scaling were not tested.

## Implementation checklist

- [x] Source and revised implementation compared in combined full/focused inputs.
- [x] Moderate visual findings fixed and recaptured.
- [x] Actual APP TypeScript and stock/warehouse focused test suites pass.
- [x] API incoming price tests and real SQL stock aggregation tests pass.
- [ ] Independently verify deployed dev API price values and OTA bundle after publication (release evidence, not visual acceptance).

## Follow-up polish

P3: physical-device review of native font rendering and very large text settings. No claim of physical-phone QA is made by the browser run.

## Receipt documents revision — 2026-10-22

- Source: `C:/Users/Администратор/.codex/generated_images/01a16315-2ebe-70d3-841b-68ca2cb14e83/exec-d4eaa4db-6171-41ae-961a-1876feba8dca.png`, plus explicit supplier-icon request.
- Implementation: `C:/Share/GitRepositories/LeaderProductMobile/.artifacts/stock-incoming-cost-20261022/receipt-design-390.png` and `receipt-design-320.png`.
- Viewports: 390×844 and 320×740, browser CSS density 1. Source 853×1844 normalized to 390×844.
- Full comparison: `.artifacts/stock-incoming-cost-20261022/receipt-design-comparison.png`; focused comparison: `receipt-design-focused.png` (paths relative to workspace root).
- State: product / receipts / collapsed details. Fixture includes longer actual-style warehouse names and customer returns, whereas the mock uses shortened warehouse names and four illustrative records. These data differences intentionally affect wrapping/row height; no pixel-equality claim. Existing compact product header and shared warehouse selector retained.
- Typography: existing native font; warehouse regular 13/19; supplier bold14; financial values unchanged16/21. Long return operation wraps at320 instead of clipping identifiers. Standard receipt/transfer headings fit one line.
- Layout: date headers, flat separators, shared icon column, compact operation+number, no repeated dates or financial captions. Full names remain readable rather than artificially shortened to match the illustration.
- Colors: navy text, blue operations, green quantity, muted receiving #8BAF9B / sending #C49C9C. Accessible warehouse-role labels supplement color.
- Assets/icons: existing real eel image and MaterialCommunityIcons; supplier office-building icon added as requested. No generated replacement asset needed.
- Content: explicit 1C transfer source parsed only for transfer documents; missing source not guessed. Price and amount keep null/zero semantics, VAT captions retained in accessibility labels.
- Interactions: question toggles cost reason; document heading toggles original document/base documents/articles. Today/yesterday grouping checked. Photo opens gallery independently; available amount and footer open product. Warehouse-scope fixture excludes nonselected warehouses. Console errors: none.
- Live read-only dev/WMS15 evidence: 29 movements checked, one transfer with explicit source, no writes.
- Comparison history: first implementation comparison found no actionable P0/P1/P2 issues; longer content and retained shared selector are intentional product constraints. No visual repair iteration claimed.
- P3 follow-up: physical Android font scaling/touch QA remains separate from browser verification.
- final result: passed

## Sales compact-list revision — 2026-10-22

- Source visual: `C:/Share/GitRepositories/LeaderProductMobile/.artifacts/stock-incoming-cost-20261022/receipt-design-390.png`; user explicitly requested analogous Sales layout.
- Implementation captures: same artifact directory, `sales-design-390.png` and `sales-design-320.png`. Full comparison: `sales-design-comparison.png`.
- Viewports/pixels: source and primary implementation both 390×844, density 1; narrow implementation 320×740. No density scaling. Collapsed product-history state; different receipt/sale data and selected warehouse counts intentionally differ. Product image/header retained.
- Typography: same native font and scale, regular warehouse names, 14px counterparty, unchanged 16px financial figures. Long client and writeoff names wrap at 320 without clipping quantities.
- Layout/spacing: same date headers, flat row separators, aligned icons, operation plus number, no financial captions or repeated dates. Focused row text is legible in the full-size combined input, so no separate crop needed.
- Colors/tokens: outgoing quantities blue; muted red sender and green receiver icons. Warehouse-role accessibility labels retained. Supplier icon becomes account icon for sales counterparties.
- Assets: unchanged eel photo and existing MaterialCommunityIcons; no synthetic asset replacements.
- Content: transfers and writeoffs retain their operation identity; only explicit 1C `В:` transfer destination is parsed. Unknown values stay em dash. Full document date, physical movement date when different, linked documents and articles remain available on expansion. Receipt-only customer-order filtering preserved.
- Interactions tested: opening Sales, expanding/collapsing document details and unknown-cost question, both viewport widths. Browser console errors: none. Independent shared pager tests covered swipe navigation; no physical Android verification claimed.
- Checks: TypeScript passes; 30 tests in 4 focused suites pass. No P0/P1/P2 visual findings in first full comparison; no repair iteration claimed.
- P3: physical-phone text scaling and touch verification remains a follow-up.
- final result: passed
