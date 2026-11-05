import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
jest.mock('react-native',()=>({Platform:{OS:'android'},AppState:{currentState:'active',addEventListener:()=>({remove:()=>{}})}}));
jest.mock('../context/AuthContext',()=>({AuthContext:require('react').createContext({profile:{id:5},isAuthenticated:true})}));
jest.mock('../utils/config',()=>({API_BASE_URL:'https://committed.example.test'}));
jest.mock('../src/shared/network/useServerStatus',()=>({useServerStatus:()=>({isReachable:true})}));
let mockNotice:(notice:any)=>void;
let mockOutboxChanged:()=>void;
const mockPending:any[]=[];
jest.mock('../src/features/help/helpAccountSync',()=>({acquireHelpAccount:(_id:number,notice:(value:any)=>void)=>{
  mockNotice=notice;
  return {getSocket:()=>null,release:jest.fn(),refresh:async()=>{},syncTicket:async()=>{},setActiveTicket:jest.fn()};
}}));
jest.mock('@react-native-async-storage/async-storage',()=>{const values=new Map<string,string>();return{getItem:jest.fn(async(key:string)=>values.get(key)??null),setItem:jest.fn(async(key:string,value:string)=>{values.set(key,value);}),removeItem:jest.fn(async(key:string)=>{values.delete(key);}),clear:jest.fn(async()=>values.clear()),getAllKeys:jest.fn(async()=>[...values.keys()]),multiGet:jest.fn(async(keys:string[])=>keys.map(key=>[key,values.get(key)??null]))};});
jest.mock('../src/features/help/helpHistoryDatabase',()=>require('../src/features/help/helpHistoryDatabase.web'));
const mockApi={config:jest.fn(),list:jest.fn(),detail:jest.fn(),read:jest.fn()};
jest.mock('../src/features/help/helpApi',()=>({createHelpApi:()=>mockApi,HelpApiError:class extends Error{},loadHelpMedia:jest.fn(),uploadHelpFiles:jest.fn()}));
jest.mock('../src/features/help/helpStorage',()=>({readHelpPending:async()=>mockPending,readLastCreatedOperation:async()=>null,subscribeHelpOutbox:(_id:number,changed:()=>void)=>{mockOutboxChanged=changed;return()=>{};},helpClientId:()=> 'committed-test',getHelpDraft:jest.fn(),getHelpDrafts:jest.fn(),setHelpDraft:jest.fn()}));
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useHelpService} from '../src/features/help/useHelpService';
import * as history from '../src/features/help/helpHistory';
import {helpViewCache} from '../src/features/help/helpViewCache';
import type {HelpMessage,HelpTicket} from '../src/features/help/helpApi';
import type {HelpHistoryPage,HelpSyncResult} from '../src/features/help/helpHistoryTypes';
const msg=(sequence:number,text=`Message ${sequence}`)=>({id:70000+sequence,ticketId:7,sequence,text,authorId:9} as HelpMessage);
const ticket=(lastSequence=600)=>({id:7,title:'Support',status:'OPEN',ownerId:5,members:[],unreadCount:0,lastReadSequence:600,lastSequence,updatedAt:'2026-11-05T00:00:00Z'} as unknown as HelpTicket);
const page:HelpHistoryPage={messages:Array.from({length:600},(_,i)=>msg(i+1)),nextCursor:null,olderCursor:null,newerCursor:null,hasOlder:false,hasNewer:false,lastReadSequence:600,firstUnreadSequence:null,lastSequence:600,eventCursor:10,snapshotCursor:10};
let service:ReturnType<typeof useHelpService>,screen:TestRenderer.ReactTestRenderer|undefined;
function Harness(){service=useHelpService(true);return null;}
const tree=(userId=5)=>React.createElement(require('../context/AuthContext').AuthContext.Provider,{value:{profile:{id:userId},isAuthenticated:true}},React.createElement(Harness));
async function committed(ids?:number[]){await act(async()=>{mockNotice({type:'ticket',ticketId:7,...(ids?{changedMessageIds:ids}:{})});});}
async function persist(changes:Partial<HelpSyncResult>={}){await history.cacheHelpSync(5,7,{ticket:ticket(),events:[],messages:[],deletedMessageIds:[],nextCursor:20,eventCursor:20,snapshotCursor:20,hasMore:false,lastReadSequence:600,firstUnreadSequence:null,lastSequence:600,...changes});}
beforeEach(async()=>{
  jest.clearAllMocks();await AsyncStorage.clear();mockPending.length=0;
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
