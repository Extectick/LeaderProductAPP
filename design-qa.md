# Design QA archive

## Public customer order weight — design QA

Source visual truth: `C:/Users/836D~1/AppData/Local/Temp/codex-clipboard-91d8e760-8e10-4a16-8246-f76e242f3c6d.png`.
Selected direction: the explicitly attached two-column image, weight below quantity,
delivery / order weight / monetary total in the fixed footer. This is an existing
production web page, not a new mobile-app prototype; existing React/MUI runtime,
brand assets, photos, gallery, contacts and capability-token protection are retained.

## Evidence and density

- Source: 853 × 1844 PNG, normalized without distortion to the 390 × 844 CSS target.
- Implementation: latest JPEG 390 × 843 pixels, CSS viewport 390 × 844,
  device scale factor approximately 1, no browser/device chrome. The comparison
  contains the capture in a 390 × 844 white canvas without stretching (one-pixel
  capture rounding is not a UI difference).
- State: demo order, 17 October 2026, two products, 3 × 815 g + 2 × 1 kg = 4.445 kg,
  monetary total 1751 RUB. Actual customer identity/address are not shown.
- Preview: `http://127.0.0.1:4180/order/` with a source capability supplied in the browser.
- Latest browser capture:
  `../../.artifacts/public-order-weights-20261017/mobile-final.jpg`.
- Full-view side-by-side evidence (reference left, implementation right):
  `../../.artifacts/public-order-weights-20261017/comparison-final.png`.
- Focused footer comparison:
  `../../.artifacts/public-order-weights-20261017/comparison-final-footer.png`.

## Findings / comparison history

### Pass 1

- [P2] Product title wrapping increases row height.
  Evidence: reference garlic-sauce title occupies two lines; 16 px Arial implementation
  occupies three lines. This pushes quantity/weight/prices about one line below target.
  Fix: adjust title size, line height and letter spacing, preserving complete dynamic names.
- [P3] Source AI mock uses a different package photo from the real catalog.
  Actual photos are retained: no generated substitute is used for real goods. The
  garlic-sauce pouch is horizontal in the source catalog, so its contained image is
  intentionally smaller than the illustrative upright mock. Subject identity is correct.
- [P3] Installed Material UI currency icon differs from the AI illustration.
  Existing icon library is deliberately reused; no hand-drawn SVG or fake UI assets.

### Intermediate comparisons

- Pass 2: 14 px balanced titles still left the garlic title at three lines.
  Evidence: `comparison-pass-2.png`, implementation `mobile-pass-2.jpg`.
- Pass 3: letter spacing -0.45 px was insufficient; the final words exceeded
  the available 167 px column by less than a pixel. Result remained blocked.
  Capture: `mobile-pass-3.jpg`.

### Final comparison / user refinement

- Resolved P2 with 14 px / 1.4 mobile titles and -0.55 px tracking. Both selected
  titles now occupy two lines (39.2 CSS px). Quantity, weight and blue amount
  return to the reference rhythm without truncation.
- The user requested a clearer weight icon. Replaced ScaleOutlined everywhere
  with the installed Material UI MonitorWeightOutlined (recognizable scales).
  This is an explicitly requested deviation from the source illustration.
- Opened and judged the final full-view and footer comparison together with
  the source image. No remaining actionable P0/P1/P2 visual findings.

## Required fidelity surfaces

- Typography: existing Arial/system fallback reused; navy semibold hierarchy,
  complete names, 14 px mobile titles, 13 px supporting text, blue 24 px row
  amounts. Selected titles wrap in two lines at 390 px; longer dynamic names
  may wrap naturally at 320 px. Footer weight is slightly more prominent than
  the illustrative source, retaining readable compact values.
- Spacing: matching white two-column mobile grid, large contained photos,
  thin separators, fixed three-part footer and full-width blue contact button.
  Footer height is measured with ResizeObserver and reserved as page padding.
  Desktop retains the existing four-column grid. No clipped persistent controls.
- Colour: existing #111a35 / #61708a / #1859f7 tokens retained; white surface,
  subtle grey divider, muted weight metadata and blue monetary emphasis.
- Images: existing brand and real catalog images reused. The horizontal Astoria
  package differs from the illustrative upright package but represents the real
  product; this intentional P3 difference is retained. No fake/recreated assets.
- Copy: selected customer/date/delivery and sample values match the visual;
  3 × 0.815 kg + 2 × 1 kg = 4.445 kg. Missing weight uses a dash, a partial
  aggregate says “Известный вес”, and its accessible description explains why.

## Functional and responsive checks

- 390 × 844: page scroll width 390, both title heights 39.2, all footer metrics.
- 320 × 844: page scroll width 320, each footer metric has no internal horizontal
  overflow; names wrap instead of being cut. Evidence: `mobile-320.jpg`.
- 1440 × 1024: four grid tracks, no horizontal overflow; footer measured/reserved
  125 px. Evidence: `desktop-1440.jpg`.
- Missing-weight case: row “Вес —”, partial total 2.445 kg, singular Russian copy
  “для 1 позиции”; no invented zero/full total. Evidence: `missing-weight-320.jpg`.
- Product photo opens in the existing shared gallery; browser Back closes it and
  preserves the order. Evidence: `gallery-mobile.jpg`.
- Manager button opens the existing contact dialog; close returns to the same
  page. External telephone/email links were not invoked. Evidence: `contacts-mobile.jpg`.
- Browser warning/error logs empty on both normal and missing-weight previews.
- Temporary browser viewport override reset; main preview left running/open.

## Code and live-data verification / release boundary

### Selected icon refinement: option 1

- Selected reference: first column of
  `../../.artifacts/public-order-weights-20261017/weight-icon-options.jpg` (900 × 356).
  The user chose the MaterialCommunityIcons `weight-kilogram` hanging weight with kg.
- Latest implementation: `weight-kilogram-mobile.jpg`, 390 × 844 pixels/CSS pixels,
  device scale factor 1. The same order, values, colours and layout are retained.
- Compared the full source and implementation together in
  `comparison-weight-kilogram.png`; compared the chosen icon's item/footer regions
  side by side at 2× in `comparison-selected-weight-icon.png`.
- Reused the exact installed library glyph through Material UI `Icon`, not a new
  drawing/component. A mechanical single-glyph WOFF subset is 864 bytes. Verified
  the original/subset drawing commands are identical and the font contains only
  U+F05A2. Font license and source notice are copied into the public web bundle.
- Browser confirms `OrderWeightIcon` loaded, two 18 px row icons and a 22 px footer
  icon at 390 px. At 320 px, row icons stay 18 px and footer becomes 19 px as before;
  page scroll width remains 320. Evidence: `weight-kilogram-320.jpg`.
- Supporting text, spacing, palette, product imagery and copy are unchanged.
  Icons are decorative/aria-hidden; accessible weight descriptions remain intact.
  Browser warning/error logs are empty. Build, public-order TypeScript and all
  36 focused APP tests passed again. No actionable P0/P1/P2 findings remain.
- Production release was subsequently authorized; deployment verification will
  be recorded separately. The earlier no-deployment note describes the initial pass.

- APP: public-order build, public-order and full APP TypeScript checks passed;
  five focused suites, 36 tests passed. Existing contacts/history/location/delivery
  behavior remains covered.
- API: TypeScript passed; five focused suites, 68 tests passed. Covers decimal
  arithmetic, units/packages, cancelled rows, unknown weights, current-quantity
  recalculation, ETags, public allowlist, bounded reference batches, deduplication,
  concurrency fencing, transient failures and unchanged default product lookup.
- WMS15 local connectivity recovered after an initial 502. The actual new source
  batch adapter read the two selected catalog references. Calculated 2.445 kg,
  2 kg and total 4.445 kg; two packages of 9.78 kg calculated as 19.56 kg.
  Read-only live check: `../../.artifacts/public-order-weights-20261017/verify-live-weights.cjs`.
- The cloud dev API's WMS15 tunnel still returns HTTP 502. This is an outstanding
  deployment/integration-path check, not a visual QA failure. Do not claim that
  live weights have been verified through cloud dev or production.
- No 1C source/schema changes, business-document writes, API deployment, OTA,
  APK, production change, commit or push were performed for this feature.

## Implementation checklist

- [x] Selected layout, per-line mass and three-part footer.
- [x] Clearer weight icon requested by the user, consistent at all locations.
- [x] Reuse brand, catalog photos, installed icons, gallery and contacts.
- [x] Resolve P2 title wrapping and repeat source/implementation comparison.
- [x] Verify responsive layout, interactions, missing data, types and tests.
- [ ] Before cloud release: restore/check the dev → WMS15 path and smoke-test
      the deployed API/public page. Production release requires authorization.

final result: passed

# Stock list and product detail: design QA, 2026-10-22

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

## Sales chart revision — 2026-10-22

- Source visual: `C:/Users/Администратор/.codex/generated_images/01a16315-2ebe-70d3-841b-68ca2cb14e83/exec-b584c299-2d93-4360-8998-ae838fdea4c5.png`, with the user's explicit request for lower analytics height.
- Actual APP components rendered at `http://localhost:8097/` using the isolated stock-products-qa data fixture. No production data or release was changed.
- Evidence: workspace `.artifacts/stock-incoming-cost-20261022/sales-chart-390.png`, `sales-chart-selected-390.png`, `sales-chart-selected-320.png`, combined `sales-chart-comparison.png`.
- Source pixels 853×1844 normalized proportionally to 390×843; implementation 390×844 and 320×740, CSS density 1. Selected-day state compared in the combined image. Entire comparison is readable at native size; no extra focused crop required.
- Intentional differences: actual native app typography, full product/customer/warehouse names, and existing warehouse multi-selector retained. Fixture sale days/amounts differ from illustration. Chart is explicitly 140 CSS px rather than the taller generated illustration; measured rendered height 140. Popup uses the chart width to preserve long names and prices. No pixel-equality claim.
- Typography: established app fonts; compact 10px chart labels, 12–13px popup data; original 16px financial figures in document rows unchanged. All popup fields readable at320.
- Spacing/layout: one chart without title/KPIs, dropdown upper right, documents below. Existing three tabs retained; no additional Analytics tab. Popup stays within the 140px chart and scrolls for multiple documents without pushing the list down.
- Colors/tokens: blue bars and period control, navy figures, muted axis/grid lines. Existing muted warehouse-role colors preserved.
- Assets: original eel photo and existing MaterialCommunityIcons; chart rendered with the app's existing ECharts SVG renderer, not a mock screenshot.
- Copy/content: document, client, quantity, unit sale price and amount shown for each sale. Unknown financial values remain em dash with source reason. Transfers/writeoffs remain identifiable list records but are excluded from sales totals. Physical movement day is not converted through UTC.
- Iteration: P2 narrow multi-document popup wrapped price/unit unnecessarily. Increased popup width (left inset40→10), recaptured320; price fits and later documents remain accessible by scrolling. Final combined390 comparison has no actionable P0/P1/P2 findings.
- Browser interactions: product opening, Sales tab, one sale and multi-sale day selection, popup close and scroll, month/7-day dropdown, empty previous month, both widths. Latest browser console error check returned none. Fixture Metro needed the same existing tslib shim as the real APP; no application dependency change.
- Data safety: sequential existing signed-cursor pagination loads the full chosen period before showing totals. Errors, missing/repeated cursors and a100-page safety limit never show partial totals as complete. Scope changes and refresh reset the guard.
- Checks: TypeScript passed;77 focused tests across14 stock/warehouse/sales suites passed. Broad run:758/759 passed, one unrelated tracking timeout; isolated rerun of that suite passed22/22. Broad run also emitted existing OTA timer/act warnings; it is not recorded as a clean full-suite pass.
- Remaining validation: physical Android touch/font scaling and live business-data acceptance were not performed; browser fixture QA is not physical-device QA. API/1C unchanged, OTA not published.
- final result: passed

## Stock interaction and history-access fixes — 2026-10-23

- Scope: six requested refinements; no new design generation. APP worktree changes remain uncommitted. No production or OTA deployment performed.
- Gestures: both RNGH FlatList and native RefreshControl wait for the same horizontal Pan recognizer. Forwarded refresh ref preserves RNGH's own nested scroll/refresh coordination. Horizontal activation 12px, vertical failure 18px; existing deliberate-swipe distance/direction checks retained. Unit tests cover both directions, no wrapping, blocked overlays and shared waitFor wiring. No adb devices available; native Android arbitration still needs physical-device verification.
- Sales: negative quantities red #DC2626; warehouse receiver/sender colors #519A72/#C46B6B, text unchanged. Accepted receipt movements no longer show the preliminary accounting-month question; unavailable costs still expose their reason. No financial values or accounting status in 1C modified.
- Analytics: one chart, Quantity/Price toggle, total height 140px including 28px toggle; 112px plot. Prices are quantity-weighted daily averages. Unknown/incomplete day prices are gaps; currencies are not mixed. Meaningful minimum price-axis range prevents sub-kopeck rounding from appearing as a large change. Explicit visible price-point symbols remain clickable despite sparse date labels.
- Browser evidence: workspace `.artifacts/stock-products-qa/qa-20261023/sales-quantity-390.png`, `sales-price-320.png`, `sales-popup-320.png`, `receipts-390.png`. Actual APP components with isolated data fixture, 390x844 and 320x740. Verified metric switching, price-point click opens document/customer/quantity/price/amount, close, and accepted receipt without preliminary question. Browser console errors: none. Temporary viewport reset.
- Tests: TypeScript passed. 82 tests / 16 focused stock/warehouse/sales suites passed; final chart-symbol adjustment additionally passed chart tests and TypeScript. `git diff --check` passed (existing LF/CRLF warnings only).
- History root cause: 1C used the order warehouse allowlist to validate an entire stock-history group. Separately authorized read-only history now queries active non-group warehouses using SELECT ALLOWED. Order warehouse export/selection and write paths unchanged. No metadata attributes added.
- WMS15 only: штатный update script completed source load, applicability, server/thin-client compilation (log: `Ошибок не обнаружено`), database configuration update. Logs: workspace `.artifacts/stock-products-qa/onec-history-20261023/`. Ping confirms `stockHistoryWarehousesVersion=2`.
- Live WMS15 checks: both directions for Omsk (19 warehouses) and Novosibirsk (21 warehouses), next-page scopes and non-overlap, unchanged two order warehouses. Local API `listStockMovements` exercised against live WMS15 validates actual schema and signed-cursor pagination for all four group/direction combinations. Verification scripts: workspace `.artifacts/stock-products-qa/verify-history-wms15.ps1` and `verify-local-api-history.cjs`.
- Test-harness issue corrected: PowerShell JSON auto-converted ISO cursor dates to localized DateTime strings; verifier now preserves date strings. This was not an app/API defect. Existing MCP requires explicit includeColumnTypes=false; verifier supplies it.
- Limitation: repeat checks through the deployed dev container could not run because SSH to the dev host timed out during banner exchange. Direct WMS15 and local API-to-WMS15 validation passed. No dev-server deployment is claimed.

## Dev OTA preparation: analytics paused — 2026-10-23

- User requested OTA with analytics hidden. Sales chart and period picker are disconnected from StockProductsScreen; implementation files are retained for later refinement but not imported into the screen. Period auto-loading and date filtering are also removed, so historical documents remain visible and pagination is driven by scrolling.
- Existing gesture, quantity/color, and accepted-receipt presentation fixes included. Regression test verifies no chart/picker, preservation of a previous-year document, no automatic history loading, and working scroll pagination/refresh.
- TypeScript and 83 focused tests / 16 suites passed. Browser fixture verified no chart or period control; capture: workspace `.artifacts/stock-products-qa/qa-20261023/sales-analytics-hidden.png`. Physical Android verification remains outstanding.
- Release target dev only, native runtime unchanged (0.1.34/build33); no production release requested. Final CI/manifest verification is reported separately after publication.
