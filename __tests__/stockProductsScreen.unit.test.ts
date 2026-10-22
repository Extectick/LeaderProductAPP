import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import StockProductsScreen from '../src/features/stockBalances/StockProductsScreen';
import { stockRequest } from '../src/features/stockBalances/products';
import { readStockCache, writeStockCache } from '../src/features/stockBalances/stockCache';
import { useServerStatus } from '../src/shared/network/useServerStatus';
import { useStockProducts } from '../src/features/stockBalances/useStockProducts';
import { useWarehouseSelection } from '../src/features/stockBalances/useWarehouseSelection';
jest.mock('../utils/config',()=>({API_BASE_URL:'https://dev.invalid'}));
jest.mock('@react-native-async-storage/async-storage',()=>({getItem:jest.fn(),setItem:jest.fn()}));
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
  ...jest.requireActual('../src/features/stockBalances/useWarehouseSelection'),useWarehouseSelection:jest.fn(),
}));
const warehouses = [{ guid: 'a', name: 'Переработка', cityGuid: 'omsk', cityName: 'Омск' }];
let view: TestRenderer.ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useServerStatus).mockReturnValue({ isReachable: true } as any);
  jest.mocked(readStockCache).mockResolvedValue(null);
  jest.mocked(stockRequest).mockResolvedValue({ warehouses, organizations: [] });
  jest.mocked(useWarehouseSelection).mockImplementation(()=>{
    const [items,save]=React.useState<any[]>([]);
    return{items,save,ready:true,error:false};
  });
  jest.mocked(useStockProducts).mockImplementation(()=>({page:{items:[]},busy:false,loadingMore:false,refreshing:false,error:null,refresh:jest.fn(),loadMore:jest.fn()}));
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
  expect(readStockCache).not.toHaveBeenCalled();expect(writeStockCache).not.toHaveBeenCalled();
});
it('does not restore cached filters or show saved-data banners for the online-only service', async () => {
  jest.mocked(useServerStatus).mockReturnValue({ isReachable: false } as any);
  jest.mocked(readStockCache).mockResolvedValue({ items: warehouses, offset: 0, nextOffset: 1, hasMore: false });
  await act(async () => { view = TestRenderer.create(React.createElement(StockProductsScreen)); });
  const trigger = view.root.findByType('SearchPicker' as any).props.titleAccessory;
  expect(trigger.props.disabled).toBe(true);
  expect(stockRequest).not.toHaveBeenCalled();
  expect(readStockCache).not.toHaveBeenCalled();
  expect(view.root.findByType('SearchPicker' as any).props.ListHeaderComponent).toBeNull();
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
  expect(list.props.refreshControl.props.enabled).not.toBe(false);
});
it('allows an explicit connection retry from detail pull-to-refresh', async () => {
  jest.mocked(useServerStatus).mockReturnValue({ isReachable: false } as any);
  await act(async () => { view = TestRenderer.create(React.createElement(StockProductsScreen)); });
  const picker = view.root.findByType('SearchPicker' as any);
  act(() => picker.props.renderItem({ item: { guid: 'p', name: 'Product' } }).props.onOpen({ guid: 'p', name: 'Product' }));
  expect(view.root.findByType('FlatList' as any).props.refreshControl.props.enabled).not.toBe(false);
});
it('shares the warehouse picker between list and card and updates all three tab queries',async()=>{
  await act(async()=>{view=TestRenderer.create(React.createElement(StockProductsScreen));});
  const picker=view.root.findByType('SearchPicker' as any);
  act(()=>picker.props.renderItem({item:{guid:'p',name:'Product'}}).props.onOpen({guid:'p',name:'Product'}));
  act(()=>view.root.findByProps({testID:'stock-product-warehouses'}).props.onPress());
  act(()=>view.root.findByType('WarehousePicker' as any).props.onSelect(warehouses[0]));
  act(()=>view.root.findByType('WarehousePicker' as any).props.onApply());
  expect(view.root.findByType('SearchPicker' as any).props.titleAccessory.props.accessibilityLabel).toContain('Переработка');
  expect(view.root.findByProps({testID:'stock-product-warehouses'}).props.accessibilityLabel).toContain('Переработка');
  expect(jest.mocked(useStockProducts)).toHaveBeenCalledWith('products',expect.objectContaining({warehouseGuids:'a'}),'1',true);
  expect(jest.mocked(useStockProducts)).toHaveBeenCalledWith('products/p/balances',expect.objectContaining({warehouseGuids:'a'}),'1',true);
  for(const label of ['Поступления','Продажи']){
    const tab=view.root.findAllByType('Pressable' as any).find(n=>n.props.accessibilityRole==='tab'&&n.findByType('Text' as any).props.children===label)!;
    act(()=>tab.props.onPress());
    expect(jest.mocked(useStockProducts)).toHaveBeenCalledWith('products/p/movements',expect.objectContaining({warehouseGuids:'a',direction:label==='Поступления'?'receipt':'expense'}),'1',true);
  }
});
it('never displays a warehouse outside the current choice, even if an API page contained it',async()=>{
  const rows=[{id:'a',warehouse:warehouses[0],inStock:1,reserved:0,available:1},{id:'b',warehouse:{guid:'b',name:'Чужой склад'},inStock:1,reserved:0,available:1}];
  jest.mocked(useWarehouseSelection).mockImplementation(()=>({items:warehouses,save:jest.fn(),ready:true,error:false}));
  jest.mocked(useStockProducts).mockImplementation(()=>({page:{items:rows},busy:false,loadingMore:false,refreshing:false,error:null,refresh:jest.fn(),loadMore:jest.fn()}) as any);
  await act(async()=>{view=TestRenderer.create(React.createElement(StockProductsScreen));});
  act(()=>view.root.findByType('SearchPicker' as any).props.renderItem({item:{guid:'p',name:'Product'}}).props.onOpen({guid:'p',name:'Product'}));
  expect(view.root.findByType('FlatList' as any).props.data.filter((r:any)=>r.kind==='balance').map((r:any)=>r.item.warehouse.guid)).toEqual(['a']);
  for(const label of ['Поступления','Продажи']){
    const tab=view.root.findAllByType('Pressable' as any).find(n=>n.props.accessibilityRole==='tab'&&n.findByType('Text' as any).props.children===label)!;
    act(()=>tab.props.onPress());
    expect(view.root.findByType('FlatList' as any).props.data.map((r:any)=>r.warehouse.guid)).toEqual(['a']);
  }
});
it('renders selected warehouse folders and collapses only their children',async()=>{
  const selected=[warehouses[0],{guid:'b',name:'Основной',cityGuid:'omsk',cityName:'Омск'}];
  const rows=selected.map(w=>({id:w.guid,warehouse:w,inStock:1,reserved:0,available:1}));
  jest.mocked(stockRequest).mockResolvedValue({warehouses:selected,organizations:[]});
  jest.mocked(useWarehouseSelection).mockImplementation(()=>({items:selected,save:jest.fn(),ready:true,error:false}));
  jest.mocked(useStockProducts).mockImplementation(()=>({page:{items:rows},busy:false,loadingMore:false,refreshing:false,error:null,refresh:jest.fn(),loadMore:jest.fn()}) as any);
  await act(async()=>{view=TestRenderer.create(React.createElement(StockProductsScreen));});
  act(()=>view.root.findByType('SearchPicker' as any).props.renderItem({item:{guid:'p',name:'Product'}}).props.onOpen({guid:'p',name:'Product'}));
  const list=()=>view.root.findByType('FlatList' as any);
  expect(list().props.data.map((r:any)=>r.kind)).toEqual(['folder','balance','balance']);
  const folder=list().props.renderItem({item:list().props.data[0]});
  expect(folder.props.accessibilityLabel).toBe('Папка складов Омск');
  act(()=>folder.props.onPress());
  expect(list().props.data).toEqual([expect.objectContaining({kind:'folder',expanded:false,count:2})]);
  act(()=>list().props.renderItem({item:list().props.data[0]}).props.onPress());
  expect(list().props.data.map((r:any)=>r.kind)).toEqual(['folder','balance','balance']);
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
