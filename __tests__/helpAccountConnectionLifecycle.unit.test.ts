let mockAppState:Function;
jest.mock('react-native',()=>({AppState:{currentState:'active',addEventListener:jest.fn((_event,fn)=>{mockAppState=fn;return{remove:jest.fn()};})},Platform:{OS:'android'}}));
jest.mock('../utils/config',()=>({API_BASE_URL:'https://dev.test'}));
jest.mock('@react-native-async-storage/async-storage',()=>({getItem:jest.fn(async()=>null),setItem:jest.fn(async()=>{})}));
let mockReady:Function;
let mockSubscribe: ((ack: Function) => void) | null = null;
const mockRecover = jest.fn();const mockHandlers:Record<string,Function>={};
const mockSocket={connected:true,on:jest.fn((event:string,fn:Function)=>{mockHandlers[event]=fn;}),emit:jest.fn((_event:string,_value:any,ack?:Function)=>_event==='help:subscribe'&&mockSubscribe?mockSubscribe(ack!):ack?.({ok:true}))};
let mockCurrentSocket:any=mockSocket;
const mockDisconnect=jest.fn();
jest.mock('../src/features/help/helpSocket',()=>({createHelpSocket:(_id:number,ready:Function)=>{mockReady=ready;Promise.resolve().then(()=>{ready(mockSocket);mockHandlers.connect?.();});return{getSocket:()=>mockCurrentSocket,disconnect:mockDisconnect,recover:mockRecover};}}));
let mockCursor=0,mockCommitFailure=false;
const mockWrite=jest.fn(async(_scope:string,_changes:any[],cursor?:number)=>{if(mockCommitFailure)throw new Error('Disk failure');if(cursor!==undefined)mockCursor=cursor;});
jest.mock('../src/features/help/helpHistoryDatabase',()=>({readAccountValue:async()=>String(mockCursor),writeAccountChanges:(...args:any[])=>mockWrite(...args),readHistoryRecord:async()=>null,listHistoryRecords:async()=>[],listHistoryTicketIds:async()=>[],removeHistoryTicket:async()=>{},resetHelpDownloadedState:async()=>{},maintainHelpHistory:async()=>({removedMessages:0,evictedTickets:0})}));
jest.mock('../src/features/help/helpStorage',()=>({readHelpPending:async()=>[],helpClientId:()=>Math.random().toString()}));
jest.mock('../src/features/help/helpOutbox',()=>({dispatchHelpPending:jest.fn()}));
const mockApi={events:jest.fn(),sync:jest.fn(),config:jest.fn(),list:jest.fn()};
jest.mock('../src/features/help/helpApi',()=>({createHelpApi:()=>mockApi,HelpApiError:class extends Error{status:number;constructor(message:string,status:number){super(message);this.status=status;}}}));
import {AppState,Platform} from 'react-native';
import {acquireHelpAccount} from '../src/features/help/helpAccountSync';
const event={id:10,ticketId:7,messageId:1,type:'MESSAGE_CREATED',actorId:9,createdAt:new Date().toISOString()};
const result={ticket:{id:7},messages:[],events:[event],deletedMessageIds:[],nextCursor:10,eventCursor:10,snapshotCursor:10,hasMore:false,lastSequence:1,lastReadSequence:0,firstUnreadSequence:1};
beforeEach(()=>{jest.useFakeTimers();AppState.currentState='active';mockSubscribe=null;mockCurrentSocket=mockSocket;mockRecover.mockClear();mockCursor=0;mockCommitFailure=false;mockWrite.mockClear();mockDisconnect.mockClear();Object.keys(mockHandlers).forEach(k=>delete mockHandlers[k]);mockApi.events.mockReset().mockImplementation(async(after:number)=>({events:after<10?[event]:[],nextCursor:Math.max(after,10),hasMore:false}));mockApi.sync.mockReset().mockResolvedValue(result);});
afterEach(()=>jest.useRealTimers());
test('a late observer receives the current connected snapshot after its lease initializes',async()=>{
  const globalLease=acquireHelpAccount(91,()=>{});let lateLease:ReturnType<typeof acquireHelpAccount>|undefined;
  const notices:any[]=[];
  try{
    await globalLease.refresh();
    lateLease=acquireHelpAccount(91,notice=>{if(notice.type==='connected'){expect(lateLease?.getSocket()).toBe(mockSocket);notices.push(notice);}});
    expect(notices).toHaveLength(0);
    await Promise.resolve();
    expect(notices).toEqual([{type:'connected',connected:true}]);
  }finally{lateLease?.release();globalLease.release();}
});
test('an observer released before snapshot delivery is never called after unmount',async()=>{
  const callback=jest.fn(),lease=acquireHelpAccount(92,callback);lease.release();
  await Promise.resolve();await Promise.resolve();expect(callback).not.toHaveBeenCalled();
});

async function flush(){for(let i=0;i<20;i++)await Promise.resolve();}
test('lost subscription ACK never announces ready, times out once and ignores its late reply',async()=>{
  let ack!:Function;mockSubscribe=reply=>{ack=reply;};
  const notices:any[]=[],lease=acquireHelpAccount(93,notice=>notices.push(notice));
  let late:ReturnType<typeof acquireHelpAccount>|undefined;
  try{
    await flush();expect(lease.isConnected()).toBe(false);
    late=acquireHelpAccount(93,notice=>notices.push(notice));await flush();
    expect(notices.filter(n=>n.type==='connected').every(n=>n.connected===false)).toBe(true);
    jest.advanceTimersByTime(5001);await flush();
    expect(mockRecover).toHaveBeenCalledTimes(1);
    ack({ok:true});await flush();expect(lease.isConnected()).toBe(false);
  }finally{late?.release();lease.release();}
  expect(jest.getTimerCount()).toBe(0);
});
test('rejected subscription ACK and repeated recovery taps are coalesced',async()=>{
  mockSubscribe=reply=>reply({ok:false});
  const lease=acquireHelpAccount(94,()=>{});
  try{
    await flush();lease.recover();lease.recover();jest.advanceTimersByTime(1);await flush();
    expect(mockRecover).toHaveBeenCalledTimes(2);expect(lease.isConnected()).toBe(false);
    expect(mockRecover.mock.calls.filter(([arg])=>arg?.replaceConnected)).toHaveLength(1);
    mockHandlers.connect();lease.recover();jest.advanceTimersByTime(4998);await flush();
    expect(mockRecover).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(2);await flush();expect(mockRecover).toHaveBeenCalledTimes(3);
    expect(mockRecover.mock.calls.filter(([arg])=>arg?.replaceConnected)).toHaveLength(2);
  }finally{lease.release();}
});
test('only the replacement socket ACK restores readiness and replays committed events',async()=>{
  const acks:Function[]=[];mockSubscribe=reply=>acks.push(reply);
  const notices:any[]=[],lease=acquireHelpAccount(95,notice=>notices.push(notice));
  try{
    await flush();const oldHandlers={...mockHandlers};const oldAck=acks[0];
    const freshHandlers:Record<string,Function>={};let freshAck!:Function;
    mockCurrentSocket={connected:true,on:(name:string,fn:Function)=>{freshHandlers[name]=fn;},emit:(name:string,_data:any,ack?:Function)=>{if(name==='help:subscribe')freshAck=ack!;else ack?.({ok:true});}};
    mockReady(mockCurrentSocket);freshHandlers.connect();
    oldAck({ok:true});oldHandlers.disconnect();await flush();
    expect(lease.isConnected()).toBe(false);
    const reads=mockApi.events.mock.calls.length;oldHandlers['help:event']({...event,id:11});await flush();
    expect(mockApi.events).toHaveBeenCalledTimes(reads);
    freshAck({ok:true});await flush();
    expect(lease.isConnected()).toBe(true);expect(mockApi.events.mock.calls.length).toBeGreaterThan(reads);
    expect(mockApi.events).toHaveBeenLastCalledWith(10);
    expect(notices.filter(n=>n.type==='connected'&&n.connected)).toHaveLength(1);
    oldHandlers.disconnect();expect(lease.isConnected()).toBe(true);
  }finally{lease.release();}
});
test('foreground health probe detects a half-open socket without waiting for a transport close',async()=>{
  const lease=acquireHelpAccount(96,()=>{});
  try{
    await flush();expect(lease.isConnected()).toBe(true);
    mockSubscribe=()=>{};
    jest.advanceTimersByTime(15000);await flush();expect(lease.isConnected()).toBe(true);
    jest.advanceTimersByTime(5001);await flush();
    expect(lease.isConnected()).toBe(false);expect(mockRecover).toHaveBeenCalledTimes(1);
  }finally{lease.release();}
});

test('background cancels probe and recovery, and release fences all pending ACKs',async()=>{
  let ack!:Function;mockSubscribe=reply=>{ack=reply;};
  const notices:any[]=[],lease=acquireHelpAccount(97,notice=>notices.push(notice));
  try{
    await flush();AppState.currentState='background';mockAppState();
    jest.advanceTimersByTime(20000);await flush();expect(mockRecover).not.toHaveBeenCalled();
    ack({ok:true});expect(lease.isConnected()).toBe(false);
    AppState.currentState='active';mockAppState();await flush();
    lease.release();const count=notices.length;ack({ok:true});await flush();
    expect(notices).toHaveLength(count);expect(jest.getTimerCount()).toBe(0);
  }finally{lease.release();}
});

test('a detached socket still announces disconnect before its replacement exists',async()=>{
  const notices:any[]=[],lease=acquireHelpAccount(98,notice=>notices.push(notice));
  try{
    await flush();expect(lease.isConnected()).toBe(true);
    mockCurrentSocket=null;mockHandlers.disconnect();
    expect(lease.isConnected()).toBe(false);
    expect(notices.filter(n=>n.type==='connected').at(-1)).toEqual({type:'connected',connected:false});
  }finally{lease.release();}
});
test('successful subscription cancels a queued recovery instead of dropping a repaired socket',async()=>{
  const lease=acquireHelpAccount(99,()=>{});
  try{
    await flush();mockSubscribe=reply=>reply({ok:false});
    mockHandlers.connect();jest.advanceTimersByTime(1);await flush();
    expect(mockRecover).toHaveBeenCalledTimes(1);
    mockHandlers.connect();mockSubscribe=null;mockHandlers.connect();await flush();
    expect(lease.isConnected()).toBe(true);
    jest.advanceTimersByTime(5001);await flush();expect(mockRecover).toHaveBeenCalledTimes(1);
  }finally{lease.release();}
});

test.each(['android','web'] as const)('%s resume verifies ACK promptly, coalesces focus/online, and preserves the cursor',async platform=>{
  const priorPlatform=Platform.OS,doc=Object.getOwnPropertyDescriptor(globalThis,'document'),win=Object.getOwnPropertyDescriptor(globalThis,'window');
  const listeners=new Map<string,Set<Function>>();let visibility='visible';
  const dispatch=(name:string)=>listeners.get(name)?.forEach(fn=>fn());
  Platform.OS=platform;
  if(platform==='web'){
    const target={addEventListener:(name:string,fn:Function)=>{const set=listeners.get(name)??new Set();set.add(fn);listeners.set(name,set);},removeEventListener:(name:string,fn:Function)=>{const set=listeners.get(name);set?.delete(fn);if(!set?.size)listeners.delete(name);}};
    Object.defineProperty(globalThis,'document',{configurable:true,value:{...target,visibilityState:visibility}});
    Object.defineProperty(globalThis,'window',{configurable:true,value:target});
  }
  const lease=acquireHelpAccount(100,()=>{});
  const change=(active:boolean)=>{visibility=active?'visible':'hidden';AppState.currentState=active?'active':'background';if(platform==='web'){(document as any).visibilityState=visibility;dispatch('visibilitychange');}else mockAppState();};
  try{
    await lease.refresh();await flush();expect(lease.getConnectionState()).toEqual({transport:'ready',sync:'idle'});
    change(false);expect(lease.getConnectionState().transport).toBe('paused');
    jest.advanceTimersByTime(60000);await flush();expect(mockRecover).not.toHaveBeenCalled();
    let reply!:Function;mockSubscribe=ack=>{reply=ack;};
    change(true);dispatch('focus');dispatch('online');await flush();
    expect(mockRecover).toHaveBeenCalledTimes(1);expect(mockRecover).toHaveBeenCalledWith({reason:'foreground'});
    expect(lease.getConnectionState().transport).toBe('checking');
    expect(mockApi.events).toHaveBeenLastCalledWith(10);
    jest.advanceTimersByTime(3001);await flush();
    expect(mockRecover).toHaveBeenLastCalledWith({reason:'subscription',replaceConnected:true});
    expect(lease.getConnectionState().transport).toBe('offline');
    reply({ok:true});expect(lease.isConnected()).toBe(false);
    expect(mockCursor).toBe(10);
  }finally{
    lease.release();Platform.OS=priorPlatform;
    if(doc)Object.defineProperty(globalThis,'document',doc);else Reflect.deleteProperty(globalThis,'document');
    if(win)Object.defineProperty(globalThis,'window',win);else Reflect.deleteProperty(globalThis,'window');
  }
  expect(listeners.size).toBe(0);expect(jest.getTimerCount()).toBe(0);
});

test('sync failure preserves acknowledged transport and cursor; a retry clears only after durable commit',async()=>{
  const lease=acquireHelpAccount(101,()=>{});
  try{
    await lease.refresh();await flush();
    mockApi.events.mockRejectedValueOnce(new Error('Network request failed'));
    await expect(lease.refresh()).rejects.toThrow('Network request failed');
    expect(lease.isConnected()).toBe(true);expect(lease.getConnectionState()).toEqual({transport:'ready',sync:'error'});expect(mockCursor).toBe(10);
    let resolve!:Function;mockApi.events.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
    const retry=lease.refresh();await flush();
    expect(lease.getConnectionState()).toEqual({transport:'ready',sync:'syncing'});
    resolve({events:[],nextCursor:11,hasMore:false});await retry;
    expect(mockCursor).toBe(11);expect(lease.getConnectionState()).toEqual({transport:'ready',sync:'idle'});
    expect(mockRecover).not.toHaveBeenCalled();
  }finally{lease.release();}
});

test('resume joined to a pre-sleep request gets one fresh replay after that request fails',async()=>{
  const lease=acquireHelpAccount(102,()=>{});
  try{
    await lease.refresh();await flush();
    let reject!:Function;mockApi.events.mockImplementationOnce(()=>new Promise((_resolve,fail)=>{reject=fail;}));
    const old=lease.refresh().catch(()=>{});await flush();const count=mockApi.events.mock.calls.length;
    AppState.currentState='background';mockAppState();
    AppState.currentState='active';mockAppState();await flush();
    expect(mockApi.events).toHaveBeenCalledTimes(count);
    reject(new Error('Request timed out'));await old;await flush();
    expect(mockApi.events).toHaveBeenCalledTimes(count+1);
    expect(mockApi.events).toHaveBeenLastCalledWith(10);expect(mockCursor).toBe(10);
    expect(lease.getConnectionState()).toEqual({transport:'ready',sync:'idle'});
  }finally{lease.release();}
});
