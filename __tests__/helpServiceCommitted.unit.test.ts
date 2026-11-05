import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
jest.mock('react-native',()=>({Platform:{OS:'android'},AppState:{currentState:'active',addEventListener:()=>({remove:()=>{}})}}));
jest.mock('../context/AuthContext',()=>({AuthContext:require('react').createContext({profile:{id:5},isAuthenticated:true})}));
jest.mock('../utils/config',()=>({API_BASE_URL:'https://committed.example.test'}));
jest.mock('../src/shared/network/useServerStatus',()=>({useServerStatus:()=>({isReachable:true})}));
let mockNotice:(notice:any)=>void;
let mockOutboxChanged:()=>void;
const mockPending:any[]=[];
const mockSyncTicket=jest.fn(async()=>{});
jest.mock('../src/features/help/helpAccountSync',()=>({acquireHelpAccount:(_id:number,notice:(value:any)=>void)=>{
  mockNotice=notice;
  return {getSocket:()=>null,release:jest.fn(),refresh:async()=>{},syncTicket:mockSyncTicket,setActiveTicket:jest.fn()};
}}));
jest.mock('@react-native-async-storage/async-storage',()=>{const values=new Map<string,string>();return{getItem:jest.fn(async(key:string)=>values.get(key)??null),setItem:jest.fn(async(key:string,value:string)=>{values.set(key,value);}),removeItem:jest.fn(async(key:string)=>{values.delete(key);}),clear:jest.fn(async()=>values.clear()),getAllKeys:jest.fn(async()=>[...values.keys()]),multiGet:jest.fn(async(keys:string[])=>keys.map(key=>[key,values.get(key)??null]))};});
jest.mock('../src/features/help/helpHistoryDatabase',()=>require('../src/features/help/helpHistoryDatabase.web'));
const mockApi={config:jest.fn(),list:jest.fn(),detail:jest.fn(),read:jest.fn(),claim:jest.fn()};
jest.mock('../src/features/help/helpApi',()=>({createHelpApi:()=>mockApi,HelpApiError:class extends Error{},loadHelpMedia:jest.fn(),uploadHelpFiles:jest.fn()}));
jest.mock('../src/features/help/helpStorage',()=>({readHelpPending:async()=>mockPending,readLastCreatedOperation:async()=>null,subscribeHelpOutbox:(_id:number,changed:()=>void)=>{mockOutboxChanged=changed;return()=>{};},saveHelpPending:jest.fn(async()=>{}),helpClientId:()=> 'committed-test',getHelpDraft:jest.fn(),getHelpDrafts:jest.fn(),setHelpDraft:jest.fn()}));
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useHelpService} from '../src/features/help/useHelpService';
import * as history from '../src/features/help/helpHistory';
import * as outbox from '../src/features/help/helpOutbox';
import {helpViewCache} from '../src/features/help/helpViewCache';
import type {HelpMessage,HelpTicket} from '../src/features/help/helpApi';
import type {HelpHistoryPage,HelpSyncResult} from '../src/features/help/helpHistoryTypes';
const msg=(sequence:number,text=`Message ${sequence}`)=>({id:70000+sequence,ticketId:7,sequence,text,authorId:9} as HelpMessage);
const ticket=(lastSequence=600)=>({id:7,title:'Support',status:'OPEN',ownerId:5,members:[],unreadCount:0,lastReadSequence:600,lastSequence,updatedAt:'2026-11-05T00:00:00Z'} as unknown as HelpTicket);
const page:HelpHistoryPage={messages:Array.from({length:600},(_,i)=>msg(i+1)),nextCursor:null,olderCursor:null,newerCursor:null,hasOlder:false,hasNewer:false,lastReadSequence:600,firstUnreadSequence:null,lastSequence:600,eventCursor:10,snapshotCursor:10};
let service:ReturnType<typeof useHelpService>,screen:TestRenderer.ReactTestRenderer|undefined;
const renderedStates:{status:string|undefined;ids:number[];hasNewer:boolean}[]=[];
function Harness(){service=useHelpService(true);renderedStates.push({status:service.selectedTicket?.status,ids:service.messages.map(message=>message.id),hasNewer:service.hasNewer});return null;}
const tree=(userId=5)=>React.createElement(require('../context/AuthContext').AuthContext.Provider,{value:{profile:{id:userId},isAuthenticated:true}},React.createElement(Harness));
async function committed(ids?:number[]){await act(async()=>{mockNotice({type:'ticket',ticketId:7,...(ids?{changedMessageIds:ids}:{})});});}
async function persist(changes:Partial<HelpSyncResult>={}){await history.cacheHelpSync(5,7,{ticket:ticket(),events:[],messages:[],deletedMessageIds:[],nextCursor:20,eventCursor:20,snapshotCursor:20,hasMore:false,lastReadSequence:600,firstUnreadSequence:null,lastSequence:600,...changes});}
beforeEach(async()=>{
  jest.clearAllMocks();mockSyncTicket.mockReset().mockResolvedValue(undefined);await AsyncStorage.clear();mockPending.length=0;renderedStates.length=0;
  const cache=helpViewCache('https://committed.example.test:5:true');cache.lists.clear();cache.windows.clear();
  mockApi.config.mockResolvedValue({canManage:false});mockApi.list.mockResolvedValue({tickets:[],nextCursor:null});mockApi.detail.mockResolvedValue({ticket:ticket(),...page});mockApi.read.mockResolvedValue({});
  await act(async()=>{screen=TestRenderer.create(tree());});
  await act(async()=>{await service.openTicket(7);await service.refresh();});
});
afterEach(async()=>{if(screen)await act(async()=>screen!.unmount());screen=undefined;jest.restoreAllMocks();});

test('stream progress reads one committed row and retains the other 599 objects; metadata-only reads no window',async()=>{
  const original=service.messages,key=service.navigationTarget?.key;
  const delta=jest.spyOn(history,'readCachedHelpDelta'),range=jest.spyOn(history,'readCachedHelpRange');
  await persist({messages:[msg(599,'Latest committed stream')]});
  await committed([70599]);
  expect(delta).toHaveBeenLastCalledWith(5,7,[70599]);expect(range).not.toHaveBeenCalled();
  expect(service.messages.find(row=>row.id===70599)?.text).toBe('Latest committed stream');
  expect(service.messages[0]).toBe(original[0]);expect(service.messages[598]).not.toBe(original[598]);
  expect(service.messages[599]).toBe(original[599]);expect(service.messages).toHaveLength(600);
  const after=service.messages;
  await persist({ticket:{...ticket(),title:'Updated metadata'},nextCursor:21,eventCursor:21,snapshotCursor:21});
  await committed([]);
  expect(delta).toHaveBeenLastCalledWith(5,7,[]);expect(range).not.toHaveBeenCalled();
  expect(service.messages).toBe(after);expect(service.selectedTicket?.title).toBe('Updated metadata');
  expect(service.navigationTarget?.key).toBe(key);
});

test('lazy quote repair keeps previous sources, next-window precedence, forward references and ticket fences',async()=>{
  const retainedQuote={id:99,text:'Server quote',author:null,attachments:[]};
  await persist({messages:[
    {...msg(597),replyToId:70100,replyTo:null},
    {...msg(598),replyToId:70600,replyTo:null},
    {...msg(599),replyToId:70100,replyTo:retainedQuote},
    msg(600,'Updated source later in the next window'),
    {...msg(595),ticketId:8},
    {...msg(596),replyToId:70595,replyTo:null},
  ]});
  await committed([70595,70596,70597,70598,70599,70600]);
  expect(service.messages.find(row=>row.id===70597)?.replyTo).toMatchObject({id:70100,text:'Message 100'});
  expect(service.messages.find(row=>row.id===70598)?.replyTo).toMatchObject({id:70600,text:'Updated source later in the next window'});
  expect(service.messages.find(row=>row.id===70599)?.replyTo).toEqual(retainedQuote);
  expect(service.messages.find(row=>row.id===70596)?.replyTo).toBeNull();
});

test('committed deletions preserve the reading window and do not append a distant tail or delete a missing ID',async()=>{
  await act(async()=>{await service.saveViewport({messageId:70150,sequence:150,offset:-18,atLatest:false},7);});
  const key=service.navigationTarget?.key,first=service.messages[0];
  const range=jest.spyOn(history,'readCachedHelpRange');
  await persist({ticket:ticket(800),messages:[msg(800)],deletedMessageIds:[70109],lastSequence:800});
  await committed([70109,70800,70110]);
  expect(service.messages.some(row=>row.id===70109)).toBe(false);
  expect(service.messages.some(row=>row.id===70110)).toBe(true);
  expect(service.messages.at(-1)?.sequence).toBe(600);expect(service.messages[0]).toBe(first);
  expect(service.hasNewer).toBe(true);expect(service.navigationTarget?.key).toBe(key);expect(range).not.toHaveBeenCalled();
});

test('a following window repairs a hinted sequence gap instead of joining disjoint cached ranges',async()=>{
  await act(async()=>{await service.saveViewport({messageId:70600,sequence:600,offset:0,atLatest:true},7);});
  const range=jest.spyOn(history,'readCachedHelpRange');
  await persist({ticket:ticket(602),messages:[msg(602)],lastSequence:602});
  await committed([70602]);
  expect(range).toHaveBeenCalledTimes(1);
  expect(service.messages.at(-1)?.sequence).toBe(600);expect(service.hasNewer).toBe(true);
});

test('a pending full outbox repair dominates later row hints while a delta read is in flight',async()=>{
  await persist({messages:[msg(599,'First update')]});
  const snapshot=await history.readCachedHelpDelta(5,7,[70599]);
  let release!:(value:typeof snapshot)=>void;
  const delta=jest.spyOn(history,'readCachedHelpDelta').mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  const range=jest.spyOn(history,'readCachedHelpRange');
  await committed([70599]);expect(delta).toHaveBeenCalledTimes(1);
  await persist({messages:[msg(598,'Full repair update')],deletedMessageIds:[70600],nextCursor:21,eventCursor:21,snapshotCursor:21});
  await act(async()=>{mockOutboxChanged();mockNotice({type:'ticket',ticketId:7,changedMessageIds:[70598]});});
  await act(async()=>{release(snapshot);});
  expect(range).toHaveBeenCalledTimes(1);expect(delta).toHaveBeenCalledTimes(1);
  expect(service.messages.find(row=>row.id===70598)?.text).toBe('Full repair update');
  expect(service.messages.some(row=>row.id===70600)).toBe(false);
});

test('row notices queued during a read coalesce their IDs without forcing a full window read',async()=>{
  await persist({messages:[msg(599,'First')]});
  const snapshot=await history.readCachedHelpDelta(5,7,[70599]);
  let release!:(value:typeof snapshot)=>void;
  const delta=jest.spyOn(history,'readCachedHelpDelta').mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  const range=jest.spyOn(history,'readCachedHelpRange');
  await committed([70599]);
  await persist({messages:[msg(598,'Second'),msg(597,'Third')],nextCursor:21,eventCursor:21,snapshotCursor:21});
  await act(async()=>{mockNotice({type:'ticket',ticketId:7,changedMessageIds:[70598]});mockNotice({type:'ticket',ticketId:7,changedMessageIds:[70597,70598]});release(snapshot);});
  expect(delta).toHaveBeenCalledTimes(2);
  expect(new Set(delta.mock.calls[1][2])).toEqual(new Set([70598,70597]));
  expect(range).not.toHaveBeenCalled();
  expect(service.messages.find(row=>row.id===70598)?.text).toBe('Second');
  expect(service.messages.find(row=>row.id===70597)?.text).toBe('Third');
});

test('oversized hint batches fall back to a complete committed repair',async()=>{
  const delta=jest.spyOn(history,'readCachedHelpDelta'),range=jest.spyOn(history,'readCachedHelpRange');
  await persist({messages:[msg(599,'Batch update')]});
  await committed(Array.from({length:201},(_,i)=>70001+i));
  expect(delta).not.toHaveBeenCalled();expect(range).toHaveBeenCalledTimes(1);
  expect(service.messages.find(row=>row.id===70599)?.text).toBe('Batch update');
});

test('a delayed committed snapshot cannot restore a ticket revoked while the read was in flight',async()=>{
  const snapshot=await history.readCachedHelpDelta(5,7,[70599]);
  let release!:(value:typeof snapshot)=>void;
  jest.spyOn(history,'readCachedHelpDelta').mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  await committed([70599]);
  await act(async()=>{mockNotice({type:'revoked',ticketId:7});});
  expect(service.selectedTicket).toBeNull();expect(service.tickets.some(row=>row.id===7)).toBe(false);
  await act(async()=>{release(snapshot);});
  expect(service.selectedTicket).toBeNull();expect(service.messages).toEqual([]);
  expect(service.tickets.some(row=>row.id===7)).toBe(false);
});

test('leaving the tail during a delta read retains the current viewport without appending its new row',async()=>{
  await act(async()=>{await service.saveViewport({messageId:70600,sequence:600,offset:0,atLatest:true},7);});
  await persist({ticket:ticket(601),messages:[msg(601)],lastSequence:601});
  const snapshot=await history.readCachedHelpDelta(5,7,[70601]);
  let release!:(value:typeof snapshot)=>void;
  jest.spyOn(history,'readCachedHelpDelta').mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  const key=service.navigationTarget?.key;
  await committed([70601]);
  await act(async()=>{await service.saveViewport({messageId:70150,sequence:150,offset:-25,atLatest:false},7);release(snapshot);});
  expect(service.messages.at(-1)?.sequence).toBe(600);expect(service.hasNewer).toBe(true);
  expect(service.navigationTarget?.key).toBe(key);
});

test('a pending delta from the previous authenticated account cannot populate the new account',async()=>{
  const snapshot=await history.readCachedHelpDelta(5,7,[70599]);
  let release!:(value:typeof snapshot)=>void;
  jest.spyOn(history,'readCachedHelpDelta').mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  await committed([70599]);
  await act(async()=>{screen!.update(tree(6));});
  expect(service.userId).toBe(6);expect(service.messages).toEqual([]);
  await act(async()=>{release(snapshot);});
  expect(service.selectedTicket).toBeNull();expect(service.messages).toEqual([]);
  expect(service.tickets.some(row=>row.id===7)).toBe(false);
});

test('leaving the tail during a full repair keeps the newer-message flag for the retained window',async()=>{
  await act(async()=>{await service.saveViewport({messageId:70600,sequence:600,offset:0,atLatest:true},7);});
  await persist({ticket:ticket(601),messages:[msg(601)],lastSequence:601});
  const rows=await history.readCachedHelpRange(5,7,1,601,1000);
  let release!:(value:typeof rows)=>void;
  jest.spyOn(history,'readCachedHelpRange').mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  const key=service.navigationTarget?.key;
  await committed();
  await act(async()=>{await service.saveViewport({messageId:70150,sequence:150,offset:-25,atLatest:false},7);release(rows);});
  expect(service.messages.at(-1)?.sequence).toBe(600);expect(service.hasNewer).toBe(true);
  expect(service.navigationTarget?.key).toBe(key);
});

test('quiet committed repair retains selected ticket identity while real metadata still updates',async()=>{
  await persist();await committed();
  const selected=service.selectedTicket,rows=service.messages,pending=service.pendingMessages;
  await committed();
  expect(service.selectedTicket).toBe(selected);expect(service.messages).toBe(rows);expect(service.pendingMessages).toBe(pending);
  await persist({ticket:{...ticket(),title:'Updated title'}});await committed();
  expect(service.selectedTicket).not.toBe(selected);expect(service.selectedTicket?.title).toBe('Updated title');
});


test('close receipt keeps the rating and preceding message visible without waiting for background sync',async()=>{
  await act(async()=>{await service.saveViewport({messageId:70600,sequence:600,offset:0,atLatest:true},7);});
  mockSyncTicket.mockImplementation(()=>new Promise(()=>{}));
  const rating={...msg(601,'Спасибо'),kind:'CLOSURE',authorId:5,rating:5} as HelpMessage;
  const response={ticket:{...ticket(601),status:'CLOSED' as const},...page,messages:[msg(599),msg(600),rating],lastSequence:601,snapshotCursor:20,eventCursor:20};
  jest.spyOn(outbox,'dispatchHelpPending').mockResolvedValue(response);
  const preceding=service.messages.at(-1);renderedStates.length=0;
  await act(async()=>{await service.closeTicket(7,{text:'Спасибо',rating:5});});
  expect(service.messages.at(-1)).toEqual(rating);
  expect(service.messages.at(-2)).toBe(preceding);
  expect(service.hasNewer).toBe(false);
  const closed=renderedStates.filter(state=>state.status==='CLOSED');
  expect(closed.length).toBeGreaterThan(0);
  expect(closed.every(state=>state.ids.includes(70601)&&state.ids.includes(70600)&&!state.hasNewer)).toBe(true);
});

test('claim receipt renders its joined event immediately and stale committed metadata cannot roll it back',async()=>{
  await act(async()=>{await service.saveViewport({messageId:70600,sequence:600,offset:0,atLatest:true},7);});
  const old=await history.readCachedHelpRecord(5,7);
  mockSyncTicket.mockImplementation(()=>new Promise(()=>{}));
  const joined={...msg(601,'Иванов Иван подключился'),kind:'SYSTEM',itStatusChange:'JOINED'} as HelpMessage;
  const claimed={...ticket(601),members:[{userId:9,role:'IT' as const,user:{id:9,name:'Иванов Иван',avatarUrl:null}}]};
  mockApi.claim.mockResolvedValue({ticket:claimed,...page,messages:[msg(600),joined],lastSequence:601,eventCursor:20,snapshotCursor:20});
  renderedStates.length=0;
  await act(async()=>{await service.claimTicket(7);});
  expect(service.messages.at(-1)).toEqual(joined);expect(renderedStates.every(state=>!state.hasNewer)).toBe(true);
  const range=jest.spyOn(history,'readCachedHelpRange');
  jest.spyOn(history,'readCachedHelpRecord').mockResolvedValueOnce(old);
  await committed();
  expect(range).not.toHaveBeenCalled();expect(service.messages.at(-1)).toEqual(joined);
  expect(service.selectedTicket?.members[0].user.name).toBe('Иванов Иван');
});

test('a committed closure applies status and rating together after its async history read',async()=>{
  await act(async()=>{await service.saveViewport({messageId:70600,sequence:600,offset:0,atLatest:true},7);});
  const rating={...msg(601,'Готово'),kind:'CLOSURE',rating:4} as HelpMessage;
  await persist({ticket:{...ticket(601),status:'CLOSED'},messages:[rating],lastSequence:601});
  const rows=await history.readCachedHelpRange(5,7,1,601,1000);
  let release!:(rows:HelpMessage[])=>void;
  jest.spyOn(history,'readCachedHelpRange').mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  renderedStates.length=0;
  await committed();
  expect(service.selectedTicket?.status).toBe('OPEN');
  expect(service.messages.at(-1)?.id).toBe(70600);
  await act(async()=>{release(rows);});
  expect(service.selectedTicket?.status).toBe('CLOSED');expect(service.messages.at(-1)).toEqual(rating);
  expect(renderedStates.filter(state=>state.status==='CLOSED').every(state=>state.ids.includes(70600)&&state.ids.includes(70601))).toBe(true);
});

test.each([false,true])('mutation tail reconciliation preserves an older reading window or a missing range (%s)',async(gap)=>{
  await act(async()=>{await service.saveViewport({messageId:gap?70600:70150,sequence:gap?600:150,offset:-12,atLatest:gap},7);});
  mockSyncTicket.mockImplementation(()=>new Promise(()=>{}));
  const last=gap?800:601;
  mockApi.claim.mockResolvedValue({ticket:ticket(last),...page,messages:gap?[msg(800)]:[msg(600),msg(601)],lastSequence:last,eventCursor:20,snapshotCursor:20});
  const original=service.messages,key=service.navigationTarget?.key;
  await act(async()=>{await service.claimTicket(7);});
  expect(service.messages).toBe(original);expect(service.hasNewer).toBe(true);expect(service.navigationTarget?.key).toBe(key);
});

test('a delayed claim response cannot replace newer committed state or remove its messages',async()=>{
  await act(async()=>{await service.saveViewport({messageId:70600,sequence:600,offset:0,atLatest:true},7);});
  mockSyncTicket.mockImplementation(()=>new Promise(()=>{}));
  let release!:(detail:any)=>void,pending!:Promise<unknown>;
  mockApi.claim.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  await act(async()=>{pending=service.claimTicket(7);});
  await persist({ticket:{...ticket(602),title:'Newer state'},messages:[msg(601),msg(602)],lastSequence:602,nextCursor:21,eventCursor:21,snapshotCursor:21});
  await committed();
  expect(service.messages.at(-1)?.id).toBe(70602);
  await act(async()=>{release({ticket:ticket(601),...page,messages:[msg(600),msg(601)],lastSequence:601,eventCursor:20,snapshotCursor:20});await pending;});
  expect(service.messages.at(-1)?.id).toBe(70602);expect(service.selectedTicket?.title).toBe('Newer state');
  expect(service.hasNewer).toBe(false);
});
