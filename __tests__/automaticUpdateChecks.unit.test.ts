import {
  areAutomaticUpdateChecksPaused,
  AUTOMATIC_UPDATE_CHECK_INTERVAL_MS,
  setAutomaticUpdateChecksPaused,
} from '@/src/shared/appUpdate/automaticUpdateChecks';

describe('automatic update checks', () => {
  afterEach(() => {
    setAutomaticUpdateChecksPaused('document-a', false);
    setAutomaticUpdateChecksPaused('document-b', false);
  });

  it('uses a low-load fifteen minute interval', () => {
    expect(AUTOMATIC_UPDATE_CHECK_INTERVAL_MS).toBe(15 * 60_000);
  });

  it('stays paused until every active document blocker is removed', () => {
    setAutomaticUpdateChecksPaused('document-a', true);
    setAutomaticUpdateChecksPaused('document-b', true);
    expect(areAutomaticUpdateChecksPaused()).toBe(true);

    setAutomaticUpdateChecksPaused('document-a', false);
    expect(areAutomaticUpdateChecksPaused()).toBe(true);

    setAutomaticUpdateChecksPaused('document-b', false);
    expect(areAutomaticUpdateChecksPaused()).toBe(false);
  });
});
