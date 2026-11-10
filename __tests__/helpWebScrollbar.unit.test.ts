import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {helpScrollbarMetrics,helpScrollbarKey,helpScrollbarSeek} from '../src/features/help/helpWebScrollbar';
jest.mock('../src/features/help/helpTheme',()=>({useHelpTheme:()=>({muted:'#64748B'})}));
import {HelpWebScrollbar} from '../src/features/help/components/HelpWebScrollbar.web';

test('thumb geometry follows viewport/content proportions and maps the complete scroll range',()=>{
 const metrics=helpScrollbarMetrics(300,1500,600,300);
 expect(metrics).toMatchObject({maximum:1200,thumb:60,offset:120,travel:240});
 expect(helpScrollbarSeek(150,30,metrics)).toBe(600);
 expect(helpScrollbarSeek(999,30,metrics)).toBe(1200);
 expect(helpScrollbarSeek(-20,30,metrics)).toBe(0);
 expect(helpScrollbarMetrics(300,300,50,300)).toMatchObject({maximum:0,thumb:300,offset:0,scroll:0});
 expect(helpScrollbarMetrics(300,30000,0,300).thumb).toBe(28);
 expect(helpScrollbarKey('End',metrics)).toBe(1200);
 expect(helpScrollbarKey('Home',metrics)).toBe(0);
 expect(helpScrollbarKey('PageDown',metrics)).toBe(870);
 expect(helpScrollbarKey('Tab',metrics)).toBeNull();
});

describe('web scrollbar binds the real scroll node',()=>{
 let view:Renderer.ReactTestRenderer|undefined,frames:FrameRequestCallback[],resize:()=>void,mutate:()=>void;
 let originalResize:any,originalMutation:any;
 const scrollListeners=new Map<string,EventListener>(),barListeners=new Map<string,EventListener>();
 let scrollTop=0;
 const node={clientHeight:300,scrollHeight:1500,firstElementChild:{} as any,
  get scrollTop(){return scrollTop;},set scrollTop(value:number){scrollTop=Math.max(0,Math.min(this.scrollHeight-this.clientHeight,value));},
  addEventListener:jest.fn((event:string,listener:EventListener)=>scrollListeners.set(event,listener)),
  removeEventListener:jest.fn((event:string)=>scrollListeners.delete(event)),
 };
 const bar={clientHeight:300,getBoundingClientRect:()=>({top:120}),focus:jest.fn(),setPointerCapture:jest.fn(),hasPointerCapture:()=>true,releasePointerCapture:jest.fn(),
  addEventListener:jest.fn((event:string,listener:EventListener)=>barListeners.set(event,listener)),removeEventListener:jest.fn((event:string)=>barListeners.delete(event)),
 };
 const thumb={contains:(target:any)=>target==='thumb'};
 const disconnect=jest.fn();
 beforeEach(()=>{
  frames=[];scrollListeners.clear();barListeners.clear();scrollTop=0;node.clientHeight=300;node.scrollHeight=1500;
  jest.spyOn(global,'requestAnimationFrame').mockImplementation(callback=>{frames.push(callback);return frames.length;});
  jest.spyOn(global,'cancelAnimationFrame').mockImplementation(()=>{});
  originalResize=(global as any).ResizeObserver;originalMutation=(global as any).MutationObserver;
  (global as any).ResizeObserver=class{constructor(callback:()=>void){resize=callback;}observe=jest.fn();disconnect=disconnect;};
  (global as any).MutationObserver=class{constructor(callback:()=>void){mutate=callback;}observe=jest.fn();disconnect=disconnect;};
 });
 afterEach(async()=>{if(view)await act(async()=>view!.unmount());view=undefined;(global as any).ResizeObserver=originalResize;(global as any).MutationObserver=originalMutation;jest.restoreAllMocks();});
 async function render(){await act(async()=>{view=Renderer.create(React.createElement(HelpWebScrollbar,{scrollRef:{current:{getScrollableNode:()=>node}},scrollId:'real-list',top:120,bottom:64,active:true}),{createNodeMock:element=>element.props['data-testid']==='help-ticket-scrollbar'?bar:element.props['data-testid']==='help-ticket-scrollbar-thumb'?thumb:null});});}
 async function flush(){await act(async()=>{const callbacks=frames.splice(0);callbacks.forEach(callback=>callback(0));});}
 const track=()=>view!.root.findByProps({'data-testid':'help-ticket-scrollbar'});
 const thumbNode=()=>view!.root.findByProps({'data-testid':'help-ticket-scrollbar-thumb'});
 const event=(extra:any={})=>({preventDefault:jest.fn(),stopPropagation:jest.fn(),currentTarget:bar,...extra});

 test('native scrolling, resize and content changes update one coalesced thumb above the blur',async()=>{
  await render();expect(track().props.style).toMatchObject({top:120,bottom:64,zIndex:3,visibility:'visible'});
  expect(track().props['aria-controls']).toBe('real-list');expect(thumbNode().props.style.height).toBe(60);
  node.scrollTop=600;scrollListeners.get('scroll')!({} as any);resize();mutate();
  expect(frames).toHaveLength(1);await flush();
  expect(thumbNode().props.style.top).toBe(120);expect(track().props['aria-valuenow']).toBe(600);
  node.scrollHeight=300;resize();await flush();
  expect(track().props.style.visibility).toBe('hidden');expect(track().props.tabIndex).toBe(-1);
 });

 test('keyboard, track click, thumb drag and wheel change the real list and clean up listeners',async()=>{
  await render();
  await act(async()=>{track().props.onKeyDown(event({key:'PageDown'}));track().props.onKeyDown(event({key:'ArrowDown'}));});
  expect(node.scrollTop).toBe(310);await flush();
  await act(async()=>track().props.onKeyDown(event({key:'End'})));expect(node.scrollTop).toBe(1200);await flush();
  await act(async()=>track().props.onPointerDown(event({button:0,pointerId:4,clientY:270,target:'track'})));
  expect(node.scrollTop).toBe(600);expect(bar.setPointerCapture).toHaveBeenCalledWith(4);await flush();
  await act(async()=>track().props.onPointerUp(event({pointerId:4})));
  await act(async()=>track().props.onPointerDown(event({button:0,pointerId:5,clientY:250,target:'thumb'})));
  await act(async()=>track().props.onPointerMove(event({pointerId:5,clientY:310})));
  expect(node.scrollTop).toBe(900);await flush();
  const wheel=event({deltaY:2,deltaMode:1});barListeners.get('wheel')!(wheel);
  expect(node.scrollTop).toBe(932);expect(wheel.preventDefault).toHaveBeenCalled();await flush();
  await act(async()=>view!.unmount());view=undefined;
  expect(scrollListeners.has('scroll')).toBe(false);expect(barListeners.has('wheel')).toBe(false);expect(disconnect).toHaveBeenCalled();
 });

 test('floating panels shorten page steps without shortening the underlying scroll range',async()=>{
  // 200 px of the actual viewport are behind the header/dock. The visible
  // track is still 300 px and must seek all the way to the real list end.
  node.clientHeight=500;await render();
  expect(track().props['aria-valuemax']).toBe(1000);
  expect(thumbNode().props.style.height).toBeCloseTo(300*300/1300);
  await act(async()=>track().props.onKeyDown(event({key:'PageDown'})));
  expect(node.scrollTop).toBe(270);await flush();
  barListeners.get('wheel')!(event({deltaY:1,deltaMode:2}));
  expect(node.scrollTop).toBe(570);await flush();
  await act(async()=>track().props.onKeyDown(event({key:'End'})));await flush();
  expect(node.scrollTop).toBe(1000);
  expect(thumbNode().props.style.top+thumbNode().props.style.height).toBeCloseTo(300);
  await act(async()=>track().props.onKeyDown(event({key:'Home'})));await flush();
  expect(node.scrollTop).toBe(0);expect(thumbNode().props.style.top).toBe(0);
 });
});
