import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
jest.mock('react-native',()=>({Platform:{OS:'android'},AppState:{currentState:'active',addEventListener:jest.fn(()=>({remove:jest.fn()}))}}));
jest.mock('../context/AuthContext',()=>({AuthContext:require('react').createContext({profile:{id:5},isAuthenticated:true})}));
jest.mock('../utils/config',()=>({API_BASE_URL:'https://dev.example.test'}));
let mockOnline=true;
jest.mock('../src/shared/network/useServerStatus',()=>({useServerStatus:()=>({isReachable:mockOnline})}));
const mockHandlers:Record<string,Function>={};
jest.mock('../src/features/help/helpSocket',()=>({createHelpSocket:(_:number,ready:Function)=>{const socket={emit:jest.fn(),on:(key:string,fn:Function)=>{mockHandlers[key]=fn;}};ready(socket);return{disconnect:jest.fn(),getSocket:()=>socket};}}));
jest.mock('@react-native-async-storage/async-storage',()=>{const values=new Map<string,string>();return{getItem:jest.fn(async(key:string)=>values.get(key)??null),setItem:jest.fn(async(key:string,value:string)=>{values.set(key,value);}),removeItem:jest.fn(async(key:string)=>{values.delete(key);}),clear:jest.fn(async()=>values.clear()),getAllKeys:jest.fn(async()=>[...values.keys()]),multiGet:jest.fn(async(keys:string[])=>keys.map(key=>[key,values.get(key)??null]))};});
jest.mock('../src/features/help/helpHistoryDatabase',()=>require('../src/features/help/helpHistoryDatabase.web'));
const mockApi={config:jest.fn(),list:jest.fn(),detail:jest.fn(),read:jest.fn(),sync:jest.fn(),messages:jest.fn(),search:jest.fn(),date:jest.fn()};
jest.mock('../src/features/help/helpApi',()=>({createHelpApi:()=>mockApi,HelpApiError:class extends Error{status:number;code?:string;constructor(message:string,status=0,code?:string){super(message);this.status=status;this.code=code;}},loadHelpMedia:jest.fn(),uploadHelpFiles:jest.fn()}));
jest.mock('../src/features/help/helpStorage',()=>({readHelpPending:jest.fn(async()=>[]),getHelpDraft:jest.fn(),setHelpDraft:jest.fn()}));
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useHelpService} from '../src/features/help/useHelpService';
import {cacheHelpPage,readCachedHelpTicket,saveHelpViewport} from '../src/features/help/helpHistory';
import {helpLocalDayBounds} from '../src/features/help/helpDateNavigation';
import {HelpApiError} from '../src/features/help/helpApi';
import type {HelpMessage,HelpTicket} from '../src/features/help/helpApi';
import type {HelpHistoryPage,HelpHistoryQuery} from '../src/features/help/helpHistoryTypes';
const msg=(sequence:number,ticketId=7)=>({id:ticketId*10000+sequence,ticketId,sequence,text:`Message ${sequence}`,authorId:9} as HelpMessage);
const ticket=(id=7,last=200)=>({id,title:'Support',status:'OPEN',members:[{userId:5}],unreadCount:0,lastReadSequence:200,lastSequence:last,lastMessage:msg(last,id),updatedAt:'2026-10-28T00:00:00Z'} as HelpTicket);
function page(from:number,to:number,id=7,last=200):HelpHistoryPage{return{messages:Array.from({length:Math.max(0,to-from+1)},(_,i)=>msg(from+i,id)),nextCursor:from>1?from:null,olderCursor:from>1?from:null,newerCursor:to<last?to:null,hasOlder:from>1,hasNewer:to<last,lastReadSequence:200,firstUnreadSequence:null,lastSequence:last,eventCursor:10,snapshotCursor:10};}
let service:ReturnType<typeof useHelpService>,screen:TestRenderer.ReactTestRenderer;
const newerStates:boolean[]=[];
function Harness(){service=useHelpService(true);newerStates.push(service.hasNewer);return null;}
async function render(){await act(async()=>{screen=TestRenderer.create(React.createElement(Harness));});}
async function open(id=7){await act(async()=>{await service.openTicket(id);await service.refresh();});}
beforeEach(async()=>{
  mockOnline=true;await AsyncStorage.clear();Object.keys(mockHandlers).forEach(key=>delete mockHandlers[key]);
  mockApi.config.mockReset().mockResolvedValue({canManage:false});mockApi.list.mockReset().mockResolvedValue({tickets:[],nextCursor:null});
  mockApi.detail.mockReset().mockImplementation(async(id:number)=>({ticket:ticket(id),...page(101,200,id)}));
  mockApi.read.mockReset().mockResolvedValue({});mockApi.search.mockReset().mockResolvedValue({messages:[],total:0,nextCursor:null});
  mockApi.date.mockReset().mockResolvedValue({messageId:70150,sequence:150});
  mockApi.sync.mockReset().mockImplementation(async(id:number,after:number)=>({ticket:ticket(id),events:[],messages:[],deletedMessageIds:[],nextCursor:Math.max(10,after),eventCursor:10,snapshotCursor:10,hasMore:false,lastSequence:200,lastReadSequence:200,firstUnreadSequence:null}));
  mockApi.messages.mockReset().mockImplementation(async(id:number,query:HelpHistoryQuery={})=>query.before?page(Math.max(1,query.before-100),query.before-1,id):query.after?page(query.after+1,Math.min(200,query.after+100),id):query.around?page(Math.max(1,query.around-40),Math.min(200,query.around+59),id):page(101,200,id));
});
afterEach(async()=>{if(screen)await act(async()=>screen.unmount());});
test('saved message and offset open an older window; snapshot fetching never marks it read',async()=>{
  await cacheHelpPage(5,ticket(),page(1,100));await saveHelpViewport(5,7,{messageId:70080,sequence:80,offset:-17,atLatest:false});
  await render();await open();
  expect(service.navigationTarget).toMatchObject({kind:'anchor',sequence:80,offset:-17});
  expect(service.messages.some(message=>message.sequence===80)).toBe(true);expect(service.hasNewer).toBe(true);expect(mockApi.read).not.toHaveBeenCalled();
});
test('cached older and newer pages remain navigable without the network',async()=>{
  await cacheHelpPage(5,ticket(),page(1,100));await cacheHelpPage(5,ticket(),page(101,200));
  mockOnline=false;mockApi.detail.mockRejectedValue(new Error('offline'));mockApi.sync.mockRejectedValue(new Error('offline'));
  await render();await open();mockApi.messages.mockClear();
  await act(async()=>{await service.loadOlder();});
  expect(service.messages[0].sequence).toBeLessThan(101);expect(mockApi.messages).not.toHaveBeenCalled();
});
test('late opening response cannot replace a cached window after the reader moved',async()=>{
  await cacheHelpPage(5,ticket(),page(1,100));await cacheHelpPage(5,ticket(),page(101,200));
  let resolve!:(value:unknown)=>void;mockApi.detail.mockReturnValueOnce(new Promise(done=>{resolve=done;}));
  await render();let opening!:Promise<unknown>;
  await act(async()=>{opening=service.openTicket(7);});
  const key=service.navigationTarget?.key;
  await act(async()=>{await service.saveViewport({messageId:70150,sequence:150,offset:-24,atLatest:false},7);});
  await act(async()=>{resolve({ticket:ticket(),...page(101,200)});await opening;await service.refresh();});
  expect(service.navigationTarget?.key).toBe(key);expect((await readCachedHelpTicket(5,7))?.record.anchor).toMatchObject({sequence:150,offset:-24});
});
test('an old screen save cannot overwrite the newly opened ticket anchor',async()=>{
  await render();await open(7);await open(8);
  await act(async()=>{await service.saveViewport({messageId:70150,sequence:150,offset:22,atLatest:false},7);});
  expect((await readCachedHelpTicket(5,7))?.record.anchor?.sequence).toBe(150);
  expect((await readCachedHelpTicket(5,8))?.record.anchor).toBeNull();
});
test('pending read for a previous ticket does not block the new ticket receipt',async()=>{
  mockApi.detail.mockImplementation(async(id:number)=>({ticket:{...ticket(id),lastReadSequence:0},...page(101,200,id),lastReadSequence:0}));
  mockApi.sync.mockImplementation(async(id:number)=>({ticket:{...ticket(id),lastReadSequence:0},events:[],messages:[],deletedMessageIds:[],nextCursor:10,eventCursor:10,snapshotCursor:10,hasMore:false,lastSequence:200,lastReadSequence:0,firstUnreadSequence:null}));
  await render();await open(7);let resolve!:()=>void;
  mockApi.read.mockReturnValueOnce(new Promise<void>(done=>{resolve=done;}));
  let pending!:Promise<void>;await act(async()=>{pending=service.markVisibleRead(150);});
  await open(8);await act(async()=>{await service.markVisibleRead(150);});
  expect(mockApi.read).toHaveBeenCalledWith(8,150);await act(async()=>{resolve();await pending;});
});
test('socket arrival updates history cache and badge without joining a disconnected tail',async()=>{
  await render();await open();await act(async()=>{await service.saveViewport({messageId:70150,sequence:150,offset:8,atLatest:false},7);});
  const key=service.navigationTarget?.key;
  mockApi.sync.mockResolvedValue({ticket:{...ticket(7,201),unreadCount:1},events:[{id:11}],messages:[msg(201)],deletedMessageIds:[],nextCursor:11,eventCursor:11,snapshotCursor:11,hasMore:false,lastSequence:201,lastReadSequence:200,firstUnreadSequence:201});
  await act(async()=>{mockHandlers['help:event']({ticketId:7});await service.refresh();});
  expect(service.messages.at(-1)?.sequence).toBe(200);expect(service.hasNewer).toBe(true);expect(service.selectedTicket?.unreadCount).toBe(1);expect(service.navigationTarget?.key).toBe(key);
  expect((await readCachedHelpTicket(5,7))?.record.lastSequence).toBe(201);
});
test('live arrival while following the tail never transiently disables follow with hasNewer',async()=>{
  await render();await open();await act(async()=>{await service.saveViewport({messageId:70200,sequence:200,offset:0,atLatest:true},7);});
  newerStates.length=0;
  mockApi.sync.mockResolvedValue({ticket:ticket(7,201),events:[{id:11}],messages:[msg(201)],deletedMessageIds:[],nextCursor:11,eventCursor:11,snapshotCursor:11,hasMore:false,lastSequence:201,lastReadSequence:200,firstUnreadSequence:201});
  mockApi.messages.mockResolvedValue(page(201,201,7,201));
  await act(async()=>{mockHandlers['help:event']({ticketId:7});await service.refresh();});
  expect(service.messages.at(-1)?.sequence).toBe(201);expect(newerStates.every(value=>value===false)).toBe(true);
});
test('event arriving during an in-flight replay triggers a second replay',async()=>{
  await render();await open();mockApi.sync.mockClear();
  let resolve!:(value:unknown)=>void;mockApi.sync.mockReturnValueOnce(new Promise(done=>{resolve=done;}));
  await act(async()=>{mockHandlers['help:event']({ticketId:7});});
  await act(async()=>{mockHandlers['help:event']({ticketId:7});});
  await act(async()=>{resolve({ticket:ticket(),events:[],messages:[],deletedMessageIds:[],nextCursor:10,eventCursor:10,snapshotCursor:10,hasMore:false,lastSequence:200,lastReadSequence:200,firstUnreadSequence:null});await service.refresh();});
  expect(mockApi.sync.mock.calls.length).toBeGreaterThanOrEqual(2);
});
test('active history trims only after idle anchor save and explicitly restores the fresh anchor',async()=>{
  mockApi.detail.mockResolvedValue({ticket:ticket(7,800),...page(701,800,7,800)});
  mockApi.sync.mockResolvedValue({ticket:ticket(7,800),events:[],messages:[],deletedMessageIds:[],nextCursor:10,eventCursor:10,snapshotCursor:10,hasMore:false,lastSequence:800,lastReadSequence:200,firstUnreadSequence:null});
  mockApi.messages.mockImplementation(async(id:number,query:HelpHistoryQuery={})=>page(Math.max(1,(query.before??801)-100),(query.before??801)-1,id,800));
  await render();await open();const key=service.navigationTarget?.key;for(let i=0;i<7;i++)await act(async()=>{await service.loadOlder();});
  expect(service.messages).toHaveLength(800);expect(service.navigationTarget?.key).toBe(key);
  await act(async()=>{await service.saveViewport({messageId:70050,sequence:50,offset:-12,atLatest:false},7,{deferTrim:true});});
  expect(service.messages).toHaveLength(800);expect(service.navigationTarget?.key).toBe(key);
  expect((await readCachedHelpTicket(5,7,50))?.record.anchor).toMatchObject({sequence:50,offset:-12});
  await act(async()=>{await service.saveViewport({messageId:70050,sequence:50,offset:-12,atLatest:false},7);});
  expect(service.messages).toHaveLength(600);expect(service.messages[0].sequence).toBe(1);expect(service.hasNewer).toBe(true);
  expect(service.navigationTarget).toMatchObject({kind:'anchor',messageId:70050,sequence:50,offset:-12,animate:false});
  expect(service.navigationTarget?.key).toBeGreaterThan(key!);
  expect((await readCachedHelpTicket(5,7,800))?.page?.messages.some(message=>message.sequence===800)).toBe(true);
});
test('online date lookup sends exact local bounds and navigates without selecting a message',async()=>{
  await render();await open();const bounds=helpLocalDayBounds('2026-10-28');
  const messages=service.messages;mockApi.messages.mockClear();
  await act(async()=>{await service.jumpToDate('2026-10-28');});
  expect(mockApi.date).toHaveBeenCalledWith(7,bounds.from,bounds.to);expect(service.navigationTarget).toMatchObject({kind:'date',messageId:70150,sequence:150});
  expect(service.messages).toBe(messages);expect(mockApi.messages).not.toHaveBeenCalled();
});
test('a day with no messages does not revoke the ticket or delete its cache',async()=>{
  await render();await open();const originalCount=service.messages.length;
  mockApi.date.mockRejectedValue(new HelpApiError('За выбранный день сообщений нет',404,'HELP_DATE_MESSAGE_NOT_FOUND'));
  await act(async()=>{await expect(service.jumpToDate('2026-10-28')).rejects.toMatchObject({code:'HELP_DATE_MESSAGE_NOT_FOUND'});});
  expect(service.selectedTicket?.id).toBe(7);expect(service.messages).toHaveLength(originalCount);expect(await readCachedHelpTicket(5,7)).not.toBeNull();
});
test('a date lookup finishing after switching chats cannot navigate the new chat',async()=>{
  await render();await open();let resolve!:(value:unknown)=>void;mockApi.date.mockReturnValueOnce(new Promise(done=>{resolve=done;}));
  let lookup!:Promise<void>;await act(async()=>{lookup=service.jumpToDate('2026-10-28');});await open(8);const key=service.navigationTarget?.key;
  await act(async()=>{resolve({messageId:70150,sequence:150});await lookup;});expect(service.selectedTicket?.id).toBe(8);expect(service.navigationTarget?.key).toBe(key);
});

test('manual scrolling cancels an outstanding date lookup without changing its current window',async()=>{
  await render();await open();let resolve!:(value:unknown)=>void;
  mockApi.date.mockReturnValueOnce(new Promise(done=>{resolve=done;}));
  const messages=service.messages,key=service.navigationTarget?.key;
  let lookup!:Promise<void>;await act(async()=>{lookup=service.jumpToDate('2026-10-28');});
  act(()=>service.cancelNavigation());mockApi.messages.mockClear();
  await act(async()=>{resolve({messageId:70020,sequence:20});await lookup;});
  expect(service.navigationTarget?.key).toBe(key);expect(service.messages).toBe(messages);expect(mockApi.messages).not.toHaveBeenCalled();
});
test('offline date lookup finds the first matching sequence only with proven complete cached history',async()=>{
  const bounds=helpLocalDayBounds('2026-10-28'),start=Date.parse(bounds.from);
  for(const [from,to] of [[1,100],[101,200]]){
    const part=page(from,to);part.messages=part.messages.map(message=>({...message,createdAt:new Date(message.sequence===50?start+1000:start-1000).toISOString()}));
    await cacheHelpPage(5,ticket(),part);
  }
  mockOnline=false;mockApi.detail.mockRejectedValue(new Error('offline'));mockApi.sync.mockRejectedValue(new Error('offline'));await render();await open();mockApi.messages.mockClear();
  await act(async()=>{await service.jumpToDate('2026-10-28');});
  expect(service.navigationTarget).toMatchObject({kind:'date',messageId:70050,sequence:50});expect(mockApi.date).not.toHaveBeenCalled();expect(mockApi.messages).not.toHaveBeenCalled();
});

test('distant date navigation retains date intent after loading an around page',async()=>{
  await render();await open();mockApi.messages.mockClear();
  mockApi.date.mockResolvedValue({messageId:70020,sequence:20});
  await act(async()=>{await service.jumpToDate('2026-10-28');});
  expect(mockApi.messages).toHaveBeenCalledWith(7,{around:20});
  expect(service.navigationTarget).toMatchObject({kind:'date',messageId:70020,sequence:20});
  expect(service.messages.some(message=>message.id===70020)).toBe(true);
});
test('offline partial history refuses to claim a cached matching row is the first message of the day',async()=>{
  const {from}=helpLocalDayBounds('2026-10-28');const part=page(101,200);part.messages=part.messages.map(message=>({...message,createdAt:from}));await cacheHelpPage(5,ticket(),part);
  mockOnline=false;mockApi.detail.mockRejectedValue(new Error('offline'));mockApi.sync.mockRejectedValue(new Error('offline'));await render();await open();const key=service.navigationTarget?.key;
  await act(async()=>{await expect(service.jumpToDate('2026-10-28')).rejects.toThrow('сохранена не полностью');});
  expect(service.selectedTicket?.id).toBe(7);expect(service.navigationTarget?.key).toBe(key);expect(mockApi.date).not.toHaveBeenCalled();
});
