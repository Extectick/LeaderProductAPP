const path = require('node:path');
const fs = require('node:fs');
const { build } = require('../public-order/node_modules/esbuild');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist-order');
async function main() {
  fs.mkdirSync(output, { recursive: true });
  await build({ absWorkingDir: root, entryPoints: ['public-order/index.tsx'], bundle: true, minify: true,
    sourcemap: false, target: ['es2020'], outdir: path.join(output, 'assets'), entryNames: 'app',
    assetNames: '[name]-[hash]', loader: { '.png': 'file' }, define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'info' });
  fs.copyFileSync(path.join(root, 'public-order/index.html'), path.join(output, 'index.html'));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
