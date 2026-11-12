import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {Text} from 'react-native';
jest.mock('../src/shared/api/httpClient',()=>({httpRequest:jest.fn()}));
jest.mock('../context/AuthContext',()=>({AuthContext:require('react').createContext(null)}));
jest.mock('../context/ThemeContext',()=>({useTheme:()=>({theme:'light'})}));
jest.mock('../components/Profile/ProfileView',()=>({ProfileView:'ProfileView'}));
jest.mock('../src/features/entityCards/StockEntityCard',()=>({StockEntityCard:(props:any)=>require('react').createElement(require('react-native').Text,{testID:'stock-service-card',...props},props.product.name)}));
import {httpRequest} from '../src/shared/api/httpClient';
import {AuthContext} from '../context/AuthContext';
import {loadEntityCard} from '../src/features/entityCards/entityApi';
import {EntityCardContent} from '../src/features/entityCards/entityRegistry';
import type {EntityTarget} from '../src/shared/entityLinks';
const guid='11111111-1111-4111-8111-111111111111';
const app:EntityTarget={v:1,source:'app',kind:'product',guid};
const legacy:EntityTarget={v:1,source:'onec',baseKey:'warehouse-source',metaType:'Catalogs',name:'Номенклатура',guid};
const product={guid,name:'Товар приложения',code:'P-1',baseUnit:{name:'Штука',symbol:'шт'},inStock:3,reserved:1,available:2,updatedAt:null};
const request=jest.mocked(httpRequest);
beforeEach(()=>request.mockReset());
test.each([[app,''],[legacy,'?baseKey=warehouse-source']] as const)('app and legacy product links use exact authorized stock lookup: %j',async(target,query)=>{
 request.mockResolvedValue({ok:true,status:200,data:product});const controller=new AbortController();
 const result=await loadEntityCard(target,121,controller.signal);
 expect(result).toEqual({kind:'stock-product',product});
 expect(request).toHaveBeenCalledTimes(1);expect(request).toHaveBeenCalledWith('/stock-balances/products/'+guid+query,expect.objectContaining({expectedUserId:121,signal:controller.signal,networkRetryCount:0}));
});
test.each([[409,'STOCK_SOURCE_MISMATCH','unsupported'],[403,'FORBIDDEN','denied'],[404,'STOCK_PRODUCT_NOT_FOUND','not-found'],[422,'ONEC_AUTH_REQUIRED','unavailable']] as const)('source and ACL denial cannot fall back to personal MCP: %s',async(status,backendErrorCode,kind)=>{
 request.mockResolvedValue({ok:false,status,backendErrorCode});await expect(loadEntityCard(legacy,121,new AbortController().signal)).rejects.toMatchObject({code:backendErrorCode,kind});expect(request).toHaveBeenCalledTimes(1);
});
test('a mismatched exact product or malformed metrics cannot be displayed',async()=>{
 for(const bad of [{...product,guid:'22222222-2222-4222-8222-222222222222'},{...product,inStock:'3'},{...product,baseUnit:{name:'шт',symbol:{secret:true}}}]){
  request.mockResolvedValue({ok:true,status:200,data:bad});await expect(loadEntityCard(app,121,new AbortController().signal)).rejects.toMatchObject({code:'ENTITY_RESPONSE_UNSUPPORTED'});
 }
});
test('switching accounts cancels the old product lookup and never renders its late data',async()=>{
 let complete!:(v:any)=>void;request.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve}));
 request.mockResolvedValue({ok:true,status:200,data:{...product,name:'Новый аккаунт'}});
 const tree=(id:number)=>React.createElement(AuthContext.Provider,{value:{isAuthenticated:true,profile:{id}} as any},React.createElement(EntityCardContent,{target:app,onOpen:jest.fn()}));
 let view!:TestRenderer.ReactTestRenderer;await act(async()=>{view=TestRenderer.create(tree(121));});const signal=request.mock.calls[0][1]?.signal;
 await act(async()=>view.update(tree(122)));expect(signal?.aborted).toBe(true);
 await act(async()=>complete({ok:true,status:200,data:product}));
 try{expect(view.root.findByProps({testID:'stock-service-card'}).props.product.name).toBe('Новый аккаунт');expect(view.root.findAllByType(Text).some(node=>node.props.children==='Товар приложения')).toBe(false);}
 finally{await act(async()=>view.unmount());}
});
test('stock result mounts the shared service component with the host scroll coordinator',async()=>{
 request.mockResolvedValue({ok:true,status:200,data:product});const title=jest.fn(),list=()=>null;let view!:TestRenderer.ReactTestRenderer;
 await act(async()=>{view=TestRenderer.create(React.createElement(AuthContext.Provider,{value:{isAuthenticated:true,profile:{id:121}} as any},React.createElement(EntityCardContent,{target:legacy,onOpen:jest.fn(),onTitleChange:title,ListComponent:list,contentTopInset:104})));});
 try{const body=view.root.findByProps({testID:'stock-service-card'});expect(body.props.product).toEqual(product);expect(body.props.ListComponent).toBe(list);expect(body.props.contentTopInset).toBe(104);expect(title).toHaveBeenCalledWith(product.name);expect(request.mock.calls.some(call=>call[0]==='/entity-links/resolve')).toBe(false);}
 finally{await act(async()=>view.unmount());}
});
