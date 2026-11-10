/** @jest-environment jsdom */
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
// Actual RN-web View/Animated renderer: accessibilityRole really changes the DOM tag.
jest.mock('react-native',()=>jest.requireActual('react-native-web'));
import {Text} from 'react-native';
import {HelpComposerVoiceAction} from '../src/features/help/components/HelpComposerVoiceAction';

let container:HTMLDivElement,root:Root;
beforeEach(()=>{container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});

test('one real button retains its DOM identity from microphone to locked recording, draft and send-in-progress',async()=>{
 const onStart=jest.fn(),onSend=jest.fn();
 const render=(sendAction:boolean,disabled=false)=>act(async()=>root.render(React.createElement(HelpComposerVoiceAction,{
  panHandlers:{},label:sendAction?'Отправить голосовое сообщение':'Записать голосовое сообщение',sendAction,canStart:!sendAction,disabled,onStart,onSend,style:{width:64,height:64},
  children:React.createElement(Text,{'aria-hidden':true},sendAction?'↑':'Микрофон'),
 })));
 await render(false);
 const button=container.querySelector('button')!;expect(button).not.toBeNull();expect(button.tabIndex).toBe(0);
 button.focus();
 await act(async()=>button.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));
 expect(onStart).toHaveBeenCalledTimes(1);expect(onSend).not.toHaveBeenCalled();
 // Locking and retaining a voice draft use the same send action and gesture node.
 await render(true);
 expect(container.querySelector('button')).toBe(button);expect(document.activeElement).toBe(button);
 expect(button.getAttribute('aria-label')).toBe('Отправить голосовое сообщение');
 expect(container.querySelectorAll('button')).toHaveLength(1);expect(container.querySelector('button button')).toBeNull();
 const enter=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});
 await act(async()=>button.dispatchEvent(enter));expect(enter.defaultPrevented).toBe(false);
 // The semantic button owns browser-generated Enter/Space clicks (JSDOM has no default key action).
 await act(async()=>button.click());expect(onSend).toHaveBeenCalledTimes(1);
 await render(true,true);expect(button.disabled).toBe(true);
 await act(async()=>button.click());expect(onSend).toHaveBeenCalledTimes(1);
 await render(true,false);expect(button.disabled).toBe(false);expect(button.tabIndex).toBe(0);
 await act(async()=>button.click());expect(onSend).toHaveBeenCalledTimes(2);
});

test('idle pointer clicks do not duplicate hold handling; Space and assistive clicks remain accessible',async()=>{
 const onStart=jest.fn();
 await act(async()=>root.render(React.createElement(HelpComposerVoiceAction,{panHandlers:{},label:'Записать голосовое сообщение',sendAction:false,canStart:true,disabled:false,onStart,onSend:jest.fn(),style:{},children:null})));
 const button=container.querySelector('button')!;
 await act(async()=>button.dispatchEvent(new MouseEvent('click',{detail:1,bubbles:true})));expect(onStart).not.toHaveBeenCalled();
 const space=new KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true});
 await act(async()=>button.dispatchEvent(space));expect(space.defaultPrevented).toBe(true);expect(onStart).toHaveBeenCalledTimes(1);
 await act(async()=>button.dispatchEvent(new KeyboardEvent('keydown',{key:' ',repeat:true,bubbles:true,cancelable:true})));expect(onStart).toHaveBeenCalledTimes(1);
 await act(async()=>button.click());expect(onStart).toHaveBeenCalledTimes(2);
});

test('locking during the original pointer hold cannot turn its release into an accidental send',async()=>{
 const onSend=jest.fn();
 const render=(sendAction:boolean)=>act(async()=>root.render(React.createElement(HelpComposerVoiceAction,{panHandlers:{},label:sendAction?'Отправить':'Записать',sendAction,canStart:!sendAction,disabled:false,onStart:jest.fn(),onSend,style:{},children:null})));
 await render(false);const button=container.querySelector('button')!;
 await act(async()=>button.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true})));
 await render(true);
 await act(async()=>button.dispatchEvent(new MouseEvent('click',{detail:1,bubbles:true})));
 expect(onSend).not.toHaveBeenCalled();
 await act(async()=>button.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true})));
 await act(async()=>button.dispatchEvent(new MouseEvent('click',{detail:1,bubbles:true})));
 expect(onSend).toHaveBeenCalledTimes(1);
});
