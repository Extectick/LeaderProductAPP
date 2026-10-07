import { isSQLiteBusy, retrySQLiteBusy } from '../src/shared/storage/sqliteBusy';

afterEach(() => jest.useRealTimers());

it('retries a transient lock and returns the successful result', async () => {
  jest.useFakeTimers();
  const task = jest.fn().mockRejectedValueOnce(new Error('database is locked')).mockResolvedValue('ready');
  const result = retrySQLiteBusy(task);
  await jest.runAllTimersAsync();
  expect(await result).toBe('ready');
  expect(task).toHaveBeenCalledTimes(2);
});

it('bounds persistent lock retries and preserves the last native exception', async () => {
  jest.useFakeTimers();
  const failure = new Error('SQLITE_BUSY');
  const task = jest.fn().mockRejectedValue(failure);
  const result = retrySQLiteBusy(task).catch(error => error);
  await jest.runAllTimersAsync();
  expect(await result).toBe(failure);
  expect(task).toHaveBeenCalledTimes(3);
});

it('never retries corruption, disk-full or unrelated errors', async () => {
  const failure = new Error('database disk image is malformed');
  const task = jest.fn().mockRejectedValue(failure);
  await expect(retrySQLiteBusy(task)).rejects.toBe(failure);
  expect(task).toHaveBeenCalledTimes(1);
  expect(isSQLiteBusy(new Error('database table is locked'))).toBe(true);
  expect(isSQLiteBusy(new Error('SQLITE_FULL'))).toBe(false);
});
