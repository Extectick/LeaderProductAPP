import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {StyleSheet,Text} from 'react-native';
import type {HelpMessage} from '../src/features/help/helpApi';
jest.mock('../context/ThemeContext',()=>({useTheme:()=>({theme:'dark'})}));
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
import {HelpAssistantMessage} from '../src/features/help/components/HelpAssistantMessage';
const message={id:1,ticketId:1043,createdAt:'2026-10-30T10:00:00Z',text:'',assistantRun:{runId:'surface-1',eventId:1,ticketId:1043,status:'thinking',step:1,completedSteps:1}} as HelpMessage;
test('streaming and completed text stay on the background without fixed height or clipping',async()=>{
  let tree!:TestRenderer.ReactTestRenderer;
  await act(async()=>{tree=TestRenderer.create(React.createElement(HelpAssistantMessage,{message}));});
  try{
    const surface=tree.root.findByProps({testID:'help-assistant-surface'});
    for(const status of ['streaming','completed','stopped'] as const){
      const text='Ответ с несколькими строками\n'.repeat(status==='streaming'?3:8);
      await act(async()=>tree.update(React.createElement(HelpAssistantMessage,{message:{...message,text,assistantRun:{...message.assistantRun!,status}}})));
      expect(tree.root.findByProps({testID:'help-assistant-surface'})).toBe(surface);
      expect(tree.root.findByProps({testID:'help-assistant-text'}).props.children).toBe(text);
      for(const id of ['help-assistant-message','help-assistant-surface','help-assistant-body']){
        const node=tree.root.findByProps({testID:id}),style=StyleSheet.flatten(node.props.style)||{};
        expect(style.height).toBeUndefined();expect(style.overflow).toBeUndefined();expect(style.backgroundColor).toBeUndefined();expect(node.props.onLayout).toBeUndefined();
      }
      expect(tree.root.findAll(n=>n.type==='Ionicons'&&n.props.name==='hardware-chip-outline')).toHaveLength(0);
    }
  }finally{await act(async()=>tree.unmount());}
});
test('time follows the text in normal flow and appears exactly once',async()=>{
  let tree!:TestRenderer.ReactTestRenderer;
  await act(async()=>{tree=TestRenderer.create(React.createElement(HelpAssistantMessage,{message:{...message,text:'Ответ',assistantRun:{...message.assistantRun!,status:'completed'}}}));});
  try{const time=tree.root.findByProps({testID:'help-assistant-time'});expect(time.props.style.position).toBeUndefined();expect(time.props.style.marginTop).toBe(3);expect(time.findAllByType(Text)).toHaveLength(1);}finally{await act(async()=>tree.unmount());}
});
