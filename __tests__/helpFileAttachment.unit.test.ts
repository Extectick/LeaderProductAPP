import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {StyleSheet} from 'react-native';
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpTheme:()=>({dark:false,text:'#222',muted:'#666',accentText:'#38f'})}));
import {HelpFileAttachment} from '../src/features/help/components/HelpFileAttachment';
const file:any={id:'file',url:'/file',name:'Документ.pdf',size:512,kind:'FILE'};
let view:TestRenderer.ReactTestRenderer;
afterEach(async()=>{if(view)await act(async()=>view.unmount());});
const button=()=>view.root.findAll(n=>n.props.testID==='help-file-attachment-file'&&typeof n.props.onPress==='function')[0];
test('busy grey surface guards duplicate presses and preserves geometry through completion',async()=>{
 let finish!:(value:unknown)=>void;const onPress=jest.fn(()=>new Promise(done=>{finish=done;}));
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpFileAttachment,{file,onPress,onError:jest.fn()}));});
 const initial=StyleSheet.flatten(button().props.style);
 await act(async()=>{button().props.onPress();button().props.onPress();});
 expect(onPress).toHaveBeenCalledTimes(1);expect(button().props.accessibilityState).toEqual({busy:true,disabled:true});
 expect(StyleSheet.flatten(button().props.style)).toEqual({...initial,backgroundColor:'#E4E7EB'});
 await act(async()=>finish(true));expect(button().props.accessibilityState.busy).toBe(false);
 expect(StyleSheet.flatten(button().props.style)).toEqual(initial);
});
test.each(['reject','false'])('a %s result offers retry and keeps error details private',async mode=>{
 const onPress=jest.fn().mockImplementationOnce(()=>mode==='reject'?Promise.reject(new Error('private URL')):Promise.resolve(false)).mockResolvedValue(true),onError=jest.fn();
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpFileAttachment,{file,onPress,onError}));});
 await act(async()=>button().props.onPress());expect(button().props.accessibilityLabel).toBe('Повторить загрузку Документ.pdf');
 expect(onError).toHaveBeenCalledTimes(mode==='reject'?1:0);
 await act(async()=>button().props.onPress());expect(onPress).toHaveBeenCalledTimes(2);
 expect(button().props.accessibilityLabel).toBe('Скачать Документ.pdf');
});
test('a recycled cell fences a prior operation even when the same file returns',async()=>{
 let first!:(value:unknown)=>void,second!:(value:unknown)=>void;
 const onPress=jest.fn().mockImplementationOnce(()=>new Promise(done=>{first=done;})).mockImplementationOnce(()=>new Promise(done=>{second=done;})),onError=jest.fn();
 const tree=(attachment:any)=>React.createElement(HelpFileAttachment,{file:attachment,onPress,onError});
 await act(async()=>{view=TestRenderer.create(tree(file));});await act(async()=>button().props.onPress());
 await act(async()=>view.update(tree({...file,id:'other',url:'/other'})));
 await act(async()=>view.update(tree(file)));await act(async()=>button().props.onPress());
 await act(async()=>first(false));expect(button().props.accessibilityState.busy).toBe(true);
 await act(async()=>second(true));expect(button().props.accessibilityState.busy).toBe(false);expect(onError).not.toHaveBeenCalled();
});
