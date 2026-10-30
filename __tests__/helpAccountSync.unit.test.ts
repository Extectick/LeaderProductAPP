jest.mock('react-native',()=>({AppState:{currentState:'active',addEventListener:jest.fn(()=>({remove:jest.fn()}))},Platform:{OS:'android'}}));
jest.mock('../utils/config',()=>({API_BASE_URL:'https://dev.test'}));
jest.mock('@react-native-async-storage/async-storage',()=>({getItem:jest.fn(async()=>null),setItem:jest.fn(async()=>{})}));
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
test('one account owns a single socket; historical replay persists but does not show startup banners',async()=>{
  const notices:any[]=[];const first=acquireHelpAccount(5,n=>notices.push(n)),second=acquireHelpAccount(5,n=>notices.push(n));
  try{await first.refresh();expect(first.getSocket()).toBe(second.getSocket());expect(mockCursor).toBe(10);expect(notices.filter(n=>n.type==='event')).toHaveLength(0);
    first.release();expect(mockDisconnect).not.toHaveBeenCalled();second.release();expect(mockDisconnect).toHaveBeenCalledTimes(1);
  }finally{first.release();second.release();}
});
test('a failed SQLite commit leaves account cursor behind and next replay repairs it',async()=>{
  mockCommitFailure=true;const connection=acquireHelpAccount(6,()=>{});
  try{await expect(connection.refresh()).rejects.toThrow('Disk failure');expect(mockCursor).toBe(0);
    mockCommitFailure=false;await connection.refresh();expect(mockCursor).toBe(10);
  }finally{connection.release();}
});
test('ticket requests share one in-flight sync and a fresh socket event is presented after commit',async()=>{
  const notices:any[]=[];const connection=acquireHelpAccount(7,n=>notices.push(n));
  try{await connection.refresh();mockApi.sync.mockClear();let complete!:(value:any)=>void;mockApi.sync.mockReturnValueOnce(new Promise(done=>{complete=done;}));
    const a=connection.syncTicket(99),b=connection.syncTicket(99);await Promise.resolve();await Promise.resolve();expect(mockApi.sync).toHaveBeenCalledTimes(1);complete({...result,ticket:{id:99}});await Promise.all([a,b]);
    const latest={...event,id:11};mockApi.events.mockImplementation(async(after:number)=>({events:after<11?[latest]:[],nextCursor:11,hasMore:false}));
    mockHandlers['help:event'](latest);await connection.refresh();expect(mockCursor).toBe(11);expect(notices.filter(n=>n.type==='event').map(n=>n.event.id)).toEqual([11]);
  }finally{connection.release();}
});
