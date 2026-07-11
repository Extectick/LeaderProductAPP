#!/usr/bin/env node
const { execFileSync } = require('node:child_process');
const { VERSION_FILE } = require('./versionConfig');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) {
      args._.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function git(args, options = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', options.allowFailure ? 'ignore' : 'pipe'],
  }).trim();
}

function safeGit(args) {
  try {
    return git(args, { allowFailure: true });
  } catch {
    return '';
  }
}

function normalizeSha(value) {
  const sha = String(value || '').trim();
  if (!sha || /^0{40}$/.test(sha)) return '';
  return sha;
}

function listChangedFiles(base, head) {
  const cleanHead = normalizeSha(head) || 'HEAD';
  const cleanBase = normalizeSha(base);
  const range = cleanBase ? [`${cleanBase}..${cleanHead}`] : [`${cleanHead}~1..${cleanHead}`];
  const output = safeGit(['diff', '--name-only', ...range]);
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function readVersionAt(ref) {
  const cleanRef = normalizeSha(ref);
  if (!cleanRef) return null;
  const raw = safeGit(['show', `${cleanRef}:${VERSION_FILE}`]);
  if (!raw) return readLegacyExpoVersionAt(cleanRef);
  try {
    return JSON.parse(raw);
  } catch {
    return readLegacyExpoVersionAt(cleanRef);
  }
}

function readLegacyExpoVersionAt(ref) {
  const cleanRef = normalizeSha(ref);
  if (!cleanRef) return null;
  const raw = safeGit(['show', `${cleanRef}:app.config.ts`]);
  if (!raw) return null;
  const versionName = raw.match(/version:\s*["']([^"']+)["']/)?.[1];
  const versionCodeRaw = raw.match(/versionCode:\s*(\d+)/)?.[1];
  const versionCode = Number.parseInt(String(versionCodeRaw || ''), 10);
  if (!versionName || !Number.isInteger(versionCode)) return null;
  return { versionName, versionCode };
}

function isNativeReleaseFile(file) {
  if (file === VERSION_FILE) return true;
  if (file === 'app.config.ts' || file === 'package.json' || file === 'package-lock.json') return true;
  if (file === 'scripts/patchExpoTaskManager.js') return true;
  if (file.startsWith('android/') || file.startsWith('ios/')) return true;
  if (file.startsWith('plugins/')) return true;
  return false;
}

function hasNativeRuntimeChange(files) {
  return files.some(isNativeReleaseFile);
}

function hasVersionBump(base, head) {
  const before = readVersionAt(base);
  const after = readVersionAt(head) || readVersionAt('HEAD');
  if (!before || !after) return false;
  const beforeCode = Number(before.versionCode);
  const afterCode = Number(after.versionCode);
  const beforeName = String(before.versionName || '');
  const afterName = String(after.versionName || '');
  return Number.isFinite(beforeCode) && Number.isFinite(afterCode) && afterCode > beforeCode && afterName !== beforeName;
}

function writeOutput(values) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  const fs = require('node:fs');
  fs.appendFileSync(
    outputPath,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n'
  );
}

const args = parseArgs(process.argv.slice(2));
const mode = String(args.mode || 'ota').trim();
const eventName = process.env.GITHUB_EVENT_NAME || '';
const base = args.base || process.env.GITHUB_EVENT_BEFORE || '';
const head = args.head || process.env.GITHUB_SHA || 'HEAD';
const files = listChangedFiles(base, head);
const nativeRequired = eventName === 'workflow_dispatch' && mode === 'apk'
  ? true
  : hasNativeRuntimeChange(files);
const versionBumped = hasVersionBump(base, head);

writeOutput({
  native_required: nativeRequired ? 'true' : 'false',
  version_bumped: versionBumped ? 'true' : 'false',
  apk_required: mode === 'apk' && nativeRequired ? 'true' : 'false',
});

console.log(`Release strategy check: mode=${mode}`);
console.log(`Changed files (${files.length}):`);
for (const file of files) console.log(`- ${file}`);
console.log(`nativeRequired=${nativeRequired}`);
console.log(`versionBumped=${versionBumped}`);

if (mode === 'ota' && nativeRequired && !versionBumped) {
  console.error('');
  console.error('Native runtime changes detected, but app.version.json was not bumped.');
  console.error('OTA alone is unsafe because installed APKs will not contain the new native code.');
  console.error('');
  console.error('Fix: run `npm run release:bump-apk`, commit app.version.json, then push again.');
  process.exit(1);
}

if (mode === 'apk' && nativeRequired && eventName !== 'workflow_dispatch' && !versionBumped) {
  console.error('');
  console.error('APK release is required, but app.version.json was not bumped.');
  console.error('Fix: run `npm run release:bump-apk`, commit app.version.json, then push again.');
  process.exit(1);
}

if (mode === 'apk' && !nativeRequired) {
  console.log('No native runtime changes detected. APK build is not required.');
}
