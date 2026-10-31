import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';

jest.mock('react-native', () => ({Platform:{OS:'android'}}));
jest.mock('expo-modules-core', () => ({requireOptionalNativeModule:()=>({apiVersion:1}),requireNativeViewManager:()=> 'NativeHelpInput'}));
const mockProbe=jest.fn(()=>jest.fn()),mockActions=jest.fn(()=>jest.fn());
jest.mock('../src/features/help/helpDiagnostics',()=>({helpDevProbe:(...args:any[])=>mockProbe(...args),helpDevActions:(...args:any[])=>mockActions(...args),helpDevRef:jest.fn()}));
import {HelpNativeInput} from '../src/features/help/components/HelpNativeInput';

test('acknowledges native text events without remounting or controlling selection',async()=>{
  const changed=jest.fn(),geometry=jest.fn(),focusInput=jest.fn(),diagnostics=jest.fn();
  const ref=React.createRef<any>();
  const props={value:'',onChange:changed,onGeometry:geometry,placeholder:'Сообщение…',color:'#fff',hintColor:'#999',accentColor:'#38f',editable:true,reducedMotion:false};
  let tree!:TestRenderer.ReactTestRenderer;
  await act(async()=>{tree=TestRenderer.create(React.createElement(HelpNativeInput,{...props,ref}),{createNodeMock:()=>({focusInput,diagnostics})});});
  const input=()=>tree.root.findByType('NativeHelpInput' as any);
  expect(input().props.textState).toEqual({text:'',eventCount:0});
  await act(async()=>input().props.onTextEdited({nativeEvent:{text:'AB',eventCount:2}}));
  expect(changed).toHaveBeenCalledWith('AB');
  await act(async()=>tree.update(React.createElement(HelpNativeInput,{...props,value:"AB",ref})));
  expect(input().props.textState).toEqual({text:'AB',eventCount:2});
  expect(input().props.selection).toBeUndefined();
  expect(input().props.style.height).toBeUndefined(); // Native owns size.
  ref.current.focus();expect(focusInput).toHaveBeenCalled();
  input().props.onGeometry({nativeEvent:{height:68,contentHeight:44}});
  expect(geometry).toHaveBeenCalledWith(68,44);
  expect(mockProbe).toHaveBeenCalledWith('composer',expect.any(Function));
  await act(async()=>tree.unmount());
});

test('fullscreen return restores text and selection through a production native command',async()=>{
  const restoreInput=jest.fn(async()=>{}),selection=jest.fn(),lines=jest.fn(),ref=React.createRef<any>();
  let tree!:TestRenderer.ReactTestRenderer;
  await act(async()=>{tree=TestRenderer.create(React.createElement(HelpNativeInput,{ref,value:'Текст',onChange:jest.fn(),onGeometry:jest.fn(),onSelection:selection,onLines:lines,placeholder:'',color:'#fff',hintColor:'#999',accentColor:'#38f',editable:true,reducedMotion:true}),{createNodeMock:()=>({restoreInput})});});
  const input=tree.root.findByType('NativeHelpInput' as any);
  input.props.onSelectionChanged({nativeEvent:{start:1,end:3}});
  expect(selection).toHaveBeenCalledWith({start:1,end:3});
  input.props.onGeometry({nativeEvent:{height:68,contentHeight:44,lines:2}});
  expect(lines).toHaveBeenCalledWith(2);
  await ref.current.restore('Дополненный текст',{start:2,end:7});
  expect(restoreInput).toHaveBeenCalledWith('Дополненный текст',2,7);
  await act(async()=>tree.unmount());
});
