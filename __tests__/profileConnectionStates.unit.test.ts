import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { OnecConnectionForm } from '../src/features/profile/ui/OnecConnectionForm';
import type { OnecConnection } from '../src/features/profile/api/onecConnections';

jest.mock('react-native', () => ({ View: 'View' }));
jest.mock('react-native-paper', () => ({ Text: 'Text' }));
jest.mock('@/components/ui/appSurfaceTokens', () => ({ useAppSurfaceTheme: () => ({ text: '#111', muted: '#666', green: '#080' }) }));
jest.mock('../src/features/profile/ui/ConnectionPrimitives', () => ({ ConnectionAction: 'Action', ConnectionField: 'Field' }));

const connection: OnecConnection = { baseKey: 'main', label: 'Торговля', login: 'employee', displayName: 'Иван Петров', loginLocked: false, mapped: true, connected: true, verifiedAt: '2026-11-07T00:00:00Z' };
let screen: TestRenderer.ReactTestRenderer;
afterEach(async () => { if (screen) await act(async () => screen.unmount()); });

test('connected 1C shows the account and detach action without credential fields', async () => {
  const onDisconnect = jest.fn();
  await act(async () => { screen = TestRenderer.create(React.createElement(OnecConnectionForm, { connection, onSave: jest.fn(), onDisconnect, busy: false, resetKey: 0 })); });
  expect(screen.root.findAllByType('Field' as any)).toHaveLength(0);
  const texts = screen.root.findAllByType('Text' as any).map(node => node.props.children);
  expect(texts).toEqual(expect.arrayContaining(['Подключено', 'Иван Петров']));
  const detach = screen.root.findByType('Action' as any);
  expect(detach.props.children).toBe('Отвязать');
  await act(async () => detach.props.onPress());
  expect(onDisconnect).toHaveBeenCalledTimes(1);
  // No optimistic local disconnect: failure must leave the connected account visible.
  expect(screen.root.findAllByType('Field' as any)).toHaveLength(0);
});

test('confirmed disconnect reveals the login form and clears the password', async () => {
  const props = { onSave: jest.fn(), onDisconnect: jest.fn(), busy: false, resetKey: 0 };
  await act(async () => { screen = TestRenderer.create(React.createElement(OnecConnectionForm, { ...props, connection: { ...connection, connected: false } })); });
  const fields = () => screen.root.findAllByType('Field' as any);
  await act(async () => fields()[1].props.onChangeText('test-only-secret'));
  await act(async () => screen.update(React.createElement(OnecConnectionForm, { ...props, connection, resetKey: 1 })));
  expect(fields()).toHaveLength(0);
  await act(async () => screen.update(React.createElement(OnecConnectionForm, { ...props, connection: { ...connection, connected: false, verifiedAt: null }, resetKey: 2 })));
  expect(fields()[0].props.value).toBe('employee');
  expect(fields()[1].props.value).toBe('');
  expect(screen.root.findByType('Action' as any).props.disabled).toBe(true);
});
