import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {StyleSheet} from 'react-native';

let mockReduced=false,mockHold=false;
const mockValues:{value:number}[]=[];
jest.mock('../src/features/help/helpTheme',()=>({useHelpReducedMotion:()=>mockReduced}));
jest.mock('react-native-reanimated',()=>({
  __esModule:true,default:{View:require('react-native').View},cancelAnimation:jest.fn(),
  Easing:{cubic:'cubic',out:(curve:any)=>`out:${curve}`},
  useSharedValue:(value:number)=>{const shared=require('react').useRef({value}).current;if(!mockValues.includes(shared))mockValues.push(shared);return shared;},
  useAnimatedStyle:(fn:any)=>({get transform(){return fn().transform;}}),
  withTiming:jest.fn((target:number)=>mockHold?mockValues[0].value:target),
}));
import {HelpQuestionTransition} from '../src/features/help/components/HelpQuestionTransition';

beforeEach(()=>{mockReduced=false;mockHold=false;mockValues.length=0;jest.clearAllMocks();});

test('restored first step is stationary; next enters right and previous enters left with measured width',async()=>{
  let tree!:TestRenderer.ReactTestRenderer;
  const timing=require('react-native-reanimated').withTiming as jest.Mock;
  const page=(index:number)=>React.createElement(HelpQuestionTransition,{index,identity:`q:${index}`,children:React.createElement('Choice',{index})});
  await act(async()=>{tree=TestRenderer.create(page(1));});
  const x=()=>StyleSheet.flatten(tree.root.findByProps({testID:'help-question-transition'}).props.style).transform[0].translateX;
  try{
    expect(x()).toBe(0);expect(timing).not.toHaveBeenCalled();
    act(()=>tree.root.findByProps({testID:'help-question-transition'}).props.onLayout({nativeEvent:{layout:{width:340}}}));
    mockHold=true;
    await act(async()=>tree.update(page(2)));
    expect(x()).toBe(340);expect(timing).toHaveBeenLastCalledWith(0,{duration:200,easing:'out:cubic'});
    await act(async()=>tree.update(page(1)));
    expect(x()).toBe(-340);
    expect(tree.root.findAllByType('Choice' as any)).toHaveLength(1);
    expect(tree.root.findByType('Choice' as any).props.index).toBe(1);
  }finally{await act(async()=>tree.unmount());}
});

test('answer rerenders do not replay motion, and interrupted changes keep only the latest question',async()=>{
  let tree!:TestRenderer.ReactTestRenderer;
  const timing=require('react-native-reanimated').withTiming as jest.Mock;
  const page=(index:number,selected=false)=>React.createElement(HelpQuestionTransition,{index,identity:`q:${index}`,children:React.createElement('Choice',{index,selected})});
  await act(async()=>{tree=TestRenderer.create(page(0));});
  try{
    act(()=>tree.root.findByProps({testID:'help-question-transition'}).props.onLayout({nativeEvent:{layout:{width:300}}}));
    mockHold=true;
    await act(async()=>tree.update(page(1)));
    mockValues[0].value=120;
    timing.mockClear();
    await act(async()=>tree.update(page(1,true)));
    expect(timing).not.toHaveBeenCalled();expect(mockValues[0].value).toBe(120);
    await act(async()=>tree.update(page(0)));
    expect(mockValues[0].value).toBe(-300);
    await act(async()=>tree.update(page(2)));
    expect(mockValues[0].value).toBe(300);
    expect(tree.root.findAllByType('Choice' as any)).toHaveLength(1);
    expect(tree.root.findByType('Choice' as any).props).toMatchObject({index:2,selected:false});
  }finally{await act(async()=>tree.unmount());}
});

test('reduced motion cancels a running slide and width changes affect only future transitions',async()=>{
  let tree!:TestRenderer.ReactTestRenderer;
  const timing=require('react-native-reanimated').withTiming as jest.Mock;
  const page=(index:number)=>React.createElement(HelpQuestionTransition,{index,identity:`q:${index}`,children:null});
  await act(async()=>{tree=TestRenderer.create(page(0));});
  try{
    const measure=(width:number)=>tree.root.findByProps({testID:'help-question-transition'}).props.onLayout({nativeEvent:{layout:{width}}});
    act(()=>measure(280));mockHold=true;
    await act(async()=>tree.update(page(1)));expect(mockValues[0].value).toBe(280);
    act(()=>{measure(Number.NaN);measure(-1);measure(400);});expect(mockValues[0].value).toBe(280);
    mockReduced=true;timing.mockClear();
    await act(async()=>tree.update(page(1)));expect(mockValues[0].value).toBe(0);expect(timing).not.toHaveBeenCalled();
    await act(async()=>tree.update(page(2)));expect(mockValues[0].value).toBe(0);expect(timing).not.toHaveBeenCalled();
    mockReduced=false;
    await act(async()=>tree.update(page(2)));expect(mockValues[0].value).toBe(0);expect(timing).not.toHaveBeenCalled();
    await act(async()=>tree.update(page(1)));expect(mockValues[0].value).toBe(-400);
  }finally{await act(async()=>tree.unmount());}
});
