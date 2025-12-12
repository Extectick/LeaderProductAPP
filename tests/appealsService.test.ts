// @ts-nocheck
const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');

test('addAppealMessage supports progress and status', async () => {
  const store = new Map();
  const asyncStorageModule = require('@react-native-async-storage/async-storage');
  const asyncStorage = asyncStorageModule.default?.default || asyncStorageModule.default || asyncStorageModule;
  mock.method(asyncStorage, 'getItem', async (k) => (store.has(k) ? store.get(k) : null));
  mock.method(asyncStorage, 'setItem', async (k, v) => { store.set(k, v); });
  mock.method(asyncStorage, 'removeItem', async (k) => { store.delete(k); });

  const appeals = require('../utils/appealsService.ts');
  const apiModule = require('../utils/apiClient.ts');
  mock.method(apiModule, 'apiClient', async () => ({ ok: true, data: { id: 1, createdAt: '2020', status: 'SENT' } }));
  const tokenModule = require('../utils/tokenService.ts');
  mock.method(tokenModule, 'getAccessToken', async () => null);
  const { addAppealMessage } = appeals;

  const progress = [];
  const res = await addAppealMessage(1, { text: 'hi', onProgress: (p) => progress.push(p) });
  assert.deepEqual(progress, [0, 100]);
  assert.equal(res.status, 'SENT');
});

test('connectAppealSocket emits message event', async () => {
  const store = new Map();
  const asyncStorageModule2 = require('@react-native-async-storage/async-storage');
  const asyncStorage2 = asyncStorageModule2.default?.default || asyncStorageModule2.default || asyncStorageModule2;
  mock.method(asyncStorage2, 'getItem', async (k) => (store.has(k) ? store.get(k) : null));
  mock.method(asyncStorage2, 'setItem', async (k, v) => { store.set(k, v); });
  mock.method(asyncStorage2, 'removeItem', async (k) => { store.delete(k); });

  const emitter = new EventEmitter();
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'socket.io-client') {
      return {
        io: () => ({
          emit: () => {},
          on: (evt, cb) => { emitter.on(evt, cb); },
          disconnect: () => {},
        }),
      };
    }
    return originalLoad(request, parent, isMain);
  };

  const appeals2 = require('../utils/appealsService.ts');
  const tokenModule2 = require('../utils/tokenService.ts');
  mock.method(tokenModule2, 'getAccessToken', async () => 'token');
  const { connectAppealSocket } = appeals2;

  const events = [];
  const cleanup = await connectAppealSocket(1, (e) => events.push(e));
  emitter.emit('message:new', { id: 5, text: 'x', createdAt: '', sender: { id: 1, email: '' }, attachments: [] });
  cleanup();
  Module._load = originalLoad;
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'message');
});
