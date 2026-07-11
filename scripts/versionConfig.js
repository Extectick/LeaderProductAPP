#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const VERSION_FILE = 'app.version.json';

function getRoot() {
  return process.cwd();
}

function getVersionPath(root = getRoot()) {
  return path.join(root, VERSION_FILE);
}

function assertVersionConfig(config) {
  const errors = [];
  const versionName = String(config.versionName || '').trim();
  const versionCode = Number(config.versionCode);
  const iosBuildNumber = String(config.iosBuildNumber || versionCode || '').trim();
  const minSupportedVersionCode =
    config.minSupportedVersionCode === undefined || config.minSupportedVersionCode === null
      ? versionCode
      : Number(config.minSupportedVersionCode);

  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(versionName)) {
    errors.push('versionName must look like 0.1.20');
  }
  if (!Number.isInteger(versionCode) || versionCode <= 0) {
    errors.push('versionCode must be a positive integer');
  }
  if (!/^\d+$/.test(iosBuildNumber)) {
    errors.push('iosBuildNumber must be a positive integer string');
  }
  if (!Number.isInteger(minSupportedVersionCode) || minSupportedVersionCode <= 0) {
    errors.push('minSupportedVersionCode must be a positive integer');
  }
  if (Number.isInteger(versionCode) && Number.isInteger(minSupportedVersionCode) && minSupportedVersionCode > versionCode) {
    errors.push('minSupportedVersionCode must not be greater than versionCode');
  }

  if (errors.length) {
    throw new Error(`Invalid ${VERSION_FILE}:\n${errors.map((line) => `- ${line}`).join('\n')}`);
  }

  return {
    versionName,
    versionCode,
    iosBuildNumber,
    minSupportedVersionCode,
  };
}

function readVersion(root = getRoot()) {
  const filePath = getVersionPath(root);
  const raw = fs.readFileSync(filePath, 'utf8');
  return assertVersionConfig(JSON.parse(raw));
}

function writeVersion(next, root = getRoot()) {
  const filePath = getVersionPath(root);
  const normalized = assertVersionConfig(next);
  fs.writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}

function parseVersionName(versionName) {
  const match = String(versionName || '').trim().match(/^(\d+)\.(\d+)\.(\d+)(.*)$/);
  if (!match) throw new Error(`Unsupported versionName: ${versionName}`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    suffix: match[4] || '',
  };
}

function bumpVersionName(versionName, level = 'patch') {
  const current = parseVersionName(versionName);
  if (level === 'major') {
    return `${current.major + 1}.0.0`;
  }
  if (level === 'minor') {
    return `${current.major}.${current.minor + 1}.0`;
  }
  if (level === 'patch') {
    return `${current.major}.${current.minor}.${current.patch + 1}`;
  }
  throw new Error(`Unsupported bump level: ${level}`);
}

module.exports = {
  VERSION_FILE,
  assertVersionConfig,
  bumpVersionName,
  getVersionPath,
  readVersion,
  writeVersion,
};
