import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type { Profile } from '../src/entities/user/types';

let mockTheme = 'light';
jest.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: mockTheme, themes: require('../constants/Colors').Colors }) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', Image: 'Image', Pressable: 'Pressable',
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 0.5 },
  Linking: { openURL: jest.fn(() => Promise.resolve()) },
}));

import { Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Colors } from '../constants/Colors';
import { UserProfileCard } from '../components/Profile/UserProfileCard';

const sample = (changes: Partial<Profile> = {}): Profile => ({
  id: 7, firstName: 'Анна', middleName: 'Петровна', lastName: 'Иванова', avatarUrl: null,
  email: 'anna@example.test', phone: '89991234567', profileStatus: 'ACTIVE', currentProfileType: 'EMPLOYEE',
  role: { id: 2, name: 'employee' }, departmentRoles: [
    { department: { id: 4, name: 'Логистика' }, role: { id: 3, name: 'department_manager' } },
  ],
  employeeProfile: { id: 11, status: 'ACTIVE', department: { id: 4, name: 'Логистика' },
    activeDepartment: { id: 5, name: 'Закупки' }, departmentRoles: [], onecUserGuid: 'synthetic-identity-only',
    createdAt: new Date('2026-01-02T10:00:00Z'), updatedAt: new Date('2026-01-03T10:00:00Z') },
  ...changes,
});
let view: TestRenderer.ReactTestRenderer;
const visibleText = (): string => {
  const collect = (value: any): string => typeof value === 'string' ? value : Array.isArray(value) ? value.map(collect).join(' ') : value?.children ? collect(value.children) : '';
  return collect(view.toJSON());
};
const button = (label: string) => view.root.findByProps({ accessibilityRole: 'button', accessibilityLabel: label });
async function render(profile = sample(), props = {}) {
  await act(async () => { view = TestRenderer.create(React.createElement(UserProfileCard, { profile, ...props })); });
}

beforeEach(() => {
  mockTheme = 'light';
  (Clipboard.setStringAsync as jest.Mock).mockReset().mockResolvedValue(undefined);
  (Linking.openURL as jest.Mock).mockReset().mockResolvedValue(undefined);
});
afterEach(async () => { if (view) await act(async () => view.unmount()); });

test('shows wrapped identity, known presence and department roles with technical data disclosed on demand', async () => {
  await render(sample(), { presenceLabel: 'В сети', presenceOnline: true });
  expect(visibleText()).toContain('Анна Петровна Иванова');
  expect(visibleText()).toContain('Сотрудник');
  expect(visibleText()).toContain('В сети');
  expect(visibleText()).toContain('Логистика');
  expect(visibleText()).toContain('Закупки');
  expect(visibleText()).toContain('Руководитель отдела');
  expect(visibleText()).toContain('Профиль 1С');
  expect(visibleText()).not.toContain('synthetic-identity-only');
  expect(visibleText()).not.toContain('ID пользователя');
  expect(view.root.findAllByType('ScrollView' as any)).toHaveLength(0);
  await act(async () => button('Подробности профиля').props.onPress());
  expect(visibleText()).toContain('ID пользователя');
  expect(visibleText()).toContain('Создан');
  expect(visibleText()).toContain('Обновлён');
  expect(visibleText()).toContain('Активен');
  expect(visibleText()).not.toContain('ACTIVE');
  expect(button('Подробности профиля').props.accessibilityState.expanded).toBe(true);
});

test('calls the native dialer, mail app and native clipboard using only known contacts', async () => {
  await render();
  await act(async () => button('Позвонить').props.onPress());
  expect(Linking.openURL).toHaveBeenCalledWith('tel:+79991234567');
  await act(async () => button('Написать').props.onPress());
  expect(Linking.openURL).toHaveBeenCalledWith('mailto:anna%40example.test');
  await act(async () => button('Скопировать контакты').props.onPress());
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith('89991234567\nanna@example.test');
  expect(visibleText()).toContain('Контакты скопированы');
  const contact = view.root.findAllByType('Text' as any).find(node => node.props.children === '+7 (999) 123-45-67');
  expect(contact?.props.selectable).toBe(true);
  for (const label of ['Позвонить', 'Написать', 'Скопировать контакты']) {
    expect(button(label).props.style({ pressed: false })[0].minHeight).toBeGreaterThanOrEqual(44);
  }
});

test('native contact failures stay inline and do not expose platform errors', async () => {
  await render();
  (Clipboard.setStringAsync as jest.Mock).mockRejectedValue(new Error('PRIVATE_NATIVE_ERROR'));
  await act(async () => button('Скопировать контакты').props.onPress());
  expect(visibleText()).toContain('Не удалось выполнить действие');
  expect(visibleText()).not.toContain('PRIVATE_NATIVE_ERROR');
  (Clipboard.setStringAsync as jest.Mock).mockResolvedValue(false);
  await act(async () => button('Скопировать контакты').props.onPress());
  expect(visibleText()).not.toContain('Контакты скопированы');
  expect(visibleText()).toContain('Не удалось выполнить действие');
  (Linking.openURL as jest.Mock).mockRejectedValue(new Error('PRIVATE_URL_ERROR'));
  await act(async () => button('Позвонить').props.onPress());
  expect(visibleText()).not.toContain('PRIVATE_URL_ERROR');
});

test('missing contacts and unknown presence remain honest; clients do not inherit employee 1С state', async () => {
  await render(sample({ email: null, phone: null, currentProfileType: 'CLIENT', departmentRoles: [] }));
  expect(visibleText()).toContain('Контакты не указаны');
  expect(visibleText()).not.toContain('В сети');
  expect(visibleText()).not.toContain('Не в сети');
  expect(visibleText()).not.toContain('Профиль 1С');
  for (const label of ['Позвонить', 'Написать', 'Скопировать контакты']) expect(view.root.findAllByProps({ accessibilityLabel: label })).toHaveLength(0);
  expect(Linking.openURL).not.toHaveBeenCalled();
});

test('legacy employee department roles remain visible when the global role list is empty', async () => {
  const profile = sample();
  await render({ ...profile, departmentRoles: [], employeeProfile: {
    ...profile.employeeProfile!, departmentRoles: [{ id: 10, role: { id: 3, name: 'department_manager' } }],
  } });
  expect(visibleText()).toContain('Руководитель отдела');
  expect(visibleText()).toContain('Логистика');
});

test('contact verification requires explicit verified timestamps', async () => {
  const profile = sample({ authMethods: { telegramLinked: false, maxLinked: false, passwordLoginEnabled: true, passwordLoginPendingVerification: false } });
  await render(profile);
  expect(view.root.findAllByProps({ accessibilityLabel: 'Почта подтверждена' })).toHaveLength(0);
  expect(view.root.findAllByProps({ accessibilityLabel: 'Телефон подтверждён' })).toHaveLength(0);
  await act(async () => view.update(React.createElement(UserProfileCard, { profile: { ...profile, emailVerifiedAt: '2026-01-02T10:00:00Z', phoneVerifiedAt: '2026-01-02T10:00:00Z' } })));
  expect(view.root.findAllByProps({ accessibilityLabel: 'Почта подтверждена' })).toHaveLength(1);
  expect(view.root.findAllByProps({ accessibilityLabel: 'Телефон подтверждён' })).toHaveLength(1);
});

test('dark theme and broken avatar keep legible identity without a hardcoded light panel', async () => {
  mockTheme = 'dark';
  const profile = sample({ avatarUrl: 'https://example.test/avatar.png' });
  await render(profile);
  const name = view.root.findAllByType('Text' as any).find(node => node.props.children === 'Анна Петровна Иванова');
  expect(name?.props.style[1].color).toBe(Colors.dark.text);
  expect(button('Позвонить').props.style({ pressed: false })[2].backgroundColor).toBe(Colors.dark.cardBackground);
  expect(view.root.findByProps({ testID: 'user-profile-card' }).props.style[0].backgroundColor).toBeUndefined();
  await act(async () => view.root.findByType('Image' as any).props.onError());
  expect(view.root.findAllByType('Image' as any)).toHaveLength(0);
  expect(visibleText()).toContain('АИ');
  expect(visibleText()).toContain('Анна Петровна Иванова');
  await act(async () => view.update(React.createElement(UserProfileCard, { profile: { ...profile, avatarUrl: 'https://example.test/new-avatar.png' } })));
  expect(view.root.findByType('Image' as any).props.source.uri).toContain('new-avatar.png');
});

test('changing user resets disclosure and ignores an old pending copy confirmation', async () => {
  let complete!: () => void;
  (Clipboard.setStringAsync as jest.Mock).mockImplementation(() => new Promise<void>(resolve => { complete = resolve; }));
  await render();
  await act(async () => button('Подробности профиля').props.onPress());
  await act(async () => button('Скопировать контакты').props.onPress());
  await act(async () => view.update(React.createElement(UserProfileCard, { profile: sample({ id: 8, firstName: 'Елена' }) })));
  await act(async () => complete());
  expect(visibleText()).toContain('Елена Петровна Иванова');
  expect(visibleText()).not.toContain('Контакты скопированы');
  expect(visibleText()).not.toContain('ID пользователя');
});
