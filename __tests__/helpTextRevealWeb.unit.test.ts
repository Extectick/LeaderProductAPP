/** @jest-environment jsdom */
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
var mockMotionListeners:Set<(event:{matches:boolean})=>void>;
var mockMedia:{matches:boolean;media:string;addEventListener:Function;removeEventListener:Function};
jest.mock('react-native',()=>{
 mockMotionListeners=new Set();
 mockMedia={matches:false,media:'(prefers-reduced-motion: reduce)',addEventListener:(_type:string,listener:(event:{matches:boolean})=>void)=>mockMotionListeners.add(listener),removeEventListener:(_type:string,listener:(event:{matches:boolean})=>void)=>mockMotionListeners.delete(listener)};
 Object.defineProperty(globalThis.window,'matchMedia',{configurable:true,value:()=>mockMedia});
 return jest.requireActual('react-native-web');
});
jest.mock('../components/ui/appSurfaceTokens',()=>({appSurfaceTokens:{},useAppSurfaceTheme:()=>({})}));
import {AccessibilityInfo} from 'react-native';
import {useHelpTextReveal} from '../src/features/help/useHelpTextReveal';
let root:Root,container:HTMLDivElement;
function Answer({text,completed=false}:{text:string;completed?:boolean}){
 const visible=useHelpTextReveal({identity:'web-answer',text,active:!completed,completed});
 return React.createElement('p',null,visible);
}
const render=(text:string,completed=false)=>act(async()=>root.render(React.createElement(Answer,{text,completed})));
beforeEach(()=>{
 jest.useFakeTimers({doNotFake:['queueMicrotask']});jest.setSystemTime(0);
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
 mockMedia.matches=false;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.useRealTimers();});
test('actual RN-web constant-true stub does not bypass the visible word stream',async()=>{
 // Deliberately use the installed library rather than the old false mock.
 expect(await AccessibilityInfo.isScreenReaderEnabled()).toBe(true);
 await render('');await render('Плавный ответ');expect(container.textContent).toBe('');
 await act(async()=>jest.advanceTimersByTime(20));expect(container.textContent).toBe('Плавный ');
 await act(async()=>jest.advanceTimersByTime(60));expect(container.textContent).toBe('Плавный ответ');
 await render('Плавный ответ',true);
 expect(container.textContent).toBe('Плавный ответ');expect(jest.getTimerCount()).toBe(0);
});
test('actual web reduced-motion media query and hidden tab still stop typing',async()=>{
 await render('');await render('Текст для чтения');
 await act(async()=>{mockMedia.matches=true;mockMotionListeners.forEach(listener=>listener({matches:true}));});
 expect(container.textContent).toBe('Текст для чтения');expect(jest.getTimerCount()).toBe(0);
 await act(async()=>{mockMedia.matches=false;mockMotionListeners.forEach(listener=>listener({matches:false}));});
 await render('Текст для чтения и дополнение');
 await act(async()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
 expect(container.textContent).toBe('Текст для чтения и дополнение');expect(jest.getTimerCount()).toBe(0);
});

test('long streamed answer keeps the same DOM node and final text without clearing or replay',async()=>{
 const final='Проверенный фрагмент ответа. '.repeat(220);
 await render('');const node=container.querySelector('p');let previous='';
 for(let end=200;end<final.length+200;end+=200){
  const chunk=final.slice(0,end);await render(chunk);
  expect(container.textContent!.startsWith(previous)).toBe(true);
  await act(async()=>jest.advanceTimersByTime(80));
  expect(container.textContent).toBe(chunk);previous=chunk;
  expect(container.querySelector('p')).toBe(node);
 }
 await render(final,true);
 expect(container.querySelector('p')).toBe(node);expect(container.textContent).toBe(final);expect(jest.getTimerCount()).toBe(0);
});
