import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
jest.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable', Modal: 'Modal', ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: (x: any) => x }, Platform: { OS: 'android' }, Alert: { alert: jest.fn() } }));
jest.mock('react-native-paper', () => {
  const React = require('react'); const host = (name: string) => (props: any) => React.createElement(name, props);
  return { Button: host('Button'), Divider: host('Divider'), Text: host('Text'), TextInput: host('Input'), Switch: host('Switch'),
    List: { Icon: host('Icon'), Item: (props: any) => React.createElement('Item', props, props.right?.({})) } };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('expo-clipboard', () => ({ getStringAsync: jest.fn() }));
jest.mock('expo-linking', () => ({ openURL: jest.fn(), canOpenURL: jest.fn() }));
jest.mock('@/context/TrackingContextV2', () => ({ useTracking: jest.fn() }));
jest.mock('@/utils/trackingV2Service', () => ({ openTrackingSettings: jest.fn(), requestTrackingPermissions: jest.fn() }));
jest.mock('@/hooks/useIsAdmin', () => ({ useIsAdmin: () => ({ isAdmin: false }) }));
jest.mock('@/utils/trackingApi', () => ({ getTrackingAdminHealth: jest.fn() }));
jest.mock('@/utils/authService', () => ({ addCredentials: jest.fn(), changePassword: jest.fn(), requestPasswordReset: jest.fn(), resendVerification: jest.fn(), verify: jest.fn(), verifyPasswordReset: jest.fn() }));
jest.mock('@/components/OTP6Input', () => 'OTP6Input');
import { CredentialsSection } from '../src/features/profile/ui/ProfileServiceSettings';
import { ProfileTrackingSettings } from '../src/features/profile/ui/ProfileTrackingSettings';
import { requestPasswordReset, verifyPasswordReset, changePassword } from '../utils/authService';
const ready: any = { available: true, permission: 'granted', backgroundPermission: 'granted', activityRecognitionPermission: 'granted', preciseLocation: true, locationServicesEnabled: true, notificationsEnabled: true, batteryOptimizationExempt: true, powerSaveMode: false };
let renderer: TestRenderer.ReactTestRenderer;
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); jest.clearAllMocks(); });

test.each([
  ['batteryOptimizationExempt', false], ['batteryOptimizationExempt', undefined], ['powerSaveMode', true],
  ['preciseLocation', false], ['notificationsEnabled', false], ['locationServicesEnabled', false],
  ['permission', 'denied'], ['backgroundPermission', 'denied'], ['activityRecognitionPermission', 'denied'],
])('setup switch stays disabled when %s is %s', async (key, value) => {
  await act(async () => { renderer = TestRenderer.create(React.createElement(ProfileTrackingSettings, {
    diagnostics: { ...ready, [key as string]: value }, enabled: false, busy: false, status: '', onToggle: jest.fn(), onRefresh: jest.fn(), onSetup: jest.fn(),
  })); });
  expect(renderer.root.findByType('Switch' as any).props.disabled).toBe(true);
  expect(renderer.root.findByType('Switch' as any).props.value).toBe(false);
});

test('completed checklist enables manual switch, and stopping stays available with revoked permissions', async () => {
  const onToggle = jest.fn();
  const props = { diagnostics: ready, enabled: false, busy: false, status: '', onToggle, onRefresh: jest.fn(), onSetup: jest.fn() };
  await act(async () => { renderer = TestRenderer.create(React.createElement(ProfileTrackingSettings, props)); });
  expect(onToggle).not.toHaveBeenCalled();
  expect(renderer.root.findByType('Switch' as any).props.disabled).toBe(false);
  await act(async () => renderer.root.findByType('Switch' as any).props.onValueChange());
  expect(onToggle).toHaveBeenCalledTimes(1);
  await act(async () => renderer.update(React.createElement(ProfileTrackingSettings, { ...props, enabled: true, diagnostics: { ...ready, permission: 'denied' } })));
  expect(renderer.root.findByType('Switch' as any).props.disabled).toBe(false);
});

test('flat security screen keeps password reset behind email verification', async () => {
  const profile: any = { email: 'test@example.test', authMethods: { passwordLoginEnabled: true } };
  await act(async () => { renderer = TestRenderer.create(React.createElement(CredentialsSection, { profile, onAdded: jest.fn() })); });
  const item = renderer.root.find(node => node.type === ('Item' as any) && node.props.title === 'Сбросить пароль');
  await act(async () => item.props.onPress());
  expect(requestPasswordReset).toHaveBeenCalledWith(profile.email);
  expect(changePassword).not.toHaveBeenCalled();
  expect(renderer.root.findByType('Modal' as any).props.visible).toBe(true);
  await act(async () => renderer.root.findByType('OTP6Input' as any).props.onFilled('123456'));
  expect(verifyPasswordReset).toHaveBeenCalledWith(profile.email, '123456');
  const input = (label: string) => renderer.root.find(node => node.type === ('Input' as any) && node.props.label === label);
  await act(async () => { input('Новый пароль').props.onChangeText('test-password'); input('Повторите пароль').props.onChangeText('test-password'); });
  const save = renderer.root.findAllByType('Pressable' as any).find(node => node.findAllByType('Text' as any).some(text => text.props.children === 'Сохранить пароль'))!;
  await act(async () => save.props.onPress());
  expect(changePassword).toHaveBeenCalledWith(profile.email, '123456', 'test-password');
  expect(renderer.root.findByType('Modal' as any).props.visible).toBe(false);
});
