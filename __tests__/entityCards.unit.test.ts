import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type { EntityCardData, EntityTarget } from '../src/features/entityCards/entityTypes';
import { EntityCardError } from '../src/features/entityCards/entityTypes';

jest.mock('../src/shared/api/httpClient', () => ({ httpRequest: jest.fn() }));
jest.mock('../context/AuthContext', () => ({ AuthContext: require('react').createContext(null) }));
jest.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));
jest.mock('../components/Profile/ProfileView', () => ({ ProfileView: (props: any) => require('react').createElement(require('react-native').Text, {testID:'existing-profile'}, `${props.userId}:${props.profileOverride.firstName}`) }));

import { httpRequest } from '../src/shared/api/httpClient';
import { AuthContext } from '../context/AuthContext';
import { entityIdentity, loadEntityCard, validateEntityCardData } from '../src/features/entityCards/entityApi';
import { EntityCardContent } from '../src/features/entityCards/entityRegistry';

const request = httpRequest as jest.Mock;
const product: EntityTarget = {v:1, source:'onec', baseKey:'torg2026', metaType:'Catalogs', name:'ТестовыйСправочник', guid:'11111111-1111-4111-8111-111111111111'};
const order: EntityTarget = {v:1, source:'onec', baseKey:'torg2026', metaType:'Documents', name:'ЗаказКлиента', guid:'22222222-2222-4222-8222-222222222222'};
const user: EntityTarget = {v:1, source:'app',kind:'user',id:'121'};
const card = (target=product): EntityCardData => ({target,view:target.source==='onec'&&target.metaType==='Documents'?'client-order':'product',title:'Тестовый товар',fields:[{key:'posted',label:'Проведён',value:false},{key:'quantity',label:'Количество',value:0}],tables:[],truncated:false});
const response = (data: unknown) => ({ok:true,status:200,data});
const authenticated = (id=1) => ({isAuthenticated:true,profile:{id}} as any);
const content = (view: TestRenderer.ReactTestRenderer) => {
  const collect = (node:any):string => typeof node==='string'?node:Array.isArray(node)?node.map(collect).join(''):node?.children?collect(node.children):'';
  return collect(view.toJSON());
};
function deferred<T>() {let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return{promise,resolve};}

beforeEach(()=>{request.mockReset();});

test('1C card resolution carries the typed identity, personal account pin and abort signal', async()=>{
  request.mockResolvedValue(response(card()));
  const controller=new AbortController();
  const result=await loadEntityCard(product,121,controller.signal);
  expect(result.kind).toBe('entity');
  expect(request).toHaveBeenCalledWith('/entity-links/resolve',expect.objectContaining({method:'POST',body:{target:product,maxTabularRows:100},expectedUserId:121,signal:controller.signal,networkRetryCount:0}));
});

test('user cards reuse the existing profile endpoint and never pass a 1C GUID as app ID', async()=>{
  request.mockResolvedValue(response({profile:{id:121,firstName:'Тест',role:{id:1,name:'employee'},departmentRoles:[]}}));
  const result=await loadEntityCard(user,1,new AbortController().signal);
  expect(result.kind).toBe('profile');expect(request.mock.calls[0][0]).toBe('/users/121/profile');
  await expect(loadEntityCard({...user,id:product.guid} as EntityTarget,1,new AbortController().signal)).rejects.toMatchObject({code:'ENTITY_INVALID_TARGET'});
  expect(request).toHaveBeenCalledTimes(1);
});

test('mismatched bases, malformed references and unexpected nested provider objects cannot render',()=>{
  expect(()=>validateEntityCardData({...card(),target:{...product,baseKey:'other'}},product)).toThrow(EntityCardError);
  expect(()=>validateEntityCardData({...card(),fields:[{key:'bad',label:'Секрет',value:{password:'never render'}}]},product)).toThrow(EntityCardError);
  expect(()=>validateEntityCardData({...card(),fields:[{key:'ref',label:'Ссылка',value:{label:'Неверная ссылка',target:{...user,id:'../../admin'}}}]},product)).toThrow(EntityCardError);
  expect(()=>validateEntityCardData({...card(),tables:[{key:'lines',label:'Товары',columns:[{key:'name',label:'Товар'}],rows:[{name:'Товар',extra:{unexpected:'object'}}],truncated:false}]},product)).toThrow(EntityCardError);
});

test('malformed and unauthenticated targets fail before any request; canceled requests cannot publish data',async()=>{
  const canceled=new AbortController();canceled.abort();
  await expect(loadEntityCard(product,1,canceled.signal)).rejects.toMatchObject({name:'AbortError'});
  await expect(loadEntityCard(product,0,new AbortController().signal)).rejects.toMatchObject({kind:'session'});
  expect(request).not.toHaveBeenCalled();
  const controller=new AbortController(),pending=deferred<ReturnType<typeof response>>();request.mockReturnValue(pending.promise);
  const read=loadEntityCard(product,1,controller.signal);controller.abort();pending.resolve(response(card()));
  await expect(read).rejects.toMatchObject({name:'AbortError'});
});

test.each([
  [422,'ONEC_AUTH_REQUIRED','connect'],[422,'ONEC_CREDENTIALS_INVALID','connect'],[422,'ONEC_ACCESS_DENIED','connect'],
  [403,'ENTITY_FORBIDDEN','denied'],[404,'ENTITY_NOT_FOUND','not-found'],[503,'ONEC_TIMEOUT','unavailable'],[401,'UNAUTHORIZED','session'],
])('HTTP%s %s maps to a safe UI state %s',async(status,code,kind)=>{
  request.mockResolvedValue({ok:false,status,backendErrorCode:code,message:'RAW_PRIVATE_DIAGNOSTIC'});
  await expect(loadEntityCard(product,1,new AbortController().signal)).rejects.toMatchObject({kind,code});
  try{await loadEntityCard(product,1,new AbortController().signal);}catch(error){expect((error as Error).message).not.toContain('RAW_PRIVATE_DIAGNOSTIC');}
});

test('order table values preserve zero/false and open referenced products by typed target',async()=>{
  const data=card(order);data.title='Заказ';data.tables=[{key:'items',label:'Товары',columns:[{key:'product',label:'Номенклатура'},{key:'count',label:'Количество'}],rows:[{product:{label:'Название продукции',target:product},count:0}],truncated:true}];
  request.mockResolvedValue(response(data));const open=jest.fn(),title=jest.fn();let view!:TestRenderer.ReactTestRenderer;
  await act(async()=>{view=TestRenderer.create(React.createElement(AuthContext.Provider,{value:authenticated()},React.createElement(EntityCardContent,{target:order,onOpen:open,onTitleChange:title})));});
  try{
    expect(content(view)).toContain('Нет');expect(content(view)).toContain('0');expect(content(view)).toContain('Показана часть строк');
    const link=view.root.findAll(node=>node.props.accessibilityRole==='link'&&node.props.accessibilityLabel==='Название продукции')[0];
    await act(async()=>link.props.onPress());expect(open).toHaveBeenCalledWith(product,'Название продукции');expect(title).toHaveBeenCalledWith('Заказ');
  }finally{await act(async()=>view.unmount());}
});

test('switching target aborts and ignores a late result including its title',async()=>{
  const first=deferred<ReturnType<typeof response>>(),second=deferred<ReturnType<typeof response>>();request.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const title=jest.fn(),open=jest.fn();let view!:TestRenderer.ReactTestRenderer;
  const tree=(target:EntityTarget)=>React.createElement(AuthContext.Provider,{value:authenticated()},React.createElement(EntityCardContent,{target,onOpen:open,onTitleChange:title}));
  await act(async()=>{view=TestRenderer.create(tree(product));});const signal=request.mock.calls[0][1].signal;
  await act(async()=>view.update(tree(order)));expect(signal.aborted).toBe(true);
  await act(async()=>first.resolve(response({...card(),title:'Устаревший товар'})));
  expect(content(view)).not.toContain('Устаревший');expect(title).not.toHaveBeenCalled();
  await act(async()=>second.resolve(response({...card(order),title:'Актуальный заказ'})));
  expect(content(view)).toContain('Актуальный заказ');expect(title).toHaveBeenCalledTimes(1);
  await act(async()=>view.unmount());
});

test('changing account clears the old card immediately and pins a fresh request to the new account',async()=>{
  request.mockResolvedValueOnce(response({...card(),title:'Данные первого аккаунта'}));const second=deferred<ReturnType<typeof response>>();request.mockReturnValueOnce(second.promise);
  const tree=(id:number)=>React.createElement(AuthContext.Provider,{value:authenticated(id)},React.createElement(EntityCardContent,{target:product,onOpen:jest.fn()}));let view!:TestRenderer.ReactTestRenderer;
  await act(async()=>{view=TestRenderer.create(tree(1));});expect(content(view)).toContain('Данные первого аккаунта');
  await act(async()=>view.update(tree(2)));expect(content(view)).not.toContain('Данные первого аккаунта');expect(request.mock.calls[1][1].expectedUserId).toBe(2);
  await act(async()=>second.resolve(response({...card(),title:'Данные второго аккаунта'})));expect(content(view)).toContain('Данные второго аккаунта');
  await act(async()=>view.unmount());
});

test('missing personal connection offers the protected form callback with the original base',async()=>{
  request.mockResolvedValue({ok:false,status:422,backendErrorCode:'ONEC_AUTH_REQUIRED',message:'PRIVATE'});const connect=jest.fn();let view!:TestRenderer.ReactTestRenderer;
  await act(async()=>{view=TestRenderer.create(React.createElement(AuthContext.Provider,{value:authenticated()},React.createElement(EntityCardContent,{target:product,onOpen:jest.fn(),onConnect:connect})));});
  try{expect(content(view)).not.toContain('PRIVATE');const button=view.root.findAll(node=>node.props.accessibilityRole==='button').find(node=>content({toJSON:()=>node} as any).includes('Подключить 1С'))!;await act(async()=>button.props.onPress());expect(connect).toHaveBeenCalledWith('torg2026');}
  finally{await act(async()=>view.unmount());}
});

test('profile rendering reuses ProfileView and exposes the one injected scroll owner with restored position',async()=>{
  request.mockResolvedValue(response({profile:{id:121,firstName:'Тест',lastName:'Сотрудник',role:{id:1,name:'employee'},departmentRoles:[]}}));const onScroll=jest.fn();let view!:TestRenderer.ReactTestRenderer;
  await act(async()=>{view=TestRenderer.create(React.createElement(AuthContext.Provider,{value:authenticated()},React.createElement(EntityCardContent,{target:user,onOpen:jest.fn(),scrollOffset:88,onScrollOffsetChange:onScroll})));});
  try{expect(view.root.findByProps({testID:'existing-profile'})).toBeTruthy();const scroll=view.root.findAllByProps({testID:'entity-card-scroll'})[0];expect(scroll.props.contentOffset).toEqual({x:0,y:88});await act(async()=>scroll.props.onScroll({nativeEvent:{contentOffset:{y:144}}}));expect(onScroll).toHaveBeenCalledWith(144);}
  finally{await act(async()=>view.unmount());}
});

test('target identity is stable across object allocation and GUID casing',()=>{
  expect(entityIdentity(product)).toBe(entityIdentity({...product,guid:product.guid.toUpperCase()}));
  expect(entityIdentity({...product,baseKey:'other'})).not.toBe(entityIdentity(product));
});

test('partial tables expand100→250→1000 while retaining loaded data, keep the partial marker and reset for another object',async()=>{
  const partial=(target=order)=>({...card(target),title:'Доступные строки',tables:[{key:'items',label:'Товары',columns:[{key:'name',label:'Товар'}],rows:[{name:'Сохранённая строка'}],truncated:true}]});
  const second=deferred<ReturnType<typeof response>>();request.mockResolvedValueOnce(response(partial())).mockReturnValueOnce(second.promise).mockResolvedValueOnce(response(partial())).mockResolvedValueOnce(response(card()));
  const tree=(target:EntityTarget)=>React.createElement(AuthContext.Provider,{value:authenticated()},React.createElement(EntityCardContent,{target,onOpen:jest.fn()}));let view!:TestRenderer.ReactTestRenderer;
  await act(async()=>{view=TestRenderer.create(tree(order));});
  await act(async()=>view.root.findAllByProps({testID:'entity-card-show-more'})[0].props.onPress());
  expect(request.mock.calls[1][1].body.maxTabularRows).toBe(250);expect(content(view)).toContain('Сохранённая строка');
  await act(async()=>second.resolve(response(partial())));
  await act(async()=>view.root.findAllByProps({testID:'entity-card-show-more'})[0].props.onPress());
  expect(request.mock.calls[2][1].body.maxTabularRows).toBe(1000);expect(content(view)).toContain('Показана часть строк');expect(view.root.findAllByProps({testID:'entity-card-show-more'})).toHaveLength(0);
  await act(async()=>view.update(tree(product)));expect(request.mock.calls[3][1].body.maxTabularRows).toBe(100);
  await act(async()=>view.unmount());
});
