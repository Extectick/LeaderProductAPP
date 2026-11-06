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
import {helpTime} from '../src/features/help/helpUiUtils';
import * as activityPresentation from '../src/features/help/helpActivityPresentation';
const base={id:1,ticketId:1043,createdAt:'2026-10-30T10:00:00Z',text:'',assistantRun:{runId:'qa-1',eventId:1,ticketId:1043,status:'thinking',step:1,completedSteps:1,startedAt:0,updatedAt:0}} as HelpMessage;

test('activity data never exposes reasoning or a disclosure control while answers stream',async()=>{
 let view!:TestRenderer.ReactTestRenderer;
 const label=jest.spyOn(activityPresentation,'helpActivityLabel');
 try{
  for(const status of ['thinking','streaming','completed'] as const){
   const message={...base,text:status==='completed'?'Ответ':'',assistantRun:{...base.assistantRun!,status,activityVersion:1 as const,draftText:'Ответ',activities:[{id:'analysis',kind:'analysis' as const,status:'completed' as const,label:'Скрытая операция',text:'Скрытый анализ'}]}};
   await act(async()=>{if(view)view.update(React.createElement(HelpAssistantMessage,{message}));else view=TestRenderer.create(React.createElement(HelpAssistantMessage,{message}));});
   expect(JSON.stringify(view.toJSON())).not.toContain('Скрытый');
   expect(view.root.findAllByProps({testID:'help-ai-work-log'})).toHaveLength(0);
   expect(view.root.findByProps({testID:'help-ai-heading'}).props.onPress).toBeUndefined();
  }
  expect(label).not.toHaveBeenCalled();
 }finally{if(view)await act(async()=>view.unmount());label.mockRestore();}
});

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
  expect(text()).toContain('ИИ ассистент');
  expect(text()).toContain('Готовлю ответ…');
  expect(view.root.findAllByProps({testID:'help-assistant-step-loader'})).toHaveLength(0);
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

test('the streamed answer keeps its identity while the assistant heading stays visible',async()=>{
 const {HelpMessageArrival}=require('../src/features/help/components/HelpMessageArrival');
 let view!:TestRenderer.ReactTestRenderer;
 const message={...base,text:'Начало',assistantRun:{...base.assistantRun!,status:'streaming' as const}};
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpAssistantMessage,{message}));});
 try{
  const first=view.root.findByType(HelpMessageArrival);expect(first.props.animate).toBe(true);
  await act(async()=>view.update(React.createElement(HelpAssistantMessage,{message:{...message,text:'Начало ответа'}})));
  expect(view.root.findByType(HelpMessageArrival)).toBe(first);
  expect(JSON.stringify(view.toJSON())).toContain('ИИ ассистент');
 }finally{await act(async()=>view.unmount());}
});

test('analysis stays hidden through completion and suggestions submit once',async()=>{
  let view!:TestRenderer.ReactTestRenderer;const reply=jest.fn();
  const activity={id:'analysis',kind:'analysis' as const,label:'Кратко об анализе',status:'running' as const,text:'Проверю подключение.'};
  const message={...base,assistantRun:{...base.assistantRun!,activityVersion:1 as const,phase:'analysis',activities:[activity]}};
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpAssistantMessage,{message,onSuggestion:reply}));});
  const texts=()=>JSON.stringify(view.toJSON());
  try{
    expect(texts()).not.toContain('Проверю подключение.');expect(texts()).not.toContain('Изучаю описание проблемы');
    const partial={...message,assistantRun:{...message.assistantRun,status:'streaming' as const,draftText:'Откройте настройки.'}};
    await act(async()=>view.update(React.createElement(HelpAssistantMessage,{message:partial,onSuggestion:reply})));
    expect(texts()).toContain('Откройте настройки.');
    const stopped={...partial,assistantRun:{...partial.assistantRun,status:'stopped' as const,stopReason:'user' as const}};
    await act(async()=>view.update(React.createElement(HelpAssistantMessage,{message:stopped,onSuggestion:reply})));
    expect(texts()).toContain('Незавершённый ответ');expect(texts()).toContain('Откройте настройки.');
    const complete={...partial,text:'Откройте настройки.',assistantRun:{...partial.assistantRun,status:'completed' as const,suggestions:['Windows 11','Windows 10']}};
    await act(async()=>view.update(React.createElement(HelpAssistantMessage,{message:complete,onSuggestion:reply})));
    expect(texts()).not.toContain('Формируется ответ');
    expect(texts()).not.toContain('Ход анализа');
    expect(view.root.findAll(node=>node.props.accessibilityLabel==='Показать действия ИИ')).toHaveLength(0);
    expect(texts()).not.toContain('Проверю подключение.');
    const option=view.root.findByProps({testID:'help-ai-suggestions'}).findAll(node=>node.props.accessibilityRole==='button')[0];
    await act(async()=>{option.props.onPress();option.props.onPress();});
    expect(reply).toHaveBeenCalledTimes(1);expect(reply).toHaveBeenCalledWith('Windows 11');
  }finally{await act(async()=>view.unmount());}
});

test.each([false,true])('completed AI answer omits message time and empty analysis chrome (live=%s)',async(live)=>{
  let view!:TestRenderer.ReactTestRenderer;
  const message={...base,text:'Готовый ответ без служебной подписи.',assistantRun:{...base.assistantRun!,status:'completed' as const,...(live?{activityVersion:1 as const,metrics:{startedAt:0,elapsedMs:42000},activities:[]}: {})}};
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpAssistantMessage,{message}));});
  try{
    const visible=JSON.stringify(view.toJSON());
    expect(visible).toContain(message.text);
    expect(visible).not.toContain(helpTime(message.createdAt));
    expect(visible).not.toContain('Ход анализа');
    expect(visible).not.toContain('42 с');
    expect(view.root.findAllByProps({testID:'help-ai-work-log'})).toHaveLength(0);
  }finally{await act(async()=>view.unmount());}
});

test.each([false,true])('question text has a single visible owner, with an explicit waiting/answered state (live=%s)',async live=>{
  let view!:TestRenderer.ReactTestRenderer;
  const message={...base,text:'Какая ОС? Windows 11 или Windows 10?',assistantRun:{...base.assistantRun!,status:'completed' as const,...(live?{activityVersion:1 as const,activities:[]}:{}),questions:[{id:'os',header:'ОС',question:'Какая ОС?',multiSelect:false,options:[]}]}};
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpAssistantMessage,{message,questionState:'waiting'}));});
  try{
    expect(JSON.stringify(view.toJSON())).toContain('ИИ ожидает ответ');
    const status=view.root.findByProps({testID:'help-assistant-question-status'});
    expect(status.props.numberOfLines).toBe(1);
    expect(view.root.findByProps({testID:'help-ai-heading'}).findByProps({testID:'help-assistant-question-status'})).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toContain('Какая ОС?');
    await act(async()=>view.update(React.createElement(HelpAssistantMessage,{message,questionState:'answered'})));
    expect(JSON.stringify(view.toJSON())).toContain('Ответы получены');
    expect(JSON.stringify(view.toJSON())).not.toContain('Какая ОС?');
  }finally{await act(async()=>view.unmount());}
});
