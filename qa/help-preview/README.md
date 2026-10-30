# Local Help component visual QA (not an app route)

This isolated Expo project imports the **real** HelpMessageBubble, HelpComposer,
HelpMedia and ThemeProvider. It never imports AuthContext, useHelpService, the
production app entry, API or notification/socket bridges. All messages and
actions stay in the local fixture cache on this device. No accounts, credentials or API calls are used.

From this directory, with the parent's existing node_modules (no installation):

```powershell
cd qa/help-preview # from the APP repository root
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
manifest. For the current DEV package and scheme:

```powershell
adb reverse tcp:8100 tcp:8100
adb shell am start -a android.intent.action.VIEW -d "leaderproduct-dev://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8100" com.leaderproduct.app.dev
```

Only the emulator/test app should be targeted. This is native component-flow QA,
not authentication/API/persistence/push delivery validation.

Stop the terminal process with Ctrl+C. `npm start` binds localhost. If the Windows
localhost IPv6 binding is inaccessible, explicitly use `npm run start:lan` and
http://127.0.0.1:8100/; this exposes the secret-free QA fixtures on local interfaces.

## Direct Android diagnostics (no Computer Use)

With the native QA entry open, run these from the APP repository root with Node 22+:

```powershell
npm run qa:help:inspect -- --out snapshot.json
npm run qa:help:inspect -- --action screen.list --out list.json
npm run qa:help:inspect -- --action fixture.it --value true --out it.json
npm run qa:help:inspect -- --action header.openMenu --out menu.json
npm run qa:help:inspect -- --action screen.open --value 1042 --out chat.json
npm run qa:help:inspect -- --action composer.text --value "First`nSecond" --out composer.json
adb -s emulator-5554 shell screencap -p /sdcard/help.png
adb -s emulator-5554 pull /sdcard/help.png help.png
```

The CLI connects directly to Metro's Hermes debugger on port 8100, selects the
DEV package, waits for the UI action to settle, and measures native view bounds.
Override `--port`, `--app`, and `--wait` (milliseconds) when necessary. JSON includes
screen/theme/scope, keyboard and composer dimensions, animation events, available
actions, and the maximum difference between the menu, time and unread-badge axes.
Dimensions are dp; multiply axis deviation by `density` for physical pixels.

Other fixture controls: `fixture.theme` (`dark`/`light`), `fixture.rows` (0–100 extra
rows), `screen.new`, `screen.back`, `screen.search`, `screen.scroll` (vertical dp),
`header.closeMenu`, `header.archive`, `header.scope`, `composer.focus`.
The snapshot's `actions` list reflects the mounted screen and IT capability.
Use `fixture.rows=0`, `fixture.it=false`, `screen.list`, and `screen.scroll=0`
to restore the default list. Reloading also resets fixture data.

The normal development app allows read-only snapshots on its Metro port; commands
are enabled only by this isolated QA entry. Release builds expose no bridge.
Logs contain numeric/layout state and action names, never command arguments,
message/search text, credentials or network payloads. Sending and deleting are
deliberately absent from the command API. `[HELP_UI]` events also appear in Metro
and `adb logcat -s ReactNativeJS`; no desktop clicking or UI-idle polling is needed.

### Native composer and chat synchronization

`modules/leader-help-input` owns Android text layout, selection and the 180 ms
height transition. Its second view updates the chat's native bottom padding and
scroll offset in the same frame as the dock. Native sources require a new APK;
older clients, iOS and web retain the existing React Native input path.

After installing a matching DEV APK, the inspector includes `native.composer`
and `native.chat`. Frames contain geometry/caret visibility and the gap between
the last message and dock; they never contain message text. Debug buffers are
bounded to 240 frames. Input injection is guarded by the Android debuggable flag
and the JS fixture-only command boundary.

- `composer.type`: Unicode input through Android InputConnection, 35 ms per character.
- `composer.paste`: one InputConnection commit, including multiline text/emoji.
- `composer.selection`: `start:end`; `composer.delete`: number of characters.
- `composer.resetMetrics`, `chat.resetMetrics`: clear native frame samples.
- `--steps path.json`: execute a JSON array of `{action,value,wait,snapshot}` in
  one Hermes connection. `snapshot` is an optional result name; waits are 0–5000 ms.

For wrap checks, focus/clear the field, reset both probes, type enough text to
wrap, then inspect `clippedFrames` and `native.chat.frames[].gap`. Check growth,
collapse, long paste, selection edits, and a scroll-away case: `screen.scroll=0`
must keep its offset while typing. Also test with Android animator scale enabled;
the transition samples explicitly report `animatorsEnabled` and `reduced`.
This validates component/IME-input geometry, not real backend delivery or physical
phone/soft-keyboard compatibility. The QA Metro excludes native build output
from its file watcher so rebuilding the APK does not stall diagnostics.

### Android blur source patch (build details)

`scripts/patchExpoBlur.js` exposes an Android `noiseEnabled` opt-out for Help's
blur surfaces. Postinstall applies it idempotently and fails if the expected Expo
source changes. `expo.autolinking.android.buildFromSource=["expo-blur"]` is
required: Expo otherwise links the precompiled module and ignores the patch.
After changing native blur code, rebuild/install the DEV APK; OTA/Metro alone
cannot update it. Existing phone builds need the same native rebuild before the
grain opt-out takes effect. Other BlurViews keep their existing noise default.


### Messenger fixtures

Keep the DEV app in the foreground: Android pauses layout and frame callbacks for
background apps. The inspector reports background state before measuring. On this
Windows emulator use the LAN Metro binding with
`REACT_NATIVE_PACKAGER_HOSTNAME=127.0.0.1` and `adb reverse tcp:8100 tcp:8100`.

- `fixture.history=600`, `fixture.history.jump=202`: paged deterministic history.
- `timeline.date`: jump to the first message of the visible local date.
- `fixture.unread`, `fixture.incoming`, `fixture.offline`/`fixture.online`:
  unread/opening, tail-follow and reconnect cases.
- `fixture.album=10`: a synthetic ordered album with PNG assets and tiny previews.
  `fixture.mediaLatency=7000` delays original resolution independently of text.
- `fixture.voice`: an incoming eight-second local synthetic WAV. Press Play in
  its message; `voice.toggle`, `voice.speed` (numeric 1/1.5/2 in `--steps`),
  `voice.jump` and `voice.stop` exercise the shared strip.
- `fixture.cache.write`/`read`/`clear`: isolated negative-ID SQLite scope, including
  edits, tombstones and viewport. Read after force-stop/relaunch to verify disk.

The album assets and tone contain no user data and require no external service.
Use ADB UI-tree bounds for taps and swipes; never interact with Telegram chats as
part of these fixtures. Native blur now additionally uses the opt-in
`frameClearColor` to avoid a white initial capture.

### Local AI processing scenario

Create a new ticket and send the first message. The fixture assigns a short title
and a sequential number, then inserts one assistant message with processing steps
and a streamed test answer. No model or backend is contacted. Follow-up messages
in these newly created tickets start another run; existing IT fixtures retain
their original behavior.

The chat ellipsis menu (also available on the empty new-ticket screen) selects
the scenario for the next message: normal answer, slow analysis, clarification,
or error. While processing, the empty composer shows Stop; entering text switches
to Send so the user can submit a correction. Corrections keep the task ID and
previous input context, retire old progress, and place updated progress below
the new user message. Superseded empty progress rows are hidden. Stopping shows
a compact status/retry row, without a stage counter. Assistant names are hidden.
The draft remains editable and stopping preserves it. The answer replaces
the processing block in the same assistant row; completed steps are not kept
onscreen. Failed or stopped runs offer Retry in the row. Assistant avatars have
a stable per-ticket color shared by the list and chat; IT members take priority
in the list.
Retry after the error scenario runs a successful answer. The menu can replay the
latest assistant row without creating another ticket. Runs belong to their ticket;
navigating elsewhere does not redirect their events. Reloading restores saved runs and resumes their current step or partial answer.

QA-only diagnostics: `fixture.ai.scenario` accepts `answer`, `slow`, `question`,
or `error`; `fixture.ai.create` creates a local ticket (optional text argument),
then use `screen.open` with its number. `fixture.ai.stop` and `fixture.ai.retry`
target the latest assistant run in the selected ticket. Snapshot state includes
assistant status, step, event number and answer length, never answer text.

Shared view: `src/features/help/components/HelpAssistantMessage.tsx`.
Event/state contract: `src/features/help/helpAssistant.ts`.
Local event generator: `qa/help-preview/assistantFixture.ts`.


### Persistent opening and smooth tail

The QA fixture saves ticket metadata, complete message history in 100-message
storage pages, drafts, read cursors and reading anchors in AsyncStorage. It loads
before HelpScreen mounts, so a reload does not replace custom tickets with seeds.
Writes are serialized with the manifest published last; changed state is flushed
every 250 ms and on background/unmount. `fixture.persist.save` awaits an explicit
flush for process-restart checks. This namespace is separate from account data.

The real application uses its existing account/API-scoped SQLite history plus a
bounded memory cache of opened windows. A cached chat opens before network work;
repair uses the saved event cursor. Ticket socket events are coalesced per ID and
refresh that ticket. Unchanged rows and message cells keep their object references;
memoized list rows skip updates when another ticket changes. Reconnect and periodic
repair still reconcile quietly without a list spinner.

Android's updated LeaderHelpChatLayout module keeps the scroll range at the tail
and eases content displacement on native frames. Reduced motion disables this
presentation spring. The native change requires an updated Dev Client; the emulator
artifact is `dev-builds/development-client/leader-product-dev-client-0.1.35-smooth-x86_64.apk`.
It is for x86_64 emulators. The jump-to-latest button is 38 dp and shares the send
button axis. Completed AI answers use natural layout immediately; processing has
one spinner in the current step marker, with no spinner on its avatar.
