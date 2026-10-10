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
  function Harness({ ws, select }: { ws: any; select: any }) { actions = useOrderShareActions(ws, select); return null; }
  const mount = async (ws: any, select: any) => { await act(async () => { renderer = TestRenderer.create(React.createElement(Harness, { ws, select })); }); };
  afterEach(() => { if (renderer) act(() => renderer.unmount()); });

  it('waits for the requested list document, never opening the previous one', async () => {
    const select = jest.fn(async () => true);
    await mount(workspace(), select);
    await act(async () => { await actions.openFromList('second-order'); });
    expect(select).toHaveBeenCalledWith('second-order');
    expect(actions.visible).toBe(false);
    await act(async () => { renderer.update(React.createElement(Harness, { ws: workspace({ selectedOrder: { guid: 'second-order' } }), select })); });
    expect(actions.visible).toBe(true);
    expect(apiClient).not.toHaveBeenCalled();
  });
  it('does not open a link dialog if document selection was cancelled', async () => {
    await mount(workspace(), jest.fn(async () => false));
    await act(async () => { await actions.openFromList('second-order'); });
    expect(actions.visible).toBe(false);
  });
  it('copies from the document number once on rapid taps without a dialog', async () => {
    await mount(workspace(), jest.fn());
    await act(async () => { await Promise.all([actions.copy(), actions.copy()]); });
    expect(apiClient).toHaveBeenCalledTimes(1);
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(link.url);
    expect(actions.feedback).toBe('Ссылка скопирована');
    expect(actions.visible).toBe(false);
    expect(actions.copying).toBe(false);
  });
  it('shows feedback without copying when offline publication fails', async () => {
    (apiClient as jest.Mock).mockRejectedValue(new Error('Нет сети'));
    await mount(workspace(), jest.fn());
    await act(async () => { await actions.copy(); });
    expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
    expect(actions.feedback).toBe('Нет сети');
    expect(actions.copying).toBe(false);
  });
  it('keeps the header callback stable but uses the latest selected document', async () => {
    const select = jest.fn();
    await mount(workspace(), select);
    const copy = actions.copy;
    await act(async () => { renderer.update(React.createElement(Harness, { ws: workspace({ selectedOrder: { guid: 'latest' } }), select })); });
    expect(actions.copy).toBe(copy);
    await act(async () => { await actions.copy(); });
    expect(apiClient).toHaveBeenCalledWith('/api/order-sharing/latest/share', expect.anything());
  });
});
