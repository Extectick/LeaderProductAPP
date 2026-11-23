import {orderConnectionReadUpdate} from '@/src/features/clientOrders/lib/orderConnectionStatus';
import {ONEC_CONNECTION_UNAVAILABLE_MESSAGE} from '@/src/shared/errors/userErrorMessage';
const verified = {source: 'verified-snapshot' as const, checkedAt: '2026-11-23T05:00:00Z', stale: false, verificationRequired: false, refreshPending: false};
describe('order list connection evidence', () => {
  it('does not report ordinary background warmup as a failure', () => {
    expect(orderConnectionReadUpdate({liveSource: {status: 'pending', message: 'Проверяем документы в 1С'}, readState: {...verified, source: 'local', stale: true, verificationRequired: true}})).toBeUndefined();
  });
  it('clears a past read failure after fresh verification without legacy liveSource', () => {
    expect(orderConnectionReadUpdate({readState: verified})).toBeNull();
    expect(orderConnectionReadUpdate({liveSource: {status: 'ok'}})).toBeNull();
  });
  it.each([
    {liveSource: {status: 'ok' as const}, readState: {...verified, stale: true}},
    {liveSource: {status: 'ok' as const}, readState: {...verified, source: 'local' as const}},
    {}, {readState: {...verified, stale: true}}, {readState: {...verified, verificationRequired: true}},
    {readState: {...verified, source: 'local' as const}}, {readState: {...verified, checkedAt: null}},
  ])('does not claim recovery from an unverified cache response: %j', meta => {
    expect(orderConnectionReadUpdate(meta)).toBeUndefined();
  });
  it('keeps actual upstream failures visible even alongside a cached verified snapshot', () => {
    expect(orderConnectionReadUpdate({liveSource: {status: 'unavailable', message: 'request timeout'}, readState: verified}))
      .toBe(ONEC_CONNECTION_UNAVAILABLE_MESSAGE);
    expect(orderConnectionReadUpdate({liveSource: {status: 'error', message: 'Не удалось загрузить документы из 1С.'}}))
      .toBe(ONEC_CONNECTION_UNAVAILABLE_MESSAGE);
    expect(orderConnectionReadUpdate({liveSource: {status: 'not_configured', message: 'Не настроена связь с менеджером 1С'}}))
      .toBe('Не настроена связь с менеджером 1С');
  });
});
