// CI's original absolute paths are not valid on the release runner.
const fs = require('node:fs');
const path = require('node:path');
const filename = process.argv[2];
const metadata = JSON.parse(fs.readFileSync(filename));
function relocate(original) {
  const normalized = String(original).replaceAll('\\', '/');
  const index = normalized.lastIndexOf('/dist-ota/');
  const relative = index >= 0 ? normalized.slice(index + 1) : normalized;
  const absolute = path.resolve(relative);
  if (!absolute.startsWith(path.resolve('dist-ota') + path.sep) || !fs.existsSync(absolute)) throw Error('Invalid candidate asset path');
  return absolute;
}
metadata.launchAssetLocalPath = relocate(metadata.launchAssetLocalPath);
for (const file of metadata.files) file.localPath = relocate(file.localPath);
for (const asset of metadata.assets) if (asset.localPath) asset.localPath = relocate(asset.localPath);
fs.writeFileSync(filename, JSON.stringify(metadata, null, 2));
