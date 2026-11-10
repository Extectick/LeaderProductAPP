# Shared viewer fixture

Run with the workspace Node toolchain, from this directory:

```sh
EXPO_OFFLINE=1 npx expo start --web --localhost --port 8124
```

The fixture mounts the real EntityCardProvider, Markdown dispatcher, viewer and
read-only client-order components. Auth, API data, profile body and presence are
local fixtures. Application HTTP requests are rejected by the fixture adapter;
clicking the public website example deliberately opens that public website.
This entry is separate from the application and must not be published to OTA.

Order checks at desktop and mobile widths:

1. Click the HTTPS order link, then the internal AI order link after closing it.
2. Wait beyond loading/entrance. The viewer must remain open, with four local
   products and total 7502; the outer URL and draft must stay unchanged.
3. Switch between the order's header and items, expand on desktop, then close.
4. Open the warehouse, follow its related order, and go back to the warehouse.
5. Open a profile and close it. The original draft remains mounted throughout.

The source-bound API response, real account authorization and live ticket 77
are not exercised by this fixture; their fences are covered separately by tests.
