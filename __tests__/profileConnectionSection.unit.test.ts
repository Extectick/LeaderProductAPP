import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {ConnectionAction,ConnectionSection} from '../src/features/profile/ui/ConnectionPrimitives';
import {ConnectionSectionVisibilityContext} from '../src/features/profile/ui/ConnectionSectionContext';
jest.mock('react-native',()=>({View:'View',Pressable:'Pressable',Platform:{OS:'web'},StyleSheet:{create:(value:unknown)=>value,hairlineWidth:1}}));
jest.mock('react-native-paper',()=>({Button:'Button',Text:'Text',TextInput:'Input'}));
jest.mock('@expo/vector-icons',()=>({Ionicons:'Icon'}));
jest.mock('@/components/ui/appSurfaceTokens',()=>({useAppSurfaceTheme:()=>({text:'#111',muted:'#666',line:'#ddd',panel:'#eee',accent:'#06f'})}));

test('retained sections load on first opening only and retain their state across collapse',async()=>{
 const load=jest.fn();let view!:Renderer.ReactTestRenderer;
 function Content(){
  React.useEffect(()=>{load();},[]);
  const [value,setValue]=React.useState(0),visible=React.useContext(ConnectionSectionVisibilityContext);
  return React.createElement('Content',{value,visible,onChange:()=>setValue(n=>n+1)});
 }
 const tree=(expanded:boolean)=>React.createElement(ConnectionSection,{title:'1С',subtitle:'Личная учётная запись',icon:'server-outline',keepMounted:true,expanded,onPress:()=>{}},React.createElement(Content));
 try{
  await act(async()=>{view=Renderer.create(tree(false));});expect(load).not.toHaveBeenCalled();
  await act(async()=>view.update(tree(true)));expect(load).toHaveBeenCalledTimes(1);
  await act(async()=>view.root.findByType('Content' as any).props.onChange());
  await act(async()=>view.update(tree(false)));expect(view.root.findByType('Content' as any).props.visible).toBe(false);
  await act(async()=>view.update(tree(true)));expect(load).toHaveBeenCalledTimes(1);
  expect(view.root.findByType('Content' as any).props).toMatchObject({visible:true,value:1});
 }finally{if(view)await act(async()=>view.unmount());}
});

test('disabled Paper outer surfaces do not expose active hover feedback',async()=>{
 let view!:Renderer.ReactTestRenderer;
 try{
  await act(async()=>{view=Renderer.create(React.createElement(ConnectionAction,{disabled:true},'Подключить'));});
  expect(view.root.findByType('Button' as any).props['aria-disabled']).toBe(true);
  expect(view.root.findByType('Button' as any).props.dataSet).toBeUndefined();
  await act(async()=>view.update(React.createElement(ConnectionAction,{disabled:false},'Подключить')));
  expect(view.root.findByType('Button' as any).props['aria-disabled']).toBe(false);
  expect(view.root.findByType('Button' as any).props.dataSet.appControl).toBe('filled');
 }finally{if(view)await act(async()=>view.unmount());}
});
