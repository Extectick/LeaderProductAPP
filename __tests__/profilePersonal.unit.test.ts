import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', Image: 'Image', Pressable: 'Pressable', TextInput: 'NativeInput', ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (x: unknown) => x }, Platform: { OS: 'android', select: (x: any) => x.android || x.default },
  useWindowDimensions: () => ({ width: 390, height: 844 }), AppState: { addEventListener: () => ({ remove: jest.fn() }) },
  Alert: { alert: jest.fn() }, Linking: { openURL: jest.fn() },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('moti/skeleton', () => ({ Skeleton: 'Skeleton' }));
jest.mock('react-native-reanimated', () => ({ __esModule: true, default: { View: 'AnimatedView' } }));
jest.mock('react-native-qrcode-svg', () => 'QRCode');
jest.mock('@/components/ui/AvatarCropperModal', () => 'AvatarCropperModal');
jest.mock('@/context/AuthContext', () => ({ AuthContext: require('react').createContext(null) }));
jest.mock('@/hooks/usePresence', () => ({ usePresence: () => ({}) }));
jest.mock('@/utils/appVersion', () => ({ getAppVersionInfo: () => ({ fullVersionLabel: '0.1.34.10' }) }));
jest.mock('expo-image-picker', () => ({ requestMediaLibraryPermissionsAsync: jest.fn() }));
jest.mock('expo-linking', () => ({ openURL: jest.fn(), canOpenURL: jest.fn() }));
jest.mock('@/utils/userService', () => ({ updateMyProfile: jest.fn(), startEmailChange: jest.fn(), verifyEmailChange: jest.fn(), getProfileById: jest.fn() }));
jest.mock('react-native-paper', () => {
  const React = require('react'); const host = (name: string) => (props: any) => React.createElement(name, props);
  return { Avatar: { Text: host('AvatarText'), Image: host('AvatarImage') }, Button: host('Button'), Divider: host('Divider'), HelperText: host('HelperText'),
    List: { Item: host('Item'), Icon: host('Icon') }, TextInput: host('Input'), TouchableRipple: host('Ripple') };
});
import { ProfileView } from '../components/Profile/ProfileView';
import { updateMyProfile, startEmailChange, verifyEmailChange } from '../utils/userService';
let renderer: TestRenderer.ReactTestRenderer;
const profile: any = { id: 4, firstName: 'Анна', middleName: '', lastName: 'Иванова', role: { name: 'MANAGER' }, email: 'old@example.ru', departmentRoles: [] };
const input = (label: string) => renderer.root.find(node => node.type === ('Input' as any) && node.props.label === label);
const button = (label: string) => renderer.root.find(node => node.type === ('Button' as any) && node.props.children === label);
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); jest.clearAllMocks(); });
test('personal editor preserves name edits during profile refresh and saves through the existing endpoint', async () => {
  const updated = jest.fn();
  const props = { profileOverride: profile, presentation: 'personal' as const, disableAppearAnimation: true, onProfileUpdated: updated };
  await act(async () => { renderer = TestRenderer.create(React.createElement(ProfileView, props)); });
  expect(button('Сохранить имя').props.disabled).toBe(true);
  await act(async () => input('Имя').props.onChangeText('Мария'));
  await act(async () => renderer.update(React.createElement(ProfileView, { ...props, profileOverride: { ...profile, phone: '79000000000' } })));
  expect(input('Имя').props.value).toBe('Мария');
  (updateMyProfile as jest.Mock).mockResolvedValue({ ...profile, firstName: 'Мария' });
  await act(async () => button('Сохранить имя').props.onPress());
  expect(updateMyProfile).toHaveBeenCalledWith({ firstName: 'Мария' });
  expect(updated).toHaveBeenCalledWith(expect.objectContaining({ firstName: 'Мария' }));
});
test('email changes keep the verification-code step, not a direct profile write', async () => {
  (startEmailChange as jest.Mock).mockResolvedValue({ sessionId: 'session', requestedEmail: 'new@example.ru' });
  (verifyEmailChange as jest.Mock).mockResolvedValue({ ...profile, email: 'new@example.ru' });
  await act(async () => { renderer = TestRenderer.create(React.createElement(ProfileView, { profileOverride: profile, presentation: 'personal', disableAppearAnimation: true })); });
  await act(async () => renderer.root.find(node => node.type === ('Item' as any) && node.props.title === 'Почта для входа').props.onPress());
  await act(async () => input('Новая почта').props.onChangeText('new@example.ru'));
  await act(async () => button('Получить код').props.onPress());
  expect(startEmailChange).toHaveBeenCalledWith('new@example.ru');
  expect(updateMyProfile).not.toHaveBeenCalled();
  expect(button('Подтвердить почту').props.disabled).toBe(true);
  await act(async () => input('Код из письма').props.onChangeText('123456'));
  await act(async () => button('Подтвердить почту').props.onPress());
  expect(verifyEmailChange).toHaveBeenCalledWith('session', '123456');
});
