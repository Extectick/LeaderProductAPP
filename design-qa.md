# Public order — dev design QA, 2026-10-10

final result: passed

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
