import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
const mockReplace = jest.fn(), mockBack = jest.fn(), mockCanGoBack = jest.fn();
let mockPath = '/profile', mockReduced = false;
const mockAddListener = jest.fn(() => ({ remove: jest.fn() }));
jest.mock('react-native', () => ({ BackHandler: { addEventListener: (...args: any[]) => mockAddListener(...args) }, Platform: { OS: 'android' } }));
jest.mock('expo-router', () => ({ Stack: 'Stack', usePathname: () => mockPath, useRouter: () => ({ replace: mockReplace, back: mockBack, canGoBack: mockCanGoBack }) }));
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => mockReduced }));
jest.mock('react-native-paper', () => ({ Appbar: { Header: 'Header', BackAction: 'Back', Content: 'Content' } }));
jest.mock('@/src/features/profile/model/ProfileDataContext', () => ({ ProfileDataProvider: ({ children }: any) => children }));
import ProfileLayout from '../app/(main)/profile/_layout';
let renderer: TestRenderer.ReactTestRenderer;
beforeEach(() => { jest.clearAllMocks(); mockPath = '/profile'; mockReduced = false; mockCanGoBack.mockReturnValue(true); });
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); });
test('native back at profile root returns to services instead of closing the app', async () => {
  await act(async () => { renderer = TestRenderer.create(React.createElement(ProfileLayout)); });
  expect(mockAddListener.mock.calls[0][0]).toBe('hardwareBackPress');
  expect((mockAddListener.mock.calls[0] as any)[1]()).toBe(true);
  expect(mockReplace).toHaveBeenCalledWith('/services');
});
test('settings back returns to profile, including direct launch with no history', async () => {
  mockPath = '/profile/settings'; mockCanGoBack.mockReturnValue(false);
  await act(async () => { renderer = TestRenderer.create(React.createElement(ProfileLayout)); });
  (mockAddListener.mock.calls[0] as any)[1]();
  expect(mockReplace).toHaveBeenCalledWith('/profile');
});
test('inactive profile does not intercept Android back on other services', async () => {
  mockPath = '/services/client-orders'; mockReduced = true;
  await act(async () => { renderer = TestRenderer.create(React.createElement(ProfileLayout)); });
  expect(mockAddListener).not.toHaveBeenCalled();
  expect(renderer.root.findByType('Stack' as any).props.screenOptions.animation).toBe('none');
});
