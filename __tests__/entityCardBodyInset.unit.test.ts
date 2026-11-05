import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {ScrollView,StyleSheet} from 'react-native';
jest.mock('../src/features/profile/ui/ProfileOnecConnections',()=>({ProfileOnecConnections:'ProtectedConnections'}));
jest.mock('../src/features/entityCards/entityRegistry',()=>({EntityCardContent:'EntityContent'}));
import {EntityCardBody} from '../src/features/entityCards/EntityCardBody';
import type {EntityCardHostProps} from '../src/features/entityCards/EntityCardHost.types';
const base:EntityCardHostProps={state:{account:'dev:121',session:1,sequence:1,closing:false,frames:[{key:1,kind:'entity',target:{v:1,source:'app',kind:'user',id:'121'},title:'Профиль',scrollOffset:120}]},userId:121,onBack:jest.fn(),onClose:jest.fn(),onDismiss:jest.fn(),onOpen:jest.fn(),onTitle:jest.fn(),onScroll:jest.fn(),onConnect:jest.fn()};
test('body forwards only viewer inset without changing target identity or restored scroll',async()=>{
 let view!:TestRenderer.ReactTestRenderer;
 await act(async()=>{view=TestRenderer.create(React.createElement(EntityCardBody,{...base,ScrollComponent:ScrollView,contentTopInset:80}));});
 try{
  const content=view.root.findAll(node=>node.type==='EntityContent')[0];expect(content.props.contentTopInset).toBe(80);expect(content.props.scrollOffset).toBe(120);expect(content.props.target).toBe((base.state.frames[0] as any).target);
  await act(async()=>view.update(React.createElement(EntityCardBody,{...base,ScrollComponent:ScrollView})));expect(view.root.findAll(node=>node.type==='EntityContent')[0].props.contentTopInset).toBe(0);
 }finally{await act(async()=>view.unmount());}
});
test('protected connection stays below shared header and late success cannot return across account changes',async()=>{
 const onBack=jest.fn(),state:EntityCardHostProps['state']={...base.state,frames:[{key:2,kind:'connection',baseKey:'torg2026',title:'Подключение 1С',scrollOffset:0}]};let view!:TestRenderer.ReactTestRenderer;
 await act(async()=>{view=TestRenderer.create(React.createElement(EntityCardBody,{...base,state,onBack,ScrollComponent:ScrollView,contentTopInset:80}));});
 try{
  const scroll=view.root.findByType(ScrollView);expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingTop).toBe(100);expect(scroll.props.showsVerticalScrollIndicator).toBe(false);
  const connection=view.root.findAll(node=>node.type==='ProtectedConnections')[0];expect(connection.props.userId).toBe(121);expect(connection.props.initialBase).toBe('torg2026');
  const late=connection.props.onConnected;await act(async()=>view.update(React.createElement(EntityCardBody,{...base,state:{...state,account:'dev:122'},userId:122,onBack,ScrollComponent:ScrollView,contentTopInset:80})));
  await act(async()=>late(new AbortController().signal));expect(onBack).not.toHaveBeenCalled();
 }finally{await act(async()=>view.unmount());}
});
