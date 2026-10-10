import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { apiClient } from '@/utils/apiClient';
import * as Clipboard from 'expo-clipboard';
import { publishClientOrderShare } from '../src/features/clientOrders/lib/orderSharing';
import { useOrderShareActions } from '../src/features/clientOrders/hooks/useOrderShareActions';

jest.mock('@/utils/apiClient', () => ({ apiClient: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
const link = { url: 'https://dev.leader-product.ru/order/#test', active: true, expiresAt: '2026-11-10' };
const workspace = (overrides = {}) => ({
  selectedOrder: { guid: 'api-draft', status: 'DRAFT' },
  readOnly: false, dirty: false, mutationLocked: false, loadingDetail: false,
  saveDraft: jest.fn(), ...overrides,
}) as any;

beforeEach(() => {
  jest.clearAllMocks();
  (apiClient as jest.Mock).mockResolvedValue({ ok: true, data: link });
});

describe('customer order link publication', () => {
  it('publishes an API draft without saving again or sending it to 1C', async () => {
    const ws = workspace();
    expect(await publishClientOrderShare(ws)).toEqual({ guid: 'api-draft', link });
    expect(ws.saveDraft).not.toHaveBeenCalled();
    expect(apiClient).toHaveBeenCalledTimes(1);
    expect(apiClient).toHaveBeenCalledWith('/api/order-sharing/api-draft/share', { method: 'POST', body: { rotate: false } });
  });
  it.each(['device-123', null])('saves an unsaved/local order %s only to API', async guid => {
    const ws = workspace({ selectedOrder: guid ? { guid } : null });
    ws.saveDraft.mockResolvedValue({ guid: 'saved-api' });
    expect((await publishClientOrderShare(ws)).guid).toBe('saved-api');
    expect(ws.saveDraft).toHaveBeenCalledWith({ reason: 'manual', intent: 'SAVE', serverOnly: true });
    expect(apiClient).toHaveBeenCalledWith('/api/order-sharing/saved-api/share', expect.anything());
  });
  it('saves dirty editor changes before creating the link', async () => {
    const ws = workspace({ dirty: true }); ws.saveDraft.mockResolvedValue(ws.selectedOrder);
    await publishClientOrderShare(ws);
    expect(ws.saveDraft).toHaveBeenCalledTimes(1);
  });
  it('never publishes a device fallback or failed save', async () => {
    for (const result of [null, { guid: 'device-123' }]) {
      const ws = workspace({ dirty: true }); ws.saveDraft.mockResolvedValue(result);
      await expect(publishClientOrderShare(ws)).rejects.toThrow('Черновик остаётся на устройстве');
    }
    expect(apiClient).not.toHaveBeenCalled();
  });
  it('does not save a read-only 1C document', async () => {
    const ws = workspace({ readOnly: true, dirty: true });
    await publishClientOrderShare(ws);
    expect(ws.saveDraft).not.toHaveBeenCalled();
  });
  it('blocks publication during another mutation', async () => {
    await expect(publishClientOrderShare(workspace({ mutationLocked: true }))).rejects.toThrow('Дождитесь');
    expect(apiClient).not.toHaveBeenCalled();
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

  it('copies a list link by GUID without loading or saving the selected editor', async () => {
    const ws = workspace({ dirty: true, loadingDetail: true, selectOrder: jest.fn() });
    await mount(ws);
    await act(async () => { await actions.copyFromList('second-order'); });
    expect(apiClient).toHaveBeenCalledTimes(1);
    expect(apiClient).toHaveBeenCalledWith('/api/order-sharing/second-order/share', { method: 'POST', body: { rotate: false } });
    expect(ws.selectOrder).not.toHaveBeenCalled();
    expect(ws.saveDraft).not.toHaveBeenCalled();
    expect(ws.selectedOrder.guid).toBe('api-draft');
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(link.url);
    expect(actions.feedback).toBe('Ссылка скопирована');
    expect(actions).not.toHaveProperty('visible');
  });
  it('copies from the list even if no document is selected', async () => {
    const ws = workspace({ selectedOrder: null });
    await mount(ws);
    await act(async () => { await actions.copyFromList('list-order'); });
    expect(ws.saveDraft).not.toHaveBeenCalled();
    expect(apiClient).toHaveBeenCalledWith('/api/order-sharing/list-order/share', expect.anything());
  });
  it.each(['device-123', ''])('never falls back to the selected editor for local/invalid identity %s', async guid => {
    const ws = workspace();
    await mount(ws);
    await act(async () => { await actions.copyFromList(guid); });
    expect(apiClient).not.toHaveBeenCalled();
    expect(ws.saveDraft).not.toHaveBeenCalled();
    expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
    expect(actions.feedback).toContain('сначала сохраните его на сервере');
  });
  it('copies once on rapid menu, list and title taps without a dialog', async () => {
    await mount(workspace());
    await act(async () => { await Promise.all([actions.copy(), actions.copyFromList('second'), actions.copy()]); });
    expect(apiClient).toHaveBeenCalledTimes(1);
    expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1);
    expect(actions.feedback).toBe('Ссылка скопирована');
    expect(actions.copying).toBe(false);
  });
  it('shows feedback without copying when offline publication fails', async () => {
    (apiClient as jest.Mock).mockRejectedValue(new Error('Нет сети'));
    await mount(workspace());
    await act(async () => { await actions.copyFromList('list-order'); });
    expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
    expect(actions.feedback).toBe('Нет сети');
    expect(actions.copying).toBe(false);
  });
  it('does not claim clipboard success when the browser denies access', async () => {
    (Clipboard.setStringAsync as jest.Mock).mockResolvedValueOnce(false);
    await mount(workspace());
    await act(async () => { await actions.copy(); });
    expect(actions.feedback).toContain('Не удалось скопировать');
  });
  it('blocks both entry points during another mutation', async () => {
    await mount(workspace({ mutationLocked: true }));
    await act(async () => { await actions.copy(); await actions.copyFromList('list-order'); });
    expect(apiClient).not.toHaveBeenCalled();
  });
  it('keeps callbacks stable but uses the latest selected document', async () => {
    await mount(workspace());
    const { copy, copyFromList } = actions;
    await act(async () => { renderer.update(React.createElement(Harness, { ws: workspace({ selectedOrder: { guid: 'latest' } }) })); });
    expect(actions.copy).toBe(copy);
    expect(actions.copyFromList).toBe(copyFromList);
    await act(async () => { await actions.copy(); });
    expect(apiClient).toHaveBeenCalledWith('/api/order-sharing/latest/share', expect.anything());
  });
  it('does not copy into the clipboard after the screen unmounts', async () => {
    let finish!: (value: unknown) => void;
    (apiClient as jest.Mock).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await mount(workspace());
    let task!: Promise<void>;
    act(() => { task = actions.copyFromList('list-order'); });
    act(() => renderer.unmount());
    await act(async () => { finish({ ok: true, data: link }); await task; });
    expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
  });
});
