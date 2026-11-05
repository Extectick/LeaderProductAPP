import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {Text} from 'react-native';
jest.mock('../context/AuthContext',()=>({AuthContext:require('react').createContext(null)}));
jest.mock('../context/ThemeContext',()=>{
 const React=require('react');const ThemeContext=React.createContext({theme:'light'});
 return {ThemeContext,useTheme:()=>React.useContext(ThemeContext)};
});
import {Portal,PortalProvider} from '@gorhom/portal';
import {AuthContext} from '../context/AuthContext';
import {ThemeContext,useTheme} from '../context/ThemeContext';
import {EntityCardContext,useEntityCards} from '../src/features/entityCards/EntityCardContext';
import {EntityCardPortalContext,useEntityCardPortalContext} from '../src/features/entityCards/EntityCardPortalContext';

function Reader(){
 const auth=React.useContext(AuthContext);
 return React.createElement(Text,{testID:'portal-card-identity'},`${auth?.profile?.id??'missing'}:${auth?.profile?.role?.name??'missing'}:${useTheme().theme}:${useEntityCards().status}`);
}
function ModalContent({bridged}:{bridged:boolean}){
 const value=useEntityCardPortalContext();
 return React.createElement(Portal,{name:'entity-portal-test'},bridged?React.createElement(EntityCardPortalContext,{value},React.createElement(Reader)):React.createElement(Reader));
}
const noop=()=>{};
const tree=(id:number,bridged=true)=>React.createElement(PortalProvider,null,
 React.createElement(AuthContext.Provider,{value:{isAuthenticated:true,profile:{id,role:{name:'employee'}}} as any},
  React.createElement(ThemeContext.Provider,{value:{theme:'dark'} as any},
   React.createElement(EntityCardContext.Provider,{value:{isOpen:true,status:'ready',openEntity:()=>true,openEntityLink:()=>true,close:noop,back:noop}},
    React.createElement(ModalContent,{bridged})))));

test('reproduces lost session when the native root portal is above the authenticated app',async()=>{
 let view!:TestRenderer.ReactTestRenderer;await act(async()=>{view=TestRenderer.create(tree(42,false));});
 try{expect(view.root.findByProps({testID:'portal-card-identity'}).props.children).toBe('missing:missing:light:unavailable');}
 finally{await act(async()=>view.unmount());}
});
test('portal boundary preserves employee session, theme and navigation and follows account changes',async()=>{
 let view!:TestRenderer.ReactTestRenderer;await act(async()=>{view=TestRenderer.create(tree(42));});
 try{
  expect(view.root.findByProps({testID:'portal-card-identity'}).props.children).toBe('42:employee:dark:ready');
  await act(async()=>view.update(tree(43)));
  expect(view.root.findByProps({testID:'portal-card-identity'}).props.children).toBe('43:employee:dark:ready');
 }finally{await act(async()=>view.unmount());}
});
