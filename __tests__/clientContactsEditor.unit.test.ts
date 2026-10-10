import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => ({ View: 'View', StyleSheet: { create: (value: unknown) => value } }));
jest.mock('react-native-paper', () => {
  const React = require('react');
  const host = (name: string) => (props: any) => React.createElement(name, props);
  return {
    ActivityIndicator: host('ActivityIndicator'), Button: host('Button'), HelperText: host('HelperText'),
    IconButton: host('IconButton'), Divider: host('Divider'), List: { Accordion: host('Accordion'), Item: host('Item'), Icon: host('Icon') },
    Text: host('Text'), TextInput: Object.assign(host('TextInput'), { Icon: host('InputIcon') }),
    useTheme: () => ({ colors: { onSurfaceVariant: '#666' } }),
  };
});
jest.mock('@/utils/apiClient', () => ({ apiClient: jest.fn() }));

import { apiClient } from '@/utils/apiClient';
import { ClientContactsEditor } from '../components/Profile/ClientContactsEditor';

const request = apiClient as jest.Mock;
let renderer: TestRenderer.ReactTestRenderer;
const inputs = (label: string) => renderer.root.find(node => node.type === ('TextInput' as any) && node.props.label === label);
const saveButton = () => renderer.root.find(node => node.type === ('Button' as any) && node.props.children === 'Сохранить контакты');

beforeEach(() => {
  request.mockReset();
  // A response from an older API must keep the new inputs empty and editable.
  request.mockResolvedValue({ ok: true, data: { settings: { phones: [], telegramUrl: null, maxUrl: null }, defaultPhone: '+70000000001' } });
});
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); });

test.each([undefined, 42])('profile and admin share WhatsApp/email editor (user %s)', async userId => {
  await act(async () => { renderer = TestRenderer.create(React.createElement(ClientContactsEditor, { userId })); });
  await act(async () => { renderer.root.findByType('Accordion' as any).props.onPress(); });
  expect(request).toHaveBeenLastCalledWith(`/users/${userId ?? 'me'}/client-contacts`, {});
  expect(inputs('WhatsApp').props.value).toBe('');
  expect(inputs('Почта для клиентов').props.value).toBe('');
  expect(inputs('Почта для клиентов').props.keyboardType).toBe('email-address');
  expect(saveButton().props.disabled).toBe(true);
  await act(async () => {
    inputs('WhatsApp').props.onChangeText('+79001234567');
    inputs('Почта для клиентов').props.onChangeText('sales@example.com');
  });
  const saved = { phones: [], telegramUrl: null, maxUrl: null, whatsappUrl: 'https://wa.me/79001234567', email: 'sales@example.com' };
  request.mockResolvedValueOnce({ ok: true, data: { settings: saved, defaultPhone: '+70000000001' } });
  await act(async () => { saveButton().props.onPress(); });
  expect(request).toHaveBeenLastCalledWith(`/users/${userId ?? 'me'}/client-contacts`, { method: 'PUT', body: { ...saved, whatsappUrl: '+79001234567' } });
  expect(inputs('WhatsApp').props.value).toBe(saved.whatsappUrl);
  expect(saveButton().props.disabled).toBe(true);
  await act(async () => {
    inputs('WhatsApp').props.onChangeText('');
    inputs('Почта для клиентов').props.onChangeText('');
  });
  await act(async () => { saveButton().props.onPress(); });
  expect(request.mock.lastCall[1].body).toMatchObject({ whatsappUrl: '', email: '' });
});

test('failed save preserves edits for retry', async () => {
  await act(async () => { renderer = TestRenderer.create(React.createElement(ClientContactsEditor)); });
  await act(async () => { renderer.root.findByType('Accordion' as any).props.onPress(); });
  await act(async () => { inputs('Почта для клиентов').props.onChangeText('invalid'); });
  request.mockResolvedValueOnce({ ok: false, message: 'Проверьте адрес электронной почты' });
  await act(async () => { saveButton().props.onPress(); });
  expect(inputs('Почта для клиентов').props.value).toBe('invalid');
  expect(saveButton().props.disabled).toBe(false);
  expect(renderer.root.findByType('HelperText' as any).props.type).toBe('error');
});

test('embedded profile section loads once and does not require an accordion click', async () => {
  await act(async () => { renderer = TestRenderer.create(React.createElement(ClientContactsEditor, { embedded: true })); });
  expect(renderer.root.findAllByType('Accordion' as any)).toHaveLength(0);
  expect(request).toHaveBeenCalledTimes(1);
  expect(inputs('Telegram').props.value).toBe('');
  await act(async () => inputs('Почта для клиентов').props.onChangeText('client@example.ru'));
  expect(request).toHaveBeenCalledTimes(1);
});
