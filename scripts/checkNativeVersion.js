#!/usr/bin/env node
const { readVersion } = require('./readNativeVersion');

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
const expectedName = String(args.versionName || args.version || args._[0] || '').trim();
const expectedCode = Number.parseInt(String(args.versionCode || args._[1] || ''), 10);

if (!expectedName) throw new Error('Missing --versionName');
if (!Number.isInteger(expectedCode) || expectedCode <= 0) throw new Error('Missing or invalid --versionCode');

const actual = readVersion();
const errors = [];

if (actual.versionName !== expectedName) {
  errors.push(`app.config.ts version is ${actual.versionName}, expected ${expectedName}`);
}

if (actual.versionCode !== expectedCode) {
  errors.push(`app.config.ts android.versionCode is ${actual.versionCode}, expected ${expectedCode}`);
}

if (String(actual.buildNumber) !== String(expectedCode)) {
  errors.push(`app.config.ts ios.buildNumber is ${actual.buildNumber}, expected ${expectedCode}`);
}

if (errors.length) {
  console.error('Native version is not synchronized with release inputs.');
  console.error(errors.map((line) => `- ${line}`).join('\n'));
  console.error('\nRun before starting the APK workflow:');
  console.error(`node ./scripts/setNativeVersion.js --versionName ${expectedName} --versionCode ${expectedCode}`);
  process.exit(1);
}

console.log(`Native version OK: ${actual.versionName} (${actual.versionCode})`);
