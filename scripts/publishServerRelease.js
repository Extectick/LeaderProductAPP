// Runs only on the trusted release runner. No database credentials leave API containers.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');

async function main() {
  const [kind, filename] = process.argv.slice(2);
  if (!['apk', 'ota'].includes(kind)) throw Error('Expected apk or ota');
  const metadata = JSON.parse(fs.readFileSync(filename));
  const channel = process.env.EXPO_PUBLIC_UPDATE_CHANNEL;
  if (!['dev', 'prod'].includes(channel) || metadata.channel !== channel || metadata.commitSha !== process.env.GITHUB_SHA) throw Error('Release channel/commit mismatch');
  const container = channel === 'dev' ? 'leader_api_dev' : 'leader_api_prod';
  const inspect = JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0];
  const env = Object.fromEntries(inspect.Config.Env.map(line => { const p = line.indexOf('='); return [line.slice(0, p), line.slice(p + 1)]; }));
  const expectedDb = channel === 'dev' ? '/LeaderAPI_dev' : '/LeaderAPI';
  if (new URL(env.DATABASE_URL).pathname !== expectedDb || env.S3_BUCKET !== process.env.S3_BUCKET) throw Error('Wrong release database or bucket');
  const expectedOrigin = channel === 'dev' ? 'https://dev.lidprod.ru' : 'https://sibvod.ru';
  if (env.DOMEN_URL !== expectedOrigin || process.env.EXPO_PUBLIC_API_URL_DEV !== expectedOrigin) throw Error('Wrong release API');
  const keys = kind === 'apk' ? [metadata.apkKey] : [metadata.manifestKey, ...metadata.files.map(x => x.key)];
  if (keys.some(key => typeof key !== 'string' || !key.startsWith(channel + '/updates/') || key.includes('..'))) throw Error('Wrong storage namespace');
  const s3 = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION, forcePathStyle: true,
    credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY } });
  for (const key of keys) await s3.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  const remoteFile = '/tmp/leader-release-' + process.env.GITHUB_RUN_ID + '-' + kind + '.json';
  execFileSync('docker', ['cp', path.resolve(filename), container + ':' + remoteFile], { stdio: 'pipe' });
  try { execFileSync('docker', ['exec', container, 'node', 'scripts/publish-' + (kind === 'apk' ? 'apk-update' : 'ota-update') + '-db.js', remoteFile], { stdio: 'inherit' }); }
  finally { execFileSync('docker', ['exec', container, 'rm', '-f', remoteFile], { stdio: 'pipe' }); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
