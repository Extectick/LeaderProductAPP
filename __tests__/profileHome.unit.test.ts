import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
jest.mock('react-native', () => ({ View: 'View', Pressable: 'Pressable', Text: 'Text', StyleSheet: { create: (value: unknown) => value } }));
jest.mock('react-native-reanimated', () => ({ __esModule: true, default: { View: 'AnimatedView' }, useReducedMotion: () => false, useSharedValue: (value: number) => ({ value }), useAnimatedStyle: (fn: any) => fn(), withSpring: (value: number) => value }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('react-native-paper', () => {
  const React = require('react'); const host = (name: string) => (props: any) => React.createElement(name, props);
  return { Avatar: { Image: host('AvatarImage'), Text: host('AvatarText'), Icon: host('AvatarIcon') },
    Button: host('Button'), Divider: host('Divider'), List: { Item: host('Item') }, Switch: host('Switch'), Text: host('Text'), TouchableRipple: host('Ripple') };
});
import { ProfileHome } from '../src/features/profile/ui/ProfileHome';
let renderer: TestRenderer.ReactTestRenderer;
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); });
test('all summary rows navigate and geo switch does not open the detail', async () => {
  const onOpen = jest.fn(), onToggleTracking = jest.fn(), onLogout = jest.fn();
  await act(async () => { renderer = TestRenderer.create(React.createElement(ProfileHome, {
    profile: { id: 1, firstName: 'Анна', lastName: 'Менеджер', role: { name: 'MANAGER' }, employeeProfile: {} } as any,
    version: '0.1.34.10', trackingEnabled: true, trackingBusy: false, trackingText: 'Включена', trackingColor: '#059669',
    onOpen, onToggleTracking, onLogout,
  })); });
  const expected: Record<string, string> = { 'Контакты для клиентов': 'contacts', 'Личные данные': 'personal', 'Работа и отделы': 'work',
    'Безопасность': 'security', 'Уведомления': 'notifications', 'О приложении': 'about', 'Геолокация': 'tracking' };
  for (const [title, section] of Object.entries(expected)) {
    await act(async () => renderer.root.find(node => node.type === ('Item' as any) && node.props.title === title).props.onPress());
    expect(onOpen).toHaveBeenLastCalledWith(section);
  }
  onOpen.mockClear();
  await act(async () => renderer.root.findByType('Switch' as any).props.onValueChange());
  expect(onToggleTracking).toHaveBeenCalledTimes(1); expect(onOpen).not.toHaveBeenCalled();
  await act(async () => renderer.root.find(node => node.type === ('Pressable' as any) && node.props.accessibilityLabel === 'Выйти из аккаунта').props.onPress());
  expect(onLogout).toHaveBeenCalledTimes(1);
});
