// Trusted release runner only. No SSH key, API token or credentials are required.
const http = require('node:http');
const HEALTH_URL = 'http://127.0.0.1:19001/_health/';
const RECOVERY = 'Verify LeaderProduct-Sentry-DevTunnel on Windows244 and the pinned host126 SSH key. Keep StrictHostKeyChecking enabled. After restoring the tunnel, retry the failed publication of the existing candidate.';
function checkReleaseDiagnostics(url = HEALTH_URL, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, response => {
      response.resume();
      if (response.statusCode === 200) resolve();
      else reject(new Error(`Release diagnostics returned HTTP ${response.statusCode}. ${RECOVERY}`));
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('DIAGNOSTIC_TIMEOUT')));
    request.on('error', () => reject(new Error(`Release diagnostics is unavailable on the trusted runner. ${RECOVERY}`)));
  });
}
if (require.main === module) checkReleaseDiagnostics().then(() => console.log('Private release diagnostics is healthy.')).catch(error => {
  console.error(error.message); process.exitCode = 1;
});
module.exports = { checkReleaseDiagnostics };
