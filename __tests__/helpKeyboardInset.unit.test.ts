import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
const mockListeners = new Map<string, (event?: any) => void>();
jest.mock('react-native', () => ({Platform:{OS:'android'}, Keyboard:{isVisible:()=>false,metrics:()=>undefined,addListener:(name:string,callback:any)=>{mockListeners.set(name,callback);return {remove:()=>mockListeners.delete(name)};}}}));
import {helpKeyboardOverlap, useHelpKeyboardInset} from '../src/features/help/useHelpKeyboardInset';

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
