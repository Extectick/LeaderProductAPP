import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AccessibilityInfo, Animated, AppState, StyleSheet } from 'react-native';
import { SendDeviceOrdersButton } from '../src/features/clientOrders/screen/SendDeviceOrdersButton';

jest.mock('react-native-paper', () => {
  const React = require('react');
  const host = (name: string) => (props: any) => React.createElement(name, props, props.children);
  return { Icon: host('Icon'), ActivityIndicator: host('Spinner'), Badge: host('Badge'), Text: host('PaperText'), TouchableRipple: host('TouchableRipple') };
});

let screen: ReactTestRenderer;
const initialAppState = AppState.currentState;
const onPress = jest.fn();
const props = { count: 4, online: true, sending: false, onPress };
const render = async (overrides = {}) => { await act(async () => { screen = create(React.createElement(SendDeviceOrdersButton, { ...props, ...overrides })); }); };
beforeEach(() => { jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true); });
afterEach(async () => { await act(async () => screen?.unmount()); AppState.currentState = initialAppState; jest.restoreAllMocks(); jest.useRealTimers(); jest.clearAllMocks(); });

it('uses a flat full-width Paper button and a separate actual count', async () => {
  await render();
  const button = screen.root.findByType('TouchableRipple' as any);
  expect(StyleSheet.flatten(button.props.style)).toMatchObject({ alignSelf: 'stretch', backgroundColor: '#DCFCE7' });
  expect(StyleSheet.flatten(button.props.style).borderWidth).toBeUndefined();
  expect(button.props.accessibilityState).toEqual({ disabled: false, busy: false });
  expect(button.props.accessibilityHint).toBe('Отправятся только документы из очереди. Черновики останутся на устройстве');
  expect(screen.root.findByType('PaperText' as any).props.children).toBe('Отправить документы');
  expect(screen.root.findByType('Badge' as any).props.children).toBe('4');
  expect(screen.root.findByType('Icon' as any).props.source).toBe('cloud-upload-outline');
  button.props.onPress();
  expect(onPress).toHaveBeenCalledTimes(1);
});

it('shows one spinner while sending and disables repeated taps', async () => {
  await render({ sending: true });
  const button = screen.root.findByType('TouchableRipple' as any);
  expect(button.props.disabled).toBe(true);
  expect(button.props.accessibilityState.busy).toBe(true);
  expect(screen.root.findAllByType('Spinner' as any)).toHaveLength(1);
  expect(screen.root.findAllByType('Icon' as any)).toHaveLength(0);
  expect(screen.root.findByType('PaperText' as any).props.children).toBe('Отправка документов…');
});

it('uses a neutral disabled offline state without hiding the count', async () => {
  await render({ online: false });
  const button = screen.root.findByType('TouchableRipple' as any);
  expect(button.props.disabled).toBe(true);
  expect(button.props.accessibilityHint).toContain('Подключитесь к интернету');
  expect(StyleSheet.flatten(button.props.style).backgroundColor).toBe('#F1F5F9');
  expect(screen.root.findByType('Icon' as any).props.source).toBe('cloud-off-outline');
  expect(screen.root.findByType('Badge' as any).props.children).toBe('4');
});

it('keeps the existing operation lock and allows long labels to wrap on narrow screens', async () => {
  await render({ disabled: true, count: 1000 });
  expect(screen.root.findByType('TouchableRipple' as any).props.disabled).toBe(true);
  const label = screen.root.findByType('PaperText' as any);
  expect(label.props.numberOfLines).toBeUndefined();
  expect(StyleSheet.flatten(label.props.style)).toMatchObject({ flex: 1, minWidth: 0 });
  expect(screen.root.findByType('Badge' as any).props.children.replace(/\s/g, '')).toBe('1000');
});

it('does not show an action when there are no queued documents', async () => {
  await render({ count: 0 });
  expect(screen.toJSON()).toBeNull();
});

it('shows only an icon and the actual count in the compact sync strip', async () => {
  await render({ compact: true });
  expect(screen.root.findAllByType('PaperText' as any)).toHaveLength(0);
  expect(screen.root.findByType('Badge' as any).props.children).toBe('4');
  const button = screen.root.findByType('TouchableRipple' as any);
  expect(button.props.accessibilityLabel).toContain('В очереди: 4');
  expect(StyleSheet.flatten(button.props.style)).toMatchObject({ marginTop: 0, borderRadius: 0 });
});

it('keeps the upload icon and count offline without bouncing or sending', async () => {
  const animate = jest.spyOn(Animated, 'timing');
  await render({ compact: true, online: false });
  expect(screen.root.findByType('Icon' as any).props.source).toBe('cloud-upload-outline');
  expect(screen.root.findByType('TouchableRipple' as any).props.disabled).toBe(true);
  expect(animate).not.toHaveBeenCalled();
});

it('reminds gently then stops in the background, for reduced motion and when sending', async () => {
  jest.useFakeTimers();
  AppState.currentState = 'active';
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(false);
  let changeState!: (state: string) => void;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener: any) => {
    changeState = listener; return { remove: jest.fn() };
  });
  const animate = jest.spyOn(Animated, 'timing');
  await render({ compact: true });
  await act(async () => { jest.advanceTimersByTime(1_800); });
  expect(animate).toHaveBeenCalledTimes(2);
  await act(async () => { changeState('background'); jest.advanceTimersByTime(20_000); });
  expect(animate).toHaveBeenCalledTimes(2);
  await act(async () => { screen.update(React.createElement(SendDeviceOrdersButton, { ...props, compact: true, sending: true })); });
  await act(async () => { jest.advanceTimersByTime(20_000); });
  expect(animate).toHaveBeenCalledTimes(2);
});
