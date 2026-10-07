// Synthetic stack only; never causes a crash on a user's device.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { TraceMap, eachMapping } = require('@jridgewell/trace-mapping');
const root = path.resolve(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(process.env.CRASH_CREDENTIAL_FILE || 'C:/ProgramData/LeaderProduct/GlitchTipDev/credentials.json'));
const backendUrl = process.env.CRASH_BACKEND_URL || cfg.sentryUrl;
const ingestBase = process.env.CRASH_INGEST_BASE || 'https://dev.leader-product.ru/sentry';
if (!['http://127.0.0.1:19010', 'http://127.0.0.1:19000'].includes(backendUrl)) throw Error('Private backend URL required');
if (!['http://127.0.0.1:19010', 'https://dev.leader-product.ru/sentry'].includes(ingestBase)) throw Error('Dev ingest URL required');
const version = JSON.parse(fs.readFileSync(path.join(root, 'app.version.json')));
const dsn = new URL(cfg.dsn);
if (dsn.hostname !== 'dev.leader-product.ru' || cfg.project !== 'leader-app-dev') throw Error('Dev guard failed');
async function main() {
  const eventId = process.argv[2] || crypto.randomBytes(16).toString('hex');
  if (!/^[a-f0-9]{32}$/.test(eventId)) throw Error('Invalid event ID');
  if (!process.argv[2]) {
    const map = JSON.parse(fs.readFileSync(path.join(root, 'android/app/build/generated/sourcemaps/react/release/index.android.bundle.map')));
    let frame;
    eachMapping(new TraceMap(map), mapping => {
      if (!frame && mapping.source?.replaceAll('\\', '/').endsWith('src/shared/monitoring/privacy.ts') && mapping.originalLine === 5) frame = mapping;
    });
    const debugId = map.debug_id || map.debugId;
    if (!frame || !debugId) throw Error('Matching source map required');
    const codeFile = 'app:///index.android.bundle';
    const event = {
      event_id: eventId, timestamp: Date.now() / 1000, platform: 'javascript', environment: 'development',
      release: `com.leaderproduct.app@${version.versionName}+${version.versionCode}`, dist: String(version.versionCode),
      level: 'error', tags: { qa_smoke: 'symbolication', app_version: version.versionName, build_number: String(version.versionCode) },
      exception: { values: [{ type: 'DevSymbolicationSmoke', value: 'Synthetic source-map verification; not a user crash',
        stacktrace: { frames: [{ filename: codeFile, abs_path: codeFile, lineno: frame.generatedLine, colno: frame.generatedColumn + 1, in_app: true }] } }] },
      debug_meta: { images: [{ type: 'sourcemap', code_file: codeFile, debug_id: debugId }] },
    };
    const response = await fetch(`${ingestBase}/api/${cfg.projectId}/envelope/`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-sentry-envelope', 'X-Sentry-Auth': `Sentry sentry_version=7,sentry_key=${dsn.username}` },
      body: [JSON.stringify({ event_id: eventId, dsn: cfg.dsn }), JSON.stringify({ type: 'event' }), JSON.stringify(event), ''].join('\n'),
      signal: AbortSignal.timeout(25000),
    });
    console.log(JSON.stringify({ eventId, ingestionStatus: response.status, debugId }));
    if (!response.ok) throw Error('Ingestion failed');
    return;
  }
  const response = await fetch(`${backendUrl}/api/0/projects/${cfg.organization}/${cfg.project}/events/${eventId}/`, {
    headers: { Authorization: `Bearer ${cfg.readToken}` }, signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw Error(`Event not ready: HTTP ${response.status}`);
  const event = await response.json();
  const frames = (event.entries || []).filter(e => e.type === 'exception').flatMap(e => e.data.values || []).flatMap(e => e.stacktrace?.frames || []);
  const readable = frames.find(f => f.filename?.replaceAll('\\', '/').endsWith('src/shared/monitoring/privacy.ts') && f.lineNo === 5);
  console.log(JSON.stringify({ eventId, symbolicated: Boolean(readable), frames: frames.map(f => ({ filename: f.filename, lineNo: f.lineNo, function: f.function })) }));
  if (!readable) throw Error('Expected original source frame missing');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
