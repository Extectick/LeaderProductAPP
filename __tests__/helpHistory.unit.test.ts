jest.mock('@react-native-async-storage/async-storage',()=>{
  const values=new Map<string,string>();
  return {getItem:jest.fn(async(key:string)=>values.get(key)??null),setItem:jest.fn(async(key:string,value:string)=>{values.set(key,value);}),removeItem:jest.fn(async(key:string)=>{values.delete(key);}),clear:jest.fn(async()=>values.clear()),getAllKeys:jest.fn(async()=>[...values.keys()]),multiGet:jest.fn(async(keys:string[])=>keys.map(key=>[key,values.get(key)??null]))};
});
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initialHelpPosition, mergeHelpRanges, reconcileHelpWindow, trimHelpWindow } from '../src/features/help/helpHistoryModel';
import { readHistoryMessages,readHistoryRecord,removeHistoryTicket,writeHistoryChange } from '../src/features/help/helpHistoryDatabase.web';
import type { HelpMessage,HelpTicket } from '../src/features/help/helpApi';
import type { HelpHistoryPage,HelpSyncResult } from '../src/features/help/helpHistoryTypes';

const message=(id:number,text=`message ${id}`)=>({id,ticketId:7,sequence:id,text} as HelpMessage);
const ticket={id:7,title:'Support',lastSequence:300,lastReadSequence:100,lastMessage:message(300)} as HelpTicket;
const page=(from:number,to:number,eventCursor=10):HelpHistoryPage=>({messages:Array.from({length:to-from+1},(_,i)=>message(from+i)),nextCursor:from>1?from:null,olderCursor:from>1?from:null,newerCursor:to<300?to:null,hasOlder:from>1,hasNewer:to<300,lastSequence:300,lastReadSequence:100,firstUnreadSequence:101,eventCursor,snapshotCursor:eventCursor});
const sync=(overrides:Partial<HelpSyncResult>={}):HelpSyncResult=>({ticket,events:[],messages:[],deletedMessageIds:[],nextCursor:20,eventCursor:20,snapshotCursor:20,hasMore:false,lastSequence:300,lastReadSequence:100,firstUnreadSequence:101,...overrides});
beforeEach(async()=>{await AsyncStorage.clear();});

test('opening priority is explicit target, saved history, unread boundary, latest',()=>{
  const anchor={messageId:80,sequence:80,offset:-12,atLatest:false};
  expect(initialHelpPosition(anchor,101,{messageId:220,sequence:220})).toMatchObject({kind:'message',sequence:220});
  expect(initialHelpPosition(anchor,101)).toMatchObject({kind:'anchor',sequence:80,offset:-12});
  expect(initialHelpPosition({...anchor,atLatest:true},101)).toMatchObject({kind:'unread',sequence:101});
  expect(initialHelpPosition(null,null)).toMatchObject({kind:'latest'});
});
test('loading distant search fragments never fills the unloaded range between them',()=>{
  let ranges=mergeHelpRanges([],page(1,100));ranges=mergeHelpRanges(ranges,page(201,300));
  expect(ranges).toHaveLength(2);
  ranges=mergeHelpRanges(ranges,page(101,200));
  expect(ranges).toEqual([{from:1,to:300,hasOlder:false,hasNewer:false,throughSequence:300}]);
});
test('live changes update existing history rows without appending remote tail',()=>{
  const result=reconcileHelpWindow([message(10),message(11)],[message(10,'edited'),message(300)],[11],false);
  expect(result.map(row=>[row.id,row.text])).toEqual([[10,'edited']]);
});
test('idle trimming retains a reader who moved to the opposite edge during pagination',()=>{
  const rows=Array.from({length:800},(_,i)=>message(i+1));
  const trimmed=trimHelpWindow(rows,{messageId:750,sequence:750,offset:-8,atLatest:false},'older');
  expect(trimmed?.messages).toHaveLength(600);expect(trimmed?.messages[0].sequence).toBe(201);
  expect(trimmed?.messages.some(row=>row.id===750)).toBe(true);expect(trimmed).toMatchObject({removedOlder:true,removedNewer:false});
  expect(trimHelpWindow(rows,{messageId:900,sequence:900,offset:0,atLatest:false},'older')).toBeNull();
});
test('page loads cannot advance an existing durable sync cursor',async()=>{
  await writeHistoryChange('dev:1',7,{ticket,page:page(1,100,10)});
  await writeHistoryChange('dev:1',7,{ticket,page:page(201,300,30)});
  expect((await readHistoryRecord('dev:1',7))?.syncCursor).toBe(10);
  await writeHistoryChange('dev:1',7,{sync:sync({nextCursor:25,eventCursor:25,snapshotCursor:35})});
  expect((await readHistoryRecord('dev:1',7))?.syncCursor).toBe(25);
});
test('slow older snapshots cannot undo edits or resurrect tombstoned messages',async()=>{
  await writeHistoryChange('dev:1',7,{ticket,page:page(1,3)});
  await writeHistoryChange('dev:1',7,{sync:sync({messages:[message(1,'edited')],deletedMessageIds:[2]})});
  await writeHistoryChange('dev:1',7,{ticket,page:page(1,3,11)});
  expect((await readHistoryMessages('dev:1',7,1,3)).map(row=>[row.id,row.text])).toEqual([[1,'edited'],[3,'message 3']]);
});
test('concurrent anchor save and replay retain both cursor and exact offset',async()=>{
  await writeHistoryChange('dev:1',7,{ticket,page:page(1,3)});
  const anchor={messageId:2,sequence:2,offset:-18.5,atLatest:false};
  await Promise.all([writeHistoryChange('dev:1',7,{anchor}),writeHistoryChange('dev:1',7,{sync:sync({messages:[message(2,'new')]})})]);
  expect(await readHistoryRecord('dev:1',7)).toMatchObject({anchor,syncCursor:20});
  expect((await readHistoryMessages('dev:1',7,2,2))[0].text).toBe('new');
});
test('account and endpoint scope isolate history, and revoked tickets are removed',async()=>{
  await writeHistoryChange('dev:1',7,{ticket,page:page(1,3)});
  expect(await readHistoryRecord('dev:2',7)).toBeNull();expect(await readHistoryRecord('prod:1',7)).toBeNull();
  await removeHistoryTicket('dev:1',7);expect(await readHistoryRecord('dev:1',7)).toBeNull();expect(await readHistoryMessages('dev:1',7,1,300)).toEqual([]);
});
