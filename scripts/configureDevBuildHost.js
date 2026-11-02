const fs = require('node:fs');
if (process.env.EXPO_PUBLIC_UPDATE_CHANNEL === 'dev' && process.env.EXPO_PUBLIC_SENTRY_DSN) {
  const dsn = new URL(process.env.EXPO_PUBLIC_SENTRY_DSN);
  if (dsn.hostname === 'dev.leader-product.ru') {
    dsn.hostname = 'dev.lidprod.ru';
    const value = dsn.toString();
    console.log('::add-mask::' + value);
    if (!process.env.GITHUB_ENV) throw new Error('GITHUB_ENV is required');
    fs.appendFileSync(process.env.GITHUB_ENV, 'EXPO_PUBLIC_SENTRY_DSN=' + value + '\n');
  }
}
