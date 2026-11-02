const fs = require('node:fs');
const assert = require('node:assert/strict');
async function main() {
  const id = process.env.SOURCE_RUN_ID;
  assert.match(id || '', /^\d+$/);
  const repo = process.env.GITHUB_REPOSITORY;
  const headers = { Authorization: 'Bearer ' + process.env.GH_TOKEN, Accept: 'application/vnd.github+json' };
  const api = async endpoint => {
    const r = await fetch('https://api.github.com/repos/' + repo + '/' + endpoint, { headers, signal: AbortSignal.timeout(30000) });
    assert.equal(r.status, 200, 'Cannot verify source workflow'); return r.json();
  };
  const run = await api('actions/runs/' + id);
  assert.equal(run.head_branch, process.env.GITHUB_REF_NAME, 'Cross-branch candidate forbidden');
  assert.ok(['push', 'workflow_dispatch'].includes(run.event), 'PR candidates forbidden');
  const kind = process.env.RELEASE_KIND;
  const expected = kind === 'apk' ? 'android-apk-release.yml' : 'publish-ota.yml';
  assert.equal(run.path, '.github/workflows/' + expected, 'Wrong source workflow');
  const jobs = await api('actions/runs/' + id + '/jobs?filter=all&per_page=100');
  assert.ok(jobs.jobs.some(job => job.name === (kind === 'apk' ? 'build-upload' : 'export-upload') && job.conclusion === 'success'), 'Candidate build must be successful');
  const comparison = await api('compare/' + run.head_sha + '...' + process.env.GITHUB_SHA);
  assert.ok(['ahead', 'identical'].includes(comparison.status), 'Candidate commit must be an ancestor');
  assert.ok(comparison.files.length < 300, 'Comparison too large');
  assert.ok(comparison.files.every(file => /^\.github\/workflows\//.test(file.filename)
    || /^scripts\/(publishServerRelease|validateReleaseCandidate|checkReleaseTarget|releaseTransfer(?:\.test)?|relocateOtaMetadata|resolveReleaseSource)\.js$/.test(file.filename)),
    'App/runtime changed since build; rebuild instead');
  fs.appendFileSync(process.env.GITHUB_ENV, 'RELEASE_COMMIT_SHA=' + run.head_sha + '\n');
  console.log('Verified successful ' + kind + ' build ' + id + ' at ' + run.head_sha);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
