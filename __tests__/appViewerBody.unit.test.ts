import React from 'react';import Renderer,{act} from 'react-test-renderer';
jest.mock('expo-router',()=>({router:{navigate:jest.fn()}}));
jest.mock('../src/features/entityCards/entityRegistry',()=>({EntityCardContent:'EntityCardContent'}));
jest.mock('../src/features/profile/ui/ProfileOnecConnections',()=>({ProfileOnecConnections:'Connections'}));
jest.mock('../src/features/help/components/HelpHtmlSurface',()=>({HelpHtmlSurface:'HtmlSurface'}));
let mockMounted=0,mockUnmounted=0,mockWebProps:any;
jest.mock('../src/features/webPages/WebPageContent',()=>({WebPageContent:(props:any)=>{mockWebProps=props;const React=require('react');React.useEffect(()=>{mockMounted++;return()=>{mockUnmounted++}},[]);return React.createElement('Site',{active:props.active})}}));
import {View,ScrollView} from 'react-native';import {EntityCardBody} from '../src/features/entityCards/EntityCardBody';
const web={key:1,kind:'web',url:'https://tass.ru/',currentUrl:'https://tass.ru/article',title:'Новости',scrollOffset:90};
const profile={key:2,kind:'entity',target:{v:1,source:'app',kind:'user',id:'1'},title:'Профиль',scrollOffset:0};
const props:any={userId:1,onOpen:()=>true,onBack:()=>{},onTitle:()=>{},onScroll:()=>{},onConnect:()=>{},ScrollComponent:ScrollView};
const tree=(frames:any[])=>React.createElement(EntityCardBody,{...props,state:{account:'user1',session:1,sequence:2,frames,closing:false}});
test('a nested card retains the website instance and browser state behind it',async()=>{
 mockMounted=0;mockUnmounted=0;let v!:Renderer.ReactTestRenderer;await act(async()=>{v=Renderer.create(tree([web]))});try{
  const late=mockWebProps.onOpenLink;expect(mockWebProps.url).toBe('https://tass.ru/');expect(mockMounted).toBe(1);
  await act(async()=>v.update(tree([web,profile])));expect(mockWebProps.active).toBe(false);expect(mockUnmounted).toBe(0);expect(late('https://example.invalid/')).toBe(false);
  expect(v.root.findAllByType(View).some(n=>n.props.style?.display==='none')).toBe(true);
  await act(async()=>v.update(tree([web])));expect(mockWebProps.active).toBe(true);expect(mockMounted).toBe(1);expect(mockUnmounted).toBe(0);
 }finally{await act(async()=>v.unmount())}expect(mockUnmounted).toBe(1);
});
