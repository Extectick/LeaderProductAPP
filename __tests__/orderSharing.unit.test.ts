import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { apiClient } from '@/utils/apiClient';
import * as Clipboard from 'expo-clipboard';
import { publishClientOrderShare } from '../src/features/clientOrders/lib/orderSharing';
import { useOrderShareActions } from '../src/features/clientOrders/hooks/useOrderShareActions';

jest.mock('@/utils/apiClient', () => ({ apiClient: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
const link = { url: 'https://sibvod.ru/order/test', active: true, expiresAt: null };
const workspace = (overrides = {}) => ({
  selectedOrder: { guid: 'api-draft', status: 'DRAFT' },
  mutationLocked: false, loadingDetail: false,
  prepareOrderForSharing: jest.fn(async (guid?: string) => ({ guid: guid ?? 'api-draft', origin: 'local' })),
  ...overrides,
}) as any;

beforeEach(() => {
  jest.clearAllMocks();
  (apiClient as jest.Mock).mockResolvedValue({ ok: true, data: link });
});

describe('customer order link publication', () => {
  it('prepares the current document before publishing the acknowledged identity', async () => {
    const ws = workspace(); ws.prepareOrderForSharing.mockResolvedValue({ guid: 'confirmed', origin: 'local' });
    expect(await publishClientOrderShare(ws)).toEqual({ guid: 'confirmed', link });
    expect(ws.prepareOrderForSharing).toHaveBeenCalledWith(undefined);
    expect(apiClient).toHaveBeenCalledWith('/api/order-sharing/confirmed/share', { method: 'POST', body: { rotate: false } });
    expect(ws.prepareOrderForSharing.mock.invocationCallOrder[0]).toBeLessThan((apiClient as jest.Mock).mock.invocationCallOrder[0]);
  });
  it('prepares a locally saved draft even when dirty=false and GUID is already a server GUID', async () => {
    const ws = workspace({ selectedOrder: { guid: 'api-draft', origin: 'device' }, dirty: false });
    await publishClientOrderShare(ws); expect(ws.prepareOrderForSharing).toHaveBeenCalledTimes(1);
  });
  it.each([null, { guid: 'device-123' }, { guid: 'old-server-guid', origin: 'device' }, { origin: 'local' }])(
    'never publishes an unconfirmed local fallback %j', async result => {
      const ws = workspace(); ws.prepareOrderForSharing.mockResolvedValue(result);
      await expect(publishClientOrderShare(ws)).rejects.toThrow('Черновик остаётся на устройстве');
      expect(apiClient).not.toHaveBeenCalled();
    });
  it('does not publish when preparation fails or a newer edit invalidates it', async () => {
    const ws = workspace(); ws.prepareOrderForSharing.mockRejectedValue(new Error('Документ изменился'));
    await expect(publishClientOrderShare(ws)).rejects.toThrow('Документ изменился');
    expect(apiClient).not.toHaveBeenCalled();
  });
  it('blocks publication during another mutation', async () => {
    const ws = workspace({ mutationLocked: true });
    await expect(publishClientOrderShare(ws)).rejects.toThrow('Дождитесь');
    expect(ws.prepareOrderForSharing).not.toHaveBeenCalled(); expect(apiClient).not.toHaveBeenCalled();
  });
  it('reports server errors instead of copying a missing link', async () => {
    (apiClient as jest.Mock).mockResolvedValue({ ok: false, message: 'Нет доступа' });
    await expect(publishClientOrderShare(workspace())).rejects.toThrow('Нет доступа');
  });
});

describe('sharing entry points', () => {
  let renderer: TestRenderer.ReactTestRenderer;
  let actions: ReturnType<typeof useOrderShareActions>;
  function Harness({ ws }: { ws: any }) { actions = useOrderShareActions(ws); return null; }
  const mount = async (ws: any) => { await act(async () => { renderer = TestRenderer.create(React.createElement(Harness, { ws })); }); };
  afterEach(() => { if (renderer) act(() => renderer.unmount()); });

  it('prepares only the list target even if another editor is dirty', async () => {
    const ws = workspace({ dirty: true, loadingDetail: true, selectOrder: jest.fn(), saveDraft: jest.fn() });
    await mount(ws);
    await act(async () => { await actions.copyFromList('second-order'); });
    expect(ws.prepareOrderForSharing).toHaveBeenCalledWith('second-order');
    expect(apiClient).toHaveBeenCalledWith('/api/order-sharing/second-order/share', { method: 'POST', body: { rotate: false } });
    expect(ws.selectOrder).not.toHaveBeenCalled(); expect(ws.saveDraft).not.toHaveBeenCalled();
    expect(ws.selectedOrder.guid).toBe('api-draft');
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(link.url);
    expect(actions.feedback).toBe('Ссылка скопирована');
  });
  it('copies from the list even if no document is selected', async () => {
    const ws = workspace({ selectedOrder: null }); await mount(ws);
    await act(async () => { await actions.copyFromList('list-order'); });
    expect(ws.prepareOrderForSharing).toHaveBeenCalledWith('list-order');
  });
  it('prepares a device list entry and publishes its new server identity', async () => {
    const ws = workspace(); ws.prepareOrderForSharing.mockResolvedValue({ guid: 'saved-api', origin: 'local' });
    await mount(ws); await act(async () => { await actions.copyFromList('device-123'); });
    expect(ws.prepareOrderForSharing).toHaveBeenCalledWith('device-123');
    expect(apiClient).toHaveBeenCalledWith('/api/order-sharing/saved-api/share', expect.anything());
  });
  it('does not copy an obsolete link after an unsuccessful save', async () => {
    const ws = workspace(); ws.prepareOrderForSharing.mockResolvedValue({ guid: 'api-draft', origin: 'device' });
    await mount(ws); await act(async () => { await actions.copyFromList('api-draft'); });
    expect(apiClient).not.toHaveBeenCalled(); expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
    expect(actions.feedback).toContain('Черновик остаётся на устройстве');
  });
  it('copies once on rapid menu, list and title taps', async () => {
    await mount(workspace());
    await act(async () => { await Promise.all([actions.copy(), actions.copyFromList('second'), actions.copy()]); });
    expect(apiClient).toHaveBeenCalledTimes(1); expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1);
  });
  it('shows feedback without copying when publication fails', async () => {
    (apiClient as jest.Mock).mockRejectedValue(new Error('Нет сети'));
    await mount(workspace()); await act(async () => { await actions.copyFromList('list-order'); });
    expect(Clipboard.setStringAsync).not.toHaveBeenCalled(); expect(actions.feedback).toBe('Нет сети');
  });
  it('does not claim success when the browser denies clipboard access', async () => {
    (Clipboard.setStringAsync as jest.Mock).mockResolvedValueOnce(false);
    await mount(workspace()); await act(async () => { await actions.copy(); });
    expect(actions.feedback).toContain('Не удалось скопировать');
  });
  it('blocks both entry points during another mutation', async () => {
    await mount(workspace({ mutationLocked: true }));
    await act(async () => { await actions.copy(); await actions.copyFromList('list-order'); });
    expect(apiClient).not.toHaveBeenCalled();
  });
  it('keeps callbacks stable but uses the latest workspace preparation', async () => {
    await mount(workspace()); const { copy, copyFromList } = actions;
    const latest = workspace(); latest.prepareOrderForSharing.mockResolvedValue({ guid: 'latest', origin: 'local' });
    await act(async () => { renderer.update(React.createElement(Harness, { ws: latest })); });
    expect(actions.copy).toBe(copy); expect(actions.copyFromList).toBe(copyFromList);
    await act(async () => { await actions.copy(); });
    expect(apiClient).toHaveBeenCalledWith('/api/order-sharing/latest/share', expect.anything());
  });
  it('does not copy into the clipboard after unmount', async () => {
    let finish!: (value: unknown) => void;
    (apiClient as jest.Mock).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await mount(workspace()); let task!: Promise<void>;
    act(() => { task = actions.copyFromList('list-order'); }); act(() => renderer.unmount());
    await act(async () => { finish({ ok: true, data: link }); await task; });
    expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
  });
});
