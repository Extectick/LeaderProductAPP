const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { transfer } = require('./releaseTransfer');
test('private release transport round trip and tamper rejection', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leader-transfer-'));
  try {
    const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pub = path.join(dir, 'public.pem'), priv = path.join(dir, 'private.pem');
    fs.writeFileSync(pub, keys.publicKey.export({ type: 'spki', format: 'pem' }));
    fs.writeFileSync(priv, keys.privateKey.export({ type: 'pkcs8', format: 'pem' }));
    const input = path.join(dir, 'input'), encrypted = path.join(dir, 'encrypted'), output = path.join(dir, 'output');
    const original = crypto.randomBytes(1024 * 512);
    fs.writeFileSync(input, original);
    await transfer('encrypt', input, encrypted, pub);
    await transfer('decrypt', encrypted, output, priv);
    assert.deepEqual(fs.readFileSync(output), original);
    fs.unlinkSync(output);
    const bytes = fs.readFileSync(encrypted); bytes[10] ^= 1; fs.writeFileSync(encrypted, bytes);
    await assert.rejects(transfer('decrypt', encrypted, output, priv));
    assert.equal(fs.existsSync(output), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
