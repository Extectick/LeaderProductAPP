import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import StockProductsScreen from '../src/features/stockBalances/StockProductsScreen';
import { stockRequest } from '../src/features/stockBalances/products';
import { readStockCache, writeStockCache } from '../src/features/stockBalances/stockCache';
import { useServerStatus } from '../src/shared/network/useServerStatus';
jest.mock('react-native', () => {
  const React = require('react');
  const host = (name: string) => ({ children, ...props }: any) => React.createElement(name, props, children);
  return { View: host('View'), Pressable: host('Pressable'), FlatList: host('FlatList'), RefreshControl: host('RefreshControl'),
    Modal: ({ visible, children }: any) => visible ? React.createElement('Modal', {}, children) : null,
    StyleSheet: { create: (s: any) => s }, BackHandler: { addEventListener: () => ({ remove: jest.fn() }) } };
});
jest.mock('react-native-paper', () => {
  const React = require('react');
  const host = (name: string) => ({ children, ...props }: any) => React.createElement(name, props, children);
  return { Text: host('Text'), Tooltip: host('Tooltip'), Button: host('Button'), Switch: host('Switch'), ActivityIndicator: host('ActivityIndicator'),
    PaperProvider: host('Provider'), Appbar: { Header: host('Header'), BackAction: host('Back'), Content: host('Content'), Action: host('Action') } };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ canGoBack: () => false, replace: jest.fn() }) }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock('../context/AuthContext', () => ({ AuthContext: require('react').createContext({ profile: { id: 1 } }) }));
jest.mock('../src/shared/network/useServerStatus', () => ({ useServerStatus: jest.fn() }));
jest.mock('../src/shared/ui/ProductListRow', () => ({ ProductListRow: 'ProductListRow' }));
jest.mock('../src/features/clientOrders/screen/mobile/SearchPickerScreen', () => ({ SearchPickerScreen: 'SearchPicker' }));
jest.mock('../src/features/clientOrders/screen/mobile/FilterLookupPickerPanel', () => ({ FilterLookupPickerPanel: 'WarehousePicker' }));
jest.mock('../src/features/clientOrders/screen/mobile/ProductImageGalleryModal', () => ({ ProductImageGalleryModal: 'Gallery', getProductGalleryImages: () => [] }));
jest.mock('../src/features/stockBalances/products', () => ({ stockRequest: jest.fn() }));
jest.mock('../src/features/stockBalances/stockCache', () => ({ readStockCache: jest.fn(), writeStockCache: jest.fn() }));
jest.mock('../src/features/stockBalances/useStockProducts', () => ({ useStockProducts: () => ({ page: { items: [] }, busy: false, stale: false, error: null }) }));
jest.mock('../src/features/stockBalances/useWarehouseSelection', () => ({
  useWarehouseSelection: () => ({ items: [], ready: true, error: false }), warehouseSelectionLabel: () => 'Все',
}));
const warehouses = [{ guid: 'a', name: 'Переработка', cityGuid: 'omsk', cityName: 'Омск' }];
let view: TestRenderer.ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useServerStatus).mockReturnValue({ isReachable: true } as any);
  jest.mocked(readStockCache).mockResolvedValue(null);
  jest.mocked(stockRequest).mockResolvedValue({ warehouses, organizations: [] });
});
afterEach(() => act(() => view?.unmount()));
it('keeps the series switch only inside the product card', async () => {
  await act(async () => { view = TestRenderer.create(React.createElement(StockProductsScreen)); });
  expect(view.root.findAllByType('Switch' as any)).toHaveLength(0);
  const picker = view.root.findByType('SearchPicker' as any);
  expect(picker.props.headerAccessory).toBeUndefined();
  act(() => picker.props.renderItem({ item: { guid: 'p', name: 'Product' } }).props.onOpen({ guid: 'p', name: 'Product' }));
  expect(view.root.findAllByType('Switch' as any)).toHaveLength(1);
  expect(writeStockCache).toHaveBeenCalledWith('1', 'warehouse-filters-v1', expect.objectContaining({ items: warehouses }));
});
it('restores warehouse groups offline without blocking the picker on a network call', async () => {
  jest.mocked(useServerStatus).mockReturnValue({ isReachable: false } as any);
  jest.mocked(readStockCache).mockResolvedValue({ items: warehouses, offset: 0, nextOffset: 1, hasMore: false });
  await act(async () => { view = TestRenderer.create(React.createElement(StockProductsScreen)); });
  const trigger = view.root.findByType('SearchPicker' as any).props.titleAccessory;
  act(() => trigger.props.onPress());
  expect(view.root.findByType('WarehousePicker' as any).props.groups[0]).toMatchObject({ name: 'Омск', items: warehouses });
  expect(stockRequest).not.toHaveBeenCalled();
});
