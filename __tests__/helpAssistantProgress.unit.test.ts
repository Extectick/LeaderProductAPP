import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {ActivityIndicator,Platform,ScrollView} from 'react-native';
import {HelpAssistantProgress} from '../src/features/help/components/HelpAssistantProgress';
import {AppWebScrollbar} from '../components/ui/AppWebScrollbar';
import type {HelpAssistantRun} from '../src/features/help/helpAssistant';
jest.mock('../context/ThemeContext',()=>({useTheme:()=>({theme:'dark'})}));
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
const run:HelpAssistantRun={runId:'run-a',eventId:1,ticketId:1,status:'thinking',step:0,completedSteps:0,activityVersion:1,
 activities:[{id:'tool-a',kind:'tool',status:'running',label:'Проверяю подключение'}]};

test('opens by default, preserves manual collapse across chunks, and opens a new run',async()=>{
 let view!:TestRenderer.ReactTestRenderer;
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpAssistantProgress,{run}));});
 const toggle=()=>view.root.findByProps({testID:'help-ai-work-toggle'});
 try{
  expect(toggle().props.accessibilityState.expanded).toBe(true);
  await act(async()=>toggle().props.onPress());
  expect(toggle().props.accessibilityState.expanded).toBe(false);
  await act(async()=>view.update(React.createElement(HelpAssistantProgress,{run:{...run,eventId:2,status:'streaming'}})));
  expect(toggle().props.accessibilityState.expanded).toBe(false);
  await act(async()=>view.update(React.createElement(HelpAssistantProgress,{run:{...run,runId:'run-b'}})));
  expect(toggle().props.accessibilityState.expanded).toBe(true);
 }finally{await act(async()=>view.unmount());}
});

test('web uses the shared list scrollbar connected to this viewport and hides the browser indicator',async()=>{
 const original=Platform.OS;Platform.OS='web';let view!:TestRenderer.ReactTestRenderer;
 try{
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpAssistantProgress,{run}));});
  const scroll=view.root.findByType(ScrollView),bar=view.root.findByType(AppWebScrollbar);
  expect(scroll.props.showsVerticalScrollIndicator).toBe(false);
  expect(bar.props.scrollId).toBe(scroll.props.nativeID);
  expect(bar.props.scrollRef.current).toBe(scroll.instance);
  expect(bar.props.active).toBe(true);
  expect(bar.props.top).toBe(0);expect(bar.props.bottom).toBe(0);
  expect(scroll.props.style.maxHeight).toBe(260);
 }finally{if(view)await act(async()=>view.unmount());Platform.OS=original;}
});

test('scrolling away suspends following and reaching the end resumes it',async()=>{
 const original=Platform.OS;Platform.OS='web';
 let view!:TestRenderer.ReactTestRenderer;
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpAssistantProgress,{run}));});
 const scroll=view.root.findByType(ScrollView),scrollToEnd=jest.spyOn(scroll.instance,'scrollToEnd').mockImplementation(()=>{});
 const event=(y:number)=>({nativeEvent:{contentSize:{height:600},layoutMeasurement:{height:260},contentOffset:{y}}});
 try{
  await act(async()=>scroll.props.onContentSizeChange(600,260));
  expect(scrollToEnd).toHaveBeenCalledTimes(1);
  await act(async()=>scroll.props.onScroll(event(100)));
  await act(async()=>scroll.props.onContentSizeChange(700,260));
  expect(scrollToEnd).toHaveBeenCalledTimes(1);
  await act(async()=>scroll.props.onScroll(event(340)));
  await act(async()=>scroll.props.onContentSizeChange(800,260));
  expect(scrollToEnd).toHaveBeenCalledTimes(2);
 }finally{scrollToEnd.mockRestore();await act(async()=>view.unmount());Platform.OS=original;}
});

test('expanded progress has one processing row below grouped results and retains the grouped row when completed',async()=>{
 const activities:NonNullable<HelpAssistantRun['activities']>=[
  {id:'model',kind:'status',status:'running',label:'ИИ обрабатывает запрос'},
  {id:'check-1',kind:'tool',status:'completed',label:'Получен результат проверки 1С'},
  {id:'check-2',kind:'tool',status:'running',label:'Получен результат проверки 1С'},
 ];
 let view!:TestRenderer.ReactTestRenderer;
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpAssistantProgress,{run:{...run,activities}}));});
 const rows=()=>view.root.findByType(ScrollView).findAll(node=>node.props.item&&typeof node.props.count==='number');
 const text=(node:TestRenderer.ReactTestInstance):string=>node.children.map(child=>typeof child==='string'?child:text(child)).join('');
 try{
  const toggle=view.root.findByProps({testID:'help-ai-work-toggle'});
  expect(text(toggle)).toContain('Ход работы');
  expect(text(toggle)).not.toContain('ИИ обрабатывает запрос');
  expect(rows().map(row=>row.props.item.kind)).toEqual(['tool','status']);
  const grouped=rows()[0];
  expect(text(grouped)).toContain('Получен результат проверки 1С (2)');
  expect(grouped.props.item.status).toBe('running');
  await act(async()=>view.update(React.createElement(HelpAssistantProgress,{run:{...run,eventId:2,activities:activities.map(item=>item.id==='check-2'?{...item,status:'completed'}:item)}})));
  expect(rows()[0]).toBe(grouped);
  expect(grouped.props.item.status).toBe('completed');
  expect(grouped.props.count).toBe(2);
  await act(async()=>toggle.props.onPress());
  expect(text(view.root.findByProps({testID:'help-ai-work-toggle'}))).toContain('ИИ обрабатывает запрос');
  expect(view.root.findAllByType(ScrollView)).toHaveLength(0);
 }finally{await act(async()=>view.unmount());}
});


test('stopped work is not presented as still loading',async()=>{
 let view!:TestRenderer.ReactTestRenderer;
 const activities:NonNullable<HelpAssistantRun['activities']>=[{id:'stopped',kind:'tool',status:'stopped',label:'Проверка остановлена'}];
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpAssistantProgress,{run:{...run,activities}}));});
 try{
  expect(view.root.findByType(ScrollView).findAllByType(ActivityIndicator)).toHaveLength(0);
  expect(view.root.findAll(node=>node.type==='Ionicons'&&node.props.name==='pause-outline')).toHaveLength(1);
 }finally{await act(async()=>view.unmount());}
});
