import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
jest.mock('react-native', () => ({ View: 'View' }));
jest.mock('react-native-paper', () => {
  const React = require('react'); const host = (name: string) => (props: any) => React.createElement(name, props);
  return { ActivityIndicator: host('Loader'), Button: host('Button'), Divider: host('Divider'), HelperText: host('HelperText'),
    List: { Item: (props: any) => React.createElement('Item', props, props.right?.()), Icon: host('Icon') }, Switch: host('Switch') };
});
jest.mock('@/utils/notificationSettingsService', () => ({ getNotificationSettings: jest.fn(), updateNotificationSettings: jest.fn() }));
import { getNotificationSettings, updateNotificationSettings } from '../utils/notificationSettingsService';
import { NotificationSettingsSection } from '../components/Profile/NotificationSettingsSection';
let renderer: TestRenderer.ReactTestRenderer;
const load = getNotificationSettings as jest.Mock, save = updateNotificationSettings as jest.Mock;
beforeEach(() => { load.mockReset(); save.mockReset(); });
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); });
test('failed load never displays fabricated enabled preferences', async () => {
  load.mockResolvedValue(null);
  await act(async () => { renderer = TestRenderer.create(React.createElement(NotificationSettingsSection)); });
  expect(renderer.root.findAllByType('Loader' as any)).toHaveLength(0);
  expect(renderer.root.findAllByType('Switch' as any)).toHaveLength(0);
  expect(renderer.root.findByType('Button' as any).props.children).toBe('Повторить');
});
test('failed write rolls back and explains that the preference was not saved', async () => {
  load.mockResolvedValue({ inAppNotificationsEnabled: true, telegramNotificationsEnabled: true, maxNotificationsEnabled: false });
  save.mockRejectedValue(new Error('offline'));
  await act(async () => { renderer = TestRenderer.create(React.createElement(NotificationSettingsSection)); });
  await act(async () => renderer.root.findAllByType('Switch' as any)[0].props.onValueChange());
  expect(renderer.root.findAllByType('Switch' as any)[0].props.value).toBe(true);
  expect(renderer.root.findByType('HelperText' as any).props.children).toContain('восстановлено');
});
