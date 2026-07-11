#!/usr/bin/env node
const path = require('node:path');
const fs = require('node:fs');
const { readVersion, writeVersion } = require('./versionConfig');

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

function replaceOrThrow(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`Cannot find ${label}`);
  }
  return source.replace(pattern, replacement);
}

const args = parseArgs(process.argv.slice(2));
const versionName = String(args.versionName || args.version || args._[0] || '').trim();
const versionCode = Number.parseInt(String(args.versionCode || args._[1] || ''), 10);

if (!versionName) {
  throw new Error('Missing --versionName or positional version name');
}
if (!Number.isInteger(versionCode) || versionCode <= 0) {
  throw new Error('Missing or invalid --versionCode or positional version code');
}

const root = process.cwd();
const gradlePath = path.join(root, 'android', 'app', 'build.gradle');

const current = readVersion(root);
const minSupportedVersionCode = args.minSupportedVersionCode
  ? Number.parseInt(String(args.minSupportedVersionCode), 10)
  : Math.min(current.minSupportedVersionCode, versionCode);

writeVersion(
  {
    versionName,
    versionCode,
    iosBuildNumber: String(versionCode),
    minSupportedVersionCode,
  },
  root
);

if (fs.existsSync(gradlePath)) {
  let gradle = fs.readFileSync(gradlePath, 'utf8');
  gradle = replaceOrThrow(
    gradle,
    /versionCode\s+\d+/,
    `versionCode ${versionCode}`,
    'Gradle versionCode'
  );
  gradle = replaceOrThrow(
    gradle,
    /versionName\s+["'][^"']+["']/,
    `versionName "${versionName}"`,
    'Gradle versionName'
  );
  fs.writeFileSync(gradlePath, gradle);
}

console.log(`Updated native version to ${versionName} (${versionCode})`);
