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

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const raw = String(value).trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function asNumber(value, label) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`Invalid ${label}`);
  }
  return num;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const metadataPath = args._[0] || args.metadata;
  if (!metadataPath) {
    throw new Error('Usage: npm run updates:publish-local -- <release-metadata.json> [--api-url URL] [--token JWT]');
  }

  loadDotEnv(path.join(process.cwd(), '.env'));

  const metadata = JSON.parse(fs.readFileSync(path.resolve(metadataPath), 'utf8'));
  const channel = String(args.channel || metadata.channel || 'dev').trim();
  const apiUrl =
    args['api-url'] ||
    process.env.LEADER_PRODUCT_API_URL ||
    process.env.UPDATE_PUBLISH_API_URL ||
    (channel === 'prod' ? 'http://api.leader-product.ru' : process.env.EXPO_PUBLIC_API_URL_DEV);

  if (!apiUrl) {
    throw new Error('Missing API URL. Pass --api-url or set LEADER_PRODUCT_API_URL.');
  }

  const token =
    args.token ||
    process.env.LEADER_PRODUCT_ACCESS_TOKEN ||
    process.env.UPDATE_PUBLISH_BEARER_TOKEN;

  if (!token) {
    throw new Error('Missing bearer token. Pass --token or set LEADER_PRODUCT_ACCESS_TOKEN.');
  }

  const payload = {
    platform: 'android',
    channel,
    versionCode: asNumber(args.versionCode ?? metadata.versionCode, 'versionCode'),
    versionName: String(args.versionName ?? metadata.versionName ?? '').trim(),
    minSupportedVersionCode: asNumber(
      args.minSupportedVersionCode ?? metadata.minSupportedVersionCode ?? metadata.versionCode,
      'minSupportedVersionCode'
    ),
    isMandatory: asBool(args.isMandatory ?? metadata.isMandatory, false),
    rolloutPercent: asNumber(args.rolloutPercent ?? metadata.rolloutPercent ?? 100, 'rolloutPercent'),
    isActive: asBool(args.isActive ?? metadata.isActive, true),
    releaseNotes: String(args.releaseNotes ?? metadata.releaseNotes ?? '').trim() || null,
    apkKey: String(metadata.apkKey || '').trim(),
    fileSize: metadata.fileSize ?? null,
    checksum: metadata.checksum ?? metadata.sha256 ?? null,
    checksumMd5: metadata.checksumMd5 ?? metadata.md5 ?? null,
  };

  if (!payload.versionName) throw new Error('Missing versionName');
  if (!payload.apkKey) throw new Error('Missing apkKey in metadata');

  const normalizedApiUrl = String(apiUrl).replace(/\/+$/, '');
  const endpoint = `${normalizedApiUrl}/updates`;

  console.log('Publishing AppUpdate:');
  console.log(JSON.stringify({ ...payload, apiUrl: normalizedApiUrl }, null, 2));

  if (args['dry-run'] === 'true') {
    console.log('Dry run: not sending request.');
    return;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    console.error(data);
    throw new Error(`Publish failed: HTTP ${response.status}`);
  }

  console.log('AppUpdate published:');
  console.log(JSON.stringify(data, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
