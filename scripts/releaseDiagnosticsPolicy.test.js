const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPolicy, validateChannel, validateCandidate } = require('./releaseDiagnosticsPolicy');
const sha = 'a'.repeat(40);
const dev = { EXPO_PUBLIC_UPDATE_CHANNEL: 'dev', EXPO_PUBLIC_SENTRY_ENABLED: 'false', GITHUB_SHA: sha };

test('dev records disabled diagnostics bound to the exported commit', () => {
  const policy = createPolicy(dev);
  assert.equal(policy.sentryEnabled, false);
  validateCandidate('dev', sha, () => policy);
});
test('dev rejects enabled SDK or any retained upload credentials without exposing their values', () => {
  assert.throws(() => createPolicy({ ...dev, EXPO_PUBLIC_SENTRY_ENABLED: 'true' }));
  for (const key of ['EXPO_PUBLIC_SENTRY_DSN', 'SENTRY_AUTH_TOKEN', 'SENTRY_READ_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT']) {
    assert.throws(() => createPolicy({ ...dev, [key]: 'PRIVATE-SENTINEL' }), error => !String(error).includes('PRIVATE-SENTINEL'));
  }
});
test('retry rejects missing, enabled, or wrong-commit dev candidates', () => {
  assert.throws(() => validateCandidate('dev', sha, () => { throw new Error('missing'); }), /fresh candidate/);
  assert.throws(() => validateCandidate('dev', sha, () => ({ ...createPolicy(dev), sentryEnabled: true })));
  assert.throws(() => validateCandidate('dev', 'b'.repeat(40), () => createPolicy(dev)));
});
test('production remains enabled and supports older candidates with existing symbol checks', () => {
  const prod = { ...dev, EXPO_PUBLIC_UPDATE_CHANNEL: 'prod', EXPO_PUBLIC_SENTRY_ENABLED: 'true', SENTRY_AUTH_TOKEN: 'PRIVATE-SENTINEL' };
  assert.equal(createPolicy(prod).sentryEnabled, true);
  assert.ok(!JSON.stringify(createPolicy(prod)).includes('PRIVATE-SENTINEL'));
  assert.throws(() => createPolicy({ ...prod, EXPO_PUBLIC_SENTRY_ENABLED: 'false' }));
  validateCandidate('prod', sha, () => { throw new Error('must not read legacy policy'); });
});
test('unknown release channels fail closed', () => {
  for (const channel of ['', undefined, 'production', 'deev']) assert.throws(() => validateChannel(channel));
});
