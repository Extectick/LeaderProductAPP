import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import StockProductsScreen from '../src/features/stockBalances/StockProductsScreen';
import { stockRequest } from '../src/features/stockBalances/products';
import { readStockCache, writeStockCache } from '../src/features/stockBalances/stockCache';
import { useServerStatus } from '../src/shared/network/useServerStatus';
import { useStockProducts } from '../src/features/stockBalances/useStockProducts';
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
  return { Text: host('Text'), Tooltip: host('Tooltip'), Button: host('Button'), Switch: host('Switch'), SegmentedButtons: host('Segments'), ActivityIndicator: host('ActivityIndicator'),
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
jest.mock('../src/features/stockBalances/useStockProducts', () => ({ useStockProducts: jest.fn(() => ({ page: { items: [] }, busy: false, stale: false, error: null, refresh: jest.fn(), loadMore: jest.fn() })) }));
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
it('temporarily hides series in the list and product card, querying only grouped balances', async () => {
  await act(async () => { view = TestRenderer.create(React.createElement(StockProductsScreen)); });
  expect(view.root.findAllByType('Switch' as any)).toHaveLength(0);
  const picker = view.root.findByType('SearchPicker' as any);
  expect(picker.props.headerAccessory).toBeUndefined();
  act(() => picker.props.renderItem({ item: { guid: 'p', name: 'Product' } }).props.onOpen({ guid: 'p', name: 'Product' }));
  expect(view.root.findAllByType('Switch' as any)).toHaveLength(0);
  expect(view.root.findAllByType('Text' as any).some(node => node.props.children === 'По сериям')).toBe(false);
  expect(jest.mocked(useStockProducts)).toHaveBeenCalledWith('products/p/balances',expect.objectContaining({bySeries:'0',groupByWarehouse:'1'}),'1',true);
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
it('uses pull-to-refresh in both lists without a header refresh button', async () => {
  await act(async () => { view = TestRenderer.create(React.createElement(StockProductsScreen)); });
  const picker = view.root.findByType('SearchPicker' as any);
  expect(picker.props.filters ?? []).toHaveLength(0);
  expect(picker.props.listProps.refreshControl.props.onRefresh).toEqual(expect.any(Function));
  act(() => picker.props.renderItem({ item: { guid: 'p', name: 'Product' } }).props.onOpen({ guid: 'p', name: 'Product' }));
  expect(view.root.findAllByType('Action' as any)).toHaveLength(0);
  const list = view.root.findByType('FlatList' as any);
  act(() => list.props.refreshControl.props.onRefresh());
  expect(list.props.refreshControl.props.onRefresh).toHaveBeenCalledTimes(1);
  expect(list.props.refreshControl.props.enabled).toBe(true);
});
it('disables detail pull-to-refresh offline', async () => {
  jest.mocked(useServerStatus).mockReturnValue({ isReachable: false } as any);
  await act(async () => { view = TestRenderer.create(React.createElement(StockProductsScreen)); });
  const picker = view.root.findByType('SearchPicker' as any);
  act(() => picker.props.renderItem({ item: { guid: 'p', name: 'Product' } }).props.onOpen({ guid: 'p', name: 'Product' }));
  expect(view.root.findByType('FlatList' as any).props.refreshControl.props.enabled).toBe(false);
});
it('shows full-width detail tabs without series, resetting the tab for the next product', async () => {
  await act(async () => { view = TestRenderer.create(React.createElement(StockProductsScreen)); });
  const picker = view.root.findByType('SearchPicker' as any);
  const open = () => picker.props.renderItem({ item: { guid: 'p', name: 'Product' } }).props.onOpen({ guid: 'p', name: 'Product' });
  act(open);
  const tabs = () => view.root.findAllByType('Pressable' as any).filter(item => item.props.accessibilityRole === 'tab');
  expect(tabs().map(item => item.findByType('Text' as any).props.children)).toEqual(['Остатки', 'Поступления', 'Продажи']);
  act(() => tabs()[1].props.onPress());
  expect(view.root.findAllByType('Switch' as any)).toHaveLength(0);
  expect(tabs()[1].props.accessibilityState.selected).toBe(true);
  act(open);
  expect(tabs()[0].props.accessibilityState.selected).toBe(true);
  expect(view.root.findAllByType('Switch' as any)).toHaveLength(0);
});
