import React from 'react';
import Renderer, {act} from 'react-test-renderer';

let mockOS = 'web', mockWidth = 1440, mockMounts = 0;
let mockParams: Record<string, string> = {};
const mockRouter = {replace: jest.fn(), canGoBack: () => true, back: jest.fn()};
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'Spinner',
  StyleSheet: {create: (value: unknown) => value},
  Platform: {get OS() {return mockOS;}},
  useWindowDimensions: () => ({width: mockWidth, height: 900}),
  BackHandler: {addEventListener: () => ({remove: jest.fn()})},
}));
jest.mock('expo-router', () => ({useRouter: () => mockRouter, useNavigation: () => ({addListener: () => () => {}}), useLocalSearchParams: () => mockParams}));
jest.mock('../context/AuthContext', () => ({AuthContext: require('react').createContext(null)}));
jest.mock('../components/Navigation/useHeaderContentTopInset', () => ({useHeaderContentTopInset: () => 80}));
jest.mock('../context/NotificationViewportContext', () => ({useNotificationViewport: () => ({headerBottomOffset: 0})}));
jest.mock('../src/features/services/headerSlotContext', () => ({useServicesHeaderSlot: () => ({setHeaderOverride: jest.fn()})}));
jest.mock('../utils/userService', () => ({getProfile: jest.fn()}));
jest.mock('../utils/logger', () => ({logger: {captureException: jest.fn()}}));
jest.mock('../src/shared/monitoring', () => ({captureException: jest.fn()}));
jest.mock('../src/features/clientOrders/ClientOrderLinkedScreen', () => ({ClientOrderLinkedScreen: 'LinkedReadOnlyOrder'}));
jest.mock('../src/features/clientOrders/screen/mobile/ClientOrdersMobileLayout', () => ({__esModule: true, default: 'MobileWorkspace'}));
jest.mock('../src/features/clientOrders/screen/desktop/ClientOrdersDesktopLayout', () => ({
  __esModule: true,
  default: function WebWorkspace() {
    const React = require('react');
    const [quantity, setQuantity] = React.useState('1');
    React.useEffect(() => {mockMounts++;}, []);
    return React.createElement('OrderQuantity', {value: quantity, onChange: setQuantity});
  },
}));

import {AuthContext} from '../context/AuthContext';
import ClientOrdersScreen from '../src/features/clientOrders/screen/ClientOrdersScreen';

const screen = (linked = true) => React.createElement(AuthContext.Provider, {value: {
  isLoading: false, profile: {employeeProfile: {onecUserGuid: linked ? 'employee-1c' : null}},
} as any}, React.createElement(ClientOrdersScreen));
let tree: Renderer.ReactTestRenderer;
beforeEach(() => {mockOS = 'web'; mockWidth = 1440; mockMounts = 0; mockParams = {}; jest.clearAllMocks();});
afterEach(async () => {if (tree) await act(async () => tree.unmount());});

test('a quantity draft survives window and sidebar breakpoint changes in one web workspace', async () => {
  await act(async () => {tree = Renderer.create(screen());});
  await act(async () => tree.root.findByType('OrderQuantity' as any).props.onChange('12,5'));
  for (const width of [1280, 1023, 768, 390, 1920]) {
    mockWidth = width;
    await act(async () => tree.update(screen()));
    expect(tree.root.findByType('OrderQuantity' as any).props.value).toBe('12,5');
  }
  expect(mockMounts).toBe(1);
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

test('native retains its existing workspace', async () => {
  mockOS = 'android';
  await act(async () => {tree = Renderer.create(screen());});
  expect(tree.root.findAllByType('MobileWorkspace' as any)).toHaveLength(1);
  expect(mockMounts).toBe(0);
});

test('source-bound links and missing employee mappings cannot mount the mutable web workspace', async () => {
  mockParams = {orderGuid: 'order-guid', orderBaseKey: 'personal-base'};
  await act(async () => {tree = Renderer.create(screen(false));});
  expect(tree.root.findAllByType('LinkedReadOnlyOrder' as any)).toHaveLength(1);
  expect(mockMounts).toBe(0);
  mockParams = {};
  await act(async () => tree.update(screen(false)));
  expect(tree.root.findAllByType('OrderQuantity' as any)).toHaveLength(0);
  expect(mockMounts).toBe(0);
});
