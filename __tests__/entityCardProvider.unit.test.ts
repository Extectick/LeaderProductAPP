import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {TextInput} from 'react-native';
jest.mock('../context/AuthContext',()=>({AuthContext:require('react').createContext(null)}));
jest.mock('../utils/config',()=>({API_BASE_URL:'https://dev.example.test'}));
const mockPush=jest.fn();
jest.mock('expo-router',()=>({router:{push:(...args:any[])=>mockPush(...args)},useSegments:()=>['(main)','services','help']}));
let mockHost:any;
jest.mock('../src/features/entityCards/EntityCardHost',()=>({__esModule:true,default:(props:any)=>{mockHost=props;return null;}}));
import {AuthContext} from '../context/AuthContext';
import {EntityCardProvider} from '../src/features/entityCards/EntityCardProvider';
import {useEntityCards,type EntityCardNavigation} from '../src/features/entityCards/EntityCardContext';
import type {EntityTarget} from '../src/shared/entityLinks';
import {helpOriginTracker} from '../src/features/help/helpClientContext';

const product:EntityTarget={v:1,source:'onec',baseKey:'torg2026',metaType:'Catalogs',name:'Номенклатура',guid:'12345678-abcd-1234-abcd-123456789abc'};
const user:EntityTarget={v:1,source:'app',kind:'user',id:'121'};
let navigation:EntityCardNavigation;
function Draft(){navigation=useEntityCards();const [draft,setDraft]=React.useState('Неотправленное сообщение');return React.createElement(TextInput,{testID:'original-draft',value:draft,onChangeText:setDraft});}
const tree=(id:number)=>React.createElement(AuthContext.Provider,{value:{isAuthenticated:true,isLoading:false,profile:{id},setAuthenticated:()=>{},setProfile:async()=>{},signOut:async()=>{}} as any},React.createElement(EntityCardProvider,null,React.createElement(Draft)));

test('the shared card supplies a normalized account-scoped Help hint, and closing marks it previous',async()=>{
 let view!:TestRenderer.ReactTestRenderer;await act(async()=>{view=TestRenderer.create(tree(1));});
 try{
  await act(async()=>navigation.openEntity(product));
  expect(helpOriginTracker.read('https://dev.example.test:1')).toMatchObject({target:product,state:'current'});
  await act(async()=>navigation.close());
  expect(helpOriginTracker.read('https://dev.example.test:1')).toMatchObject({target:product,state:'previous'});
  await act(async()=>view.update(tree(2)));
  expect(helpOriginTracker.read('https://dev.example.test:1')).toBeUndefined();
  expect(helpOriginTracker.read('https://dev.example.test:2')).not.toHaveProperty('target');
 }finally{await act(async()=>view.unmount());}
});

test('global panel preserves the mounted draft, nested parent position and suspends focus until dismissal',async()=>{
 let view!:TestRenderer.ReactTestRenderer;await act(async()=>{view=TestRenderer.create(tree(1));});
 try{
  const input=view.root.findByType(TextInput);
  await act(async()=>{input.props.onChangeText('Сохранённый черновик');navigation.openEntity(product,'Товар');});
  expect(navigation.isOpen).toBe(true);const firstKey=mockHost.state.frames[0].key;
  await act(async()=>{mockHost.onScroll(firstKey,420);mockHost.onOpen(user,'Сотрудник');});
  expect(mockHost.state.frames).toHaveLength(2);
  await act(async()=>navigation.back());expect(mockHost.state.frames[0].scrollOffset).toBe(420);
  expect(view.root.findByType(TextInput).props.value).toBe('Сохранённый черновик');
  await act(async()=>navigation.close());expect(navigation.isOpen).toBe(true);expect(mockHost.state.closing).toBe(true);
  await act(async()=>mockHost.onDismiss());expect(navigation.isOpen).toBe(false);
  expect(view.root.findByType(TextInput).props.value).toBe('Сохранённый черновик');
 }finally{await act(async()=>view.unmount());}
});

test('account change immediately removes old panel; late dismissal cannot affect a new account',async()=>{
 let view!:TestRenderer.ReactTestRenderer;await act(async()=>{view=TestRenderer.create(tree(1));});
 try{
  await act(async()=>navigation.openEntity(product));const oldDismiss=mockHost.onDismiss;
  await act(async()=>view.update(tree(2)));expect(navigation.isOpen).toBe(false);
  await act(async()=>navigation.openEntity(user));expect(mockHost.userId).toBe(2);
  await act(async()=>oldDismiss());expect(navigation.isOpen).toBe(true);expect(mockHost.userId).toBe(2);
 }finally{await act(async()=>view.unmount());}
});

test('authenticated employee can inspect another profile without an active profile-type payload',async()=>{
 let view!:TestRenderer.ReactTestRenderer;
 const auth={isAuthenticated:true,isLoading:false,profile:{id:42,role:{name:'employee'},currentProfileType:null,employeeProfile:null}};
 await act(async()=>{view=TestRenderer.create(React.createElement(AuthContext.Provider,{value:auth as any},React.createElement(EntityCardProvider,null,React.createElement(Draft))));});
 try{
  expect(navigation.status).toBe('ready');
  await act(async()=>{expect(navigation.openEntity(user)).toBe(true);});
  expect(mockHost.userId).toBe(42);expect(mockHost.state.frames[0].target).toEqual(user);
 }finally{await act(async()=>view.unmount());}
});

test.each([[false,'ACTIVE','authentication-required'],[true,'BLOCKED','blocked']])('a missing or blocked session cannot open a profile',async(authenticated,profileStatus,status)=>{
 let view!:TestRenderer.ReactTestRenderer;
 await act(async()=>{view=TestRenderer.create(React.createElement(AuthContext.Provider,{value:{isAuthenticated:authenticated,isLoading:false,profile:{id:42,profileStatus}} as any},React.createElement(EntityCardProvider,null,React.createElement(Draft))));});
 try{expect(navigation.status).toBe(status);expect(navigation.openEntity(user)).toBe(false);expect(navigation.isOpen).toBe(false);}
 finally{await act(async()=>view.unmount());}
});

test('losing authentication updates the link status even when no panel is open',async()=>{
 let view!:TestRenderer.ReactTestRenderer;await act(async()=>{view=TestRenderer.create(tree(42));});
 try{
  expect(navigation.status).toBe('ready');
  await act(async()=>{view.update(React.createElement(AuthContext.Provider,{value:{isAuthenticated:false,isLoading:false,profile:{id:42}} as any},React.createElement(EntityCardProvider,null,React.createElement(Draft))));});
  expect(navigation.status).toBe('authentication-required');expect(navigation.openEntity(user)).toBe(false);
 }finally{await act(async()=>view.unmount());}
});

const clientOrder:EntityTarget={v:1,source:'onec',baseKey:'torg2026',metaType:'Documents',name:'ЗаказКлиента',guid:'b8b8cb5c-d9b9-11f1-9d3e-f6ac37589664'};
test('orders remain in the shared viewer and preserve the original Help draft',async()=>{
 mockPush.mockClear();let view!:TestRenderer.ReactTestRenderer;await act(async()=>{view=TestRenderer.create(tree(1));});
 try{
  const input=view.root.findByType(TextInput);await act(async()=>input.props.onChangeText('Черновик перед заказом'));
  await act(async()=>navigation.openEntity(clientOrder));
  expect(mockHost.state.frames.at(-1)).toMatchObject({kind:'entity',target:clientOrder});
  expect(mockHost.state.closing).toBe(false);expect(mockPush).not.toHaveBeenCalled();
  await act(async()=>navigation.close());await act(async()=>mockHost.onDismiss());
  expect(navigation.isOpen).toBe(false);expect(mockPush).not.toHaveBeenCalled();
  expect(view.root.findByType(TextInput).props.value).toBe('Черновик перед заказом');
 }finally{await act(async()=>view.unmount());}
});

test('nested orders return to their parent card without navigating away from Help',async()=>{
 mockPush.mockClear();let view!:TestRenderer.ReactTestRenderer;await act(async()=>{view=TestRenderer.create(tree(1));});
 try{
  await act(async()=>navigation.openEntity(user));const parent=mockHost.state.frames[0];
  await act(async()=>{mockHost.onScroll(parent.key,180);navigation.openEntity(clientOrder);});
  expect(mockHost.state.frames).toHaveLength(2);
  await act(async()=>navigation.back());
  expect(mockHost.state.frames).toHaveLength(1);expect(mockHost.state.frames[0]).toMatchObject({target:user,scrollOffset:180});
  expect(mockPush).not.toHaveBeenCalled();
 }finally{await act(async()=>view.unmount());}
});
