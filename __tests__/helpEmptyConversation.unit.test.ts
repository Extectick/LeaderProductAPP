import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {Animated,StyleSheet} from 'react-native';
import {HelpEmptyConversation} from '../src/features/help/components/HelpEmptyConversation';
let mockReduced=false;
jest.mock('../src/features/help/helpTheme',()=>({useHelpTheme:()=>({text:'#fff',muted:'#aaa',accent:'#38f'}),useHelpReducedMotion:()=>mockReduced}));
jest.mock('../src/features/help/components/HelpAiIcon',()=>({HelpAiIcon:'HelpAiIcon'}));

test('legacy keyboard movement animates the content from its current position while keeping resting geometry',async()=>{
  const animations:{value:Animated.Value;config:any;stop:jest.Mock;start:jest.Mock}[]=[];
  const timing=jest.spyOn(Animated,'spring').mockImplementation((value,config)=>{
    const animation={value:value as Animated.Value,config,stop:jest.fn(),start:jest.fn()};animations.push(animation);return animation as any;
  });
  let tree!:TestRenderer.ReactTestRenderer;
  const props={keyboardInset:0,style:{position:'absolute' as const,top:100,bottom:64}};
  try{
    await act(async()=>{tree=TestRenderer.create(React.createElement(HelpEmptyConversation,props));});
    const surface=tree.root.findByProps({testID:'help-new-ticket-hint'});
    const displacement=StyleSheet.flatten(tree.root.findByProps({testID:'help-new-ticket-hint-content'}).props.style).transform![0].translateY as Animated.Value;
    const movement=()=>animations.filter(animation=>animation.value===displacement);
    const stopped=jest.spyOn(displacement,'stopAnimation');
    await act(async()=>tree.update(React.createElement(HelpEmptyConversation,{...props,keyboardInset:300})));
    expect(displacement.__getValue()).toBe(0);
    expect(movement().at(-1)!.config).toMatchObject({toValue:-150,stiffness:180,damping:28,overshootClamping:true,useNativeDriver:true,isInteraction:false});
    act(()=>displacement.setValue(-60));
    await act(async()=>tree.update(React.createElement(HelpEmptyConversation,props)));
    expect(stopped).not.toHaveBeenCalled();expect(displacement.__getValue()).toBe(-60);
    expect(movement().at(-1)!.config.toValue).toBe(0);
    expect(StyleSheet.flatten(surface.props.style)).toMatchObject({top:100,bottom:64});
    await act(async()=>tree.unmount());expect(stopped).toHaveBeenCalled();
  }finally{if(tree)await act(async()=>tree.unmount());timing.mockRestore();}
});

test('native hint motion receives no second transform animation or keyboard offset',async()=>{
  const timing=jest.spyOn(Animated,'spring');let tree!:TestRenderer.ReactTestRenderer;
  try{
    await act(async()=>{tree=TestRenderer.create(React.createElement(HelpEmptyConversation,{nativeID:'native-hint',keyboardInset:300}));});
    const displacement=StyleSheet.flatten(tree.root.findByProps({testID:'help-new-ticket-hint-content'}).props.style).transform![0].translateY as Animated.Value;
    await act(async()=>tree.update(React.createElement(HelpEmptyConversation,{nativeID:'native-hint',keyboardInset:0})));
    expect(displacement.__getValue()).toBe(0);
    expect(timing.mock.calls.filter(([value])=>value===displacement)).toHaveLength(0);
  }finally{if(tree)await act(async()=>tree.unmount());timing.mockRestore();}
});

test('an already open keyboard restores the correct center; reduced motion applies subsequent changes immediately',async()=>{
  mockReduced=true;let tree!:TestRenderer.ReactTestRenderer;
  try{
    await act(async()=>{tree=TestRenderer.create(React.createElement(HelpEmptyConversation,{keyboardInset:300}));});
    const displacement=()=>StyleSheet.flatten(tree.root.findByProps({testID:'help-new-ticket-hint-content'}).props.style).transform![0].translateY.__getValue();
    expect(displacement()).toBe(-150);
    await act(async()=>tree.update(React.createElement(HelpEmptyConversation,{keyboardInset:0})));expect(displacement()).toBe(0);
  }finally{if(tree)await act(async()=>tree.unmount());mockReduced=false;}
});

