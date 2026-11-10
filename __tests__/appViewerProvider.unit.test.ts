import React from 'react';import Renderer,{act} from 'react-test-renderer';import {TextInput} from 'react-native';
jest.mock('../context/AuthContext',()=>({AuthContext:require('react').createContext(null)}));
jest.mock('../utils/config',()=>({API_BASE_URL:'https://api.invalid'}));
jest.mock('expo-router',()=>({router:{push:jest.fn()},useSegments:()=>['(main)','services','help']}));
let mockHost:any;jest.mock('../src/features/entityCards/EntityCardHost',()=>({__esModule:true,default:(props:any)=>{mockHost=props;return null}}));
import {AuthContext} from '../context/AuthContext';import {EntityCardProvider} from '../src/features/entityCards/EntityCardProvider';import {useEntityCards,type EntityCardNavigation} from '../src/features/entityCards/EntityCardContext';
let nav:EntityCardNavigation;function Child(){nav=useEntityCards();return React.createElement(TextInput,{value:'Сохранённый черновик'})}
const tree=(id=1)=>React.createElement(AuthContext.Provider,{value:{isAuthenticated:true,profile:{id}} as any},React.createElement(EntityCardProvider,null,React.createElement(Child)));
test('website shares the same host and Back prioritizes menu then native history then frame',async()=>{
 let v!:Renderer.ReactTestRenderer;await act(async()=>{v=Renderer.create(tree())});try{
  await act(async()=>nav.openEntity({v:1,source:'app',kind:'user',id:'1'}));await act(async()=>nav.openWeb!('https://tass.ru/','Новости'));
  const key=mockHost.state.frames.at(-1).key,goBack=jest.fn(),reload=jest.fn(),menu=jest.fn().mockReturnValueOnce(true).mockReturnValue(false);
  await act(async()=>{mockHost.onPageControls(key,{canGoBack:true,goBack,reload});mockHost.onRegisterMenuDismiss(key,menu);nav.back()});expect(goBack).not.toHaveBeenCalled();
  await act(async()=>nav.back());expect(goBack).toHaveBeenCalledTimes(1);expect(mockHost.state.frames).toHaveLength(2);
  expect(mockHost.onReloadPage(key)).toBe(true);expect(reload).toHaveBeenCalledTimes(1);
  await act(async()=>{mockHost.onPageControls(key,{canGoBack:false,goBack,reload});nav.back()});expect(mockHost.state.frames).toHaveLength(1);
  expect(v.root.findByType(TextInput).props.value).toBe('Сохранённый черновик');
 }finally{await act(async()=>v.unmount())}
});
test('HTML ownership and stale website callbacks cannot cross account/close boundaries',async()=>{
 let v!:Renderer.ReactTestRenderer;await act(async()=>{v=Renderer.create(tree())});try{
  const payload:any={artifact:{id:'example',title:'Example',full:{html:'<p>Example</p>',css:''}},scopeId:'source',expectedUserId:2,isCurrent:()=>true};
  expect(nav.openHtml!(payload)).toBe(false);await act(async()=>nav.openHtml!({...payload,expectedUserId:1}));
  await act(async()=>nav.openWeb!('https://tass.ru/'));const key=mockHost.state.frames.at(-1).key,late=mockHost.onPageControls,goBack=jest.fn();
  await act(async()=>v.update(tree(2)));late(key,{canGoBack:true,goBack,reload:jest.fn()});await act(async()=>nav.openWeb!('https://example.invalid/'));
  await act(async()=>nav.back());expect(goBack).not.toHaveBeenCalled();
 }finally{await act(async()=>v.unmount())}
});
