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
import {helpViewCache,helpListCacheKey,shareHelpItems} from '../src/features/help/helpViewCache';
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
  mockOnline=true;helpViewCache('https://dev.example.test:5:true').lists.clear();helpViewCache('https://dev.example.test:5:true').windows.clear();await AsyncStorage.clear();Object.keys(mockHandlers).forEach(key=>delete mockHandlers[key]);
  mockApi.config.mockReset().mockResolvedValue({canManage:false});mockApi.list.mockReset().mockResolvedValue({tickets:[],nextCursor:null});
  mockApi.detail.mockReset().mockImplementation(async(id:number)=>({ticket:ticket(id),...page(101,200,id)}));
  mockApi.read.mockReset().mockResolvedValue({});mockApi.search.mockReset().mockResolvedValue({messages:[],total:0,nextCursor:null});
  mockApi.date.mockReset().mockResolvedValue({messageId:70150,sequence:150});
  mockApi.sync.mockReset().mockImplementation(async(id:number,after:number)=>({ticket:ticket(id),events:[],messages:[],deletedMessageIds:[],nextCursor:Math.max(10,after),eventCursor:10,snapshotCursor:10,hasMore:false,lastSequence:200,lastReadSequence:200,firstUnreadSequence:null}));
  mockApi.messages.mockReset().mockImplementation(async(id:number,query:HelpHistoryQuery={})=>query.before?page(Math.max(1,query.before-100),query.before-1,id):query.after?page(query.after+1,Math.min(200,query.after+100),id):query.around?page(Math.max(1,query.around-40),Math.min(200,query.around+59),id):page(101,200,id));
});
afterEach(async()=>{if(screen)await act(async()=>screen.unmount());});
test('disk cached opening completes before network repair and never requests a full detail',async()=>{
  await cacheHelpPage(5,ticket(),page(101,200));
  await saveHelpViewport(5,7,{messageId:70150,sequence:150,offset:-17,atLatest:false});
  mockApi.sync.mockReturnValue(new Promise(()=>{}));
  await render();await act(async()=>{await service.openTicket(7);});
  expect(service.loading).toBe(false);expect(service.messages.length).toBeGreaterThan(0);
  expect(service.navigationTarget).toMatchObject({kind:'anchor',sequence:150,offset:-17});
  expect(mockApi.detail).not.toHaveBeenCalled();expect(mockApi.sync).toHaveBeenCalledWith(7,10);
});
test('a second opening uses the warm message window immediately with stable cell references',async()=>{
  await render();await act(async()=>{await service.openTicket(7);});
  const rows=service.messages;mockApi.detail.mockClear();
  await act(async()=>service.clearSelection());
  await act(async()=>{await service.openTicket(7);});
  expect(service.messages).toBe(rows);expect(service.loading).toBe(false);
  expect(mockApi.detail).not.toHaveBeenCalled();
});
test('a ticket socket event updates only that row and retains the other row reference',async()=>{
  mockApi.list.mockResolvedValue({tickets:[ticket(7),ticket(8)],nextCursor:null});
  await render();const other=service.tickets.find(row=>row.id===8);
  mockApi.list.mockClear();mockApi.detail.mockClear();
  mockApi.detail.mockResolvedValue({ticket:{...ticket(7),title:'Changed'},...page(101,200)});
  jest.useFakeTimers();
  try{await act(async()=>{mockHandlers['help:event']({ticketId:7});jest.advanceTimersByTime(110);});}
  finally{jest.useRealTimers();}
  expect(mockApi.list).not.toHaveBeenCalled();expect(mockApi.detail).toHaveBeenCalledTimes(1);
  expect(mockApi.detail).toHaveBeenCalledWith(7);
  expect(service.tickets.find(row=>row.id===7)?.title).toBe('Changed');
  expect(service.tickets.find(row=>row.id===8)).toBe(other);
});
test('quiet reconciliation shares unchanged items and isolates account and server cache scopes',()=>{
  const a=ticket(7),b=ticket(8),before=[a,b];
  expect(shareHelpItems(before,[{...a},{...b}])).toBe(before);
  const next=shareHelpItems(before,[{...a,title:'Changed'},{...b}]);
  expect(next[0]).not.toBe(a);expect(next[1]).toBe(b);
  const key=helpListCacheKey('OPEN','mine');helpViewCache('server:5').lists.set(key,before);
  expect(helpViewCache('server:6').lists.get(key)).toBeUndefined();
  expect(helpViewCache('other:5').lists.get(key)).toBeUndefined();
});
test('a background list response cannot release the opening chat layout before its messages arrive',async()=>{
  await render();
  let resolveList!:(value:any)=>void,resolveDetail!:(value:any)=>void;
  mockApi.list.mockReturnValueOnce(new Promise(done=>{resolveList=done;}));
  mockApi.detail.mockReturnValueOnce(new Promise(done=>{resolveDetail=done;}));
  let listing!:Promise<unknown>,opening!:Promise<unknown>;
  await act(async()=>{listing=service.loadTickets('OPEN','mine',false,undefined,true);opening=service.openTicket(7);});
  expect(service.loading).toBe(true);
  await act(async()=>{resolveList({tickets:[ticket(7)],nextCursor:null});await listing;});
  expect(service.loading).toBe(true);
  await act(async()=>{resolveDetail({ticket:ticket(7),...page(101,200)});await opening;});
  expect(service.loading).toBe(false);expect(service.messages).toHaveLength(100);
});
