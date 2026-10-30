import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
jest.mock('../src/features/help/helpDiagnostics', () => ({helpDevState:jest.fn(),helpDevActions:()=>()=>{}}));
jest.mock('../qa/help-preview/HelpPreview', () => {
  const owner={id:101,name:'Вы',avatarUrl:null},it={id:202,name:'IT',avatarUrl:null};
  const message=(id:number,text:string,own=false,extra={})=>({id,ticketId:1042,sequence:id,text,authorId:own?101:202,author:own?owner:it,authorRole:own?'USER':'IT',kind:'TEXT',clientMessageId:null,createdAt:'2026-10-30T10:00:00.000Z',editedAt:null,replyToId:null,replyTo:null,forwardedFromId:null,rating:null,attachments:[],reactions:[],...extra});
  return {OWNER:owner,IT:it,message,fixtures:[message(1,'Старое сообщение IT')],resolve:jest.fn()};
});
import { useHelpService } from '../qa/help-preview/serviceFixture';

describe('new ticket assistant integration in the QA service',()=>{
  let service:ReturnType<typeof useHelpService>,view:TestRenderer.ReactTestRenderer;
  function Harness(){service=useHelpService();return null;}
  beforeEach(async()=>{jest.useFakeTimers();await act(async()=>{view=TestRenderer.create(React.createElement(Harness));});});
  afterEach(async()=>{await act(async()=>view.unmount());jest.clearAllTimers();jest.useRealTimers();});
  test('first send creates a clean ticket, one assistant identity and an eventual answer',async()=>{
    await act(async()=>{await service.createTicket({text:'Принтер не печатает уже час. Помогите разобраться.'});});
    expect(service.selectedTicket).toMatchObject({id:1043,number:1043,title:'Не печатает принтер',status:'OPEN',itRequested:false,members:[]});
    expect(service.messages).toHaveLength(2);
    expect(service.messages[0]).toMatchObject({authorId:101,ticketId:1043});
    expect(service.messages[1]).toMatchObject({authorId:303,assistantRun:{ticketId:1043,status:'thinking'}});
    await act(async()=>jest.runAllTimers());
    expect(service.messages).toHaveLength(2);
    expect(service.messages[1]).toMatchObject({assistantRun:{status:'completed',completedSteps:4}});
    expect(service.messages[1].text).toContain('модель принтера');
  });
  test('background tickets keep their own history and events',async()=>{
    await act(async()=>{await service.createTicket({text:'Первый вопрос'});});
    await act(async()=>{service.assistantPreview.setScenario('question');});
    await act(async()=>{await service.createTicket({text:'Второй вопрос'});});
    await act(async()=>jest.runAllTimers());
    expect(service.selectedTicket?.id).toBe(1044);
    expect(service.messages[1].text).toContain('Уточните');
    await act(async()=>{await service.openTicket(1043);});
    expect(service.messages[0].text).toBe('Первый вопрос');
    expect(service.messages[1].text).not.toContain('Уточните');
    expect(service.messages.every(row=>row.ticketId===1043)).toBe(true);
  });
  test('error retry replaces the same row and stop prevents late events',async()=>{
    await act(async()=>{service.assistantPreview.setScenario('error');});
    await act(async()=>{await service.createTicket({text:'Ошибка печати'});});
    await act(async()=>jest.runAllTimers());
    const row=service.messages[1];expect(row.assistantRun?.status).toBe('error');
    await act(async()=>{service.assistantPreview.retry(1043,row.assistantRun!.runId);});
    expect(service.messages[1].id).toBe(row.id);
    expect(service.messages[1].assistantRun?.runId).not.toBe(row.assistantRun?.runId);
    await act(async()=>{service.assistantPreview.stop(1043,service.messages[1].assistantRun!.runId);jest.runAllTimers();});
    expect(service.messages[1].assistantRun?.status).toBe('stopped');
    expect(service.messages).toHaveLength(2);
  });
});
