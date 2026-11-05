import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {TextInput} from 'react-native';
jest.mock('../context/AuthContext',()=>({AuthContext:require('react').createContext(null)}));
jest.mock('../utils/config',()=>({API_BASE_URL:'https://dev.example.test'}));
jest.mock('../utils/profileGate',()=>({getProfileGate:()=> 'active'}));
let mockHost:any;
jest.mock('../src/features/entityCards/EntityCardHost',()=>({__esModule:true,default:(props:any)=>{mockHost=props;return null;}}));
import {AuthContext} from '../context/AuthContext';
import {EntityCardProvider} from '../src/features/entityCards/EntityCardProvider';
import {useEntityCards,type EntityCardNavigation} from '../src/features/entityCards/EntityCardContext';
import type {EntityTarget} from '../src/shared/entityLinks';

const product:EntityTarget={v:1,source:'onec',baseKey:'torg2026',metaType:'Catalogs',name:'Номенклатура',guid:'12345678-abcd-1234-abcd-123456789abc'};
const user:EntityTarget={v:1,source:'app',kind:'user',id:'121'};
let navigation:EntityCardNavigation;
function Draft(){navigation=useEntityCards();const [draft,setDraft]=React.useState('Неотправленное сообщение');return React.createElement(TextInput,{testID:'original-draft',value:draft,onChangeText:setDraft});}
const tree=(id:number)=>React.createElement(AuthContext.Provider,{value:{isAuthenticated:true,isLoading:false,profile:{id},setAuthenticated:()=>{},setProfile:async()=>{},signOut:async()=>{}} as any},React.createElement(EntityCardProvider,null,React.createElement(Draft)));

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
