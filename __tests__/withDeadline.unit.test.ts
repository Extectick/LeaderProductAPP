import { withDeadline } from '../src/shared/network/withDeadline';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('a completed wait releases its timeout and abort listener', async () => {
  const controller = new AbortController();
  const remove = jest.spyOn(controller.signal, 'removeEventListener');
  await expect(withDeadline(Promise.resolve(null), 100, controller.signal)).resolves.toBeNull();
  expect(jest.getTimerCount()).toBe(0);
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  controller.abort();
});

test('timeout stops only this consumer; a later result remains available to another', async () => {
  let finish!: (value: string) => void;
  const work = new Promise<string>(resolve => { finish = resolve; });
  const first = withDeadline(work, 100).catch(error => error);
  const second = withDeadline(work, 1000);
  await jest.advanceTimersByTimeAsync(100);
  expect(await first).toMatchObject({ name: 'TimeoutError' });
  finish('rotated');
  await expect(second).resolves.toBe('rotated');
  expect(jest.getTimerCount()).toBe(0);
});

test('caller cancellation consumes a late rejection and does not alter its error', async () => {
  let fail!: (reason: unknown) => void;
  const work = new Promise<never>((_resolve, reject) => { fail = reject; });
  const controller = new AbortController();
  controller.abort();
  await expect(withDeadline(work, 100, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  const original = { status: 503, code: 'UNAVAILABLE' };
  fail(original);
  await expect(work).rejects.toBe(original);
  expect(jest.getTimerCount()).toBe(0);
});

test('structured failures are preserved unchanged', async () => {
  const original = { status: 409, code: 'ACCOUNT_CHANGED' };
  await expect(withDeadline(Promise.reject(original), 100)).rejects.toBe(original);
  expect(jest.getTimerCount()).toBe(0);
});
