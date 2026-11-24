jest.mock('../components/AppHeader', () => ({ AppHeader: 'AppHeader' }));
jest.mock('moti/skeleton', () => ({Skeleton: 'Skeleton'}));
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {FlatList,ScrollView,StyleSheet} from 'react-native';
jest.mock('../hooks/useThemeColor',()=>({useThemeColor:(_props:any,key:string)=>require('../constants/Colors').Colors.light[key]}));
jest.mock('../src/features/clientOrders/hooks/useClientOrdersWorkspace',()=>({useClientOrdersWorkspace:()=>{throw new Error('Read-only cards must not mount the mutable workspace');}}));
jest.mock('../src/features/clientOrders/hooks/useCustomerPurchaseHistory',()=>({}));
jest.mock('../src/features/clientOrders/hooks/useOrderShareActions',()=>({}));
jest.mock('../src/features/clientOrders/hooks/useOrderAction',()=>({}));
jest.mock('../utils/clientOrdersService',()=>({}));
jest.mock('../src/features/productCatalog',()=>({}));
jest.mock('../src/features/clientOrders/ClientOrdersPager',()=>({__esModule:true,default:'Pager'}));
jest.mock('../src/features/clientOrders/screen/mobile/SearchPickerScreen',()=>({}));
jest.mock('../src/features/clientOrders/screen/mobile/FilterLookupPickerPanel',()=>({}));
jest.mock('../src/features/clientOrders/screen/mobile/ProductImageGalleryModal',()=>({getProductGalleryImages:()=>[]}));
jest.mock('../src/features/clientOrders/screen/mobile/ClientOrdersMobileUi',()=>({
  PickerBottomSheet: 'Sheet', PickerBottomSheetTextInput: 'SheetInput', PickerBottomSheetScrollView: 'SheetScroll',
}));
jest.mock('../src/features/clientOrders/screen/mobile/OfflineDataBanner',()=>({}));
jest.mock('../src/features/clientOrders/screen/SendDeviceOrdersButton',()=>({}));
jest.mock('../src/features/clientOrders/assets/onec-company-logo.svg',()=> 'Logo');
jest.mock('../src/features/clientOrders/lib/clientOrderInvoices',()=>({}));
jest.mock('../src/shared/appUpdate/automaticUpdateChecks',()=>({}));
jest.mock('../components/ui/ContextMenuTrigger',()=>({__esModule:true,default:({children}:any)=>children}));
jest.mock('../components/ui/LiquidGlassSurface',()=>({LiquidGlassSurface:({children}:any)=>children}));
jest.mock('../components/ui/DateTimeInput',()=>({__esModule:true,default:'DateTimeInput'}));
jest.mock('@expo/vector-icons',()=>({MaterialCommunityIcons:'Icon'}));
jest.mock('react-native-paper',()=>({Text:'Text',TextInput:'TextInput',ActivityIndicator:'ActivityIndicator'}));
import {ClientOrderReadOnlyView, ProductLineEditorSheet} from '../src/features/clientOrders/ClientOrdersMobileScreen';
import type {ClientOrder} from '../utils/clientOrdersService';
const order={guid:'b8b8cb5c-d9b9-11f1-9d3e-f6ac37589664',source:'ONEC',sourceBaseKey:'torg2026',readOnly:true,currency:'EUR',
 totalAmount:95,items:[{product:{guid:'11111111-1111-4111-8111-111111111111',name:'Товар'},quantity:2,price:50,lineAmount:95}],events:[]} as ClientOrder;
let view:TestRenderer.ReactTestRenderer;
afterEach(async()=>{if(view)await act(async()=>view.unmount());});

test('viewer uses supplied native scroll owners, reserves its header and reports live offsets for close gestures',async()=>{
 const onScrollOffsetChange=jest.fn();
 const ViewerList=React.forwardRef<any,any>((props,ref)=>React.createElement('ViewerList',{...props,ref}));
 const ViewerScroll=({children,...props}:any)=>React.createElement('ViewerScroll',props,children);
 await act(async()=>{view=TestRenderer.create(React.createElement(ClientOrderReadOnlyView,{order,ListComponent:ViewerList,ScrollComponent:ViewerScroll,contentTopInset:92,scrollOffset:140,onScrollOffsetChange}));});
 expect(StyleSheet.flatten(view.root.findByProps({testID:'client-order-readonly-view'}).props.style).marginTop).toBe(92);
 const list=view.root.findByType('ViewerList' as any);expect(list.props.contentOffset).toEqual({x:0,y:140});expect(list.props.data[0]).toMatchObject({productName:'Товар',readOnlyLineAmount:95});
 act(()=>list.props.onScroll({nativeEvent:{contentOffset:{y:250}}}));expect(onScrollOffsetChange).toHaveBeenLastCalledWith(250);
 await act(async()=>view.root.findAll(node=>node.props.accessibilityRole==='tab'&&typeof node.props.onPress==='function')[0].props.onPress());
 expect(onScrollOffsetChange).toHaveBeenLastCalledWith(0);expect(view.root.findAllByType('ViewerList' as any)).toHaveLength(0);
 const header=view.root.findByType('ViewerScroll' as any);act(()=>header.props.onScroll({nativeEvent:{contentOffset:{y:-10}}}));expect(onScrollOffsetChange).toHaveBeenLastCalledWith(0);
 expect(header.props.children.props.readOnlyPresentation).toBe(true);
});

test('ordinary linked service keeps its native defaults and unmodified header spacing',async()=>{
 await act(async()=>{view=TestRenderer.create(React.createElement(ClientOrderReadOnlyView,{order}));});
 expect(StyleSheet.flatten(view.root.findByProps({testID:'client-order-readonly-view'}).props.style).marginTop).toBe(0);
 expect(view.root.findAllByType(FlatList)).toHaveLength(1);
 await act(async()=>view.root.findAll(node=>node.props.accessibilityRole==='tab'&&typeof node.props.onPress==='function')[0].props.onPress());
 expect(view.root.findAllByType(ScrollView)).toHaveLength(1);
});

test('order row displays a pending or missing selling price until the quoted price arrives', async () => {
  const Rows = React.forwardRef<any, any>((props, ref) => React.createElement('Rows', { ...props, ref }));
  await act(async () => {
    view = TestRenderer.create(React.createElement(ClientOrderReadOnlyView, { order, ListComponent: Rows }));
  });
  const list = view.root.findByType('Rows' as any);
  const card = list.props.renderItem({ item: list.props.data[0], index: 0 });
  const missing = 'Цена не получена. Укажите цену в строке заказа.';
  const line = { ...card.props.item, quantity: '1', basePrice: null, manualPrice: '', receiptPrice: 1422.2 };
  const renderRow = async (pricePending: boolean, basePrice: number | null) => {
    await act(async () => view.update(React.cloneElement(card, {
      item: { ...line, basePrice }, currency: 'RUB', readOnly: false, mutationLocked: false,
      pricePending, lineMessages: basePrice == null ? [missing] : [],
    })));
    return JSON.stringify(view.toJSON()).replace(/[\s\u00a0\u202f]/g, '');
  };
  const pending = await renderRow(true, null);
  expect(pending).toContain('Skeleton');
  expect(pending).toContain('Загрузкацены');
  expect(pending).not.toContain('Ценанеполучена');
  expect(pending).not.toContain('Прибыль');
  const absent = await renderRow(false, null);
  expect(absent).not.toContain('Skeleton');
  expect(absent).toContain('Ценанеполучена');
  expect(absent).not.toContain('Прибыль');
  const priced = await renderRow(false, 1660);
  expect(priced).not.toContain('Skeleton');
  expect(priced).toContain('1660₽');
  expect(priced).toContain('Прибыль237,8');
});

test.each([false, true])('the visible quantity and price survive a fault inside the 180 ms input debounce, newly picked=%s', async newlyPicked => {
  jest.useFakeTimers();
  const {emptyDraft} = require('../src/features/clientOrders/clientOrdersShared');
  const line = {key:'key',lineGuid:'line',productGuid:'product',productName:'Test',quantity:newlyPicked?'0':'2',
    manualPrice:'',comment:'',discountPercent:'',basePrice:10,packages:[]};
  const draft = {...emptyDraft(),guid:'doc',clientOrderId:'local-doc',items:newlyPicked?[]:[line]};
  const setItemPatch = jest.fn();
  const pending = {current: null as null | ((value: typeof draft) => typeof draft)};
  let sheet!: TestRenderer.ReactTestRenderer;
  try {
    await act(async () => {sheet = TestRenderer.create(React.createElement(ProductLineEditorSheet,{
      styles:{},visible:true,topOffset:0,item:line,rowNumber:1,workspace:{draft,setItemPatch},
      allowZeroQuantity:newlyPicked,pendingLineInput:pending,onClose:jest.fn(),onOpenImages:jest.fn(),
    }));});
    const inputs=sheet.root.findAll(node => (node.type as unknown) === 'SheetInput');
    const price=inputs.find(node => typeof node.props.onFocus === 'function');
    const quantity=inputs.find(node => node !== price);
    expect(quantity).toBeDefined();
    await act(async () => {price!.props.onFocus();});
    await act(async () => {price!.props.onChangeText('17');quantity!.props.onChangeText('5');});
    expect(setItemPatch).not.toHaveBeenCalled();
    expect(pending.current!(draft).items).toMatchObject([{key:'key',quantity:'5',manualPrice:'17'}]);
    const other={...draft,guid:'other-order'};
    expect(pending.current!(other)).toBe(other);
    expect(draft.items.length).toBe(newlyPicked?0:1);
    await act(async () => {jest.advanceTimersByTime(180);});
    expect(setItemPatch).toHaveBeenCalledWith('key',{quantity:'5'});
    expect(setItemPatch).toHaveBeenCalledWith('key',expect.objectContaining({manualPrice:'17'}));
  } finally {
    if(sheet) await act(async () => sheet.unmount());
    jest.useRealTimers();
  }
});
