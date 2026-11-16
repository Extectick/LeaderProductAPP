import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import fs from 'node:fs';
import path from 'node:path';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockRouter = {replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn()};
let mockStorage: typeof import('../src/features/navigation/lastServiceRouteStorage');
jest.mock('expo-router', () => ({useRouter: () => mockRouter}));
jest.mock('../context/AuthContext', () => ({AuthContext: require('react').createContext({profile:{id:4242}})}));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../src/features/navigation/lastServiceRouteStorage', () => ({clearLastServiceRoute: (id: number) => mockStorage.clearLastServiceRoute(id)}));
jest.mock('../components/ThemedView', () => ({ThemedView: 'View'}));
jest.mock('../components/ThemedText', () => ({ThemedText: 'Text'}));
jest.mock('../components/ui/IconSymbol', () => ({IconSymbol: 'Icon'}));
import NotFoundScreen from '../app/+not-found';
import {canOpenService, INSTALLED_SERVICE_ROUTES, supportsServiceRoute} from '../src/features/services/lib/serviceAvailability';

let tree: Renderer.ReactTestRenderer | undefined;
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  jest.isolateModules(() => {mockStorage = jest.requireActual('../src/features/navigation/lastServiceRouteStorage');});
});
afterEach(async () => {if(tree) await act(async () => tree!.unmount()); tree=undefined;});
const deferred = <T,>() => {let resolve!: (value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};};
const buttons = () => tree!.root.findAll(node => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function');

test('recovery navigates and clears memory even while native removal is stalled', async () => {
  await mockStorage.saveLastServiceRoute(4242, '/services/stock_balances');
  const removal = deferred<void>();
  jest.spyOn(AsyncStorage, 'multiRemove').mockImplementationOnce(() => removal.promise);
  await act(async () => {tree = Renderer.create(React.createElement(NotFoundScreen));});
  act(() => buttons()[0].props.onPress());
  expect(mockRouter.replace).toHaveBeenCalledWith('/services');
  expect(mockStorage.getCachedLastServiceRoute(4242)).toBeNull();
  expect(mockStorage.getCachedLastServiceRoute()).toBeNull();
  removal.resolve();
});

test.each([false, true])('back recovers without history and clears stale state (history=%s)', async hasHistory => {
  await mockStorage.saveLastServiceRoute(4242, '/services/client_orders');
  mockRouter.canGoBack.mockReturnValue(hasHistory);
  await act(async () => {tree=Renderer.create(React.createElement(NotFoundScreen));});
  await act(async () => buttons()[1].props.onPress());
  expect(mockStorage.getCachedLastServiceRoute(4242)).toBeNull();
  expect(mockRouter.back).toHaveBeenCalledTimes(hasHistory ? 1 : 0);
  expect(mockRouter.replace).toHaveBeenCalledTimes(hasHistory ? 0 : 1);
  if(!hasHistory) expect(mockRouter.replace).toHaveBeenCalledWith('/services');
});

test('late disk read cannot resurrect a cleared remembered route', async () => {
  const oldRead=deferred<string|null>();
  jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(() => oldRead.promise);
  const pending=mockStorage.getLastServiceRoute(4242);
  await mockStorage.clearLastServiceRoute(4242);
  oldRead.resolve('/services/stock_balances');
  await expect(pending).resolves.toBeNull();
  expect(mockStorage.getCachedLastServiceRoute(4242)).toBeNull();
});

test('late disk read cannot overwrite a newer navigation', async () => {
  const oldRead=deferred<string|null>();
  jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(() => oldRead.promise);
  const pending=mockStorage.getLastServiceRoute(4242);
  await mockStorage.saveLastServiceRoute(4242, '/services/client_orders');
  oldRead.resolve('/services/stock_balances');
  await expect(pending).resolves.toBeNull();
  expect(mockStorage.getCachedLastServiceRoute(4242)).toBe('/services/client_orders');
});

test('missing service in per-user and legacy storage is not restored after restart', async () => {
  await AsyncStorage.multiSet([['last_service_route_v1:4242','/services/help'], ['last_service_route_v1','/services/removed']]);
  await expect(mockStorage.getLastServiceRoute(4242)).resolves.toBeNull();
  expect(mockStorage.getCachedLastServiceRoute(4242)).toBeNull();
});

test('valid installed roots survive groups, queries and child screens; missing roots cannot replace them', async () => {
  expect(mockStorage.resolveServiceRootRoute('/(main)/services/stock_balances/?warehouse=1')).toBe('/services/stock_balances');
  expect(mockStorage.resolveServiceRootRoute('/services/appeals/123#message')).toBe('/services/appeals');
  for(const value of ['/services/help','/services/future','https://example.com/services/appeals','/admin']) expect(mockStorage.resolveServiceRootRoute(value)).toBeNull();
  await mockStorage.saveLastServiceRoute(4242,'/services/stock_balances');
  await mockStorage.saveLastServiceRoute(4242,'/services/help');
  expect(mockStorage.getCachedLastServiceRoute(4242)).toBe('/services/stock_balances');
});

test.each(Object.entries(INSTALLED_SERVICE_ROUTES))('installed service %s has a bundled index screen', (_, route) => {
  expect(fs.existsSync(path.join(__dirname,'../app/(main)',route,'index.tsx'))).toBe(true);
});

test('new server Help entry cannot open an absent screen in runtime 0.1.38', () => {
  const service={id:99,key:'help',name:'ИИ ассистент',route:'/services/help',kind:'LOCAL',visible:true,enabled:true} as any;
  expect(canOpenService(service,true,'android')).toBe(false);
  expect(canOpenService(service,false,'android')).toBe(false);
  expect(canOpenService({...service,key:'stock_balances',route:'/services/stock_balances'},true,'android')).toBe(true);
  expect(canOpenService({...service,key:'stock_balances',route:'/services/stock_balances',enabled:false},true,'android')).toBe(false);
  expect(supportsServiceRoute({...service,key:'stock_balances',route:'/(main)/services/stock_balances/?warehouse=1'})).toBe(true);
  expect(supportsServiceRoute({...service,key:'stock_balances',route:'/services/help'})).toBe(false);
});
