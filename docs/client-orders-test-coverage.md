# Client Orders Test Coverage

## Automated APP Checks

Run from `LeaderProductAPP`:

```powershell
npm run test:unit
npx tsc --noEmit
```

Covered:

- shared order status labels, including 1C states and queue labels;
- package selection defaults, base-unit packaging, package multipliers;
- line total and unit price conversion helpers;
- product line validation: zero quantity, zero price, missing package, price below cost;
- API payload building for save/submit;
- HTTP timeout and token refresh retry behavior;
- client order API client query contracts and request timeout propagation;
- workspace queued-document polling: refreshes queue metadata without reloading/opening the full document again.

## Automated API Checks

Run from `LeaderProductAPI`:

```powershell
npm run type-check
npm run test:unit
```

Covered:

- live 1C client requests for client order references and documents;
- request timeout to 1C;
- 1C DTO normalization for references, products, prices, stock and client orders;
- API route validation for list/detail/reference/product endpoints;
- local drafts plus 1C list metadata behavior at route level;
- queued order actions: unqueue, queued delete, queued cancel compatibility;
- copy route contract;
- schemas for client order payloads and filters.

## Manual E2E Checks

These require a real API, 1C extension and Android/web client:

- create draft offline, save on device, reconnect, verify it syncs to API;
- submit order to 1C, interrupt connection, verify queue state and retry behavior;
- open queued document, edit it, verify queue-position refresh does not overwrite local edits;
- copy local and 1C documents, verify manual prices stay manual and price-list prices refresh;
- pick organization and counterparty, verify defaults from 1C fill agreement, contract, warehouse, address and price type;
- search products with and without stock-only filter, verify stock/price/cost match selected warehouse and price type;
- verify 1C unavailable does not log out the user or reset an open document;
- verify real Android OTA/update flow and release APK startup.

## Current Boundary

The unit coverage protects the main contracts and pure business rules. It does not prove that the live 1C database returns correct business data, that the 1C extension compiles in every target base, or that all native UI gestures behave correctly on every Android device. Those remain integration/e2e checks.
