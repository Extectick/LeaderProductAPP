# Public customer order weight — design QA

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
