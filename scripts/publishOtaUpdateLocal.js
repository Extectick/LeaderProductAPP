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
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const metadataPath = args._[0] || args.metadata;
  if (!metadataPath) {
    throw new Error('Usage: npm run ota:publish-local -- <ota-metadata.json> [--api-url URL] [--token JWT]');
  }

  loadDotEnv(path.join(process.cwd(), '.env'));

  const metadata = JSON.parse(fs.readFileSync(path.resolve(metadataPath), 'utf8'));
  const apiUrl =
    args['api-url'] ||
    process.env.LEADER_PRODUCT_API_URL ||
    process.env.OTA_PUBLISH_API_URL ||
    (metadata.channel === 'prod' ? 'https://api.leader-product.ru' : process.env.EXPO_PUBLIC_API_URL_DEV);
  const token = args.token || process.env.LEADER_PRODUCT_ACCESS_TOKEN || process.env.OTA_PUBLISH_BEARER_TOKEN;

  if (!apiUrl) throw new Error('Missing API URL');
  if (!token) throw new Error('Missing bearer token');

  const payload = {
    platform: metadata.platform,
    channel: metadata.channel,
    runtimeVersion: metadata.runtimeVersion,
    updateId: metadata.updateId,
    manifestKey: metadata.manifestKey,
    launchAssetKey: metadata.launchAssetKey,
    launchAssetHash: metadata.launchAssetHash,
    launchAssetType: metadata.launchAssetType,
    assets: metadata.assets,
    metadata: metadata.metadata,
    otaSequence: metadata.otaSequence,
    displayVersion: metadata.displayVersion,
    isActive: metadata.isActive,
    rolloutPercent: metadata.rolloutPercent,
    commitSha: metadata.commitSha,
    releaseNotes: metadata.releaseNotes,
  };

  const endpoint = `${String(apiUrl).replace(/\/+$/, '')}/ota/publish`;
  console.log(`Publishing OTA metadata to ${endpoint}`);

  if (args.dryRun === 'true' || args['dry-run'] === 'true') {
    console.log(JSON.stringify(payload, null, 2));
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
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    console.error(data);
    throw new Error(`Publish failed: HTTP ${response.status}`);
  }
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(`Published OTA metadata: HTTP ${response.status}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
