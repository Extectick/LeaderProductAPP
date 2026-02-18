# LeaderProductAPP

Expo Router application for Android/Web/Web-mobile with services:
- Appeals (chat/workflow)
- QR codes + analytics
- Tracking (background location)
- Admin panel

## Stack
- React 19
- React Native 0.81
- Expo SDK 54
- TypeScript (strict)
- expo-router

## Scripts
- `npm run start`
- `npm run android`
- `npm run ios`
- `npm run web`
- `npm run build:web`

## Local setup
1. Install dependencies: `npm install`
2. Configure env (copy from `.env.example`)
3. Run `npm run start`

## Baseline quality gates
- Type check: `npx tsc --noEmit`
- Non-blocking CI check: `.github/workflows/quality-check.yml`

## Manual smoke checklist
1. Auth:
   - login/logout
   - token refresh scenario (401 recovery)
2. Appeals:
   - list -> detail navigation
   - send message
   - websocket updates
3. Tracking:
   - start/stop tracking
   - route sync after reconnect
4. Admin:
   - tabs open/render
5. Web layout:
   - desktop + mobile width breakpoints

## Notes
- `app/` stays router-only entry layer.
- `src/shared/*` contains cross-domain infrastructure.
- `*.web.tsx` screens are intentionally preserved.

