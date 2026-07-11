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
const expectedCodeRaw = String(args.versionCode || args._[1] || '').trim();
const expectedCode = Number.parseInt(expectedCodeRaw, 10);

if (expectedName && (!Number.isInteger(expectedCode) || expectedCode <= 0)) {
  throw new Error('Missing or invalid --versionCode');
}

const actual = readVersion();
const errors = [];

if (expectedName && actual.versionName !== expectedName) {
  errors.push(`app.version.json versionName is ${actual.versionName}, expected ${expectedName}`);
}

if (expectedName && actual.versionCode !== expectedCode) {
  errors.push(`app.version.json versionCode is ${actual.versionCode}, expected ${expectedCode}`);
}

if (String(actual.buildNumber) !== String(actual.versionCode)) {
  errors.push(`app.version.json iosBuildNumber is ${actual.buildNumber}, expected ${actual.versionCode}`);
}

if (actual.minSupportedVersionCode > actual.versionCode) {
  errors.push(
    `app.version.json minSupportedVersionCode is ${actual.minSupportedVersionCode}, greater than versionCode ${actual.versionCode}`
  );
}

if (errors.length) {
  console.error('Native version is not synchronized with release inputs.');
  console.error(errors.map((line) => `- ${line}`).join('\n'));
  console.error('\nRun before starting the APK workflow, then commit app.version.json:');
  console.error(`node ./scripts/setNativeVersion.js --versionName ${expectedName || actual.versionName} --versionCode ${expectedCode || actual.versionCode}`);
  process.exit(1);
}

console.log(`Native version OK: ${actual.versionName} (${actual.versionCode})`);
