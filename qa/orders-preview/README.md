# Client Orders web QA fixture

Renders the production `ClientOrdersWebScreen` against synthetic in-memory data. It is not an application login, database or 1C connection, and cannot demonstrate production persistence or an actual order export.

Start with the workspace Node24 runtime:

```sh
. /home/extectick/LeaderProduct/.dev-runtime/env.sh
cd LeaderProductAPP/qa/orders-preview
EXPO_OFFLINE=1 npm start
```

Own Metro port: **8131**. The normal APP Metro on8081 is untouched. No dependency installation, OTA or API process is needed.

Query options: `?theme=dark`, `mode=readonly`, `mode=queued`, `mode=error`, `offline=1`, `inset=216` (expanded sidebar; default72), `inset=0` (narrow shell), `orderGuid=demo-sent`.

The fixture has real UI edits, numeric validation/metrics, filtering, selecting/creating/copying documents, picking several products and mocked save/submit/queue actions. Thumbnail assets use the bundled demo/company icon; they intentionally are not real product photos. All orders, clients, amounts and GUIDs are synthetic.

`window.__ordersQa` aliases `window.__ordersFixture`. `window.__ordersQaSetRail(72|216|0)` and the rail button change container width without remounting the editor. The catalog contains12 distinct synthetic products.

`window.__ordersFixture.state` provides inspectable draft/filter state, `setOnline(boolean)` changes the connection state without a remount, and `selectOrder(guid)` selects a scenario. `actions` records mock export actions only. `window.__ordersFixtureNetwork.blocked` records rejected network attempts. The isolated Metro resolver replaces workspace/service/network modules. Fetch/XHR reject external origins and `/api/` calls as defence in depth.

Fixture data lives only in memory. Refresh resets it; existing table/picker view preferences may use this preview origin's localStorage. It never reads APP credentials or personal 1C data.

Boundary regression check: `node --test qa/orders-preview/networkBoundary.test.cjs` (from APP).

Fast-entry QA: changing a client/organization clears dependent fields and resolves synthetic defaults asynchronously (120ms). Add `defaults=slow` for an800ms loading window or `defaults=missing` to leave contract/address unset. `window.__ordersQa.setMutationLocked(true|false)` simulates an in-flight mutation; `state.loadingDefaults` and `state.mutationLocked` expose those gates. `patchDraft` supports the same object/updater signatures as the real workspace. No real defaults or business writes are requested.

`history=1` includes one synthetic prior purchase, so catalogue checks also render the date/clock metadata (including the purchased-only filter). This uses the same fixture product ID and never requests business history.

Shared list QA: `customers=75&customerDelay=600` uses paginated synthetic clients; `customerFailure=once` fails the first request, then permits retry. `window.__customerRequests` contains only synthetic offset/query calls. The fixture includes production WebInteractionStyles for hover/focus checks.
