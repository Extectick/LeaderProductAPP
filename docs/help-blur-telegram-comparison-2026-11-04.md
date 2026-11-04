# Help blur: source comparison and compatibility

## Regression in OTA 0.1.44.1

The dev OTA endpoint on 2026-11-04 selected `0.1.44.1`, runtime `0.1.44`,
commit `d9e0b4c2df4cecade30fcbe640f631475fbe1e9c`, created at
`2026-11-04T12:58:03.597Z`. Its native runtime uses Expo SDK 57; the current
development workspace uses SDK 58. These runtimes must not share an OTA export.

That commit implemented progressive Help glass by stacking three masked,
tinted `BlurView`s per edge. This compounds tint as well as blur and adds native
render passes while opening or scrolling a chat. Earlier changes enlarged the
feather to 144dp and moved the dock capture 64dp into the conversation, changing
both the material and the content-facing boundary.

The correction restores one masked blur per surface, shared app material and
104dp feather, a 36dp header extension, and the dock boundary at the composer's
8dp padding. The retained ticket list releases its blur after chat entry and
restores it on back navigation without remounting its list. A missing native
target gets a bounded initial attachment probe rather than endless animation
frame polling. The attachment scrolling changes from `d9e0b4c` are preserved.

These are confirmed source-level rendering costs and visual regressions.
They are candidates for the reported stalls, not a measured GPU/CPU diagnosis:
no Android device was available through the device panel for a before/after
frame trace. Do not report a phone FPS improvement from component tests or an
export alone.

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

The corrected blur, primitives, screen, attachment picker, theme surface and
chat entry have 153 passing component tests on SDK 58. TypeScript, Android
export, Expo dependency checks and Expo Doctor (20/20) also pass. The checks
cover one blur pass, mirrored mask boundaries, bounded missing-target work,
and releasing/restoring the retained list's effects. Physical-device timing
and visual verification remain outstanding.

The same six-file patch was applied to an isolated snapshot of `d9e0b4c`
using its original npm lockfile and Expo SDK 57. The same 153 tests and the
snapshot's full TypeScript check pass there as well. The snapshot and patch
are private development artifacts under `.dev-runtime/`; no OTA has been
published for that SDK 57 runtime by this correction. Following the owner's
request to ship SDK 58, the release target is APK 0.1.45 / versionCode 44 and
runtime 0.1.45. It includes this correction and the SDK 58 native libraries;
subsequent OTA exports must target that new runtime.
