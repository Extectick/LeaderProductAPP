#!/usr/bin/env node
const { bumpVersionName, readVersion, writeVersion } = require('./versionConfig');

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

const args = parseArgs(process.argv.slice(2));
const level = String(args.level || args._[0] || 'patch').trim();
const current = readVersion();
const nextVersionCode = Number(args.versionCode || current.versionCode + 1);
const nextVersionName = String(args.versionName || bumpVersionName(current.versionName, level)).trim();
const minSupportedVersionCode = args.minSupportedVersionCode
  ? Number(args.minSupportedVersionCode)
  : current.minSupportedVersionCode;

const next = writeVersion({
  versionName: nextVersionName,
  versionCode: nextVersionCode,
  iosBuildNumber: String(nextVersionCode),
  minSupportedVersionCode,
});

console.log(`Native version bumped: ${current.versionName} (${current.versionCode}) -> ${next.versionName} (${next.versionCode})`);
console.log('Commit app.version.json before releasing an APK.');
