jest.mock('react-native',()=>({AppState:{currentState:'active',addEventListener:jest.fn(()=>({remove:jest.fn()}))},Platform:{OS:'android'}}));
jest.mock('../utils/config',()=>({API_BASE_URL:'https://dev.test'}));
const mockStorage=new Map<string,string>();
jest.mock('@react-native-async-storage/async-storage',()=>({getItem:jest.fn(async(key:string)=>mockStorage.get(key)??null),setItem:jest.fn(async(key:string,value:string)=>{mockStorage.set(key,value);})}));
let mockReady:Function;const mockHandlers:Record<string,Function>={};
const mockSocket={connected:true,on:jest.fn((event:string,fn:Function)=>{mockHandlers[event]=fn;}),emit:jest.fn((_event:string,_value:any,ack?:Function)=>ack?.({ok:true}))};
const mockDisconnect=jest.fn();
jest.mock('../src/features/help/helpSocket',()=>({createHelpSocket:(_id:number,ready:Function)=>{mockReady=ready;Promise.resolve().then(()=>{ready(mockSocket);mockHandlers.connect?.();});return{getSocket:()=>mockSocket,disconnect:mockDisconnect};}}));
let mockCursor=0,mockCommitFailure=false;
const mockWrite=jest.fn(async(_scope:string,_changes:any[],cursor?:number)=>{if(mockCommitFailure)throw new Error('Disk failure');if(cursor!==undefined)mockCursor=cursor;});
jest.mock('../src/features/help/helpHistoryDatabase',()=>({readAccountValue:async()=>String(mockCursor),writeAccountChanges:(...args:any[])=>mockWrite(...args),readHistoryRecord:async()=>null,listHistoryRecords:async()=>[],removeHistoryTicket:async()=>{},resetHelpDownloadedState:async()=>{},maintainHelpHistory:async()=>({removedMessages:0,evictedTickets:0})}));
jest.mock('../src/features/help/helpStorage',()=>({readHelpPending:async()=>[],helpClientId:()=>Math.random().toString()}));
jest.mock('../src/features/help/helpOutbox',()=>({dispatchHelpPending:jest.fn()}));
const mockApi={events:jest.fn(),sync:jest.fn(),config:jest.fn(),list:jest.fn()};
jest.mock('../src/features/help/helpApi',()=>({createHelpApi:()=>mockApi,HelpApiError:class extends Error{status:number;constructor(message:string,status:number){super(message);this.status=status;}}}));
import {acquireHelpAccount} from '../src/features/help/helpAccountSync';
const event={id:10,ticketId:7,messageId:1,type:'MESSAGE_CREATED',actorId:9,createdAt:new Date().toISOString()};
const result={ticket:{id:7},messages:[],events:[event],deletedMessageIds:[],nextCursor:10,eventCursor:10,snapshotCursor:10,hasMore:false,lastSequence:1,lastReadSequence:0,firstUnreadSequence:1};
beforeEach(()=>{jest.useFakeTimers();mockCursor=0;mockCommitFailure=false;mockWrite.mockClear();mockDisconnect.mockClear();Object.keys(mockHandlers).forEach(k=>delete mockHandlers[k]);mockApi.events.mockReset().mockImplementation(async(after:number)=>({events:after<10?[event]:[],nextCursor:Math.max(after,10),hasMore:false}));mockApi.sync.mockReset().mockResolvedValue(result);});
afterEach(()=>jest.useRealTimers());

import {emitPushRegistrationChanged} from '../utils/pushRegistrationEvents';
async function settle(){for(let i=0;i<80;i++)await Promise.resolve();}
test('token persistence, rotation and removal refresh presence immediately without waiting for the heartbeat',async()=>{
  mockStorage.clear();mockSocket.emit.mockClear();const lease=acquireHelpAccount(93,()=>{});
  try{
    await lease.refresh();await settle();
    mockStorage.set('pushToken','synthetic-first-token');emitPushRegistrationChanged();await settle();
    let presence=mockSocket.emit.mock.calls.filter(([event])=>event==='help:presence');expect(presence.at(-1)?.[1].pushToken).toBe('synthetic-first-token');
    mockStorage.set('pushToken','synthetic-rotated-token');emitPushRegistrationChanged();await settle();
    presence=mockSocket.emit.mock.calls.filter(([event])=>event==='help:presence');expect(presence.at(-1)?.[1].pushToken).toBe('synthetic-rotated-token');
    mockStorage.delete('pushToken');emitPushRegistrationChanged();await settle();
    presence=mockSocket.emit.mock.calls.filter(([event])=>event==='help:presence');expect(presence.at(-1)?.[1].pushToken).toBeUndefined();
    lease.release();const after=mockSocket.emit.mock.calls.length;emitPushRegistrationChanged();await settle();expect(mockSocket.emit.mock.calls).toHaveLength(after);
  }finally{lease.release();}
});
