import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
jest.mock('react-native',()=>({Platform:{OS:'android'}}));
jest.mock('expo-modules-core',()=>({requireOptionalNativeModule:()=>({apiVersion:1}),requireNativeViewManager:()=> 'NativeHelpInput'}));
jest.mock('../src/features/help/helpDiagnostics',()=>({helpDevProbe:()=>()=>{},helpDevActions:()=>()=>{},helpDevRef:jest.fn()}));
import {HelpNativeInput} from '../src/features/help/components/HelpNativeInput';
import {isDetachedHelpInputFocusError,scheduleHelpInputFocus} from '../src/features/help/helpInputFocus';
const props={value:'',onChange:jest.fn(),onGeometry:jest.fn(),placeholder:'Сообщение…',color:'#fff',hintColor:'#999',accentColor:'#38f',editable:true,reducedMotion:false};
const stale=new Error("Call to function 'LeaderHelpInputView.focusInput' has been rejected. Unable to find the expo.modules.leaderhelpinput.LeaderHelpInputView view with tag 2442");
test('a pending native focus rejection after unmount is handled, and a captured old handle cannot issue another command',async()=>{
  let reject!:(error:Error)=>void;const focusInput=jest.fn(()=>new Promise<void>((_,fail)=>{reject=fail;}));const ref=React.createRef<any>();let view!:TestRenderer.ReactTestRenderer;
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpNativeInput,{...props,ref}),{createNodeMock:()=>({focusInput})});});
  const handle=ref.current;await act(async()=>handle.focus());expect(focusInput).toHaveBeenCalledTimes(1);
  await act(async()=>{view.unmount();reject(stale);await Promise.resolve();});
  handle.focus();expect(focusInput).toHaveBeenCalledTimes(1);
});
test('focus failures unrelated to a detached view remain visible without logging the native message',async()=>{
  const warn=jest.spyOn(console,'warn').mockImplementation(()=>{}),focusInput=jest.fn(()=>Promise.reject(Object.assign(new Error('private native detail'),{code:'ERR_REAL_FOCUS'}))),ref=React.createRef<any>();let view!:TestRenderer.ReactTestRenderer;
  try{await act(async()=>{view=TestRenderer.create(React.createElement(HelpNativeInput,{...props,ref}),{createNodeMock:()=>({focusInput})});});await act(async()=>{ref.current.focus();await Promise.resolve();});expect(warn).toHaveBeenCalledWith('[help] native input focus failed',{code:'ERR_REAL_FOCUS',name:'Error'});expect(JSON.stringify(warn.mock.calls)).not.toContain('private native detail');}
  finally{await act(async()=>view.unmount());warn.mockRestore();}
});
test('deferred composer focus is cancelled on departure even if a cancelled callback is delivered late',()=>{
  const focus=jest.fn();let callback!:FrameRequestCallback;
  const raf=jest.spyOn(global,'requestAnimationFrame').mockImplementation(fn=>{callback=fn;return 42;}),cancel=jest.spyOn(global,'cancelAnimationFrame').mockImplementation(()=>{});
  try{const dispose=scheduleHelpInputFocus(()=>({focus}));dispose();callback(0);expect(cancel).toHaveBeenCalledWith(42);expect(focus).not.toHaveBeenCalled();}
  finally{raf.mockRestore();cancel.mockRestore();}
});
test('only the known Help view-detachment signature is ignored',()=>{
  expect(isDetachedHelpInputFocusError(stale)).toBe(true);
  expect(isDetachedHelpInputFocusError(new Error('Cannot cast java.lang.Integer to expo.modules.leaderhelpinput.LeaderHelpInputView'))).toBe(true);
  expect(isDetachedHelpInputFocusError(new Error('Native focus permission failure'))).toBe(false);
  expect(isDetachedHelpInputFocusError(new Error('Unable to find the OtherView view with tag 2442'))).toBe(false);
});
