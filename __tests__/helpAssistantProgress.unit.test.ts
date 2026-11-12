import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {Platform,ScrollView} from 'react-native';
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
