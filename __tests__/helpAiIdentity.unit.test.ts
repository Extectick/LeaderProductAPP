import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {Animated,StyleSheet,Text} from 'react-native';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
let mockReduced=true;
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
jest.mock('react-native-svg',()=>({__esModule:true,default:'Svg',Path:'Path'}));
jest.mock('../src/features/help/helpTheme',()=>({
  useHelpTheme:()=>({background:'#F7F9FC',accent:'#3289FF',accentText:'#2563EB',text:'#18212D',muted:'#627185'}),
  useHelpReducedMotion:()=>mockReduced,
}));
import {HelpAssistantAvatar} from '../src/features/help/components/HelpAssistantAvatar';
import {HelpEmptyConversation} from '../src/features/help/components/HelpEmptyConversation';
import {HELP_AI_MARK_PATH} from '../src/features/help/helpAiBrand';
import {helpAssistantAvatarColor} from '../src/features/help/helpAssistant';

test('avatars reuse the exact source mark while preserving each ticket colour',async()=>{
  const source=readFileSync(join(__dirname,'../assets/help/openai-blossom.svg'),'utf8');
  expect(HELP_AI_MARK_PATH).toBe(source.match(/<path d="([^"]+)" fill="black"\/>/)?.[1]);
  let view!:TestRenderer.ReactTestRenderer;
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpAssistantAvatar,{ticketId:1042,size:46}));});
  try{
    expect(view.root.findByProps({testID:'help-ai-icon'}).props.width).toBe(28);
    expect(view.root.findByProps({testID:'help-assistant-avatar-1042'}).props.style.backgroundColor).toBe(helpAssistantAvatarColor(1042));
    await act(async()=>view.update(React.createElement(HelpAssistantAvatar,{ticketId:1043,size:30})));
    expect(view.root.findByProps({testID:'help-ai-icon'}).props.width).toBe(18);
    expect(view.root.findByProps({testID:'help-assistant-avatar-1043'}).props.style.backgroundColor).toBe(helpAssistantAvatarColor(1043));
  }finally{await act(async()=>view.unmount());}
});

test('empty conversation uses the shared mark without repeating layout or animation in reduced motion',async()=>{
  mockReduced=true;
  const timing=jest.spyOn(Animated,'timing');
  let view!:TestRenderer.ReactTestRenderer;
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpEmptyConversation,{active:true,style:{position:'absolute',top:80,bottom:320}}));});
  try{
    expect(timing).not.toHaveBeenCalled();
    expect(view.root.findByProps({testID:'help-ai-icon'}).props.width).toBe(40);
    expect(view.root.findAllByType(Text).map(node=>node.props.children)).toEqual(['Чем помочь?','Опишите проблему — начнём разбираться']);
    const style=StyleSheet.flatten(view.root.findByProps({testID:'help-new-ticket-hint'}).props.style);
    expect(style).toMatchObject({top:80,bottom:320,alignItems:'center',justifyContent:'center'});
  }finally{await act(async()=>view.unmount());}
});
