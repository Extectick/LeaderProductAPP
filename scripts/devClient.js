const path = require('node:path');
const { spawn } = require('node:child_process');

// Explicit environment keeps Metro and native prebuild on the same dev API.
// This entry is for the separately installed development client, not OTA.
const env = {
  ...process.env,
  LEADER_DEV_CLIENT: '1',
  NODE_ENV: 'development',
  EXPO_PUBLIC_UPDATE_CHANNEL: 'dev',
  EXPO_PUBLIC_API_URL_DEV: process.env.LEADER_DEV_API_URL || 'https://dev.leader-product.ru',
  EXPO_PUBLIC_OTA_UPDATE_URL: '',
};
const action = process.argv[2] || 'start';
if (!['start', 'prebuild'].includes(action)) throw new Error('Use start or prebuild');
const args = action === 'start'
  ? ['start', '--dev-client', '--scheme', 'leaderproduct-dev', '--host', 'lan', '--port', '8081', ...process.argv.slice(3)]
  : ['prebuild', '--platform', 'android', '--no-install', ...process.argv.slice(3)];
const child = spawn(process.execPath, [require.resolve('expo/bin/cli'), ...args], {
  cwd: path.resolve(__dirname, '..'), env, stdio: 'inherit', windowsHide: true,
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
