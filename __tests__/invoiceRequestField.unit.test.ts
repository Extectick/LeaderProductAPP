import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => ({ View: 'View', Pressable: 'Pressable',
  Linking: { openURL: jest.fn() }, Platform: { OS: 'android' } }));
jest.mock('react-native-paper', () => ({ Text: 'Text', ActivityIndicator: 'ActivityIndicator' }));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }));
jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('expo-sharing', () => ({}));
jest.mock('@/utils/clientOrdersService', () => ({ downloadClientOrderInvoice: jest.fn() }));
jest.mock('@/utils/androidFileDownload', () => ({ enqueueAuthenticatedAndroidDownload: jest.fn() }));

import { InvoiceRequestField } from '../src/features/clientOrders/screen/mobile/InvoiceRequestField';

let renderer: TestRenderer.ReactTestRenderer;
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); });
const savedOrder = { guid: 'old-order', number1c: 'НОУТ-1', status: 'CONFIRMED', syncState: 'SYNCED',
  source: 'MANAGER_APP', invoiceState: 'WAITING', invoiceRequestPending: true };
function props(patch: any = {}) {
  return { styles: {}, readOnly: true, requestBusy: true, requestPending: true,
    downloadBusy: false, shareBusy: false, onDownload: jest.fn(), onShare: jest.fn(),
    onRequestInvoice: jest.fn(), ...patch,
    workspace: { selectedOrder: null, draft: { clientOrderId: 'new-client-id', invoiceRequested: false },
      selections: {}, readOnly: false, loadingDefaults: false, patchDraft: jest.fn(), ...patch.workspace },
  };
}
const labels = () => renderer.root.findAllByType('Text' as any).map(node => node.props.children).join(' ');
const checkboxes = () => renderer.root.findAllByType('Pressable' as any).filter(node => node.props.accessibilityRole === 'checkbox');
async function mount(value: ReturnType<typeof props>) {
  await act(async () => { renderer = TestRenderer.create(React.createElement(InvoiceRequestField, value)); });
}

it('keeps the new-order checkbox during a temporary lock, even with stale request flags', async () => {
  await mount(props());
  expect(labels()).toContain('Отправлять счёт автоматически');
  expect(labels()).not.toContain('Счёт формируется');
  expect(labels()).not.toContain('Запросить счёт');
  expect(checkboxes()).toHaveLength(1);
  expect(renderer.root.findAllByType('ActivityIndicator' as any)).toHaveLength(0);
});

it('does not carry the previous invoice spinner into the next document', async () => {
  await mount(props({ workspace: { selectedOrder: savedOrder, readOnly: true } }));
  expect(labels()).toContain('Счёт формируется');
  await act(async () => renderer.update(React.createElement(InvoiceRequestField, props())));
  expect(labels()).toContain('Отправлять счёт автоматически');
  expect(labels()).not.toContain('Счёт формируется');
  expect(renderer.root.findAllByType('ActivityIndicator' as any)).toHaveLength(0);
});

it.each([
  { origin: 'device', source: 'DEVICE_LOCAL', status: 'QUEUED', syncState: 'QUEUED' },
  { source: 'MANAGER_APP', status: 'DRAFT', syncState: 'DRAFT' },
])('ignores invoice metadata on a new/local draft: %j', async draft => {
  await mount(props({ workspace: { selectedOrder: { ...savedOrder, ...draft, number1c: null,
    invoiceDownloadAvailable: true }, readOnly: true } }));
  expect(labels()).toContain('Отправлять счёт автоматически');
  expect(labels()).not.toContain('Скачать счёт');
  expect(labels()).not.toContain('Счёт формируется');
  expect(renderer.root.findAllByType('ActivityIndicator' as any)).toHaveLength(0);
});

it('does not interpret a temporary lock on an editable order as document read-only state', async () => {
  await mount(props({ workspace: { selectedOrder: savedOrder, readOnly: false } }));
  expect(checkboxes()).toHaveLength(1);
  expect(checkboxes()[0].props.disabled).toBe(true);
  expect(labels()).not.toContain('Счёт формируется');
});

it('retains real invoice progress on the original read-only document', async () => {
  await mount(props({ workspace: { selectedOrder: savedOrder, readOnly: true } }));
  expect(labels()).toContain('Счёт формируется');
  expect(renderer.root.findAllByType('ActivityIndicator' as any)).toHaveLength(1);
});

it('retains PDF download and sharing for an existing invoice', async () => {
  const value = props({ workspace: { selectedOrder: { ...savedOrder, invoiceDownloadAvailable: true }, readOnly: true } });
  await mount(value);
  expect(labels()).toContain('Скачать счёт');
  await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Скачать счёт' }).props.onPress());
  await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Поделиться счётом' }).props.onPress());
  expect(value.onDownload).toHaveBeenCalledTimes(1);
  expect(value.onShare).toHaveBeenCalledTimes(1);
});

it('keeps the automatic-delivery preference editable and resets its optimistic state for a new draft', async () => {
  const value = props({ readOnly: false, workspace: { draft: { clientOrderId: 'a', invoiceRequested: false, counterpartyGuid: 'client' } } });
  await mount(value);
  await act(async () => checkboxes()[0].props.onPress());
  expect(value.workspace.patchDraft).toHaveBeenCalledWith({ invoiceRequested: true });
  expect(checkboxes()[0].props.accessibilityState.checked).toBe(true);
  await act(async () => renderer.update(React.createElement(InvoiceRequestField,
    props({ readOnly: false, workspace: { draft: { clientOrderId: 'b', invoiceRequested: false } } }))));
  expect(checkboxes()[0].props.accessibilityState.checked).toBe(false);
});
