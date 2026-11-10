import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {Platform} from 'react-native';
import {bindHelpMarginWheel,helpWebWheelPixels,useHelpWebMarginWheel} from '../src/features/help/useHelpWebMarginWheel';

test('wheel units preserve pixel/line/page intent and reject invalid deltas',()=>{
 expect(helpWebWheelPixels(-120,0,600)).toBe(-120);
 expect(helpWebWheelPixels(3,1,600)).toBe(48);
 expect(helpWebWheelPixels(-1,2,600)).toBe(-600);
 expect(helpWebWheelPixels(NaN,0,600)).toBe(0);
 expect(helpWebWheelPixels(5,7,600)).toBe(0);
});
test('only empty pane wheel events are forwarded; nested scrollers and browser zoom retain native behavior',()=>{
 let listener!:(event:any)=>void;
 const node:any={addEventListener:jest.fn((_name,fn)=>{listener=fn;}),removeEventListener:jest.fn()},forward=jest.fn(()=>true);
 const cleanup=bindHelpMarginWheel(node,forward);
 expect(node.addEventListener).toHaveBeenCalledWith('wheel',expect.any(Function),{passive:false});
 const event=(extra:any={})=>({target:node,deltaY:100,deltaX:0,deltaMode:0,ctrlKey:false,defaultPrevented:false,preventDefault:jest.fn(),...extra});
 const blank=event();listener(blank);expect(forward).toHaveBeenCalledWith(100,0);expect(blank.preventDefault).toHaveBeenCalledTimes(1);
 for(const extra of [{target:{}},{ctrlKey:true},{defaultPrevented:true},{deltaX:150},{deltaY:0},{deltaY:NaN}]){
  const own=event(extra);listener(own);expect(own.preventDefault).not.toHaveBeenCalled();
 }
 expect(forward).toHaveBeenCalledTimes(1);
 forward.mockReturnValue(false);const inactive=event();listener(inactive);expect(inactive.preventDefault).not.toHaveBeenCalled();
 cleanup();expect(node.removeEventListener).toHaveBeenCalledWith('wheel',listener);
});
test('hook detaches while overlays obscure the chat and forwards to the current timeline after navigation',async()=>{
 const previous=Platform.OS;Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});
 let listener!:(event:any)=>void,view!:Renderer.ReactTestRenderer;
 const pane:any={current:{addEventListener:jest.fn((_name,fn)=>{listener=fn;}),removeEventListener:jest.fn()}},first=jest.fn(()=>true),next=jest.fn(()=>true),timeline:any={current:{scrollByWheel:first}};
 function Harness({enabled}:{enabled:boolean}){useHelpWebMarginWheel(pane,timeline,enabled);return null;}
 try{
  await act(async()=>{view=Renderer.create(React.createElement(Harness,{enabled:true}));});
  timeline.current={scrollByWheel:next};listener({target:pane.current,deltaY:-40,deltaX:0,deltaMode:0,preventDefault:jest.fn()});
  expect(first).not.toHaveBeenCalled();expect(next).toHaveBeenCalledWith(-40,0);
  await act(async()=>view.update(React.createElement(Harness,{enabled:false})));
  expect(pane.current.removeEventListener).toHaveBeenCalledWith('wheel',listener);
 }finally{if(view)await act(async()=>view.unmount());Object.defineProperty(Platform,'OS',{configurable:true,value:previous});}
});
