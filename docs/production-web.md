# Production web application

`https://app.lidprod.ru` serves the standalone Expo web export from the production
APP source. Its API is `https://api.lidprod.ru`. The development Metro site remains
`https://app.dev.lidprod.ru`; do not point the production domain at Metro.

## Build

Use Node 24 and the committed npm lockfile from the intended production commit.
Run `npm ci` in an isolated checkout. Do not copy API secrets or a development
`.env` into the web build. Set these public build settings explicitly:

```sh
export NODE_ENV=production EXPO_NO_DOTENV=1 EXPO_OFFLINE=1 CI=1
export EXPO_PUBLIC_API_URL_DEV=https://api.lidprod.ru
export EXPO_PUBLIC_UPDATE_CHANNEL=prod
export EXPO_PUBLIC_OTA_UPDATE_URL=https://api.lidprod.ru/ota/update
export EXPO_PUBLIC_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
export EXPO_PUBLIC_SENTRY_ENABLED=false EXPO_PUBLIC_SENTRY_DSN=''
export SENTRY_AUTH_TOKEN='' SENTRY_READ_TOKEN='' SENTRY_ORG='' SENTRY_PROJECT=''
export SENTRY_DISABLE_AUTO_UPLOAD=true SENTRY_DISABLE_NATIVE_DEBUG_UPLOAD=true
# Set EXPO_PUBLIC_TELEGRAM_BOT_USERNAME and EXPO_PUBLIC_MAX_BOT_USERNAME to the
# public bot usernames used by production. Never pass bot tokens to the frontend.
node scripts/createAdminGitCatalog.cjs
npx expo export --platform web --max-workers 2 --output-dir dist
```

The Help service's display label is `ИИ ассистент` and uses `HelpAiIcon`, shared
with the ticket list. The client normalizes this label/icon even when an older API
or cache returns `Помощь`; service IDs, route, visibility and access rules stay intact.

## Hosting

On host126, immutable exports live in `/opt/leader-api-prod/releases/app-web/`.
The `current` symlink selects one export. The existing Nginx release mount exposes
that directory at `/var/www/releases/app-web/`; no API image or Metro process is
involved. Install `deploy/web/app.lidprod.ru.conf` as the separate virtual host
`/opt/leader-api-prod/nginx-tls/app-prod.conf`. Validate with `nginx -t` before a
graceful reload. Never replace the API Nginx base configuration.

Copy a verified export to a new versioned directory, then atomically replace only
`app-web/current`. Retain the previous target for rollback. HTML is not cached;
hashed Expo assets are immutable. Direct routes fall back to `index.html`, while
missing assets return 404. Keep old hashed assets available when releasing over
an existing site whose users may still have a previous HTML document open.

The `app.lidprod.ru` certificate uses the existing ACME webroot and certificate
store under `/opt/leader-api-prod/`. The existing
`leader-api-prod-cert-renew.timer` runs renewal for the entire store and reloads
Nginx. Do not create a competing renewal job.

Check HTTPS, the sign-in page, direct navigation, asset MIME types and browser
requests to the prod API after deployment. Web publication does not publish an
Android APK or OTA update. Workflow-only/source commits can use `[skip ci]` when
only this manually verified web export is being activated.
