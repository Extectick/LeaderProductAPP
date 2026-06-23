#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

function readVersion() {
  const root = process.cwd();
  const appConfigPath = path.join(root, 'app.config.ts');
  const source = fs.readFileSync(appConfigPath, 'utf8');

  const versionName = source.match(/version:\s*["']([^"']+)["']/)?.[1];
  const versionCodeRaw = source.match(/versionCode:\s*(\d+)/)?.[1];
  const buildNumber = source.match(/buildNumber:\s*["'](\d+)["']/)?.[1];

  if (!versionName) throw new Error('Cannot find Expo version in app.config.ts');
  if (!versionCodeRaw) throw new Error('Cannot find Android versionCode in app.config.ts');
  if (!buildNumber) throw new Error('Cannot find iOS buildNumber in app.config.ts');

  const versionCode = Number.parseInt(versionCodeRaw, 10);
  return { versionName, versionCode, buildNumber };
}

if (require.main === module) {
  const version = readVersion();
  console.log(JSON.stringify(version, null, 2));
}

module.exports = { readVersion };
