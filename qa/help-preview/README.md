# Local Help component visual QA (not an app route)

This isolated Expo project imports the **real** HelpMessageBubble, HelpComposer,
HelpMedia and ThemeProvider. It never imports AuthContext, useHelpService, the
production app entry, API or notification/socket bridges. All messages and
actions stay in browser memory. No accounts, credentials or API calls are used.

From this directory, with the parent's existing node_modules (no installation):

```powershell
cd C:\Share\GitRepositories\LeaderProductMobile\.worktrees\help-app-dev\qa\help-preview
npm start
```

Default URL: http://localhost:8100/?theme=dark&width=390

- `?theme=light&width=320` tests compact/light layout.
- `?theme=dark&width=390&composer=long` starts with an overflowing composer.
- `?theme=dark&width=390&screen=list` renders the real **HelpScreen** list.
- `?theme=light&width=390&screen=chat&ticketId=1042` opens its real chat layout.
  Metro aliases only HelpScreen's service hook/router imports to in-memory QA
  fixtures. Production resolution and auth remain unchanged. List/archive/chat
  transitions and local actions work, but this does not test the real service.
- Exact prototype snapshot: `?screen=list&theme=dark&width=393&height=852&insetTop=54&insetBottom=34`.
  `height` fixes the surface height without flex shrinking; insets are supplied
  only to the real screen's QA context. Capture a **full-page** screenshot and
  crop/measure `[data-testid="help-qa-surface"]` (393×852). The toolbar remains
  outside the surface; body scrolling is enabled in fixed-height mode.
- Toolbar switches theme, viewport width and composer modes.
- Long press / right click opens the actual message menu; reactions are local.
- Voice fixture is an 8-second, low-volume synthetic WAV generated in memory.
  Playback and composer recording use real expo-audio. Microphone access is
  requested only after deliberately pressing the recording control.
- Image fixture is an in-memory SVG; opens the actual gallery.
- Only the QA origin's theme preference is stored via the real ThemeProvider.

The default fixture header is not HelpScreen; `screen=list/chat` uses the real
screen with a fixture service. This is layout QA, **not** proof of auth, backend, socket, notification,
navigation, keyboard-on-device or persistence correctness. Do not export this
entry to OTA, register it under app/, or include it in a release command.

## Native debug dev-client

This entry also runs in the existing real native dev-client build; **do not run
prebuild in this QA directory**. `npm run start:native` serves the same isolated
entry on 8100 (stop this QA directory's earlier Metro process first).

Native defaults to the real HelpScreen chat fixture #1042, full window width,
real SafeAreaProvider insets, no browser toolbar. Back opens the real ticket list.
Composer keyboard, swipe, microphone permission, recording, locking and playback
are the actual components/expo-audio implementation. No auth or backend runs.
The synthetic WAV is written only to app cache; native image uses the existing
app icon fixture because React Native Image does not render browser SVG data URIs.

After the matching debug APK is installed, coordinate the exact scheme with its
manifest. For the `leaderproduct` development-client scheme:

```powershell
adb reverse tcp:8100 tcp:8100
adb shell am start -a android.intent.action.VIEW -d "leaderproduct://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8100" com.leaderproduct.app
```

Only the emulator/test app should be targeted. This is native component-flow QA,
not authentication/API/persistence/push delivery validation.

Stop the terminal process with Ctrl+C. `npm start` binds localhost. If the Windows
localhost IPv6 binding is inaccessible, explicitly use `npm run start:lan` and
http://127.0.0.1:8100/; this exposes the secret-free QA fixtures on local interfaces.
