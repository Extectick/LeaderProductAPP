import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
jest.mock('../src/features/help/helpDiagnostics',()=>({helpDevState:jest.fn(),helpDevActions:()=>()=>{}}));
jest.mock('../qa/help-preview/HelpPreview',()=>{
  const owner={id:101,name:'Вы',avatarUrl:null},it={id:202,name:'IT',avatarUrl:null};
  const message=(id:number,text:string,own=false,extra={})=>({id,ticketId:1042,sequence:id,text,authorId:own?101:202,author:own?owner:it,authorRole:own?'USER':'IT',kind:'TEXT',clientMessageId:null,createdAt:'2026-10-30T10:00:00Z',editedAt:null,replyToId:null,replyTo:null,forwardedFromId:null,rating:null,attachments:[],reactions:[],...extra});
  return {OWNER:owner,IT:it,message,fixtures:[message(1,'Пример')],resolve:jest.fn()};
});
import { useHelpService } from '../qa/help-preview/serviceFixture';
import { supersedeFixtureAssistantRuns } from '../qa/help-preview/assistantFixture';
import type { HelpMessage } from '../src/features/help/helpApi';

test('a correction keeps the task and original context, retires old progress, and starts below the new input',async()=>{
  jest.useFakeTimers();
  let service!:ReturnType<typeof useHelpService>,view!:TestRenderer.ReactTestRenderer;
  function Harness(){service=useHelpService();return null;}
  try {
    await act(async()=>{view=TestRenderer.create(React.createElement(Harness));});
    await act(async()=>{await service.createTicket({text:'Не печатает принтер'});});
    const old=service.messages.at(-1)!;
    await act(async()=>{await service.sendMessage(1043,{text:'Бумага есть, ошибка подключения USB'});});
    const current=service.messages.at(-1)!,retired=service.messages.find(row=>row.id===old.id)!;
    expect(retired.assistantRun).toMatchObject({status:'stopped',stopReason:'superseded'});
    expect(current.assistantRun).toMatchObject({taskId:old.assistantRun!.taskId,contextMessageCount:2,taskStartSequence:1,status:'thinking'});
    expect(current.assistantRun!.runId).not.toBe(old.assistantRun!.runId);
    expect(service.messages.at(-2)!.text).toBe('Бумага есть, ошибка подключения USB');
    expect(current.sequence).toBe(service.messages.at(-2)!.sequence+1);
    expect(service.messages.filter(row=>row.assistantRun&&['thinking','streaming'].includes(row.assistantRun.status))).toHaveLength(1);
    await act(async()=>{service.assistantPreview.stop(1043,current.assistantRun!.runId);jest.runAllTimers();});
    expect(service.messages.at(-1)!.assistantRun!.status).toBe('stopped');
    await act(async()=>service.assistantPreview.retry(1043,current.assistantRun!.runId));
    await act(async()=>jest.runAllTimers());
    expect(service.messages.at(-1)!.text).toContain('модель принтера');
    expect(service.messages.at(-1)!.assistantRun).toMatchObject({status:'completed',contextMessageCount:2});
  } finally {
    if(view)await act(async()=>view.unmount());
    jest.clearAllTimers();jest.useRealTimers();
  }
});

test('an orphaned progress row is superseded even after its native fixture timer disappeared',()=>{
  const old={id:2,text:'',assistantRun:{runId:'old',ticketId:1043,eventId:3,status:'thinking',step:1,completedSteps:1,startedAt:0,updatedAt:0}} as HelpMessage;
  expect(supersedeFixtureAssistantRuns([old])[0].assistantRun).toMatchObject({status:'stopped',stopReason:'superseded',eventId:4});
  expect(old.assistantRun!.status).toBe('thinking');
});
