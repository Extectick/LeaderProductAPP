const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = 'release-artifacts/diagnostics-policy.json';

function validateChannel(channel) {
  assert.ok(['dev', 'prod'].includes(channel), 'Unknown release channel');
}

function createPolicy(env) {
  const channel = env.EXPO_PUBLIC_UPDATE_CHANNEL;
  validateChannel(channel);
  const enabled = env.EXPO_PUBLIC_SENTRY_ENABLED;
  assert.equal(enabled, channel === 'dev' ? 'false' : 'true', 'Release diagnostics policy mismatch');
  if (channel === 'dev') {
    for (const key of ['EXPO_PUBLIC_SENTRY_DSN', 'SENTRY_AUTH_TOKEN', 'SENTRY_READ_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT']) {
      assert.ok(!env[key], 'Dev diagnostics credentials must be empty');
    }
  }
  assert.match(env.GITHUB_SHA || '', /^[a-f0-9]{40}$/);
  return { version: 1, channel, sentryEnabled: enabled === 'true', commitSha: env.GITHUB_SHA };
}

function validateCandidate(channel, commitSha, read = () => JSON.parse(fs.readFileSync(path, 'utf8'))) {
  validateChannel(channel);
  // Old production candidates retain their existing mandatory symbol verification.
  if (channel === 'prod') return;
  let policy;
  try { policy = read(); } catch { throw new Error('Dev candidate has no diagnostics policy; export a fresh candidate'); }
  assert.deepEqual(policy, { version: 1, channel: 'dev', sentryEnabled: false, commitSha },
    'Dev candidate was built with a different diagnostics policy; export a fresh candidate');
}

if (require.main === module) {
  assert.equal(process.argv[2], 'record');
  const policy = createPolicy(process.env);
  fs.mkdirSync('release-artifacts', { recursive: true });
  fs.writeFileSync(path, JSON.stringify(policy, null, 2) + '\n');
  console.log('Release diagnostics policy recorded: ' + policy.channel);
}
module.exports = { validateChannel, createPolicy, validateCandidate };
