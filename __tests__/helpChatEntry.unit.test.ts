import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import type {SharedValue} from 'react-native-reanimated';
let mockReduced=false;
let mockCachedStyles=false;
const mockAnimations:{target:number;done?:(finished:boolean)=>void}[]=[];
jest.mock('../src/features/help/helpTheme',()=>({useHelpReducedMotion:()=>mockReduced}));
jest.mock('react-native-reanimated',()=>({
  __esModule:true,default:{View:require('react-native').View},cancelAnimation:jest.fn(),runOnJS:(fn:any)=>fn,
  useSharedValue:(value:number)=>require('react').useRef({value}).current,
  useAnimatedStyle:(fn:()=>any)=>{const initial=require('react').useRef(fn()).current;return mockCachedStyles?initial:Object.defineProperties({},Object.fromEntries(Object.keys(fn()).map(key=>[key,{enumerable:true,get:()=>fn()[key]}])));},
  withTiming:(target:number,_config:any,done?:any)=>{mockAnimations.push({target,done});return 0;},Easing:{out:(fn:any)=>fn,cubic:(x:number)=>x},
}));
import {HelpChatEntry,type HelpChatEntryHandle} from '../src/features/help/components/HelpChatEntry';
import {Animated,StyleSheet,View} from 'react-native';
import {HelpMessageArrival,HelpMessageArrivalContext} from '../src/features/help/components/HelpMessageArrival';

describe('message arrivals',()=>{
  let tree:TestRenderer.ReactTestRenderer;
  let timing:jest.SpyInstance;
  const registry=new Set<string>();
  beforeEach(()=>{mockReduced=false;registry.clear();timing=jest.spyOn(Animated,'timing').mockReturnValue({start:jest.fn(),stop:jest.fn(),reset:jest.fn()});});
  afterEach(async()=>{if(tree)await act(async()=>tree.unmount());timing.mockRestore();});
  function content(identity:string,animate:boolean){return React.createElement(HelpMessageArrivalContext.Provider,{value:registry},React.createElement(HelpMessageArrival,{identity,animate,children:React.createElement(View)}));}
  test('new message rises once on the native driver and text changes do not restart it',async()=>{
    await act(async()=>{tree=TestRenderer.create(content('client:send-1',true));});
    expect(timing).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({toValue:1,duration:220,useNativeDriver:true,isInteraction:false}));
    await act(async()=>tree.update(content('client:send-1',false)));expect(timing).toHaveBeenCalledTimes(1);
  });
  test('server acknowledgement uses the outbox identity without a second arrival',async()=>{
    await act(async()=>{tree=TestRenderer.create(content('client:send-2',true));});
    const progress=timing.mock.calls[0][0] as Animated.Value;
    await act(async()=>progress.setValue(.5));
    await act(async()=>tree.unmount());
    await act(async()=>{tree=TestRenderer.create(content('client:send-2',true));});
    expect(timing).toHaveBeenCalledTimes(2);
    expect(timing.mock.calls[1]).toEqual([progress,expect.objectContaining({toValue:1,duration:110})]);
    expect(tree.root.findByProps({testID:'help-message-arrival'}).props.style.transform[0].translateY.__getValue()).toBe(12);
  });
  test('history and reduced-motion messages appear immediately',async()=>{
    await act(async()=>{tree=TestRenderer.create(content('message:old',false));});
    expect(timing).not.toHaveBeenCalled();
    mockReduced=true;await act(async()=>tree.update(content('client:new',true)));
    expect(timing).not.toHaveBeenCalled();
  });
  test('measurement deferral does not consume the first arrival',async()=>{
    const render=(deferred:boolean)=>React.createElement(HelpMessageArrivalContext.Provider,{value:registry},React.createElement(HelpMessageArrival,{identity:'client:measured',animate:true,deferred,children:React.createElement(View)}));
    await act(async()=>{tree=TestRenderer.create(render(true));});
    expect(timing).not.toHaveBeenCalled();expect(registry.has('client:measured')).toBe(false);
    await act(async()=>tree.update(render(false)));
    expect(timing).toHaveBeenCalledTimes(1);expect(registry.has('client:measured')).toBe(true);
  });
});

describe('Help bidirectional scene motion',()=>{
  let tree:TestRenderer.ReactTestRenderer;
  let ref:React.RefObject<HelpChatEntryHandle|null>;
  const entered=jest.fn();
  beforeEach(()=>{mockReduced=false;mockCachedStyles=false;mockAnimations.length=0;entered.mockClear();ref=React.createRef();});
  afterEach(async()=>{if(tree)await act(async()=>tree.unmount());});
  const layout=async(width=390)=>act(async()=>tree.root.findByProps({testID:'help-chat-viewport'}).props.onLayout({nativeEvent:{layout:{x:0,y:0,width,height:800}}}));
  async function render(ready=true,progress={value:1} as SharedValue<number>,measured=true){await act(async()=>{tree=TestRenderer.create(React.createElement(HelpChatEntry,{ref,ready,progress,onLayout:jest.fn(),onEntered:entered,backgroundColor:'#fff',children:null}));});if(measured)await layout();return progress;}
  test('a ready cached screen stays hidden until its actual native width is measured',async()=>{
    await render(true,undefined,false);
    const viewport=()=>tree.root.findByProps({testID:'help-chat-viewport'});
    expect(viewport().props.style[1].opacity).toBe(0);expect(mockAnimations).toHaveLength(0);
    await layout(390);
    expect(viewport().props.style[1].transform).toEqual([{translateX:390}]);expect(mockAnimations.map(x=>x.target)).toEqual([1]);
  });
  test('prepares unmeasured history inside the viewport while hidden',async()=>{
    await render(false);
    const style=tree.root.findByProps({testID:'help-chat-viewport'}).props.style[1];
    expect(style.opacity).toBe(0);expect(style.transform).toEqual([{translateX:0}]);
    expect(mockAnimations).toHaveLength(0);
  });
  test('cached chats still enter once and notify readiness only after UI completion',async()=>{
    const progress=await render();expect(progress.value).toBe(0);expect(mockAnimations.map(x=>x.target)).toEqual([1]);expect(entered).not.toHaveBeenCalled();
    await act(async()=>{mockAnimations[0].done?.(true);mockAnimations[0].done?.(true);});expect(entered).toHaveBeenCalledTimes(1);
  });
  test('two Back presses share one exit, block input and await the actual final frame',async()=>{
    await render();await act(async()=>mockAnimations[0].done?.(true));
    let first!:Promise<boolean>,second!:Promise<boolean>,finished=false;
    await act(async()=>{first=ref.current!.dismiss();second=ref.current!.dismiss();void first.then(()=>{finished=true;});});
    expect(first).toBe(second);expect(finished).toBe(false);expect(mockAnimations.map(x=>x.target)).toEqual([1,0]);
    expect(tree.root.findByProps({testID:'help-chat-viewport'}).props.pointerEvents).toBe('none');
    await act(async()=>{mockAnimations[1].done?.(true);await first;});expect(finished).toBe(true);
  });
  test('Back during data loading completes without animating an invisible screen',async()=>{
    await render(false);expect(mockAnimations).toHaveLength(0);
    await act(async()=>{await expect(ref.current!.dismiss()).resolves.toBe(true);});expect(mockAnimations).toHaveLength(0);
  });
  test('unmounting cancels a pending exit rather than resolving it as successful navigation',async()=>{
    await render();let pending!:Promise<boolean>;await act(async()=>{pending=ref.current!.dismiss();});
    await act(async()=>tree.unmount());await expect(pending).resolves.toBe(false);
  });
  test('reduced motion keeps both directions immediate',async()=>{
    mockReduced=true;const progress=await render();expect(progress.value).toBe(1);expect(entered).toHaveBeenCalledTimes(1);
    await act(async()=>{await expect(ref.current!.dismiss()).resolves.toBe(true);});expect(progress.value).toBe(0);expect(mockAnimations).toHaveLength(0);
  });
});

// Fabric can reuse the initial transform while committing keyboard/portal updates.
test('completed chat stays in the viewport after a keyboard/attachment rerender with cached animated props',async()=>{
  mockCachedStyles=true;mockReduced=false;mockAnimations.length=0;
  const progress={value:0} as SharedValue<number>,onEntered=jest.fn();let tree!:TestRenderer.ReactTestRenderer;
  const render=(children:React.ReactNode)=>React.createElement(HelpChatEntry,{ready:true,progress,onEntered,backgroundColor:'#fff',children});
  await act(async()=>{tree=TestRenderer.create(render(null));});
  await act(async()=>tree.root.findByProps({testID:'help-chat-viewport'}).props.onLayout({nativeEvent:{layout:{width:360,height:800}}}));
  await act(async()=>{progress.value=1;mockAnimations[0].done?.(true);});
  await act(async()=>tree.update(render(React.createElement(View,{testID:'attachment-open'}))));
  const style=StyleSheet.flatten(tree.root.findByProps({testID:'help-chat-viewport'}).props.style);
  expect(style.opacity).toBe(1);expect(style.transform).toEqual([{translateX:0}]);expect(onEntered).toHaveBeenCalledTimes(1);
  await act(async()=>tree.unmount());mockCachedStyles=false;
});
