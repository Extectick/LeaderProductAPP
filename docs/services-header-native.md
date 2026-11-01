# Services header and Android window background

The company name is a local vector path in
`src/features/services/assets/companyWordmark.ts`. It is traced from the alpha
contours of the existing company-wordmark PNG, with the same letter shapes,
instead of loading/cropping a separate bitmap from an OTA asset URI. The source
PNG remains as design input; the visible heading does not depend on its download
or decode callbacks. The company symbol still uses the existing APK icon asset.

`AppThemeSurface` is mounted inside the application ThemeProvider. It provides
the selected navigation theme, paints the full React surface, and sets the native
window background through Expo SystemUI. It reapplies the current background on
route changes and foreground entry. ServicesLayout also gives native stack
scenes an explicit themed background/status-bar style.

## Focused validation

- The phone reported OTA 0.1.37.6. The previous bitmap failure was not reproduced
  in the debug emulator; avoid treating debug bitmap success as phone acceptance.
- The new vector heading was checked after a full Android JS reload, including
  UI-tree confirmation that the vector host is present and old image host absent.
- Native window background stayed `#f9fafb` through services -> Help -> services
  with both light and dark Android system modes, while the app remained light.
  The original system mode was restored afterward.
- Evidence lives under `.local-tools/emulator-qa/header-native/` in the workspace
  parent: `vector-loaded-light.png`, `final-dark-system.png`,
  `window-transitions.json`, `window-transitions-dark-system.json`.
- The native QA fixture shares the real components and SystemUI integration;
  it does not reproduce the authenticated app's complete native-stack history.
- Unit coverage checks first-paint vector availability, the profile callback,
  route/theme/foreground window restoration and listener cleanup.

The SVG and SystemUI native modules already exist in runtime 0.1.37; these
changes can be delivered as a JS OTA without changing the APK runtime.
