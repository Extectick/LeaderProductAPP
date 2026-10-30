# Expo Push Service

Configured on 2026-10-30. The API sends through Expo; Android delivery uses FCM v1.

| Variant | Android package | Firebase project |
| --- | --- | --- |
| Dev Client | `com.leaderproduct.app.dev` | `leaderproduct-dev` |
| Main application | `com.leaderproduct.app` | `leaderproduct-prod` |

Both projects use Spark. Dedicated `expo-push` service accounts have `roles/firebasecloudmessaging.admin`; separate keys are assigned to the matching application identifiers in Expo credentials. Service-account private keys must not be bundled or committed.

Local client files are `firebase/google-services.dev.json` and `firebase/google-services.prod.json` (ignored). EAS project file variable `GOOGLE_SERVICES_JSON` is configured for development (dev), preview and production (main). GitHub Actions restores the main config from `FIREBASE_ANDROID_CONFIG_PROD` before prebuild and validates the Android package. API URL selection does not change the native application identifier or Firebase project.

Native changes require rebuilding the APK. Metro and OTA alone cannot add Firebase resources to an installed APK. The local Dev Client build command is:

```powershell
./scripts/build-dev-client.ps1 -Architectures 'arm64-v8a,x86_64'
```

The Windows Gradle init file bounds Ninja workers and uses response files for long native compiler commands. The APK is copied to `dev-builds/development-client/leader-product-dev-client.apk`. This is a Dev Client: JavaScript is loaded from Metro (`npm run start:dev-client`).

Dev Client uses `most-recent` launch mode so opening a system notification restores the last Metro project. The local config plugin also repairs the stale Android launcher flag left by an incremental prebuild from `launcher` mode.

Push registration is account-scoped, retries transient failures with a bounded budget, reacts to foreground and native token rotation, and updates Help presence after the Expo token changes. Registration and logout writes are serialized to prevent binding a previous account's token to a new session.

The dev API runs the persisted assistant simulator in a separate worker. A completed answer becomes a normal Help message. Active-chat and displayed-banner acknowledgements suppress the system push for that device; otherwise the delivery worker uses Expo. Tapping a push restores the exact ticket/message target after authentication.

For Android background-delivery QA, leave the app with Home or remove its task. To test process death, kill the background process without setting the package's force-stop flag. Android force-stop explicitly disables background delivery until the user launches the application again.

An Expo ticket confirms acceptance by Expo. A downstream receipt confirms FCM handoff; actual display and navigation require a device check. Do not log tokens, service-account JSON, or raw authentication-account JSON.

## Device verification

On the Android API 36 emulator, ticket #11 was submitted at 2026-10-30 13:59:15 UTC. The app process was terminated while the server job was pending. The worker completed the four stages at 14:04:16 UTC, generated message #38/event #61, and Expo accepted delivery at 14:04:23 UTC. Android displayed the actual system notification with the assistant's answer. This verifies server-side execution and OS delivery independently of the app process.

Cold-start navigation was rechecked on the rebuilt APK by replaying the same completed message through Expo, starting outside the chat and terminating the app process. Tapping the system notification opened ticket #11 with the completed answer. Dev Client must restore its Metro project; navigation waits for the authenticated profile and preserves a cold-start response until the current binding accepts it. Two new regression cases cover profile restoration and disposed asynchronous bindings; eight new registration/presence cases and TypeScript also passed.
