import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {StyleSheet} from 'react-native';
import type {HelpMessage} from '../src/features/help/helpApi';
jest.mock('../context/ThemeContext',()=>({useTheme:()=>({theme:'dark'})}));
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
import {HelpAssistantMessage} from '../src/features/help/components/HelpAssistantMessage';
const message={id:1,ticketId:1043,createdAt:'2026-10-30T10:00:00Z',text:'',assistantRun:{runId:'surface-1',eventId:1,ticketId:1043,status:'thinking',step:1,completedSteps:1}} as HelpMessage;
const textOf=(node:TestRenderer.ReactTestInstance|string):string=>typeof node==='string'?node:node.children.map(textOf).join('');
test('streaming and completed text stay on the background without fixed height or clipping',async()=>{
  let tree!:TestRenderer.ReactTestRenderer;
  await act(async()=>{tree=TestRenderer.create(React.createElement(HelpAssistantMessage,{message}));});
  try{
    const surface=tree.root.findByProps({testID:'help-assistant-surface'});
    for(const status of ['streaming','completed','stopped'] as const){
      const text='Ответ с несколькими строками\n'.repeat(status==='streaming'?3:8);
      await act(async()=>tree.update(React.createElement(HelpAssistantMessage,{message:{...message,text,assistantRun:{...message.assistantRun!,status}}})));
      expect(tree.root.findByProps({testID:'help-assistant-surface'})).toBe(surface);
      expect(textOf(tree.root.findByProps({testID:'help-assistant-text'})).trimEnd()).toBe(text.trimEnd());
      for(const id of ['help-assistant-message','help-assistant-surface','help-assistant-body']){
        const node=tree.root.findByProps({testID:id}),style=StyleSheet.flatten(node.props.style)||{};
        expect(style.height).toBeUndefined();expect(style.overflow).toBeUndefined();expect(style.backgroundColor).toBeUndefined();expect(node.props.onLayout).toBeUndefined();
      }
      expect(tree.root.findAll(n=>n.type==='Ionicons'&&n.props.name==='hardware-chip-outline')).toHaveLength(0);
    }
  }finally{await act(async()=>tree.unmount());}
});
test('completed answer has no timestamp footer',async()=>{
  let tree!:TestRenderer.ReactTestRenderer;
  await act(async()=>{tree=TestRenderer.create(React.createElement(HelpAssistantMessage,{message:{...message,text:'Ответ',assistantRun:{...message.assistantRun!,status:'completed'}}}));});
  try{expect(tree.root.findAllByProps({testID:'help-assistant-time'})).toHaveLength(0);}finally{await act(async()=>tree.unmount());}
});
