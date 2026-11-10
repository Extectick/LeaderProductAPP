import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Platform, Text } from 'react-native';
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
import { HelpAssistantMessage,HelpAssistantPreviewMenu } from '../src/features/help/components/HelpAssistantMessage';
import {useTheme} from '../context/ThemeContext';
import {helpTime} from '../src/features/help/helpUiUtils';
import * as activityPresentation from '../src/features/help/helpActivityPresentation';
const base={id:1,ticketId:1043,createdAt:'2026-10-30T10:00:00Z',text:'',assistantRun:{runId:'qa-1',eventId:1,ticketId:1043,status:'thinking',step:1,completedSteps:1,startedAt:0,updatedAt:0}} as HelpMessage;

test('public progress appears while processing and disappears with the final answer',async()=>{
 let view!:TestRenderer.ReactTestRenderer;
 const label=jest.spyOn(activityPresentation,'helpActivityLabel');
 try{
  for(const status of ['thinking','streaming','completed'] as const){
   const message={...base,text:status==='completed'?'Ответ':'',assistantRun:{...base.assistantRun!,status,activityVersion:1 as const,draftText:'Ответ',activities:[{id:'analysis',kind:'analysis' as const,status:'completed' as const,label:'Скрытая операция',text:'Скрытый анализ'}]}};
   await act(async()=>{if(view)view.update(React.createElement(HelpAssistantMessage,{message}));else view=TestRenderer.create(React.createElement(HelpAssistantMessage,{message}));});
   if(status==='completed')expect(JSON.stringify(view.toJSON())).not.toContain('Скрытый анализ');
   else {
    const toggle=view.root.findByProps({testID:'help-ai-work-toggle'});
    if(!toggle.props.accessibilityState.expanded)await act(async()=>toggle.props.onPress());
    expect(JSON.stringify(view.toJSON())).toContain('Скрытый анализ');
   }
   expect(view.root.findAllByProps({testID:'help-ai-work-log'}).length>0).toBe(status!=='completed');
   if(status!=='completed')expect(view.root.findAll(node=>node.type==='Ionicons'&&node.props.name==='checkmark').length).toBeGreaterThan(0);
   expect(view.root.findByProps({testID:'help-ai-heading'}).props.onPress).toBeUndefined();
  }
  expect(label).toHaveBeenCalled();
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
  expect(view.root.findByProps({testID:'help-ai-work-toggle'}).props.accessibilityState.expanded).toBe(false);
  expect(view.root.findByProps({testID:'help-ai-accessible-role'}).props.style.opacity).toBe(0);
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

test('the streamed answer keeps its identity and accessible role without a visible masthead',async()=>{
 const {HelpStreamingAnswer}=require('../src/features/help/components/HelpStreamingText');
 const streamType=HelpStreamingAnswer.type??HelpStreamingAnswer;
 let view!:TestRenderer.ReactTestRenderer;
 const message={...base,text:'',assistantRun:{...base.assistantRun!,status:'streaming' as const}};
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpAssistantMessage,{message}));});
 try{
  const first=view.root.findByType(streamType);expect(first.props.status).toBe('streaming');
  await act(async()=>view.update(React.createElement(HelpAssistantMessage,{message:{...message,text:'Начало ответа'}})));
  expect(view.root.findByType(streamType)).toBe(first);
  await act(async()=>view.update(React.createElement(HelpAssistantMessage,{message:{...message,text:'Начало ответа',assistantRun:{...message.assistantRun,status:'completed'}}})));
  expect(view.root.findByType(streamType)).toBe(first);
  expect(first.props.status).toBe('completed');
  expect(JSON.stringify(view.toJSON())).toContain('ИИ ассистент');
 }finally{await act(async()=>view.unmount());}
});

test('analysis is visible before completion, then removed, and suggestions submit once',async()=>{
  let view!:TestRenderer.ReactTestRenderer;const reply=jest.fn();
  const activity={id:'analysis',kind:'analysis' as const,label:'Кратко об анализе',status:'running' as const,text:'Проверю подключение.'};
  const message={...base,assistantRun:{...base.assistantRun!,activityVersion:1 as const,phase:'analysis',activities:[activity]}};
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpAssistantMessage,{message,onSuggestion:reply}));});
  const texts=()=>JSON.stringify(view.toJSON());
  try{
    expect(texts()).not.toContain('Проверю подключение.');
    await act(async()=>view.root.findByProps({testID:'help-ai-work-toggle'}).props.onPress());
    expect(texts()).toContain('Проверю подключение.');expect(texts()).not.toContain('Изучаю описание проблемы');
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

test.each([false,true])('question history retains its actual prompt with compact read-only disclosure and correct status (live=%s)',async live=>{
  let view!:TestRenderer.ReactTestRenderer;
  const message={...base,text:'Какая ОС? Windows 11 или Windows 10?',assistantRun:{...base.assistantRun!,status:'completed' as const,...(live?{activityVersion:1 as const,activities:[]}:{}),questions:[{id:'os',header:'ОС',question:'Какая ОС?',multiSelect:false,options:[]}]}};
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpAssistantMessage,{message,questionState:'waiting'}));});
  try{
    expect(JSON.stringify(view.toJSON())).toContain('Ожидает ответа');
    const status=view.root.findByProps({testID:'help-assistant-question-status'});
    expect(status.props.accessibilityLiveRegion).toBe('polite');
    expect(view.root.findByProps({testID:'help-ai-heading'}).findByProps({testID:'help-assistant-question-status'})).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).toContain('Какая ОС?');
    expect(JSON.stringify(view.toJSON())).not.toContain('Windows 11 или Windows 10?');
    await act(async()=>view.update(React.createElement(HelpAssistantMessage,{message,questionState:'answered'})));
    expect(JSON.stringify(view.toJSON())).toContain('Ответ получен');
    await act(async()=>view.root.findByProps({testID:'help-question-history-toggle'}).props.onPress());
    expect(view.root.findByProps({testID:'help-question-history-toggle'}).props.accessibilityState.expanded).toBe(true);
    expect(view.root.findByProps({testID:'help-question-history-details'})).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).toContain('Какая ОС?');
    expect(JSON.stringify(view.toJSON())).not.toContain('Windows 11 или Windows 10?');
  }finally{await act(async()=>view.unmount());}
});


test('web AI scenario rows expose shared feedback and Space selects a radio action',async()=>{
 jest.replaceProperty(Platform,'OS','web');let view!:TestRenderer.ReactTestRenderer;
 const preview:any={scenario:'answer',setScenario:jest.fn(),replay:jest.fn()},onClose=jest.fn();
 try{
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpAssistantPreviewMenu,{preview,ticketId:42,onClose}));});
  const row=view.root.findAllByProps({accessibilityLabel:'Уточняющий вопрос'}).find(node=>node.props.onKeyDown)!;
  expect(row.props.dataSet).toMatchObject({appControl:'row'});
  const preventDefault=jest.fn();await act(async()=>row.props.onKeyDown({key:' ',preventDefault}));
  expect(preventDefault).toHaveBeenCalled();expect(preview.setScenario).toHaveBeenCalledWith('question');expect(onClose).toHaveBeenCalledTimes(1);
 }finally{await act(async()=>view?.unmount());jest.restoreAllMocks();}
});


test.each([false,true])('confirmed question reply replaces the waiting disclosure in the same AI body (live=%s)',async live=>{
  let view!:TestRenderer.ReactTestRenderer;
  const message={...base,text:'Какая ОС?',assistantRun:{...base.assistantRun!,status:'completed' as const,...(live?{activityVersion:1 as const,activities:[]}:{}),questions:[{id:'os',header:'ОС',question:'Какая ОС?',multiSelect:false,options:[]}]}};
  const questionReply=React.createElement(Text,{testID:'confirmed-question-reply'},'Какая ОС? Ответ: Windows 11');
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpAssistantMessage,{message,questionState:'answered',questionReply}));});
  try{
    expect(view.root.findByProps({testID:'help-assistant-question-history'}).findByProps({testID:'confirmed-question-reply'})).toBeTruthy();
    expect(view.root.findAllByProps({testID:'help-question-history-toggle'})).toHaveLength(0);
    expect(view.root.findAll(node=>typeof node.type==='string'&&node.props.testID==='help-assistant-message')).toHaveLength(1);
    expect(JSON.stringify(view.toJSON())).not.toContain('Ответ пользователя — в следующем сообщении.');
  }finally{await act(async()=>view.unmount());}
});

test.each([false,true])('assistant heading and answer have independent keys across updates (live=%s)',async live=>{
 const error=jest.spyOn(console,'error').mockImplementation(()=>{});
 let view:TestRenderer.ReactTestRenderer|undefined;
 try {
  for(const runId of ['same-run','next-run'])for(const status of ['streaming','completed','stopped'] as const){
   const message={...base,text:'Ответ пользователю',assistantRun:{...base.assistantRun!,runId,status,...(live?{activityVersion:1 as const,activities:[]}:{})}};
   await act(async()=>{if(view)view.update(React.createElement(HelpAssistantMessage,{message}));else view=TestRenderer.create(React.createElement(HelpAssistantMessage,{message}));});
   expect(view!.root.findAll(node=>typeof node.type==='string'&&node.props.testID==='help-ai-heading')).toHaveLength(1);
  }
  expect(error.mock.calls.filter(args=>args.some(value=>typeof value==='string'&&/same key|unique.*key/i.test(value)))).toEqual([]);
 } finally {if(view)await act(async()=>view!.unmount());error.mockRestore();}
});
