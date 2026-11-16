# Navigation recovery for legacy production APK 0.1.38

The legacy application can receive server catalog entries for screens it does not
contain. Opening such a service and persisting it as the last route can trap the
user on the old not-found page across restarts. Its Home action used to restore
the same route; Back had no fallback when there was no navigation history.

The recovery actions now clear only the remembered service and navigate without
waiting for native storage. Late reads cannot reinstate the cleared route. Only
installed service roots are persisted; unavailable screens remain visibly disabled
with an update explanation in the catalog. Native dependencies, SDK57 and runtime
0.1.38 remain unchanged. This hotfix is isolated from the SDK58 production branch.

Validation: full unit suite, TypeScript, unchanged native configuration/lockfile,
OTA manifest and downloaded asset hashes, Hermes header comparison with APK37.
