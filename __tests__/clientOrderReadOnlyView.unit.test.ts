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
jest.mock('../src/features/clientOrders/screen/mobile/ClientOrdersMobileUi',()=>({}));
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
import {ClientOrderReadOnlyView} from '../src/features/clientOrders/ClientOrdersMobileScreen';
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
