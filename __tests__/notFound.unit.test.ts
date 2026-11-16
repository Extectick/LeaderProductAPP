import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockRouter = { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn() };
let mockStorage: typeof import('../src/features/navigation/lastServiceRouteStorage');
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('../context/AuthContext', () => ({AuthContext: require('react').createContext({profile:{id:4242}})}));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../src/features/navigation/lastServiceRouteStorage', () => ({clearLastServiceRoute: (id: number) => mockStorage.clearLastServiceRoute(id)}));
import NotFoundScreen from '../app/+not-found';
import {AuthContext} from '../context/AuthContext';

const deferred = <T,>() => {let resolve!: (value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};};
let screen: TestRenderer.ReactTestRenderer | undefined;
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  jest.isolateModules(() => {mockStorage=jest.requireActual('../src/features/navigation/lastServiceRouteStorage');});
});
afterEach(async () => {if(screen)await act(async()=>screen!.unmount());screen=undefined;});

test('unknown route automatically returns to services, clears restoration, and renders no error/buttons', async () => {
  await mockStorage.saveLastServiceRoute(4242, '/services/help');
  await act(async () => {screen=TestRenderer.create(React.createElement(NotFoundScreen));});
  expect(screen!.toJSON()).toBeNull();
  expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).toHaveBeenCalledWith('/services');
  expect(mockRouter.back).not.toHaveBeenCalled();
  expect(mockStorage.getCachedLastServiceRoute(4242)).toBeNull();
  expect(mockStorage.getCachedLastServiceRoute()).toBeNull();
  await expect(AsyncStorage.getItem('last_service_route_v1:4242')).resolves.toBeNull();
});

test('recovery does not wait for stalled native storage removal', async () => {
  await mockStorage.saveLastServiceRoute(4242, '/services/client_orders');
  const removal=deferred<void>();
  jest.spyOn(AsyncStorage,'multiRemove').mockImplementationOnce(()=>removal.promise);
  await act(async()=>{screen=TestRenderer.create(React.createElement(NotFoundScreen));});
  expect(mockRouter.replace).toHaveBeenCalledWith('/services');
  expect(mockStorage.getCachedLastServiceRoute(4242)).toBeNull();
  removal.resolve();
});

test('StrictMode effect replay does not issue duplicate redirects', async () => {
  await act(async()=>{screen=TestRenderer.create(React.createElement(React.StrictMode,null,React.createElement(NotFoundScreen)));});
  expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  expect(screen!.toJSON()).toBeNull();
});

test('new account while the fallback is mounted clears that account before recovery', async()=>{
  const render=(id:number)=>React.createElement(AuthContext.Provider,{value:{profile:{id}} as any},React.createElement(NotFoundScreen));
  await act(async()=>{screen=TestRenderer.create(render(4242));});
  await mockStorage.saveLastServiceRoute(5252,'/services/stock_balances');
  await act(async()=>{screen!.update(render(5252));});
  expect(mockStorage.getCachedLastServiceRoute(5252)).toBeNull();
  expect(mockRouter.replace).toHaveBeenCalledTimes(2);
});

test('late disk result cannot resurrect a route cleared by automatic recovery', async () => {
  const read=deferred<string|null>();
  jest.spyOn(AsyncStorage,'getItem').mockImplementationOnce(()=>read.promise);
  const pending=mockStorage.getLastServiceRoute(4242);
  await act(async()=>{screen=TestRenderer.create(React.createElement(NotFoundScreen));});
  read.resolve('/services/help');
  await expect(pending).resolves.toBeNull();
  expect(mockStorage.getCachedLastServiceRoute(4242)).toBeNull();
});

test('late disk result cannot overwrite a newer valid service navigation', async()=>{
  const read=deferred<string|null>();
  jest.spyOn(AsyncStorage,'getItem').mockImplementationOnce(()=>read.promise);
  const pending=mockStorage.getLastServiceRoute(4242);
  await mockStorage.saveLastServiceRoute(4242,'/services/client_orders');
  read.resolve('/services/help');
  await expect(pending).resolves.toBeNull();
  expect(mockStorage.getCachedLastServiceRoute(4242)).toBe('/services/client_orders');
});

test('only installed service roots are restored, including current Help', async()=>{
  await AsyncStorage.multiSet([['last_service_route_v1:4242','/services/removed'],['last_service_route_v1','/services/future']]);
  await expect(mockStorage.getLastServiceRoute(4242)).resolves.toBeNull();
  expect(mockStorage.resolveServiceRootRoute('/(main)/services/help?ticketId=9')).toBe('/services/help');
  expect(mockStorage.resolveServiceRootRoute('/services/appeals/12')).toBe('/services/appeals');
  await mockStorage.saveLastServiceRoute(4242,'/services/help');
  await mockStorage.saveLastServiceRoute(4242,'/services/removed');
  expect(mockStorage.getCachedLastServiceRoute(4242)).toBe('/services/help');
});
