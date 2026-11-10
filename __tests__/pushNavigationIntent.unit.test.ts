import {createPushNavigationIntent} from '../utils/pushNavigationIntent';

type Response = {id: string; recipient?: number};
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return {promise,resolve}; };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
afterEach(() => jest.useRealTimers());

test('startup reads once, and live/restored delivery of that response opens once', async () => {
  const response = {id:'one'}, read = jest.fn(async () => response), clear = jest.fn(async () => {}), open = jest.fn(() => true);
  const intent = createPushNavigationIntent({read,clear,identity:(value:Response)=>value.id});
  expect(await intent.initial()).toBe(response);
  expect(await intent.initial()).toBe(response);
  expect(read).toHaveBeenCalledTimes(1);
  expect(intent.deliver(response, open, () => true)).toBe(true);
  expect(await intent.restore(open, () => true)).toBe(true);
  expect(open).toHaveBeenCalledTimes(1);
  await flush(); expect(clear).toHaveBeenCalledTimes(1);
});

test('a stale navigator or wrong account does not consume the saved response', async () => {
  const response = {id:'one',recipient:12}, read = jest.fn(async () => response), clear = jest.fn(async () => {}), open = jest.fn(() => false);
  const intent = createPushNavigationIntent({read,clear,identity:(value:Response)=>value.id});
  expect(intent.deliver(response, open, () => false)).toBe(false);
  expect(open).not.toHaveBeenCalled();
  expect(intent.deliver(response, open, () => true)).toBe(false);
  expect(intent.accepted(response)).toBe(false);
  await flush(); expect(clear).not.toHaveBeenCalled();
  open.mockReturnValue(true);
  expect(await intent.restore(open, () => true)).toBe(true);
});

test('navigation acceptance never clears a newer native notification', async () => {
  const response = {id:'one'}, newer = {id:'two'}, clear = jest.fn(async () => {});
  const intent = createPushNavigationIntent({read:async()=>newer,clear,identity:(value:Response)=>value.id});
  expect(intent.deliver(response, () => true, () => true)).toBe(true);
  await flush(); expect(clear).not.toHaveBeenCalled();
  expect(intent.accepted(response)).toBe(true);
  expect(intent.accepted(newer)).toBe(false);
});

test('a hung native read releases startup at the bounded deadline and does not surface a late intent', async () => {
  jest.useFakeTimers();
  const native = deferred<Response|null>(), clear = jest.fn(async () => {});
  const intent = createPushNavigationIntent({read:()=>native.promise,clear,identity:(value:Response)=>value.id});
  const pending = intent.initial(450);
  jest.advanceTimersByTime(449); let settled = false; void pending.then(()=>{settled=true;});
  await flush(); expect(settled).toBe(false);
  jest.advanceTimersByTime(1); expect(await pending).toBe(null);
  native.resolve({id:'late'}); await flush(); expect(await intent.initial()).toBe(null);
  expect(clear).not.toHaveBeenCalled();
});

test('native read failure releases startup without marking anything consumed', async () => {
  const clear=jest.fn(async()=>{});
  const intent=createPushNavigationIntent<Response>({read:async()=>{throw Error('native unavailable');},clear,identity:value=>value.id});
  expect(await intent.initial()).toBe(null);
  expect(clear).not.toHaveBeenCalled();
});
