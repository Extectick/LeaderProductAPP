jest.mock('../src/shared/monitoring', () => ({ captureException: jest.fn() }));

it('retains the innermost stage and native exception, deduplicating nested reports and repeated taps', async () => {
  jest.resetModules();
  const { offlineSyncStage, reportOfflineSyncFailure } = require('../src/shared/storage/offlineSyncDiagnostics');
  const { captureException } = require('../src/shared/monitoring');
  const failure = new Error('SQLITE_BUSY');
  await expect(offlineSyncStage({ stage: 'outer' }, () => offlineSyncStage({ stage: 'inner', entity: 'stock' }, () => Promise.reject(failure)))).rejects.toBe(failure);
  reportOfflineSyncFailure(failure, { stage: 'outer' });
  reportOfflineSyncFailure(failure, { stage: 'outer' });
  reportOfflineSyncFailure(new Error('SQLITE_BUSY'), { stage: 'inner', entity: 'stock' });
  expect(captureException).toHaveBeenCalledTimes(1);
  expect(captureException).toHaveBeenCalledWith(failure, { tags: { offline_sync_stage: 'inner', offline_sync_entity: 'stock' } });
});
