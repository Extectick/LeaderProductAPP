# Public order — dev design QA, 2026-10-11

final result: passed

## Latest scoped iteration (2026-10-11)

Source visual truth: deployed dev page captured as `qa/public-order/mobile-before-20261011.png`, plus the user's six scoped changes. Keep the large 4/2 product grid; replace the intro with customer below the brand and date at right, restyle the pinned footer, remove the freshness block, preserve the missing-photo tile but remove loaded-photo background. Existing application image viewer remains a shared component (MUI on web; native Paper/Expo Image is not imported into the standalone DOM page).

Implementation evidence (local preview, real dev QA order; no customer/1C writes):

- `qa/public-order/mobile-after-20261011.png`: 390 × 844 CSS viewport, header, two-column layout, white photo background and pinned footer.
- `qa/public-order/mobile-footer-20261011.png`: list scrolled to end; last amount bottom 696.61 < footer top 721.11, no occlusion.
- `qa/public-order/gallery-20261011.png`: shared full-screen dark gallery, photo contain-fit, 44 px close control; open/close exercised.
- `qa/public-order/small-20261011.png`: 320 × 740, no horizontal overflow (305 px document width including scrollbar exclusion).
- `qa/public-order/desktop-20261011.png`: 1440 × 1024, four columns, aligned amount baselines, fixed flat footer.
- `qa/public-order/edge-before-20261011.png` and `edge-after-20261011.png`: explicitly synthetic local-only fixture with five test phones, Telegram/MAX and a missing photo. Dev records are not modified.

Comparison: before/after mobile images were emitted together in one comparison input. The multi-contact before/after pair was also compared together. Both captures use the same 390 × 844 CSS viewport; the browser capture excludes chrome/scrollbar area (375 × 811 raster), while the fullscreen gallery is 390 × 843. No raster-vs-CSS density mismatch was classified as a design defect. Footer and photo controls are readable in the full captures, so no separate cropped image was necessary.

Iteration findings:

- [P2, fixed] Five phone buttons pushed Telegram/MAX out of view. Split the contact strip into a scrollable phone list and non-shrinking messenger actions; allow a compact extra name row on mobile. In the final 390 px fixture Telegram is x=265..309 and MAX x=315..359, both inside the 375 px content area.
- [P2, fixed by request] The share menu navigated into a document and opened a modal. Removed the dialog and changed list publication to GUID-only, followed by clipboard + Snackbar. The editor path still saves changes as API draft only.
- No remaining P0/P1/P2 findings in these checked states.

Required fidelity surfaces:

- Typography: existing Arial/system stack, 14 px mobile names and 21 px amounts retained. Compact brand/customer/date hierarchy replaces the large intro deliberately. Full product names remain visible.
- Layout: existing large four/two-column product presentation retained; quantity/amount aligned within each grid row. Pinned footer measured dynamically to keep final products accessible; 44 px contact targets.
- Colors: white loaded-photo surfaces, blue prices/actions, restrained dividers, dark full-screen viewer matching the native visual direction. Missing-photo tile remains #f5f7f9.
- Images: real catalog photos and existing logo, contain-fit and no cropping; original missing-photo icon/text retained. No generated replacement artwork.
- Copy: only customer under brand and date at right, no freshness text. No cost, stock or internal data added. Extra phones and messenger links remain supported.

Checks: APP/public-web TypeScript and public build passed; 123 targeted APP tests passed (including 18 sharing cases). Browser open/close gallery and page-end visibility passed; warning/error log empty. Native Android menu interactions were covered by hook/service tests, not claimed as physical-device QA. Phone/messenger hrefs were inspected, no call/message was sent. Production, API source and 1C unchanged.

## Prior iteration record (2026-10-10)

## Source and implementation

- Source visual truth: `C:/Users/836D~1/AppData/Local/Temp/codex-clipboard-d9c8fc2d-d134-4265-bb44-f22839eba78c.png` (1683 × 935 composite, desktop and mobile mockups).
- Subsequent user instructions override the mock's top total, slogans and badges: large flat 4/2 cards; total beside delivery at the bottom; editable manager phones/MAX/Telegram; use the application's image viewer; align prices; pin minimal delivery/contact bar to viewport bottom.
- Implementation: `https://dev.leader-product.ru/order/`, fictional dev order `qa-public-order-demo`.
- Deployed APP source: `f8e1108`; public-web workflow `38053303788` succeeded. This QA concerns the customer web page; native profile/share controls were not manually exercised on Android.

## Evidence and normalization

Screenshots are local artifacts under `qa/public-order/` in this worktree:

- `desktop-pinned-final.jpg`: 1440 × 1024 CSS viewport, four columns, loaded photos, pinned desktop bar.
- `mobile-pinned-top-final.jpg` and `mobile-pinned-footer-final.jpg`: 390 × 844 CSS viewport, two columns, initial and end-of-list states.
- `shared-photo-viewer-final.jpg`: the extracted application web gallery, fullscreen on a phone; open and close verified.
- `small-phone-final.jpg`: 320 × 740 CSS viewport.
- `tablet-final.jpg`: 768 × 1024 CSS viewport.
- `unavailable-final.jpg`: invalid link state; opening a different fragment removes the previous order.

Desktop final capture is 1440 × 1024 pixels at 1:1. Browser screenshot output on the phone excludes browser/scrollbar area and is 375 × 811 pixels (gallery: 390 × 843); CSS viewport was independently read as 390 × 844. The source composite is a scaled presentation, not a 1:1 page raster. Compared content regions at their relative frame widths; no pixel-perfect or device-bezel equivalence is claimed. Earlier viewport overrides used compensating browser scale; final checks explicitly read the actual CSS dimensions.

Source, final desktop, mobile footer and image viewer were opened together in one comparison input. Both full-page structure and readable card/footer details were inspected. The source contains different demonstration products; implementation deliberately uses actual dev catalog photographs and complete names rather than fabricated replacement assets.

## Comparison history and findings

1. [P1, fixed] Broken brand image in the first deployed page (`desktop-before.jpg`). Corrected esbuild public asset prefix to `/order/assets`. Final desktop/mobile show the existing application brand asset.
2. [P2, fixed] Product amounts shifted between columns for long names. Flex-column cards with automatic margin before quantity keep the bottom price rows aligned. Final measured amount Y coordinates: desktop all 795.06; narrow mobile row pairs 293.98 / 654.90. Full names remain visible.
3. [P2, fixed] Opening another shared link in the same tab could retain the first capability. Added hash navigation reload. Browser checked valid → invalid → valid; inaccessible state contains no previous order data.
4. [P2, fixed] Public page had a separate basic photo dialog. Extracted the existing web order image gallery to `ProductImageGalleryDialog`; both the order editor and public page import it. Fullscreen phone view and close control verified; native gallery unchanged.
5. [P2, fixed by latest user request] Delivery and contacts required scrolling to the page end. Added one flat fixed bar, about 84 px on phone / 61 px on desktop, with dynamic measured content padding and safe-area support. After scrolling to the last row, its bottom was 710.35 while the bar began at 760.40: no hidden product amount or contact control.

No actionable P0/P1/P2 findings remain in the tested page states.

## Required fidelity surfaces

- Typography: system/Arial sans-serif, dark bold product names, muted quantity and bright blue amounts; mobile names 14 px, amounts 21 px. Full names wrap naturally; amount baselines aligned. The raster source does not identify an exact font; no unverified font-equivalence claim.
- Spacing/layout rhythm: four desktop/two mobile grid tracks, large contain-fit photos, flat cards, no shadows or repeated containers. The compact fixed bar intentionally replaces the mock's larger static footer. Widths 320/390/768/1440 have no page horizontal overflow; measured scrollWidth equals clientWidth.
- Colors/tokens: white background, pale neutral photo surfaces, blue prices/actions, subdued secondary text. Existing green application logo intentionally replaces the illustrative blue mock logo.
- Images/assets: actual product photographs and existing application brand asset; no invented SVG/logo/photo approximations. All four desktop photos loaded. Object-fit preserves packaging rather than cropping it.
- Copy/content: no slogans, fake status badges, stock, cost, profit or internal fields. Saved quantity × unit price and line total retained. Manager phone is a labelled fictitious QA number. MAX/Telegram render only when explicitly configured.

## Interactions and checks

- Public photo opens the shared fullscreen viewer and closes back to the product list.
- Fixed bar remains at viewport bottom; last item and refresh remain reachable.
- Invalid fragment, return to a valid link, desktop/mobile/tablet layouts and exact price alignment checked in the deployed browser.
- Telephone href inspected; no real call or messenger message initiated.
- Browser error/warning log: empty in final check.
- APP and standalone public-web TypeScript checks passed; production bundle built successfully.
- API dev integration checks cover contacts self/admin permissions, multiple phones/link validation, stable concurrent sharing, strict field allowlist, authorized photos, ETag changes, token renewal/revocation/expiry and absence of 1C submission.

## Follow-up / residual test limits

- A physical Android/iOS browser and native profile/admin editing remain useful pilot checks. They are not represented as completed by this desktop browser QA.
- Screenshots contain a fictional order and test phone; do not use them as commercial order data.
