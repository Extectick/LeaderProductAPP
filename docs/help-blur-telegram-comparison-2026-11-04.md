# Help blur: source comparison and compatibility

## Telegram reference

Compared the current official Android sources:

- [ChatActivity](https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/src/main/java/org/telegram/ui/ChatActivity.java): chat glass uses a shared message/wallpaper source and invalidates the relative source position when the glass moves.
- [BlurredBackgroundDrawable](https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/src/main/java/org/telegram/ui/Components/blur3/drawable/BlurredBackgroundDrawable.java): `drawSourceAny` samples the source at the drawable's bounds, then applies the material tint; `getPositionRelativeSource` tracks actual source offsets.
- [BlurredBackgroundProviderImpl](https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/src/main/java/org/telegram/ui/Components/blur3/drawable/color/impl/BlurredBackgroundProviderImpl.java): chat panels use theme-dependent tint and separate glass/shadow settings. Telegram also has a distinct Liquid Glass pipeline. Its numeric parameters cannot be treated as interchangeable with Expo BlurView intensity.

## Changes in this app

- The message source must continue underneath header and composer glass. Clipping the entire native capture target at the dock top erased those pixels, leaving only `frameClearColor`/tint. The OTA wrapper now supplies an empty `viewportId` to the existing Android module; native scroll padding, bottom following and read occlusion still use the dock bounds. The full-scene React viewport retains its outer clip.
- `HelpBlurSurface` no longer overrides the common blur with intensity14. It inherits the same `APP_EDGE_BLUR` material as the app and administration header.
- Header and dock use one mirrored104dp feather, bounded by their measured height. The header starts at its content-facing bottom edge and continues to the screen top. The dock starts exactly at the composer top, continues through the navigation safe area, and has no full-width opaque plate or border above it.
- No image, texture, white gradient fill or fake background is added to emulate Telegram. The mask controls the opacity of the captured blur only.

These changes reuse Telegram's source-coordinate and material ownership principles. They are not a claim of pixel-identical rendering across Telegram's native glass pipeline, Expo and different phone displays.

## Android system-bar limitation

The previous `LeaderHelpChatLayout` stores navigation-bar color/contrast when taking IME ownership and restores them on release. On some devices that can reintroduce a dark system scrim as Help exits. Such system compositor layers may not appear in screen recordings.

A narrow native fix is prepared: keep the application's transparent, non-contrast navigation chrome when releasing the temporary IME owner and restore only the soft-input mode. This code requires a new APK. OTA cannot install it into existing native binaries; ExpoSystemUI in the current APK exposes decor background color only, not navigation-bar contrast flags.

Verify that native fix on the affected physical phone, including gesture and three-button navigation. Screenshot/video evidence alone cannot prove absence of an OEM system scrim.

## Focused checks

`appScreenBlur`, `helpPrimitives`, and `appThemeSurface`:21 component tests passed. Parent agent owns device verification and final integrated checks.
