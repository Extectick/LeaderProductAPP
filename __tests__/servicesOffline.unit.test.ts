import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { canOpenService } from '../src/features/services/lib/serviceAvailability';
import { useServicesData } from '../src/features/services/hooks/useServicesData';
import { SERVICE_CATALOG } from '../src/features/services/config/serviceCatalog';

var mockVersion = 0;
let mockOnline = true;
const mockListeners = new Set<(status: any) => void>();
const mockRead = jest.fn();
const mockWrite = jest.fn();
const mockRemote = jest.fn();
jest.mock('@/src/features/services/storage/servicesAccessCache', () => ({
  getServicesAccessCacheVersion: () => mockVersion,
  readCachedServices: (...args: any[]) => mockRead(...args),
  writeCachedServices: (...args: any[]) => mockWrite(...args),
}));
jest.mock('@/utils/servicesService', () => ({ getServicesForUser: (...args: any[]) => mockRemote(...args) }));
jest.mock('@/src/shared/network/serverStatus', () => ({
  getServerStatus: () => ({ isReachable: mockOnline }),
  subscribeServerStatus: (listener: any) => { mockListeners.add(listener); return () => mockListeners.delete(listener); },
}));

const orders = SERVICE_CATALOG.find(item => item.key === 'client_orders')!;
let screen: ReactTestRenderer;
let snapshot: ReturnType<typeof useServicesData>;
const Harness = () => { snapshot = useServicesData(); return null; };
const mount = async () => { await act(async () => { screen = create(React.createElement(Harness)); }); };
beforeEach(() => {
  mockVersion++;
  mockOnline = true;
  mockRead.mockResolvedValue([orders]);
  mockRemote.mockResolvedValue([orders]);
});
afterEach(async () => { await act(async () => screen?.unmount()); jest.clearAllMocks(); });

it('opens native orders offline using existing permissions, not cloud classification', () => {
  expect(canOpenService(orders, false, 'android')).toBe(true);
  expect(canOpenService(orders, false, 'web')).toBe(false);
  expect(canOpenService({ ...orders, enabled: false }, false, 'android')).toBe(false);
  expect(canOpenService({ ...orders, visible: false }, false, 'android')).toBe(false);
  expect(canOpenService({ ...orders, route: '/admin' }, false, 'android')).toBe(false);
  expect(canOpenService(SERVICE_CATALOG[0], false, 'android')).toBe(false);
  expect(canOpenService(orders, true, 'android')).toBe(true);
});

it('uses cache immediately on a cold start without waiting for a failing request', async () => {
  let reject!: (error: Error) => void;
  mockRemote.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
  await mount();
  expect(snapshot.services?.map(item => item.key)).toEqual(['client_orders']);
  expect(snapshot.loading).toBe(false);
  await act(async () => { reject(new Error('Нет связи с сервером')); });
  expect(snapshot.error).toBeNull();
  expect(snapshot.services?.[0].enabled).toBe(true);
});

it('does not request services or show network errors while known offline, including repeated refresh', async () => {
  mockOnline = false;
  await mount();
  await act(async () => { await snapshot.loadServices(); await snapshot.loadServices(); });
  expect(mockRemote).not.toHaveBeenCalled();
  expect(snapshot.loading).toBe(false);
  expect(snapshot.error).toBeNull();
  expect(snapshot.services).toHaveLength(1);
});

it('revalidates permissions after reconnection without losing cache while loading', async () => {
  mockOnline = false;
  await mount();
  mockRemote.mockResolvedValue([{ ...orders, enabled: false }]);
  await act(async () => { mockOnline = true; mockListeners.forEach(listener => listener({ isReachable: true })); });
  expect(mockRemote).toHaveBeenCalledTimes(1);
  expect(snapshot.services?.[0].enabled).toBe(false);
  expect(snapshot.loading).toBe(false);
});

it('never fills a missing or empty authorization cache with the built-in catalog', async () => {
  mockOnline = false;
  mockRead.mockResolvedValue(null);
  await mount();
  expect(snapshot.services).toBeNull();
  expect(snapshot.error).toContain('первого входа');
  mockRead.mockResolvedValue([]);
  await act(async () => { await snapshot.loadServices(); });
  expect(snapshot.services).toEqual([]);
  expect(snapshot.error).toBeNull();
});

it('discards a previous account request after access cache invalidation', async () => {
  let resolve!: (services: any) => void;
  mockRemote.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  await mount();
  mockVersion++;
  mockOnline = false;
  mockRead.mockResolvedValue([]);
  await act(async () => { await snapshot.loadServices(); resolve([orders]); });
  expect(snapshot.services).toEqual([]);
  expect(mockWrite).not.toHaveBeenCalled();
});
