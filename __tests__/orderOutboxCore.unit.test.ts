import { createHash } from 'node:crypto';
import { drainOrderOutbox } from '../src/features/clientOrders/offline/orderOutboxCore';
import { canonicalSubmissionJson, isAutomaticSubmission, matchingSubmissionReceipt, submissionHash } from '../src/features/clientOrders/offline/orderSubmissionProtocol';

const item = (id = 'client-order-1', revision = 1) => ({ apiScope: '', userId: '90', clientOrderId: id, clientRevision: revision,
  payload: { intent: 'SUBMIT', clientRevision: revision, comment: 'Куренкова 🐟', quantity: 1.25 },
  payloadHash: submissionHash({ intent: 'SUBMIT', clientRevision: revision, comment: 'Куренкова 🐟', quantity: 1.25 }),
  leaseToken: 'lease', attempts: 1, receipt: null as any });
const receipt = (packet = item(), state = 'ACCEPTED') => ({ ...packet, receiptVersion: 'client-order-inbox-v1',
  accepted: true, submissionId: `receipt-${packet.clientOrderId}`, userId: 90, intent: 'SUBMIT', acceptedAt: new Date().toISOString(), state });
let store: any, transport: any, current: boolean;
beforeEach(() => {
  current = true;
  store = { claim: jest.fn().mockResolvedValue([]), accept: jest.fn(), fail: jest.fn(), accepted: jest.fn().mockResolvedValue([]), status: jest.fn(), complete: jest.fn() };
  transport = { capabilities: jest.fn().mockResolvedValue({ enabled: true, protocol: 'client-order-inbox-v1' }),
    upload: jest.fn().mockImplementation(async packets => packets.map((p: any) => receipt(p))),
    statuses: jest.fn().mockResolvedValue([]), order: jest.fn(), legacy: jest.fn() };
});
const run = () => drainOrderOutbox({ userId: '90', store, transport, isCurrent: () => current });
describe('durable background order queue', () => {
  it('has the same UTF8 SHA256 JSON protocol as Node API, including undefined and Unicode', () => {
    const payload = { z: undefined, a: 'Ёж 🐟', qty: 0.125, lines: [{ b: 2, a: 1 }] };
    expect(submissionHash(payload)).toBe(createHash('sha256').update(canonicalSubmissionJson(payload), 'utf8').digest('hex'));
    expect(submissionHash(payload)).toBe(submissionHash({ lines: [{ a: 1, b: 2 }], qty: 0.125, a: 'Ёж 🐟' }));
  });
  it.each(['ON_DEVICE','READY_TO_SEND','SEND_ERROR','SENDING','PRICE_REVIEW','NEEDS_EDIT'])('never promotes SAVE with status %s', status => {
    expect(isAutomaticSubmission({ intent: 'SAVE', status, clientOrderId: 'client-id-1' })).toBe(false);
  });
  it('uploads many packets before reading a single server processing result', async () => {
    for (let i = 0; i < 3; i++) store.claim.mockResolvedValueOnce(Array.from({ length: 10 }, (_, n) => item(`client-${i}-${n}`)));
    store.accepted.mockImplementation(() => {
      expect(transport.upload).toHaveBeenCalledTimes(3);
      return [];
    });
    await run();
    expect(store.accept).toHaveBeenCalledTimes(30);
    expect(transport.order).not.toHaveBeenCalled();
  });
  it('retains local payload after API acceptance, not pretending that 1C has posted it', async () => {
    store.claim.mockResolvedValueOnce([item()]);
    await run();
    expect(store.accept).toHaveBeenCalledWith(item(), expect.objectContaining({ state: 'ACCEPTED' }));
    expect(store.complete).not.toHaveBeenCalled();
  });
  it('does not trust another user, intent, revision or packet hash', () => {
    for (const wrong of [{ userId: 91 }, { intent: 'SAVE' }, { clientRevision: 2 }, { payloadHash: 'bad' }, { accepted: false }]) {
      expect(matchingSubmissionReceipt(item(), { ...receipt(), ...wrong })).toBe(false);
    }
  });
  it('retries an identical immutable packet after lost HTTP reply', async () => {
    const packet = item();
    store.claim.mockResolvedValueOnce([packet]);
    transport.upload.mockRejectedValue(new Error('network lost'));
    await run();
    expect(store.fail).toHaveBeenCalledWith(packet, expect.objectContaining({ retryable: true }));
    expect(store.complete).not.toHaveBeenCalled();
  });
  it('does not stop a batch because one item requires correction', async () => {
    const first = item(), second = item('client-order-2');
    store.claim.mockResolvedValueOnce([first, second]);
    transport.upload.mockResolvedValue([{ ...receipt(first), accepted: false, errorCode: 'VALIDATION_ERROR' }, receipt(second)]);
    await run();
    expect(store.fail).toHaveBeenCalledWith(first, expect.objectContaining({ retryable: false }));
    expect(store.accept).toHaveBeenCalledWith(second, expect.anything());
  });
  it('keeps an unverified/missing receipt for a retry', async () => {
    store.claim.mockResolvedValueOnce([item()]); transport.upload.mockResolvedValue([{ ...receipt(), userId: 91 }]);
    await run();
    expect(store.accept).not.toHaveBeenCalled();
    expect(store.fail).toHaveBeenCalledWith(item(), expect.objectContaining({ retryable: true }));
  });
  it('propagates async business review without resubmitting or discarding content', async () => {
    const packet = { ...item(), receipt: receipt() }; store.accepted.mockResolvedValue([packet]);
    transport.statuses.mockResolvedValue([{ ...receipt(), state: 'NEEDS_REVIEW', errorCode: 'STOCK_SHORTAGE' }]);
    await run();
    expect(store.status).toHaveBeenCalledWith(packet, expect.objectContaining({ state: 'NEEDS_REVIEW' }));
    expect(store.complete).not.toHaveBeenCalled();
    expect(transport.upload).not.toHaveBeenCalled();
  });
  it('only reconciles a queued receipt after canonical order download', async () => {
    const packet = { ...item(), receipt: receipt() }; const order = { guid: 'canonical' };
    store.accepted.mockResolvedValue([packet]); transport.statuses.mockResolvedValue([receipt(item(), 'QUEUED')]); transport.order.mockResolvedValue(order);
    await run();
    expect(store.complete).toHaveBeenCalledWith({ ...packet, receipt: expect.objectContaining({ state: 'QUEUED' }) }, order, false);
  });
  it('keeps accepted payload when canonical download fails', async () => {
    store.accepted.mockResolvedValue([{ ...item(), receipt: receipt() }]); transport.statuses.mockResolvedValue([receipt(item(), 'QUEUED')]);
    transport.order.mockRejectedValue(new Error('offline'));
    await run(); expect(store.complete).not.toHaveBeenCalled(); expect(store.fail).not.toHaveBeenCalled();
  });
  it('halts cleanly for unsupported server capability', async () => {
    transport.capabilities.mockResolvedValue({ enabled: false, protocol: 'client-order-inbox-v1' });
    await run(); expect(store.claim).not.toHaveBeenCalled();
  });
  it('never starts work after account switching/logout', async () => {
    current = false; await run(); expect(store.claim).not.toHaveBeenCalled(); expect(transport.upload).not.toHaveBeenCalled();
  });
  it('never creates a modern replacement for a legacy server order', async () => {
    const packet = item('legacy-server:guid-1234'); store.claim.mockResolvedValueOnce([packet]);
    await run(); expect(transport.upload).toHaveBeenCalledWith([packet]);
    expect(transport.legacy).not.toHaveBeenCalled(); expect(store.complete).not.toHaveBeenCalled();
  });
});
