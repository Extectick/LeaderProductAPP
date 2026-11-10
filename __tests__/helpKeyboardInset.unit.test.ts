import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
let mockKeyboardVisible=false;
const mockDismiss=jest.fn();
const mockListeners = new Map<string, (event?: any) => void>();
jest.mock('react-native', () => ({Platform:{OS:'android'}, Keyboard:{isVisible:()=>mockKeyboardVisible,dismiss:()=>mockDismiss(),metrics:()=>undefined,addListener:(name:string,callback:any)=>{mockListeners.set(name,callback);return {remove:()=>mockListeners.delete(name)};}}}));
import {helpKeyboardOverlap, useHelpKeyboardInset} from '../src/features/help/useHelpKeyboardInset';
import {Platform} from 'react-native';

test('web viewport moves the dock for a keyboard, ignores pinch zoom and removes listeners', async () => {
  const oldWindow=global.window, oldPlatform=Platform.OS;
  const listeners=new Map<string,()=>void>();
  const viewport={height:500,offsetTop:0,scale:1,addEventListener:(event:string,callback:()=>void)=>listeners.set(event,callback),removeEventListener:(event:string)=>listeners.delete(event)};
  const remove=jest.fn();
  (global as any).window={innerHeight:800,visualViewport:viewport,addEventListener:jest.fn(),removeEventListener:remove};
  Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});
  const parent:any={current:{measureInWindow:(callback:any)=>callback(0,0,390,800)}};
  const changed=jest.fn();
  function Harness(){useHelpKeyboardInset(parent,true,changed);return null;}
  let tree!:TestRenderer.ReactTestRenderer;
  try {
    await act(async()=>{tree=TestRenderer.create(React.createElement(Harness));});
    expect(changed).toHaveBeenLastCalledWith(300);
    viewport.offsetTop=20;listeners.get('scroll')!();expect(changed).toHaveBeenLastCalledWith(280);
    viewport.scale=2;listeners.get('resize')!();expect(changed).toHaveBeenLastCalledWith(0);
    viewport.scale=1;viewport.height=800;viewport.offsetTop=0;listeners.get('resize')!();expect(changed).toHaveBeenLastCalledWith(0);
    await act(async()=>tree.unmount());
    expect(listeners.size).toBe(0);expect(remove).toHaveBeenCalledWith('resize',expect.any(Function));
  } finally { (global as any).window=oldWindow;Object.defineProperty(Platform,'OS',{configurable:true,value:oldPlatform}); }
});

test('keyboard overlap supports overlay, resized and hidden windows', () => {
  expect(helpKeyboardOverlap(800,500)).toBe(300);
  expect(helpKeyboardOverlap(500,500)).toBe(0);
  expect(helpKeyboardOverlap(480,500)).toBe(0);
  expect(helpKeyboardOverlap(800,null)).toBe(0);
});

test('keyboard fallback remeasures the parent and rejects late layout callbacks after hiding', async () => {
  let bottom=800, delayed=false;
  const callbacks:(()=>void)[]=[];
  const parent:any={current:{measureInWindow:(callback:any)=>{const done=()=>callback(0,20,400,bottom-20);if(delayed)callbacks.push(done);else done();}}};
  const changed=jest.fn();let measure!:()=>void;
  function Harness(){measure=useHelpKeyboardInset(parent,true,changed);return null;}
  let tree!:TestRenderer.ReactTestRenderer;
  await act(async()=>{tree=TestRenderer.create(React.createElement(Harness));});
  try {
    await act(async()=>mockListeners.get('keyboardDidShow')!({endCoordinates:{height:300,screenY:500}}));
    expect(changed).toHaveBeenLastCalledWith(300);
    bottom=500;measure();expect(changed).toHaveBeenLastCalledWith(0);
    bottom=800;delayed=true;measure();mockListeners.get('keyboardDidHide')!();callbacks.pop()!();
    expect(changed).toHaveBeenLastCalledWith(0);
  }finally{await act(async()=>tree.unmount());}
  expect(mockListeners.size).toBe(0);
});

import {settleHelpKeyboard} from '../src/features/help/helpKeyboardTransition';
test('first bubble waits for keyboard hide and final layout frames',async()=>{
  jest.useFakeTimers();mockKeyboardVisible=true;
  const closed=jest.fn(),done=jest.fn();
  const originalRaf=global.requestAnimationFrame;
  global.requestAnimationFrame=(callback:any)=>setTimeout(callback,16) as any;
  try{
    const settled=settleHelpKeyboard(true,closed).then(done);
    expect(mockDismiss).toHaveBeenCalled();expect(done).not.toHaveBeenCalled();
    mockKeyboardVisible=false;mockListeners.get('keyboardDidHide')!();
    expect(closed).toHaveBeenCalledTimes(1);expect(done).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(32);await settled;
    expect(done).toHaveBeenCalledTimes(1);expect(mockListeners.size).toBe(0);
  }finally{mockKeyboardVisible=false;global.requestAnimationFrame=originalRaf;jest.useRealTimers();}
});
test('closed keyboard does not delay sending',async()=>{
  mockKeyboardVisible=false;const closed=jest.fn();
  await settleHelpKeyboard(false,closed);expect(closed).not.toHaveBeenCalled();
});
test('missing hide event has a bounded fallback without resetting a visible IME',async()=>{
  jest.useFakeTimers();mockKeyboardVisible=true;
  const closed=jest.fn(),originalRaf=global.requestAnimationFrame;
  global.requestAnimationFrame=(callback:any)=>setTimeout(callback,16) as any;
  try{
    const settled=settleHelpKeyboard(true,closed);
    await jest.advanceTimersByTimeAsync(532);await settled;
    expect(closed).not.toHaveBeenCalled();expect(mockListeners.size).toBe(0);
  }finally{mockKeyboardVisible=false;global.requestAnimationFrame=originalRaf;jest.useRealTimers();}
});
