# Sentry Rollout Checklist

## Scope
- React Native + Expo runtime errors and key flow breadcrumbs.
- Fallback to local logger when DSN/package is missing.

## 1. Install and build
- Install package: `npx expo install @sentry/react-native`.
- Ensure native config steps are applied for Android/Web builds if required by current Expo SDK docs.
- Build a test artifact for Android and Web smoke.

## 2. Environment configuration
- Set `EXPO_PUBLIC_SENTRY_ENABLED=true` in production env.
- Set `EXPO_PUBLIC_SENTRY_DSN=<project_dsn>` in production env.
- Set `EXPO_PUBLIC_SENTRY_ENVIRONMENT=production` (or target stage).
- Optionally set `EXPO_PUBLIC_SENTRY_RELEASE=<app_version_or_build_id>`.
- Keep `EXPO_PUBLIC_SENTRY_ENABLED=false` for local/dev by default.
- Validate env contract: `npm run check:sentry-config`.

## 3. Runtime validation
- Trigger a handled exception and confirm event appears in Sentry.
- Trigger one unhandled JS exception and confirm global handler capture.
- Verify breadcrumbs for:
  - auth
  - http client
  - appeals outbox sync
  - tracking flow

## 4. Safety controls
- Keep runtime kill-switch: `EXPO_PUBLIC_SENTRY_ENABLED=false`.
- Do not block app startup if Sentry package is absent.
- Keep local logger capture active in all environments.

## 5. Release gate
- `npx tsc --noEmit` passes.
- Smoke flows pass on Android/Web/Web mobile:
  - login/logout
  - appeals list/detail/chat send
  - tracking start/stop
  - admin tabs open
