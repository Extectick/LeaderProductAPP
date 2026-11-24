import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {useServerSchedules} from '../src/features/help/schedules/useServerSchedules';
import {parseHelpPush} from '../src/features/help/helpPush';
import {scheduleApi} from '../src/features/help/schedules/api';

jest.mock('../src/features/help/helpApi',()=>({helpRequest:jest.fn()}));
jest.mock('expo-router/react-navigation',()=>({useIsFocused:()=>true}));
jest.mock('expo',()=>({uuid:{v4:()=>require('node:crypto').randomUUID()}}));
const request=jest.requireMock('../src/features/help/helpApi').helpRequest as jest.Mock;
const task={id:'task-1',ticketId:73,messageId:18,time:'12:00',timeZone:'Asia/Novosibirsk',warehouse:'all',metric:'inStock' as const,
  active:true,due:1000,runs:[],hasMoreRuns:false};
const draft={time:task.time,timeZone:task.timeZone,warehouse:task.warehouse,metric:task.metric};
const list={tasks:[task],decisions:{},activeTaskCount:1,unreadTaskCount:0};
let screen:TestRenderer.ReactTestRenderer | undefined;
let state:ReturnType<typeof useServerSchedules>;
function Sample(){state=useServerSchedules(42);return null;}
beforeEach(()=>request.mockReset());
afterEach(async()=>{if(screen)await act(async()=>screen?.unmount());screen=undefined;});
test('binds every schedule action to the signed-in account and the original assistant proposal',async()=>{
  request.mockResolvedValue({});
  const api=scheduleApi(42);
  await api.add(73,18,draft);await api.read(['r1']);await api.runs('task 1','run/2');await api.reports('run/3');
  expect(request.mock.calls).toEqual([
    ['/schedules','POST',{ticketId:73,messageId:18,...draft},42],
    ['/schedules/read','POST',{ids:['r1']},42],
    ['/schedules/task%201/runs?before=run%2F2','GET',undefined,42],
    ['/schedules/reports?before=run%2F3','GET',undefined,42],
  ]);
});
test('requires a valid recipient and report target for a schedule notification',()=>{
  const push={type:'HELP_SCHEDULE_REPORT',ticketId:73,scheduleId:'task-1',runId:'run-2',recipientUserId:42};
  expect(parseHelpPush(push)).toEqual({ticketId:73,scheduleId:'task-1',runId:'run-2',recipientUserId:42});
  expect(parseHelpPush({...push,runId:'../other'})).toBeNull();
  expect(parseHelpPush({...push,recipientUserId:0})).toBeNull();
});
test('uses server counters and retries an uncertain manual run with its original request ID',async()=>{
  let uncertain=true;
  request.mockImplementation(async(path:string)=>{
    if(path==='/schedules')return list;
    if(path==='/schedules/task-1/run' && uncertain){uncertain=false;throw new Error('network');}
    return {ok:true};
  });
  await act(async()=>{screen=TestRenderer.create(React.createElement(Sample));});
  expect(state.loaded).toBe(true);
  expect(state.state.activeTaskCount).toBe(1);
  await act(async()=>{await expect(state.check(task.id)).rejects.toThrow('network');await state.check(task.id);});
  const calls=request.mock.calls.filter(([path])=>path.endsWith('/run'));
  expect(calls).toHaveLength(2);expect(calls[0][2].requestId).toMatch(/^[\da-f-]{36}$/);
  expect(calls[1][2]).toEqual(calls[0][2]);
});
