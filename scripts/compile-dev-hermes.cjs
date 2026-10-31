// Precompile an offline Metro dev bundle without disabling __DEV__ or changing its environment.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

const [input, output] = process.argv.slice(2);
if (!input || input === '--help') {
  console.log('Usage: node scripts/compile-dev-hermes.cjs <metro-dev.bundle> [output.hbc]');
  process.exit(input ? 0 : 1);
}
const source = path.resolve(input), target = path.resolve(output || `${input}.hbc`);
if (source === target) throw new Error('Use a separate output path to preserve the source bundle');
if (!/__DEV__\s*=\s*true\b/.test(fs.readFileSync(source, 'utf8'))) throw new Error('Expected a Metro dev bundle with __DEV__ enabled');
const platform = { win32: 'win64-bin', darwin: 'osx-bin', linux: 'linux64-bin' }[process.platform];
if (!platform) throw new Error(`Unsupported compiler platform: ${process.platform}`);
const compilerRoot = path.dirname(require.resolve('hermes-compiler/package.json'));
const compiler = path.join(compilerRoot, 'hermesc', platform, process.platform === 'win32' ? 'hermesc.exe' : 'hermesc');
fs.mkdirSync(path.dirname(target), { recursive: true });
const result = spawnSync(compiler, ['-O', '-emit-binary', '-out', target, source], { stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
const bytes = fs.readFileSync(target);
const metadata = { format: 'hermes-bytecode', dev: true, compilerVersion: require('hermes-compiler/package.json').version, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
fs.writeFileSync(`${target}.gz`, zlib.gzipSync(bytes));
fs.writeFileSync(`${target}.json`, JSON.stringify(metadata, null, 2) + '\n');
console.log(JSON.stringify({ ...metadata, output: target }));
