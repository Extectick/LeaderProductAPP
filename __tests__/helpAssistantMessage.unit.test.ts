import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { HelpMessage } from '../src/features/help/helpApi';
jest.mock('../context/ThemeContext',()=>({useTheme:jest.fn(()=>({theme:'dark'}))}));
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
jest.mock('../src/features/help/helpDiagnostics',()=>({helpDevState:jest.fn()}));
jest.mock('react-native-reanimated', () => ({
  __esModule:true,default:{View:require('react-native').View},
  useSharedValue:(value:number)=>require('react').useRef({value}).current,
  useAnimatedStyle:(fn:()=>any)=>Object.defineProperties({},Object.fromEntries(Object.keys(fn()).map(key=>[key,{enumerable:true,get:()=>fn()[key]}]))),
  cancelAnimation:jest.fn(),runOnJS:(fn:any)=>fn,withTiming:(value:number)=>value,Easing:{out:(fn:any)=>fn,quad:()=>0},
}));
import { HelpAssistantMessage } from '../src/features/help/components/HelpAssistantMessage';
import {useTheme} from '../context/ThemeContext';
const base={id:1,ticketId:1043,createdAt:'2026-10-30T10:00:00Z',text:'',assistantRun:{runId:'qa-1',eventId:1,ticketId:1043,status:'thinking',step:1,completedSteps:1,startedAt:0,updatedAt:0}} as HelpMessage;

test('composer callback churn skips the assistant body and actions still use the newest callback',async()=>{
  let view!:TestRenderer.ReactTestRenderer;
  const message={...base,text:'Ответ',assistantRun:{...base.assistantRun!,status:'stopped' as const}};
  const first=jest.fn(),latest=jest.fn();
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpAssistantMessage,{message,onRetry:first}));});
  const before=jest.mocked(useTheme).mock.calls.length;
  try{
    await act(async()=>view.update(React.createElement(HelpAssistantMessage,{message,onRetry:latest})));
    expect(jest.mocked(useTheme).mock.calls.length).toBe(before);
    await act(async()=>view.root.findAll(node=>node.props.accessibilityLabel==='Повторить обработку ИИ')[0].props.onPress());
    expect(first).not.toHaveBeenCalled();expect(latest).toHaveBeenCalledTimes(1);
  }finally{await act(async()=>view.unmount());}
});
test('reasoning becomes the answer in one message with a single AI identity',async()=>{
  let view!:TestRenderer.ReactTestRenderer;
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpAssistantMessage,{message:base}));});
  const text=()=>view.root.findAllByType(Text).map(node=>node.props.children).flat().join(' ');
  expect(text()).not.toContain('ИИ рассуждает');
  expect(view.root.findAllByProps({testID:'help-assistant-avatar-loading-1043'})).toHaveLength(0);
  expect(view.root.findAllByProps({testID:'help-assistant-step-loader'}).length).toBeGreaterThan(0);
  expect(text()).not.toContain('тестовый сценарий');
  expect(view.root.findAll(node=>node.props.accessibilityLabel==='Остановить обработку ИИ')).toHaveLength(0);
  const answer={...base,text:'Готовый ответ',assistantRun:{...base.assistantRun!,status:'completed' as const,step:3,completedSteps:4}};
  await act(async()=>view.update(React.createElement(HelpAssistantMessage,{message:answer})));
  expect(text()).toContain('Готовый ответ');
  expect(text()).not.toContain('Анализ завершён');
  expect(text()).not.toContain('Изучаю описание');
  expect(view.root.findAllByType(Text).filter(node=>node.props.children==='Помощник · ИИ')).toHaveLength(0);
  expect(view.root.findAll(node=>node.type==='Ionicons'&&node.props.name==='hardware-chip-outline')).toHaveLength(0);
  await act(async()=>view.unmount());
});

test('live AI steps, completion marks and first answer animate with stable identities',async()=>{
  const {HelpMessageArrival}=require('../src/features/help/components/HelpMessageArrival');
  let view!:TestRenderer.ReactTestRenderer;
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpAssistantMessage,{message:base}));});
  try{
    expect(view.root.findAllByType(HelpMessageArrival).map(node=>node.props.identity)).toContain('assistant-check:qa-1:1:pending');
    const next={...base,assistantRun:{...base.assistantRun!,step:2,completedSteps:2}};
    await act(async()=>view.update(React.createElement(HelpAssistantMessage,{message:next})));
    expect(view.root.findAllByType(HelpMessageArrival).map(node=>node.props.identity)).toEqual(expect.arrayContaining(['assistant-check:qa-1:1:done','assistant-step:qa-1:2']));
    const answer={...next,text:'Начало',assistantRun:{...next.assistantRun,status:'streaming' as const}};
    await act(async()=>view.update(React.createElement(HelpAssistantMessage,{message:answer})));
    const first=view.root.findByType(HelpMessageArrival);expect(first.props.animate).toBe(true);
    await act(async()=>view.update(React.createElement(HelpAssistantMessage,{message:{...answer,text:'Начало ответа'}})));
    expect(view.root.findByType(HelpMessageArrival)).toBe(first);
  }finally{await act(async()=>view.unmount());}
});
