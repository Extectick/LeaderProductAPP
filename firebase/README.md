# Firebase and Expo Push Service

The API sends notifications through Expo Push Service. Android delivery uses FCM v1.

| Native variant | Android package | Firebase project | Local client configuration |
| --- | --- | --- | --- |
| Dev Client (`LEADER_DEV_CLIENT=1`) | `com.leaderproduct.app.dev` | `leaderproduct-dev` | `firebase/google-services.dev.json` |
| Main application | `com.leaderproduct.app` | `leaderproduct-prod` | `firebase/google-services.prod.json` |

Download the Android app configuration from the matching Firebase project. The files are ignored by Git. EAS can supply a file environment variable named `GOOGLE_SERVICES_JSON`; it overrides the local file. The app config validates that the file includes the selected Android package.

The API URL does not select the Firebase project: the native application identifier does. Changing Firebase configuration requires a native rebuild; Metro or an OTA update cannot add it to an installed APK.

Register the FCM v1 service-account key in the matching Android application identifier under the Expo project's credentials. This private key is a server credential and must never be placed in the APK, `EXPO_PUBLIC_*`, app config, or Git. Prefer a dedicated service account with the Firebase Cloud Messaging API Admin role.

The EAS project ID and `google-services.json` are different settings; both are required for Expo Android push. A successful Expo ticket confirms acceptance by Expo; an Expo receipt confirms the downstream FCM handoff, not display or reading on the phone.
