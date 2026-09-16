import { trackingCommandConnectionLabel, trackingLogDiagnostics } from '../utils/trackingReliability';

describe('truthful tracking diagnostics', () => {
  it('ages command connectivity without inventing a fresh location or claiming the phone is offline', () => {
    const now = Date.now();
    expect(trackingCommandConnectionLabel(null, now)).toBeNull();
    expect(trackingCommandConnectionLabel(new Date(now - 30_000).toISOString(), now)).toBe('Телефон отвечает на команды');
    expect(trackingCommandConnectionLabel(new Date(now - 120_000).toISOString(), now)).toBe('Свежая связь с телефоном не подтверждена');
  });
  it('does not treat upload attempts/errors or GPS requests as successful points', () => {
    expect(trackingLogDiagnostics([
      { time: 1000, message: 'Requesting position' },
      { time: 2000, message: 'Upload error: token lpt_secret_secret' },
      { time: 3000, message: 'Upload response 503' },
    ])).toEqual({ lastSentAt: undefined, lastError: expect.any(String) });
    expect(JSON.stringify(trackingLogDiagnostics([{ time: 1, message: 'Upload error: lpt_secret_secret' }]))).not.toContain('lpt_');
  });
  it('clears old errors after a confirmed successful upload', () => {
    expect(trackingLogDiagnostics([
      { time: 1000, message: 'Upload response 401' },
      { time: 2000, message: 'Upload response 200' },
    ])).toEqual({ lastSentAt: new Date(2000).toISOString(), lastError: undefined });
  });
  it('retains last success and reports a subsequent failure separately', () => {
    expect(trackingLogDiagnostics([
      { time: 2000, message: 'Upload failed, retrying in 10000' },
      { time: 1000, message: 'Upload response 204' },
      { time: NaN, message: 'Upload response 200' },
    ])).toEqual({ lastSentAt: new Date(1000).toISOString(), lastError: expect.any(String) });
  });
});
