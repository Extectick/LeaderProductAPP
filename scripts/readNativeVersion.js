#!/usr/bin/env node
const { readVersion: readVersionConfig } = require('./versionConfig');

function readVersion() {
  const version = readVersionConfig();
  return {
    ...version,
    buildNumber: version.iosBuildNumber,
  };
}

if (require.main === module) {
  const version = readVersion();
  console.log(JSON.stringify(version, null, 2));
}

module.exports = { readVersion };
