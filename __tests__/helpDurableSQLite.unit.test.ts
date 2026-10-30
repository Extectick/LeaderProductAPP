import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const mockFile=path.join(os.tmpdir(),`help-durable-${process.pid}-${Date.now()}.db`);
let mockFailSql='';
jest.mock('expo-sqlite',()=>{
  const {DatabaseSync}=require('node:sqlite');
  const wrap=(raw:any)=>({databasePath:mockFile,
    execAsync:async(sql:string)=>raw.exec(sql),
    getFirstAsync:async(sql:string,...args:any[])=>raw.prepare(sql).get(...args)??null,
    getAllAsync:async(sql:string,...args:any[])=>raw.prepare(sql).all(...args),
    runAsync:async(sql:string,...args:any[])=>{if(mockFailSql&&sql.includes(mockFailSql))throw new Error('Simulated disk write failure');return raw.prepare(sql).run(...args);},
    closeAsync:async()=>raw.close(),
    withExclusiveTransactionAsync:async(work:Function)=>{const connection=new DatabaseSync(mockFile);connection.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');try{await work(wrap(connection));connection.exec('COMMIT');}catch(error){connection.exec('ROLLBACK');throw error;}finally{connection.close();}},
  });
  return {openDatabaseAsync:async()=>wrap(new DatabaseSync(mockFile))};
});
jest.mock('../src/shared/storage/sqliteLifecycle',()=>({assertSQLiteAvailable:()=>{},manageSQLiteConnection:()=>{},withSQLiteActivity:(work:Function)=>Promise.resolve().then(()=>work())}));
import {readAccountValue,readHistoryRecord,writeAccountChanges,readOutbox,putOutbox,readHistorySnapshot,writeAccountValue,maintainHelpHistory,listHistoryRecords,readHistoryMessage,insertAccountValueIfAbsent} from '../src/features/help/helpHistoryDatabase';
import type {HelpPending} from '../src/features/help/helpDurableTypes';
import type {HelpHistoryPage} from '../src/features/help/helpHistoryTypes';
const ticket={id:7,updatedAt:'2026-10-30T00:00:00Z',lastSequence:2,lastReadSequence:0,unreadCount:2} as any;
const page:HelpHistoryPage={messages:[{id:1,ticketId:7,sequence:1,text:'first'},{id:2,ticketId:7,sequence:2,text:'second'}] as any,nextCursor:null,olderCursor:null,newerCursor:null,hasOlder:false,hasNewer:false,lastReadSequence:0,firstUnreadSequence:1,lastSequence:2,eventCursor:20,snapshotCursor:20};
const operation=(key:string):HelpPending=>({key,ticketId:7,create:false,createdAt:Date.now(),status:'queued',input:{text:'same text',clientMessageId:key}});
afterAll(()=>{for(const suffix of ['','-wal','-shm']){try{fs.unlinkSync(mockFile+suffix);}catch{}}});
test('migration initializes actual SQLite schema and distinct sends retain separate operation IDs',async()=>{
  await putOutbox('migration',operation('one'));await putOutbox('migration',operation('two'));
  expect(await readOutbox('migration')).toHaveLength(2);
  await expect(putOutbox('migration',{...operation('one'),input:{text:'changed',clientMessageId:'one'}})).rejects.toThrow();
  const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(mockFile);expect(db.prepare('PRAGMA user_version').get().user_version).toBe(1);db.close();
});
test('history rows, account cursor and operation completion roll back together on disk failure',async()=>{
  await putOutbox('atomic',operation('op'));
  mockFailSql='DELETE FROM help_outbox';
  try{await expect(writeAccountChanges('atomic',[{ticketId:7,change:{ticket,page}}],20,'op',false,{'last-created':'7'})).rejects.toThrow('Simulated');}finally{mockFailSql='';}
  expect(await readAccountValue('atomic','last-created')).toBeNull();expect(await readHistoryRecord('atomic',7)).toBeNull();expect(await readAccountValue('atomic','events')).toBeNull();expect(await readOutbox('atomic')).toHaveLength(1);
  await writeAccountChanges('atomic',[{ticketId:7,change:{ticket,page}}],20,'op',false,{'last-created':'7'});
  expect((await readHistorySnapshot('atomic',7))?.messages).toHaveLength(2);expect(await readAccountValue('atomic','events')).toBe('20');expect(await readOutbox('atomic')).toHaveLength(0);
});
test('normal cursor is monotonic but an explicit resync can reset it downward',async()=>{
  await writeAccountChanges('cursor',[],50);await writeAccountChanges('cursor',[],20);expect(await readAccountValue('cursor','events')).toBe('50');
  await writeAccountChanges('cursor',[],10,undefined,true);expect(await readAccountValue('cursor','events')).toBe('10');
});
test('maintenance evicts only downloaded history and preserves pending sends and drafts',async()=>{
  await writeAccountChanges('cache',[{ticketId:7,change:{ticket,page}},{ticketId:8,change:{ticket:{...ticket,id:8},page:{...page,messages:page.messages.map(m=>({...m,id:m.id+100,ticketId:8}))}}}]);
  await putOutbox('cache',operation('protected'));await writeAccountValue('cache','draft:ticket:8','draft');
  const result=await maintainHelpHistory('cache',null,0,0);expect(result.evictedTickets).toBe(1);
  expect((await readHistorySnapshot('cache',7))?.messages).toHaveLength(2);expect((await readHistoryRecord('cache',8))?.ranges).toHaveLength(0);
  expect(await readAccountValue('cache','draft:ticket:8')).toBe('draft');expect(await readOutbox('cache')).toHaveLength(1);
});

import {readableHelpSequence} from '../src/features/help/helpReadSequence';
test('viewing AI progress does not read the final answer that later replaces the same message',()=>{
  const input={id:1,sequence:1,kind:'TEXT'},progress={id:2,sequence:2,kind:'ASSISTANT_PROGRESS',assistantRun:{status:'thinking'}};
  expect(readableHelpSequence([input,progress] as any,2)).toBe(1);
  expect(readableHelpSequence([input,{...progress,kind:'TEXT',assistantRun:{status:'completed'}}] as any,2)).toBe(2);
});

test('creation acknowledgement clears only its matching saved draft in the same commit',async()=>{
  await writeAccountValue('draft','draft:new:plain','Original');await putOutbox('draft',operation('create'));
  await writeAccountChanges('draft',[{ticketId:7,change:{ticket,page}}],undefined,'create',false,{'last-created':'7'},{key:'draft:new:plain',text:'Original'});
  expect(await readAccountValue('draft','draft:new:plain')).toBe('');
  await writeAccountValue('draft','draft:new:plain','A newer draft');
  await writeAccountChanges('draft',[],undefined,undefined,false,undefined,{key:'draft:new:plain',text:'Original'});
  expect(await readAccountValue('draft','draft:new:plain')).toBe('A newer draft');
});

test('corrupt cached metadata is skipped and canonical sync repairs it without losing user work or tombstones',async()=>{
  await writeAccountChanges('corrupt',[{ticketId:7,change:{ticket,page}}]);
  await putOutbox('corrupt',operation('unsent'));await writeAccountValue('corrupt','draft:ticket:7','Unsent draft');
  await writeAccountChanges('corrupt',[{ticketId:7,change:{sync:{ticket,events:[],messages:[],deletedMessageIds:[2],nextCursor:25,eventCursor:25,snapshotCursor:25,hasMore:false,lastReadSequence:0,firstUnreadSequence:1,lastSequence:2}}}]);
  const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(mockFile);
  db.prepare('UPDATE help_history_tickets SET data=? WHERE scope=? AND ticket_id=?').run('not-json','corrupt',7);db.close();
  expect(await readHistoryRecord('corrupt',7)).toBeNull();expect(await listHistoryRecords('corrupt')).toEqual([]);expect(await readHistorySnapshot('corrupt',7)).toBeNull();
  await writeAccountChanges('corrupt',[{ticketId:7,change:{sync:{ticket,events:[],messages:[page.messages[0]],deletedMessageIds:[],nextCursor:30,eventCursor:30,snapshotCursor:30,hasMore:false,lastReadSequence:0,firstUnreadSequence:1,lastSequence:2}}}]);
  expect((await readHistoryRecord('corrupt',7))?.syncCursor).toBe(30);
  expect(await readHistoryMessage('corrupt',7,2)).toBeNull();expect(await readOutbox('corrupt')).toHaveLength(1);expect(await readAccountValue('corrupt','draft:ticket:7')).toBe('Unsent draft');
});
test('importing an old draft cannot overwrite a newer concurrent local edit',async()=>{
  await writeAccountValue('draft-race','draft:ticket:7','New edit');
  expect(await insertAccountValueIfAbsent('draft-race','draft:ticket:7','Legacy draft')).toBe('New edit');
  expect(await readAccountValue('draft-race','draft:ticket:7')).toBe('New edit');
  expect(await insertAccountValueIfAbsent('draft-race','draft:ticket:8','Legacy draft')).toBe('Legacy draft');
});
