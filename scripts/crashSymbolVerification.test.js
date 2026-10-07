const { test } = require('node:test');
const assert = require('node:assert/strict');
const { verifySymbolication } = require('./crashSymbolVerification');
const resolved = { filename: '/src/shared/monitoring/privacy.ts', lineNo: 14 };
const match = frame => frame.filename === resolved.filename && frame.lineNo === resolved.lineNo;
const sleep = async () => {};

test('retries a fresh event after asynchronous artifact assembly', async () => {
  const sent = [], reads = [];
  const result = await verifySymbolication({
    send: async () => { const id = String(sent.length + 1); sent.push(id); return id; },
    read: async id => { reads.push(id); return id === '1' ? [{ filename: 'app:///index.android.bundle' }] : [resolved]; },
    match, sleep,
  });
  assert.deepEqual(sent, ['1', '2']);
  assert.deepEqual(reads, ['1', '2']);
  assert.equal(result.eventId, '2');
});

test('polls the same event while ingestion is pending', async () => {
  let sends = 0, reads = 0;
  await verifySymbolication({ send: async () => String(++sends), read: async () => ++reads < 3 ? null : [resolved], match, sleep });
  assert.equal(sends, 1);
  assert.equal(reads, 3);
});

test('never passes an incorrect or missing original frame', async () => {
  let sends = 0;
  await assert.rejects(verifySymbolication({
    send: async () => String(++sends), read: async () => [{ ...resolved, lineNo: 15 }], match, sleep,
  }), /publication is blocked/);
  assert.equal(sends, 6);
});

test('authentication or transport failures are not suppressed', async () => {
  await assert.rejects(verifySymbolication({
    send: async () => '1', read: async () => { throw Error('Private diagnostic read failed: 403'); }, match, sleep,
  }), /403/);
});
