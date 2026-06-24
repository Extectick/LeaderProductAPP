#!/usr/bin/env node
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
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

function sha256Base64Url(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('base64url');
}

function sha256Hex(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function contentTypeForExt(ext) {
  const normalized = String(ext || '').replace(/^\./, '').toLowerCase();
  if (normalized === 'hbc' || normalized === 'js') return 'application/javascript';
  if (normalized === 'json') return 'application/json';
  if (normalized === 'png') return 'image/png';
  if (normalized === 'jpg' || normalized === 'jpeg') return 'image/jpeg';
  if (normalized === 'webp') return 'image/webp';
  if (normalized === 'svg') return 'image/svg+xml';
  if (normalized === 'ttf') return 'font/ttf';
  if (normalized === 'otf') return 'font/otf';
  return 'application/octet-stream';
}

function normalizeRel(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function readExportMetadata(exportDir) {
  const metadataPath = path.join(exportDir, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    throw new Error(`Export metadata not found: ${metadataPath}`);
  }
  return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
}

function getRuntimeVersion(args) {
  const runtimeVersion = String(args.runtimeVersion || '').trim();
  if (runtimeVersion) return runtimeVersion;
  const appConfig = fs.readFileSync(path.resolve('app.config.ts'), 'utf8');
  const versionName = appConfig.match(/version:\s*["']([^"']+)["']/)?.[1];
  if (!versionName) throw new Error('Missing --runtimeVersion and cannot read app.config.ts version');
  return versionName;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const exportDir = path.resolve(args._[0] || args.exportDir || 'dist-ota');
  const outPath = path.resolve(args.out || 'release-artifacts/ota-metadata.json');
  const platform = String(args.platform || 'android').trim().toLowerCase();
  const channel = String(args.channel || process.env.EXPO_PUBLIC_UPDATE_CHANNEL || 'dev').trim();
  const runtimeVersion = getRuntimeVersion(args);
  const nativeVersion = readVersion();
  const releaseKey = String(
    args.updateId ||
      `${platform}-${channel}-${runtimeVersion}-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomBytes(4).toString('hex')}`
  );
  const updateId = String(args.uuid || crypto.randomUUID()).trim();
  const releaseNotes = String(args.releaseNotes || '').trim();
  const commitSha = String(args.commitSha || process.env.GITHUB_SHA || '').trim() || null;
  const rolloutPercent = Number(args.rolloutPercent || 100);
  const isActive = args.isActive === undefined ? true : String(args.isActive).toLowerCase() === 'true';

  const exportMetadata = readExportMetadata(exportDir);
  const platformMetadata = exportMetadata.fileMetadata?.[platform];
  if (!platformMetadata?.bundle) {
    throw new Error(`No bundle found for platform "${platform}" in ${exportDir}/metadata.json`);
  }

  const bundleRel = normalizeRel(platformMetadata.bundle);
  const bundlePath = path.join(exportDir, bundleRel);
  if (!fs.existsSync(bundlePath)) throw new Error(`Bundle not found: ${bundlePath}`);

  const baseKey = `${channel}/updates/ota/${platform}/${runtimeVersion}/${updateId}`;
  const bundleExt = path.extname(bundleRel) || '.hbc';
  const launchAssetKey = `${baseKey}/bundle${bundleExt}`;

  const assetByPath = new Map();
  for (const asset of platformMetadata.assets || []) {
    const rel = normalizeRel(asset.path);
    if (!rel || assetByPath.has(rel)) continue;
    const localPath = path.join(exportDir, rel);
    if (!fs.existsSync(localPath)) continue;
    const ext = asset.ext || path.extname(rel).replace(/^\./, '');
    const fileExtension = ext ? `.${String(ext).replace(/^\./, '')}` : path.extname(rel);
    assetByPath.set(rel, {
      localPath,
      key: `${baseKey}/${rel}`,
      hash: sha256Base64Url(localPath),
      hashHex: sha256Hex(localPath),
      contentType: contentTypeForExt(ext),
      fileExtension,
      size: fs.statSync(localPath).size,
    });
  }

  const manifestKey = `${baseKey}/manifest.json`;
  const metadata = {
    platform,
    channel,
    runtimeVersion,
    updateId,
    releaseKey,
    manifestKey,
    launchAssetKey,
    launchAssetHash: sha256Base64Url(bundlePath),
    launchAssetHashHex: sha256Hex(bundlePath),
    launchAssetType: contentTypeForExt(bundleExt),
    launchAssetLocalPath: bundlePath,
    assets: Array.from(assetByPath.values()),
    metadata: {
      commitSha,
      releaseKey,
      baseVersionName: nativeVersion.versionName,
      baseVersionCode: nativeVersion.versionCode,
      baseBuildNumber: nativeVersion.buildNumber,
      exportBundler: exportMetadata.bundler,
      exportVersion: exportMetadata.version,
    },
    rolloutPercent,
    isActive,
    commitSha,
    releaseNotes,
    createdAt: new Date().toISOString(),
    files: [
      {
        localPath: bundlePath,
        key: launchAssetKey,
        contentType: contentTypeForExt(bundleExt),
        size: fs.statSync(bundlePath).size,
      },
      ...Array.from(assetByPath.values()).map((asset) => ({
        localPath: asset.localPath,
        key: asset.key,
        contentType: asset.contentType,
        size: asset.size,
      })),
    ],
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(metadata, null, 2));
  console.log(`Created OTA metadata: ${outPath}`);
  console.log(JSON.stringify({
    updateId,
    releaseKey,
    runtimeVersion,
    channel,
    launchAssetKey,
    assets: metadata.assets.length,
  }, null, 2));
}

main();
