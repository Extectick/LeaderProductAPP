// Encrypt CI candidates (including private symbols) before putting them in artifacts.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');

async function transfer(mode, input, output, keyFile) {
  if (!['encrypt', 'decrypt'].includes(mode) || !input || !output || !keyFile) throw Error('Invalid transfer arguments');
  const envelopeFile = (mode === 'encrypt' ? output : input) + '.json';
  const keyPem = fs.readFileSync(keyFile);
  let key, iv, cipher;
  if (mode === 'encrypt') {
    key = crypto.randomBytes(32);
    iv = crypto.randomBytes(12);
    cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  } else {
    const envelope = JSON.parse(fs.readFileSync(envelopeFile));
    if (envelope.version !== 1) throw Error('Unknown transfer format');
    key = crypto.privateDecrypt({ key: keyPem, oaepHash: 'sha256' }, Buffer.from(envelope.key, 'base64'));
    iv = Buffer.from(envelope.iv, 'base64');
    cipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    cipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  }
  try {
    await pipeline(fs.createReadStream(input), cipher, fs.createWriteStream(output, { flags: 'wx', mode: 0o600 }));
    if (mode === 'encrypt') fs.writeFileSync(envelopeFile, JSON.stringify({
      version: 1, key: crypto.publicEncrypt({ key: keyPem, oaepHash: 'sha256' }, key).toString('base64'),
      iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'),
    }), { mode: 0o600, flag: 'wx' });
  } catch (error) {
    fs.rmSync(output, { force: true });
    throw error;
  } finally { key.fill(0); }
}
module.exports = { transfer };
if (require.main === module) transfer(...process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
