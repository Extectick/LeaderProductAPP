import { getRoutePointDateTimeLabels } from '../src/features/tracking/helpers';

describe('tracking helpers', () => {
  it('formats route point in recorded timezone and keeps viewer timezone secondary', () => {
    const labels = getRoutePointDateTimeLabels(
      {
        recordedAt: '2026-07-11T16:23:04.216Z',
        recordedTimeZone: 'Asia/Novosibirsk',
        recordedTimezoneOffsetMinutes: 420,
      },
      { viewerTimeZone: 'Europe/Moscow' }
    );

    expect(labels.primary).toContain('23:23');
    expect(labels.primary).toContain('UTC+7');
    expect(labels.secondary).toContain('19:23');
  });
});
