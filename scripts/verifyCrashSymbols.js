// Sends an explicitly synthetic frame, never crashes a user's device.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { TraceMap, eachMapping } = require('@jridgewell/trace-mapping');

async function main() {
  const files = require('./crashSymbolFiles')(process.argv[2]);
  const map = JSON.parse(fs.readFileSync(files.map));
  let frame;
  eachMapping(new TraceMap(map), mapping => {
    if (!frame && mapping.source?.replaceAll('\\', '/').endsWith('src/shared/monitoring/privacy.ts')
      && mapping.originalLine >= 4) frame = mapping;
  });
  const debugId = map.debug_id || map.debugId;
  assert.ok(frame && debugId, 'Matching source frame and debug ID required');
  const dsn = new URL(process.env.EXPO_PUBLIC_SENTRY_DSN);
  assert.equal(dsn.hostname, 'api.leader-product.ru');
  const base = process.env.SENTRY_URL.replace(/\/$/, '');
  assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
  const id = crypto.randomBytes(16).toString('hex');
  const codeFile = 'app:///index.android.bundle';
  const event = {
    event_id: id, timestamp: Date.now() / 1000, platform: 'javascript', environment: 'production',
    release: process.env.EXPO_PUBLIC_SENTRY_RELEASE, dist: process.env.SENTRY_DIST, level: 'error',
    tags: { qa_smoke: 'synthetic-source-map-verification' },
    exception: { values: [{ type: 'ProductionSourceMapSmoke', value: 'Synthetic map verification; not a user crash',
      stacktrace: { frames: [{ filename: codeFile, abs_path: codeFile, lineno: frame.generatedLine, colno: frame.generatedColumn + 1, in_app: true }] } }] },
    debug_meta: { images: [{ type: 'sourcemap', code_file: codeFile, debug_id: debugId }] },
  };
  const response = await fetch(dsn.origin + '/sentry/api/' + dsn.pathname.split('/').pop() + '/envelope/', {
    method: 'POST', headers: { 'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': 'Sentry sentry_version=7,sentry_key=' + dsn.username },
    body: [JSON.stringify({ event_id: id, dsn: process.env.EXPO_PUBLIC_SENTRY_DSN }), JSON.stringify({ type: 'event' }), JSON.stringify(event), ''].join('\n'),
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 200, 'Production ingestion must work before release');
  const readUrl = base + '/api/0/projects/' + process.env.SENTRY_ORG + '/' + process.env.SENTRY_PROJECT + '/events/' + id + '/';
  for (let attempt = 0; attempt < 12; attempt++) {
    const result = await fetch(readUrl, { headers: { Authorization: 'Bearer ' + process.env.SENTRY_READ_TOKEN }, signal: AbortSignal.timeout(10000) });
    if (result.status === 200) {
      const detail = await result.json();
      const frames = (detail.entries || []).filter(e => e.type === 'exception').flatMap(e => e.data.values || []).flatMap(e => e.stacktrace?.frames || []);
      const readable = frames.find(f => f.filename?.replaceAll('\\', '/').endsWith('src/shared/monitoring/privacy.ts') && f.lineNo === frame.originalLine);
      if (readable) {
        console.log(JSON.stringify({ eventId: id, symbolicated: true, source: readable.filename, line: readable.lineNo, debugId }));
        return;
      }
    } else if (result.status !== 404) throw Error('Private diagnostic read failed: ' + result.status);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw Error('Original source frame did not resolve; OTA publication is blocked. Event: ' + id);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
