import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {StyleSheet} from 'react-native';

let mockReduced=false,mockHold=false;
const mockValues:{value:any}[]=[];
jest.mock('../src/features/help/helpTheme',()=>({useHelpReducedMotion:()=>mockReduced}));
jest.mock('react-native-reanimated',()=>({
  __esModule:true,default:{View:require('react-native').View},cancelAnimation:jest.fn(),
  Easing:{cubic:'cubic',out:(curve:any)=>`out:${curve}`},
  useSharedValue:(value:any)=>{const shared=require('react').useRef({value}).current;if(!mockValues.includes(shared))mockValues.push(shared);return shared;},
  useAnimatedStyle:(fn:any)=>({get height(){return fn().height;},get opacity(){return fn().opacity;}}),
  withTiming:jest.fn((target:number)=>mockHold?mockValues[0].value:target),
}));
import {HelpQuestionReveal} from '../src/features/help/components/HelpQuestionReveal';

beforeEach(()=>{mockReduced=false;mockHold=false;mockValues.length=0;jest.clearAllMocks();});

test('keeps expanded children mounted and uses cached natural heights in both directions',async()=>{
  let tree!:TestRenderer.ReactTestRenderer;
  const mounted=jest.fn(),unmounted=jest.fn();
  function Body(){React.useEffect(()=>{mounted();return unmounted;},[]);return React.createElement('QuestionChoices');}
  const render=(collapsed:boolean)=>React.createElement(HelpQuestionReveal,{collapsed,children:React.createElement(Body),collapsedContent:React.createElement('WaitingForAnswer')});
  await act(async()=>{tree=TestRenderer.create(render(false));});
  const height=()=>StyleSheet.flatten(tree.root.findByProps({testID:'help-question-reveal'}).props.style).height;
  const measure=(layer:string,value:number)=>tree.root.findByProps({testID:`help-question-reveal-${layer}`}).props.onLayout({nativeEvent:{layout:{height:value}}});
  try{
    const body=tree.root.findByType('QuestionChoices' as any);
    expect(height()).toBe(0);
    act(()=>measure('expanded',300));expect(height()).toBe(300);
    act(()=>measure('collapsed',46));expect(height()).toBe(300);
    await act(async()=>tree.update(render(true)));expect(height()).toBe(46);
    expect(tree.root.findByProps({testID:'help-question-reveal-expanded'}).props).toMatchObject({pointerEvents:'none',accessibilityElementsHidden:true,importantForAccessibility:'no-hide-descendants'});
    act(()=>measure('expanded',320));expect(height()).toBe(46);
    await act(async()=>tree.update(render(false)));expect(height()).toBe(320);
    expect(tree.root.findByType('QuestionChoices' as any)).toBe(body);
    expect(mounted).toHaveBeenCalledTimes(1);expect(unmounted).not.toHaveBeenCalled();
  }finally{await act(async()=>tree.unmount());}
});

test('interruptions retarget current height and layer opacity follows that same height clock',async()=>{
  let tree!:TestRenderer.ReactTestRenderer;
  const timing=require('react-native-reanimated').withTiming as jest.Mock;
  const render=(collapsed:boolean)=>React.createElement(HelpQuestionReveal,{collapsed,children:React.createElement('Expanded'),collapsedContent:React.createElement('Collapsed')});
  await act(async()=>{tree=TestRenderer.create(render(false));});
  const style=(id:string)=>StyleSheet.flatten(tree.root.findByProps({testID:id}).props.style);
  try{
    act(()=>tree.root.findByProps({testID:'help-question-reveal-expanded'}).props.onLayout({nativeEvent:{layout:{height:300}}}));
    expect(style('help-question-reveal-expanded').opacity).toBe(1);
    expect(style('help-question-reveal-collapsed').opacity).toBe(0);
    mockHold=true;
    await act(async()=>tree.update(render(true)));
    expect(timing).toHaveBeenLastCalledWith(44,{duration:220,easing:'out:cubic'});
    mockValues[0].value=180;
    const midway=(180-44)/(300-44);
    expect(style('help-question-reveal-expanded').opacity).toBeCloseTo((midway-.15)/.85);
    expect(style('help-question-reveal-collapsed').opacity).toBe(0);
    mockValues[0].value=44+(300-44)*.1;
    expect(style('help-question-reveal-expanded').opacity).toBe(0);
    expect(style('help-question-reveal-collapsed').opacity).toBeCloseTo(1/3);
    mockValues[0].value=180;
    await act(async()=>tree.update(render(false)));
    expect(style('help-question-reveal').height).toBe(180);
    expect(timing).toHaveBeenLastCalledWith(300,{duration:220,easing:'out:cubic'});
    expect(tree.root.findByProps({testID:'help-question-reveal-collapsed'}).props).toMatchObject({pointerEvents:'none',accessibilityElementsHidden:true});
  }finally{await act(async()=>tree.unmount());}
});

test('reduced motion applies measurements directly without timing and ignores invalid measurements',async()=>{
  mockReduced=true;let tree!:TestRenderer.ReactTestRenderer;
  const timing=require('react-native-reanimated').withTiming as jest.Mock;
  const render=(collapsed:boolean)=>React.createElement(HelpQuestionReveal,{collapsed,children:null,collapsedContent:null});
  await act(async()=>{tree=TestRenderer.create(render(false));});
  const height=()=>StyleSheet.flatten(tree.root.findByProps({testID:'help-question-reveal'}).props.style).height;
  const measure=(value:number)=>tree.root.findByProps({testID:'help-question-reveal-expanded'}).props.onLayout({nativeEvent:{layout:{height:value}}});
  try{
    act(()=>measure(280));expect(height()).toBe(280);
    act(()=>{measure(0);measure(Number.NaN);});expect(height()).toBe(280);
    await act(async()=>tree.update(render(true)));expect(height()).toBe(44);
    expect(timing).not.toHaveBeenCalled();
  }finally{await act(async()=>tree.unmount());}
});
