import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockRouter = { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('../context/AuthContext', () => ({AuthContext: require('react').createContext({profile:{id:4242}})}));
jest.mock('react-native-reanimated', () => ({useReducedMotion: () => true}));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicons');
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
import NotFoundScreen from '../app/+not-found';
import { getLastServiceRoute, saveLastServiceRoute } from '../src/features/navigation/lastServiceRouteStorage';

describe('not found recovery', () => {
  let screen: TestRenderer.ReactTestRenderer;
  beforeEach(async () => {
    mockRouter.replace.mockReset(); mockRouter.back.mockReset(); mockRouter.canGoBack.mockReset();
    await act(async () => { screen = TestRenderer.create(React.createElement(NotFoundScreen)); });
  });
  afterEach(async () => { await act(async () => screen.unmount()); });
  const buttons = () => screen.root.findAll(node => typeof node.props.onPress === 'function' && node.props.accessibilityRole === 'button');
  test('primary action replaces missing page with services on all platforms', async () => {
    await saveLastServiceRoute(4242, '/services/removed-service');
    await act(async () => buttons()[1].props.onPress());
    expect(mockRouter.replace).toHaveBeenCalledWith('/services');
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(await getLastServiceRoute(4242)).toBeNull();
  });
  test.each([0, 2])('back control %s uses history when available', async index => {
    mockRouter.canGoBack.mockReturnValue(true);
    await act(async () => buttons()[index].props.onPress());
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
  test.each([0, 2])('back control %s recovers cold deep links without history', async index => {
    await saveLastServiceRoute(4242, '/services/help');
    mockRouter.canGoBack.mockReturnValue(false);
    await act(async () => buttons()[index].props.onPress());
    expect(mockRouter.replace).toHaveBeenCalledWith('/services');
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(await getLastServiceRoute(4242)).toBeNull();
  });
});
