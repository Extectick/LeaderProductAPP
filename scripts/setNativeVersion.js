#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

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
const appConfigPath = path.join(root, 'app.config.ts');
const gradlePath = path.join(root, 'android', 'app', 'build.gradle');

let appConfig = fs.readFileSync(appConfigPath, 'utf8');
appConfig = replaceOrThrow(
  appConfig,
  /version:\s*["'][^"']+["']/,
  `version: "${versionName}"`,
  'Expo version'
);
appConfig = replaceOrThrow(
  appConfig,
  /buildNumber:\s*["']\d+["']/,
  `buildNumber: "${versionCode}"`,
  'iOS buildNumber'
);
appConfig = replaceOrThrow(
  appConfig,
  /versionCode:\s*\d+/,
  `versionCode: ${versionCode}`,
  'Android versionCode'
);
fs.writeFileSync(appConfigPath, appConfig);

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

console.log(`Updated native version to ${versionName} (${versionCode})`);
