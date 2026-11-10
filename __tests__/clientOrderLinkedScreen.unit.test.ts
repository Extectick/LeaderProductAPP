import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {Text,StyleSheet} from 'react-native';
import {Colors} from '../constants/Colors';
let mockParams:any={};
let mockTheme='light';
jest.mock('../hooks/useThemeColor',()=>({useThemeColor:(_props:any,key:string)=>require('../constants/Colors').Colors[mockTheme][key]}));
const mockBack=jest.fn(),mockReplace=jest.fn(),mockHeader=jest.fn();
jest.mock('expo-router',()=>({useLocalSearchParams:()=>mockParams,useRouter:()=>({back:()=>mockBack(),replace:(...args:any[])=>mockReplace(...args),canGoBack:()=>true}),useNavigation:()=>({addListener:()=>()=>{}})}));
jest.mock('../context/AuthContext',()=>({AuthContext:require('react').createContext(null)}));
jest.mock('../utils/config',()=>({API_BASE_URL:'https://dev.test'}));
jest.mock('../utils/clientOrdersService',()=>({getClientOrder:jest.fn()}));
jest.mock('../components/Navigation/useHeaderContentTopInset',()=>({useHeaderContentTopInset:()=>80}));
jest.mock('../context/NotificationViewportContext',()=>({useNotificationViewport:()=>({headerBottomOffset:0})}));
jest.mock('../src/features/services/headerSlotContext',()=>({useServicesHeaderSlot:()=>({setHeaderOverride:(value:any)=>mockHeader(value)})}));
jest.mock('../src/features/profile/ui/ProfileOnecConnections',()=>({ProfileOnecConnections:'ProtectedConnection'}));
jest.mock('../src/features/clientOrders/ClientOrdersMobileScreen',()=>({ClientOrderReadOnlyView:'ServiceReadOnlyView'}));
jest.mock('../src/features/clientOrders/screen/mobile/ClientOrdersMobileLayout',()=>({__esModule:true,default:'MutableMobileWorkspace'}));
jest.mock('../src/features/clientOrders/screen/desktop/ClientOrdersDesktopLayout',()=>({__esModule:true,default:'MutableDesktopWorkspace'}));
jest.mock('../utils/userService',()=>({getProfile:jest.fn()}));
jest.mock('../utils/logger',()=>({logger:{captureException:jest.fn()}}));
jest.mock('../src/shared/monitoring',()=>({captureException:jest.fn()}));
import {AuthContext} from '../context/AuthContext';
import {getClientOrder} from '../utils/clientOrdersService';
import ClientOrdersScreen from '../src/features/clientOrders/screen/ClientOrdersScreen';
import {ClientOrderLinkedScreen} from '../src/features/clientOrders/ClientOrderLinkedScreen';
const guid='b8b8cb5c-d9b9-11f1-9d3e-f6ac37589664';
const order={guid,number1c:'НСК-77',sourceBaseKey:'torg2026',readOnly:true,items:[],events:[]} as any;
const read=jest.mocked(getClientOrder);
const tree=(id:number,Component=ClientOrdersScreen)=>React.createElement(AuthContext.Provider,{value:{isAuthenticated:true,isLoading:false,profile:{id,employeeProfile:null}} as any},React.createElement(Component as any,{orderGuid:guid,orderBaseKey:'torg2026',onBack:mockBack}));
beforeEach(()=>{mockTheme='light';mockParams={orderGuid:guid,orderBaseKey:'torg2026'};read.mockReset();mockHeader.mockClear();mockBack.mockClear();});

test('source-aware service route mounts shared read-only presentation without a mutable workspace or legacy 1C-user lookup',async()=>{
 read.mockResolvedValue(order);let view!:TestRenderer.ReactTestRenderer;await act(async()=>{view=TestRenderer.create(tree(121));});
 try{
  expect(read).toHaveBeenCalledTimes(1);expect(read).toHaveBeenCalledWith(guid,expect.objectContaining({baseKey:'torg2026',expectedUserId:121,signal:expect.any(AbortSignal)}));
  expect(view.root.findAll(node=>node.type==='ServiceReadOnlyView')[0].props.order).toBe(order);
  expect(view.root.findAll(node=>node.type==='MutableMobileWorkspace'||node.type==='MutableDesktopWorkspace')).toHaveLength(0);
  const header=mockHeader.mock.calls.map(x=>x[0]).filter(Boolean).at(-1);expect(header.subtitle).toBe('Только просмотр');header.onBack();expect(mockBack).toHaveBeenCalledTimes(1);
 }finally{await act(async()=>view.unmount());}
});

test('invalid/ambiguous source params cannot fall through to the shared service or issue a lookup',async()=>{
 for(const params of [{orderGuid:guid,orderBaseKey:''},{orderGuid:guid,orderBaseKey:['torg2026','other']},{orderGuid:'../../other',orderBaseKey:'torg2026'}]){
  mockParams=params;let view!:TestRenderer.ReactTestRenderer;await act(async()=>{view=TestRenderer.create(tree(121));});
  expect(view.root.findAllByType(Text).some(n=>n.props.children==='Некорректная ссылка на заказ.')).toBe(true);expect(read).not.toHaveBeenCalled();await act(async()=>view.unmount());
 }
});

test('account change cancels an old lookup and cannot expose its late document',async()=>{
 let complete!:(result:any)=>void;read.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve}));read.mockResolvedValue({...order,number1c:'Другой аккаунт'});let view!:TestRenderer.ReactTestRenderer;
 await act(async()=>{view=TestRenderer.create(tree(121,ClientOrderLinkedScreen as any));});const signal=read.mock.calls[0][1]?.signal;
 await act(async()=>view.update(tree(122,ClientOrderLinkedScreen as any)));expect(signal?.aborted).toBe(true);
 await act(async()=>complete(order));
 try{expect(view.root.findAll(node=>node.type==='ServiceReadOnlyView')[0].props.order.number1c).toBe('Другой аккаунт');expect(read.mock.calls[1][1]?.expectedUserId).toBe(122);}
 finally{await act(async()=>view.unmount());}
});

test('missing personal credentials use the protected existing connection form and retry the exact base',async()=>{
 read.mockRejectedValueOnce(Object.assign(new Error('Подключите 1С'),{code:'ONEC_AUTH_REQUIRED'}));read.mockResolvedValue(order);let view!:TestRenderer.ReactTestRenderer;
 await act(async()=>{view=TestRenderer.create(tree(121,ClientOrderLinkedScreen as any));});
 try{
  const form=view.root.findAll(node=>node.type==='ProtectedConnection')[0];expect(form.props.userId).toBe(121);expect(form.props.initialBase).toBe('torg2026');
  await act(async()=>form.props.onConnected(new AbortController().signal));expect(read).toHaveBeenCalledTimes(2);expect(read.mock.calls[1][1]?.baseKey).toBe('torg2026');
 }finally{await act(async()=>view.unmount());}
});


test('linked order loading uses the same dark service surface and accent instead of a white page',async()=>{
 mockTheme='dark';read.mockImplementation(()=>new Promise(()=>{}));let view!:TestRenderer.ReactTestRenderer;
 await act(async()=>{view=TestRenderer.create(tree(121,ClientOrderLinkedScreen as any));});
 try{const screen=view.root.findByProps({testID:'client-order-linked-screen'});expect(StyleSheet.flatten(screen.props.style).backgroundColor).toBe(Colors.dark.background);}
 finally{await act(async()=>view.unmount());}
});
