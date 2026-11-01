import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import type {SharedValue} from 'react-native-reanimated';
let mockReduced=false;
const mockAnimations:{target:number;done?:(finished:boolean)=>void}[]=[];
jest.mock('../src/features/help/helpTheme',()=>({useHelpReducedMotion:()=>mockReduced}));
jest.mock('react-native-reanimated',()=>({
  __esModule:true,default:{View:require('react-native').View},cancelAnimation:jest.fn(),runOnJS:(fn:any)=>fn,
  useSharedValue:(value:number)=>require('react').useRef({value}).current,
  useAnimatedStyle:(fn:()=>any)=>Object.defineProperties({},Object.fromEntries(Object.keys(fn()).map(key=>[key,{enumerable:true,get:()=>fn()[key]}]))),
  withTiming:(target:number,_config:any,done?:any)=>{mockAnimations.push({target,done});return 0;},Easing:{out:(fn:any)=>fn,cubic:(x:number)=>x},
}));
import {HelpChatEntry,type HelpChatEntryHandle} from '../src/features/help/components/HelpChatEntry';

describe('Help bidirectional scene motion',()=>{
  let tree:TestRenderer.ReactTestRenderer;
  let ref:React.RefObject<HelpChatEntryHandle|null>;
  const entered=jest.fn();
  beforeEach(()=>{mockReduced=false;mockAnimations.length=0;entered.mockClear();ref=React.createRef();});
  afterEach(async()=>{if(tree)await act(async()=>tree.unmount());});
  async function render(ready=true,progress={value:1} as SharedValue<number>){await act(async()=>{tree=TestRenderer.create(React.createElement(HelpChatEntry,{ref,ready,progress,onLayout:jest.fn(),onEntered:entered,backgroundColor:'#fff',children:null}));});return progress;}
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
