import { buildCopyPayload, orderToDraft } from '../src/features/clientOrders/clientOrdersShared';
import { legacyOrderMatches, runLegacyOrderOperation } from '../src/features/clientOrders/lib/legacyOrderRecovery';

function server(quantity = 2, revision = 2, status = 'DRAFT'): any {
  return { guid: 'server', revision, status, syncState: status === 'DRAFT' ? 'DRAFT' : 'QUEUED', origin: 'local',
    createdByUser: { id: 98 }, organization: { guid: 'org' }, counterparty: { guid: 'customer' },
    deliveryDate: '2026-10-14T00:00:00Z', currency: 'RUB',
    items: [{ lineGuid: 'line', product: { guid: 'product', name: 'Товар' }, quantity,
      basePrice: 100, manualPrice: 100, isManualPrice: true }], events: [] };
}
const operation = () => ({ guid: 'server', revision: 1, userId: 98, intent: 'SUBMIT' as const,
  payload: buildCopyPayload(orderToDraft(server())) });
function dependencies() {
  return { read: jest.fn(async () => server()), update: jest.fn(async () => server()),
    submit: jest.fn(async () => server(2, 3, 'QUEUED')), checkpoint: jest.fn(async (_order: any) => {}),
    isCurrent: jest.fn(() => true) };
}
const network = () => Object.assign(new Error('Network request failed'), { status: 0 });

describe('legacy server-bound operation recovery', () => {
  it('heals revision 1 versus 2 when content matches, without another PATCH', async () => {
    const deps = dependencies();
    expect((await runLegacyOrderOperation(operation(), deps)).revision).toBe(3);
    expect(deps.update).not.toHaveBeenCalled();
    expect(deps.checkpoint.mock.calls[0][0].revision).toBe(2);
    expect(deps.submit).toHaveBeenCalledWith('server', 2);
    expect(deps.checkpoint.mock.invocationCallOrder[0]).toBeLessThan(deps.submit.mock.invocationCallOrder[0]);
  });
  it('recovers a committed PATCH whose response was lost', async () => {
    const deps = dependencies();
    deps.read.mockResolvedValueOnce(server(1, 1)).mockResolvedValueOnce(server());
    deps.update.mockRejectedValueOnce(network());
    await runLegacyOrderOperation(operation(), deps);
    expect(deps.update).toHaveBeenCalledTimes(1);
    expect(deps.submit).toHaveBeenCalledWith('server', 2);
  });
  it('recovers a concurrent matching commit rejected by the revision guard', async () => {
    const deps = dependencies();
    deps.read.mockResolvedValueOnce(server(1, 1)).mockResolvedValueOnce(server());
    deps.update.mockRejectedValueOnce(Object.assign(new Error('Версия заказа устарела'), { status: 409 }));
    await runLegacyOrderOperation(operation(), deps);
    expect(deps.submit).toHaveBeenCalledWith('server', 2);
  });
  it('recovers a lost SUBMIT reply without submitting a second time', async () => {
    const deps = dependencies();
    deps.read.mockResolvedValueOnce(server()).mockResolvedValueOnce(server(2, 3, 'QUEUED'));
    deps.submit.mockRejectedValueOnce(network());
    expect((await runLegacyOrderOperation(operation(), deps)).status).toBe('QUEUED');
    expect(deps.submit).toHaveBeenCalledTimes(1);
  });
  it('restarts after SAVE succeeded but SUBMIT did not reach the server', async () => {
    const deps = dependencies();
    deps.read.mockResolvedValueOnce(server(1, 1)).mockResolvedValue(server());
    let storedRevision = 1;
    deps.checkpoint.mockImplementation(async order => { storedRevision = order.revision; });
    deps.submit.mockRejectedValueOnce(network());
    await expect(runLegacyOrderOperation(operation(), deps)).rejects.toMatchObject({ status: 0 });
    expect(storedRevision).toBe(2);
    expect((await runLegacyOrderOperation({ ...operation(), revision: storedRevision }, deps)).status).toBe('QUEUED');
    expect(deps.update).toHaveBeenCalledTimes(1);
    expect(deps.submit).toHaveBeenLastCalledWith('server', 2);
  });
  it.each(['QUEUED', 'SENT_TO_1C', 'CONFIRMED'])('consumes a matching already accepted %s without writing again', async status => {
    const deps = dependencies(); deps.read.mockResolvedValue(server(2, 3, status));
    expect((await runLegacyOrderOperation(operation(), deps)).status).toBe(status);
    expect(deps.update).not.toHaveBeenCalled(); expect(deps.submit).not.toHaveBeenCalled();
  });
  it('SAVE never submits and does not treat a DRAFT as submitted', async () => {
    const deps = dependencies();
    expect((await runLegacyOrderOperation({ ...operation(), intent: 'SAVE' }, deps)).status).toBe('DRAFT');
    expect(deps.submit).not.toHaveBeenCalled();
  });
  it.each([
    { items: [] }, { items: server(3).items }, { organization: { guid: 'different' } }, { comment: 'changed' },
    { items: [{ ...server().items[0], manualPrice: 200 }] },
  ])('retains local content on a changed newer server revision: %j', async patch => {
    const deps = dependencies(); deps.read.mockResolvedValue({ ...server(), ...patch });
    await expect(runLegacyOrderOperation(operation(), deps)).rejects.toMatchObject({ status: 409,
      errorDetails: { kind: 'LEGACY_DRAFT_CONFLICT', changes: expect.any(Array) } });
    expect(deps.update).not.toHaveBeenCalled(); expect(deps.submit).not.toHaveBeenCalled();
    expect(deps.checkpoint).not.toHaveBeenCalled();
  });
  it.each([{ createdByUser: { id: 1 } }, { createdByUser: null }, { guid: 'different' }, { revision: 0 }, { origin: 'device' }])('fails closed on identity/version mismatch: %j', async patch => {
    const deps = dependencies(); deps.read.mockResolvedValue({ ...server(), ...patch });
    await expect(runLegacyOrderOperation(operation(), deps)).rejects.toThrow('Не удалось подтвердить');
    expect(deps.update).not.toHaveBeenCalled(); expect(deps.submit).not.toHaveBeenCalled();
  });
  it('never submits when durable checkpoint fails', async () => {
    const deps = dependencies(); deps.checkpoint.mockRejectedValue(new Error('SQLite write failed'));
    await expect(runLegacyOrderOperation(operation(), deps)).rejects.toThrow('SQLite');
    expect(deps.submit).not.toHaveBeenCalled();
  });
  it('does not write after the user/account/local operation changed during readback', async () => {
    const deps = dependencies(); deps.isCurrent.mockReturnValue(false);
    await expect(runLegacyOrderOperation(operation(), deps)).rejects.toThrow('Заказ изменён на устройстве');
    expect(deps.update).not.toHaveBeenCalled(); expect(deps.submit).not.toHaveBeenCalled();
  });
  it.each([403, 404])('does not recreate missing or inaccessible orders (%i)', async status => {
    const deps = dependencies(); deps.read.mockRejectedValue(Object.assign(new Error('Unavailable'), { status }));
    await expect(runLegacyOrderOperation(operation(), deps)).rejects.toMatchObject({ status });
    expect(deps.update).not.toHaveBeenCalled(); expect(deps.submit).not.toHaveBeenCalled();
  });
  it('requires matching content even if a later server operation is already accepted', () => {
    expect(legacyOrderMatches(operation(), server(1, 4, 'QUEUED'))).toBe(false);
  });
});
