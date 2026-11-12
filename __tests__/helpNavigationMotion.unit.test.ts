import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Animated, StyleSheet } from 'react-native';
let mockReduced = false;
const mockSceneJobs:{target:number;duration:number;done?:(finished:boolean)=>void}[]=[];
jest.mock('react-native-reanimated',()=>({
  __esModule:true,default:{View:require('react-native').View},cancelAnimation:jest.fn(),runOnJS:(fn:any)=>fn,
  useSharedValue:(value:number)=>require('react').useRef({value}).current,
  useAnimatedStyle:(fn:()=>any)=>Object.defineProperties({},Object.fromEntries(Object.keys(fn()).map(key=>[key,{enumerable:true,get:()=>fn()[key]}]))),
  withTiming:(target:number,_config:any,done?:any)=>{mockSceneJobs.push({target,duration:_config.duration,done});return 0;},Easing:{out:(fn:any)=>fn,cubic:(x:number)=>x},
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('../src/features/help/helpTheme', () => ({ useHelpReducedMotion: () => mockReduced, useHelpTheme: () => ({surface:'#222',muted:'#999',line:'#333',accent:'#38f',accentText:'#68b',background:'#151b22'}) }));
import { HelpJumpToLatest } from '../src/features/help/components/HelpTimelineIndicators';
import { HelpChatEntry, type HelpChatEntryHandle } from '../src/features/help/components/HelpChatEntry';

const jobs: { config: any; callback?: (result: {finished:boolean}) => void }[] = [];
beforeEach(() => {
  mockReduced = false; jobs.length = 0; mockSceneJobs.length=0;
  jest.spyOn(Animated, 'timing').mockImplementation((_value, config) => ({ start: callback => jobs.push({config,callback}), stop: jest.fn(), reset: jest.fn() }));
});
afterEach(() => jest.restoreAllMocks());
test('arrow animates in and out and stops accepting taps as soon as it hides', async () => {
  let view!: TestRenderer.ReactTestRenderer;
  const props = {visible:false,onPress:jest.fn()};
  await act(async () => {view=TestRenderer.create(React.createElement(HelpJumpToLatest,props));});
  expect(view.root.findAllByProps({testID:'help-jump-to-latest'})).toHaveLength(0);
  await act(async () => view.update(React.createElement(HelpJumpToLatest,{...props,visible:true})));
  expect(jobs.at(-1)!.config).toMatchObject({toValue:1,duration:180,useNativeDriver:true});
  await act(async () => view.update(React.createElement(HelpJumpToLatest,props)));
  expect(view.root.findAllByProps({testID:'help-jump-to-latest-motion'})[0].props.pointerEvents).toBe('none');
  expect(view.root.findAllByProps({testID:'help-jump-to-latest'})[0].props.disabled).toBe(true);
  await act(async () => jobs.at(-1)!.callback?.({finished:true}));
  expect(view.root.findAllByProps({testID:'help-jump-to-latest'})).toHaveLength(0);
  await act(async () => view.unmount());
});
test('chat entry waits for a ready viewport and completes on the shared scene clock', async () => {
  let view!: TestRenderer.ReactTestRenderer;
  const ref=React.createRef<HelpChatEntryHandle>(),child=jest.fn(()=>null);
  const onEntered=jest.fn(),props={ref,ready:false,onEntered,onLayout:jest.fn(),backgroundColor:'#151b22',children:React.createElement(child)};
  await act(async () => {view=TestRenderer.create(React.createElement(HelpChatEntry,props));});
  await act(async()=>view.root.findAllByProps({testID:'help-chat-viewport'})[0].props.onLayout({nativeEvent:{layout:{width:390,height:800}}}));
  expect(StyleSheet.flatten(view.root.findAllByProps({testID:'help-chat-viewport'})[0].props.style).opacity).toBe(0);
  expect(onEntered).not.toHaveBeenCalled();
  await act(async () => ref.current!.reveal());
  expect(child).toHaveBeenCalledTimes(1);
  expect(mockSceneJobs.at(-1)!.target).toBe(1);
  expect(onEntered).not.toHaveBeenCalled();
  await act(async () => mockSceneJobs.at(-1)!.done?.(true));
  expect(onEntered).toHaveBeenCalledTimes(1);
  await act(async () => view.unmount());
});
test('unmounted entry ignores a late native animation completion',async()=>{
  let view!:TestRenderer.ReactTestRenderer;const ref=React.createRef<HelpChatEntryHandle>(),onEntered=jest.fn();
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpChatEntry,{ref,ready:false,onEntered,onLayout:jest.fn(),backgroundColor:'#151b22',children:null}));});
  await act(async()=>view.root.findAllByProps({testID:'help-chat-viewport'})[0].props.onLayout({nativeEvent:{layout:{width:390,height:800}}}));
  await act(async()=>ref.current!.reveal());const callback=mockSceneJobs.at(-1)!.done;
  await act(async()=>view.unmount());await act(async()=>callback?.(true));
  expect(onEntered).not.toHaveBeenCalled();
});

test('a known measured scene width starts entry without waiting for another native layout event',async()=>{
  let view!:TestRenderer.ReactTestRenderer;const onEntered=jest.fn();
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpChatEntry,{ready:true,initialWidth:390,onEntered,backgroundColor:'#151b22',children:null}));});
  try{
    expect(mockSceneJobs).toHaveLength(1);expect(mockSceneJobs[0]).toMatchObject({target:1,duration:240});
    expect(StyleSheet.flatten(view.root.findAllByProps({testID:'help-chat-viewport'})[0].props.style).opacity).toBe(1);
    expect(onEntered).not.toHaveBeenCalled();
  }finally{await act(async()=>view.unmount());}
});

test('exit starts after removing the settled transform and resolves once on its own completion',async()=>{
  let view!:TestRenderer.ReactTestRenderer;const ref=React.createRef<HelpChatEntryHandle>();
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpChatEntry,{ref,ready:true,initialWidth:390,backgroundColor:'#151b22',children:null}));});
  await act(async()=>mockSceneJobs.at(-1)!.done?.(true));
  const finished=jest.fn();let first!:Promise<boolean>,second!:Promise<boolean>;
  await act(async()=>{
    first=ref.current!.dismiss();second=ref.current!.dismiss();void first.then(finished);
    // A running native transform must not race the still-committed static one.
    expect(mockSceneJobs.filter(job=>job.duration===220)).toHaveLength(0);
  });
  expect(first).toBe(second);expect(finished).not.toHaveBeenCalled();
  expect(view.root.findAllByProps({testID:'help-chat-viewport'})[0].props.pointerEvents).toBe('none');
  expect(mockSceneJobs.at(-1)).toMatchObject({target:0,duration:220});
  await act(async()=>mockSceneJobs.at(-1)!.done?.(true));
  expect(finished).toHaveBeenCalledTimes(1);expect(finished).toHaveBeenCalledWith(true);
  await act(async()=>view.unmount());
});

test('a directly routed chat skips a second entry slide but keeps the animated return',async()=>{
  let view!:TestRenderer.ReactTestRenderer;const ref=React.createRef<HelpChatEntryHandle>(),onEntered=jest.fn();
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpChatEntry,{ref,ready:true,animateEntry:false,initialWidth:390,onEntered,backgroundColor:'#151b22',children:null}));});
  expect(onEntered).toHaveBeenCalledTimes(1);expect(mockSceneJobs).toHaveLength(0);
  await act(async()=>{void ref.current!.dismiss();});
  expect(mockSceneJobs.at(-1)).toMatchObject({target:0,duration:220});
  await act(async()=>mockSceneJobs.at(-1)!.done?.(true));await act(async()=>view.unmount());
});
