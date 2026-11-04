import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Alert } from 'react-native';

const mockRouter = { dismissTo: jest.fn(), back: jest.fn(), replace: jest.fn() };
let mockParams: any, mockProfile: any;
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('react-native-reanimated', () => ({ __esModule: true, default: { View: 'AnimatedView' }, FadeIn: { duration: () => ({ reduceMotion: () => undefined }) }, ReduceMotion: { System: 0 } }));
jest.mock('react-native-paper', () => ({ Button: 'PaperButton', Text: 'PaperText' }));
jest.mock('@/components/Profile/ProfileView', () => ({ ProfileView: 'ProfileView' }));
jest.mock('@/components/Profile/ClientContactsEditor', () => ({ ClientContactsEditor: 'Contacts' }));
jest.mock('@/components/Profile/NotificationSettingsSection', () => ({ NotificationSettingsSection: 'Notifications' }));
jest.mock('@/src/features/profile/ui/ProfileBottomSpacer', () => ({ ProfileBottomSpacer: 'Spacer' }));
jest.mock('@/src/features/profile/model/ProfileDataContext', () => ({ useProfileData: () => ({ profile: mockProfile, refresh: jest.fn() }) }));
jest.mock('@/src/features/profile/ui/ProfileServiceSettings', () => ({ CredentialsSection: 'Credentials', TrackingToggle: 'Tracking', TrackingAdminHealthCard: 'Health' }));
jest.mock('@/src/features/profile/ui/ProfileSettingsPrimitives', () => ({ ProfileFact: 'Fact' }));
jest.mock('@/src/features/profile/ui/ProfileOnecConnections', () => ({ ProfileOnecConnections: 'OnecConnections' }));
jest.mock('@/utils/rbacLabels', () => ({ getRoleDisplayName: () => '' }));
jest.mock('@/utils/appVersion', () => ({ getAppVersionInfo: () => ({}) }));
jest.mock('@/utils/config', () => ({ API_BASE_URL: 'https://api.example.test' }));
jest.mock('@/src/shared/api/httpClient', () => ({ httpRequest: jest.fn() }));
import ProfileSettingsScreen from '../app/(main)/profile/settings';
import { httpRequest } from '../src/shared/api/httpClient';

let screen: TestRenderer.ReactTestRenderer;
beforeEach(async () => {
  jest.clearAllMocks();
  mockParams = { section: 'onec', base: 'main', returnTicket: '24', returnRun: 'run-24' };
  mockProfile = { id: 7, employeeProfile: {} };
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.mocked(httpRequest).mockResolvedValue({ ok: true } as any);
  await act(async () => { screen = TestRenderer.create(React.createElement(ProfileSettingsScreen)); });
});
afterEach(async () => { await act(async () => screen.unmount()); jest.restoreAllMocks(); });
const form = () => screen.root.findByType('OnecConnections' as any);
const destination = { pathname: '/services/help', params: { ticketId: '24' } };

test('successful 1C connection resumes the run and explicitly returns to the originating chat', async () => {
  const signal = new AbortController().signal;
  expect(form().props.initialBase).toBe('main');
  await act(async () => form().props.onConnected(signal));
  expect(httpRequest).toHaveBeenCalledWith('/help/tickets/24/assistant/retry', {
    method: 'POST', body: { runId: 'run-24' }, signal, expectedUserId: 7, networkRetryCount: 0,
  });
  expect(mockRouter.dismissTo).toHaveBeenCalledWith(destination);
  expect(mockRouter.back).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
});

test.each(['http', 'network'])('a failed AI restart still returns to the chat after a successful 1C connection (%s)', async kind => {
  if (kind === 'http') jest.mocked(httpRequest).mockResolvedValue({ ok: false } as any);
  else jest.mocked(httpRequest).mockRejectedValue(new Error('unavailable'));
  await act(async () => form().props.onConnected(new AbortController().signal));
  expect(mockRouter.dismissTo).toHaveBeenCalledWith(destination);
  expect(Alert.alert).toHaveBeenCalledWith('1С подключена', expect.stringContaining('Повторить'));
});

test('return to a chat does not require a pending AI run; ordinary profile connections stay in profile', async () => {
  mockParams = { section: 'onec', returnTicket: '24' };
  await act(async () => screen.update(React.createElement(ProfileSettingsScreen)));
  await act(async () => form().props.onConnected(new AbortController().signal));
  expect(httpRequest).not.toHaveBeenCalled();
  expect(mockRouter.dismissTo).toHaveBeenCalledWith(destination);
  mockParams = { section: 'onec' };
  await act(async () => screen.update(React.createElement(ProfileSettingsScreen)));
  expect(form().props.onConnected).toBeUndefined();
});

test.each(['0', '-1', 'other/path', '9007199254740992', ['24', '25']])('rejects an invalid return ticket %s', async returnTicket => {
  mockParams = { ...mockParams, returnTicket };
  await act(async () => screen.update(React.createElement(ProfileSettingsScreen)));
  expect(form().props.onConnected).toBeUndefined();
});

test.each(['blur', 'account'])('a late restart response cannot redirect after %s changes', async change => {
  let finish!: (value: any) => void, pending!: Promise<void>;
  jest.mocked(httpRequest).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const controller = new AbortController();
  await act(async () => { pending = form().props.onConnected(controller.signal); });
  if (change === 'blur') controller.abort();
  else { mockProfile = { id: 9, employeeProfile: {} }; await act(async () => screen.update(React.createElement(ProfileSettingsScreen))); }
  await act(async () => { finish({ ok: true }); await pending; });
  expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
});
