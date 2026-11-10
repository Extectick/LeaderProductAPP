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
test('production supports explicit disabled diagnostics with no credentials', () => {
  const prod = { ...dev, EXPO_PUBLIC_UPDATE_CHANNEL: 'prod' };
  const policy = createPolicy(prod);
  assert.equal(policy.sentryEnabled, false);
  validateCandidate('prod', sha, () => policy);
  assert.throws(() => validateCandidate('prod', sha, () => { throw new Error('missing'); }), /fresh candidate/);
  assert.throws(() => validateCandidate('prod', sha, () => ({ ...policy, sentryEnabled: true })));
  assert.throws(() => validateCandidate('prod', 'b'.repeat(40), () => policy));
  for (const key of ['EXPO_PUBLIC_SENTRY_DSN', 'SENTRY_AUTH_TOKEN', 'SENTRY_READ_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT']) {
    assert.throws(() => createPolicy({ ...prod, [key]: 'PRIVATE-SENTINEL' }), error => !String(error).includes('PRIVATE-SENTINEL'));
  }
});
test('enabled production candidates require an explicit matching policy', () => {
  const prod = { ...dev, EXPO_PUBLIC_UPDATE_CHANNEL: 'prod', EXPO_PUBLIC_SENTRY_ENABLED: 'true', SENTRY_AUTH_TOKEN: 'PRIVATE-SENTINEL' };
  const policy = createPolicy(prod);
  assert.equal(policy.sentryEnabled, true);
  assert.ok(!JSON.stringify(policy).includes('PRIVATE-SENTINEL'));
  validateCandidate('prod', sha, () => policy, true);
  assert.throws(() => validateCandidate('prod', sha, () => policy));
});
test('unknown release channels fail closed', () => {
  for (const channel of ['', undefined, 'production', 'deev']) assert.throws(() => validateChannel(channel));
});
