import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
jest.mock('../src/shared/api/httpClient',()=>({httpRequest:jest.fn()}));
jest.mock('../context/AuthContext',()=>({AuthContext:require('react').createContext(null)}));
jest.mock('../context/ThemeContext',()=>({useTheme:()=>({theme:'light'})}));
jest.mock('../components/Profile/ProfileView',()=>({ProfileView:'ProfileView'}));
jest.mock('../src/features/clientOrders/ClientOrdersMobileScreen',()=>({ClientOrderReadOnlyView:'ServiceReadOnlyView'}));
jest.mock('../utils/apiClient',()=>({apiClient:jest.fn()}));
jest.mock('../src/features/productCatalog',()=>({}));
jest.mock('../src/features/clientOrders/offline/offlineOrdersDatabase',()=>({}));
import {httpRequest} from '../src/shared/api/httpClient';
import {AuthContext} from '../context/AuthContext';
import {loadEntityCard} from '../src/features/entityCards/entityApi';
import {EntityCardContent} from '../src/features/entityCards/entityRegistry';
import {clientOrderRoute} from '../src/features/clientOrders/lib/clientOrderOpening';
import type {EntityTarget} from '../src/shared/entityLinks';
const guid='b8b8cb5c-d9b9-11f1-9d3e-f6ac37589664';
const target:EntityTarget={v:1,source:'onec',baseKey:'torg2026',metaType:'Documents',name:'ЗаказКлиента',guid};
const appGuid=guid;
const item={product:{guid:'11111111-1111-4111-8111-111111111111',name:'Товар'},quantity:2,price:50,lineAmount:95};
const order={guid:appGuid,number:'APP-42',number1c:'НСК-77',sourceBaseKey:'torg2026',readOnly:true,items:[item],currency:'EUR',totalAmount:95};
const request=jest.mocked(httpRequest);
beforeEach(()=>request.mockReset());

test('legacy order link validates its original base through the service and preserves its source identity',async()=>{
 request.mockResolvedValue({ok:true,status:200,data:order});const controller=new AbortController();
 await expect(loadEntityCard(target,121,controller.signal)).resolves.toMatchObject({kind:'client-order',orderGuid:appGuid,title:'Заказ НСК-77',order:{...order,events:[],invoices:[],itemsCount:1}});
 expect(request).toHaveBeenCalledTimes(1);expect(request).toHaveBeenCalledWith('/api/client-orders/'+guid+'?baseKey=torg2026',expect.objectContaining({expectedUserId:121,signal:controller.signal,networkRetryCount:0}));
 expect(clientOrderRoute(appGuid,'torg2026')).toEqual({pathname:'/services/client_orders',params:{orderGuid:appGuid,orderBaseKey:'torg2026'}});
});

test.each([[409,'CLIENT_ORDER_SOURCE_MISMATCH','unsupported'],[403,'FORBIDDEN','denied'],[404,'NOT_FOUND','not-found'],[502,'INTERNAL_ERROR','unavailable']] as const)('HTTP %s cannot navigate or fall back to a generic MCP lookup',async(status,backendErrorCode,kind)=>{
 request.mockResolvedValue({ok:false,status,backendErrorCode,message:'PRIVATE_PROVIDER_RESPONSE'});
 await expect(loadEntityCard(target,121,new AbortController().signal)).rejects.toMatchObject({kind,code:backendErrorCode});expect(request).toHaveBeenCalledTimes(1);
});

test.each([{},null,{...order,guid:'../../other-route'},{...order,guid:'00000000-0000-0000-0000-000000000000'},{...order,sourceBaseKey:'other'},{...order,readOnly:false},{...order,guid:'11111111-1111-4111-8111-111111111111'}])('malformed order identities cannot become navigation targets: %j',async data=>{
 request.mockResolvedValue({ok:true,status:200,data});await expect(loadEntityCard(target,121,new AbortController().signal)).rejects.toMatchObject({code:'ENTITY_RESPONSE_UNSUPPORTED'});
});

test('validated order renders the shared service body in its viewer with one source-bound request',async()=>{
 request.mockResolvedValue({ok:true,status:200,data:order});const open=jest.fn(),title=jest.fn(),scroll=jest.fn();let view!:TestRenderer.ReactTestRenderer;
 const ScrollComponent='ViewerScroll' as any,ListComponent='ViewerList' as any;
 await act(async()=>{view=TestRenderer.create(React.createElement(AuthContext.Provider,{value:{isAuthenticated:true,profile:{id:121}} as any},React.createElement(EntityCardContent,{target,onOpen:open,onTitleChange:title,ScrollComponent,ListComponent,scrollOffset:110,contentTopInset:80,onScrollOffsetChange:scroll})));});
 try{
  const body=view.root.findByType('ServiceReadOnlyView' as any);
  expect(body.props).toMatchObject({order:{...order,events:[],itemsCount:1},ScrollComponent,ListComponent,scrollOffset:110,contentTopInset:80,onScrollOffsetChange:scroll});
  expect(request).toHaveBeenCalledTimes(1);expect(open).not.toHaveBeenCalled();expect(title).toHaveBeenCalledWith('Заказ НСК-77');
  expect(view.root.findAllByProps({testID:'entity-card-scroll'})).toHaveLength(0);
  expect(view.root.findAllByProps({testID:'entity-client-order-opening'})).toHaveLength(0);
 }
 finally{await act(async()=>view.unmount());}
});

test('a late preflight after changing account is aborted and cannot open the previous user order',async()=>{
 let complete!:(result:any)=>void;request.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));request.mockResolvedValue({ok:false,status:403,backendErrorCode:'FORBIDDEN'});
 const tree=(id:number)=>React.createElement(AuthContext.Provider,{value:{isAuthenticated:true,profile:{id}} as any},React.createElement(EntityCardContent,{target,onOpen:jest.fn()}));let view!:TestRenderer.ReactTestRenderer;
 await act(async()=>{view=TestRenderer.create(tree(121));});const signal=request.mock.calls[0][1]?.signal;
 await act(async()=>view.update(tree(122)));expect(signal?.aborted).toBe(true);
 await act(async()=>complete({ok:true,status:200,data:order}));
 try{expect(view.root.findAllByType('ServiceReadOnlyView' as any)).toHaveLength(0);expect(request.mock.calls[1][1]?.expectedUserId).toBe(122);}
 finally{await act(async()=>view.unmount());}
});

test.each([[null],[{}],[{...item,product:null}],[{...item,product:{...item.product,name:{private:'data'}}}],[{...item,quantity:'2'}],[{...item,lineAmount:Infinity}]])('malformed source rows cannot mount a broken or misleading card: %j',async row=>{
 request.mockResolvedValue({ok:true,status:200,data:{...order,items:[row]}});
 await expect(loadEntityCard(target,121,new AbortController().signal)).rejects.toMatchObject({code:'ENTITY_RESPONSE_UNSUPPORTED'});
});

test('missing optional service collections are normalized without mutating the response',async()=>{
 const sparse={...order,items:undefined};request.mockResolvedValue({ok:true,status:200,data:sparse});
 const result=await loadEntityCard(target,121,new AbortController().signal);
 expect(result).toMatchObject({kind:'client-order',order:{items:[],events:[],invoices:[],itemsCount:0}});
 expect(sparse.items).toBeUndefined();
});
