import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable', Modal: 'Modal',
  Platform: { select: (values: any) => values.web },
  StyleSheet: { create: (value: any) => value, absoluteFill: {} },
}));
jest.mock('expo-router', () => ({ Tabs: Object.assign((props: any) => require('react').createElement('Tabs', props), { Screen: 'Screen' }) }));
jest.mock('moti', () => ({ MotiView: 'MotiView' }));
jest.mock('@/hooks/useThemeColor', () => ({ useThemeColor: () => '#FFFFFF' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 24 }) }));

import MobileTabs from '@/components/Navigation/MobileTabs';
import TabBarSpacer from '@/components/Navigation/TabBarSpacer';
import CustomAlert from '@/components/CustomAlert';
import { ProfileBottomSpacer } from '@/src/features/profile/ui/ProfileBottomSpacer';

let renderer: TestRenderer.ReactTestRenderer;
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); });

test('keeps existing routes without rendering bottom navigation', async () => {
  await act(async () => { renderer = TestRenderer.create(React.createElement(MobileTabs)); });
  const tabs = renderer.root.findByType('Tabs' as any);
  expect(tabs.props.tabBar({})).toBeNull();
  expect(tabs.props.screenOptions.tabBarStyle.display).toBe('none');
  expect(renderer.root.findAllByType('Screen' as any).map(node => node.props.name))
    .toEqual(['home/index', 'tasks/index', 'services', 'profile', 'admin']);
});

test('removed navigation leaves no phantom footer; profile retains gesture inset', async () => {
  await act(async () => { renderer = TestRenderer.create(React.createElement(React.Fragment, null,
    React.createElement(TabBarSpacer), React.createElement(TabBarSpacer, { extra: 8 }), React.createElement(ProfileBottomSpacer))); });
  expect(renderer.root.findAllByType('View' as any).map(node => node.props.style.height)).toEqual([0, 8, 32]);
});

test('shared logout alert stays compact and keeps cancel, confirm and system back', async () => {
  const onCancel = jest.fn(), onConfirm = jest.fn();
  await act(async () => { renderer = TestRenderer.create(React.createElement(CustomAlert, {
    visible: true, title: 'Выйти из аккаунта?', message: 'Отслеживание геолокации будет остановлено.', onCancel, onConfirm,
  })); });
  const card = renderer.root.findAllByType('MotiView' as any).find(node => Array.isArray(node.props.style))!;
  expect(card.props.style[0]).toMatchObject({ width: '100%', maxWidth: 420, borderRadius: 16 });
  const actions = renderer.root.findAllByType('Pressable' as any).filter(node => node.props.accessibilityRole === 'button');
  expect(actions).toHaveLength(2);
  await act(async () => { actions[0].props.onPress(); actions[1].props.onPress(); renderer.root.findByType('Modal' as any).props.onRequestClose(); });
  expect(onCancel).toHaveBeenCalledTimes(2);
  expect(onConfirm).toHaveBeenCalledTimes(1);
});
