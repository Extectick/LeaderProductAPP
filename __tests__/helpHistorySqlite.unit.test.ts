// Exercise the production SQL and transaction boundaries against SQLite itself.
// The Expo bridge is adapted to Node's SQLite API; device bridge behavior is separate runtime QA.
// Development/release use Node 24. The legacy Node 20 quality job has no built-in SQLite.
const sqliteTest=Number(process.versions.node.split('.')[0])>=22?test:test.skip;
let mockFailMessageId=0;
let mockMessageWriteCalls=0;
const mockMessageReads:{sql:string;params:unknown[];rows:number}[]=[];
const mockConnections:any[]=[];
const mockDatabaseDirectory=require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'leader-help-read-'));
const mockDatabaseFile=require('node:path').join(mockDatabaseDirectory,'history.db');
jest.mock('expo-sqlite',()=>({openDatabaseAsync:async()=>{
  const {DatabaseSync}=require('node:sqlite'),connection=new DatabaseSync(mockDatabaseFile);
  const db:any={databasePath:'help-history-test',execAsync:async(sql:string)=>connection.exec(sql),
    getFirstAsync:async(sql:string,...params:unknown[])=>connection.prepare(sql).get(...params)??null,
    getAllAsync:async(sql:string,...params:unknown[])=>{const rows=connection.prepare(sql).all(...params);if(sql.includes('FROM help_history_messages'))mockMessageReads.push({sql,params,rows:rows.length});return rows;},
    runAsync:async(sql:string,...params:unknown[])=>{if(sql.startsWith('INSERT INTO help_history_messages')){mockMessageWriteCalls++;if(params.some((value,index)=>index%6===2&&value===mockFailMessageId))throw new Error('simulated storage failure');}return connection.prepare(sql).run(...params);},
    closeAsync:async()=>connection.close(),withExclusiveTransactionAsync:async(work:Function)=>{connection.exec('BEGIN IMMEDIATE');try{await work(db);connection.exec('COMMIT');}catch(error){connection.exec('ROLLBACK');throw error;}},
  };mockConnections.push(db);return db;
}}));
jest.mock('../src/shared/storage/sqliteLifecycle',()=>({assertSQLiteAvailable:()=>{},manageSQLiteConnection:()=>{},withSQLiteActivity:(work:Function)=>work()}));
import {readHistoryDelta,listHistoryTicketIds,readHistoryRecord,readHistoryMessages,writeHistoryChange,removeHistoryTicket,readHistorySnapshot} from '../src/features/help/helpHistoryDatabase';
import type {HelpMessage,HelpTicket} from '../src/features/help/helpApi';
import type {HelpHistoryPage,HelpSyncResult} from '../src/features/help/helpHistoryTypes';
const ticket={id:7,title:'Support',updatedAt:'2026-10-28T00:00:00Z'} as HelpTicket;
const message=(id:number,text='original')=>({id,ticketId:7,sequence:id,text} as HelpMessage);
const page:HelpHistoryPage={messages:[message(1),message(2)],hasOlder:false,hasNewer:false,olderCursor:null,newerCursor:null,nextCursor:null,eventCursor:10,snapshotCursor:10,lastSequence:2,lastReadSequence:0,firstUnreadSequence:1};
const sync=(changes:Partial<HelpSyncResult>):HelpSyncResult=>({ticket,events:[],messages:[],deletedMessageIds:[],nextCursor:20,eventCursor:20,snapshotCursor:20,hasMore:false,lastSequence:2,lastReadSequence:0,firstUnreadSequence:1,...changes});
beforeEach(()=>{mockFailMessageId=0;mockMessageWriteCalls=0;mockMessageReads.length=0;});
sqliteTest('SQLite snapshot guard and tombstone prevent older pages undoing replay',async()=>{
  await writeHistoryChange('native:1',7,{ticket,page});
  await writeHistoryChange('native:1',7,{sync:sync({messages:[message(1,'edited')],deletedMessageIds:[2]})});
  await writeHistoryChange('native:1',7,{ticket,page:{...page,eventCursor:12,snapshotCursor:12}});
  expect((await readHistoryMessages('native:1',7,1,2)).map(row=>[row.id,row.text])).toEqual([[1,'edited']]);
  expect((await readHistoryRecord('native:1',7))?.syncCursor).toBe(20);
});
sqliteTest('failed SQLite replay rolls back its changed rows and cursor together',async()=>{
  await writeHistoryChange('native:2',7,{ticket,page});mockFailMessageId=3;
  await expect(writeHistoryChange('native:2',7,{sync:sync({messages:[message(1,'should roll back'),message(3)]})})).rejects.toThrow('simulated storage failure');
  expect((await readHistoryRecord('native:2',7))?.syncCursor).toBe(10);
  expect((await readHistoryMessages('native:2',7,1,3)).map(row=>row.text)).toEqual(['original','original']);
});
sqliteTest('SQLite ticket deletion removes both metadata and private messages only in its scope',async()=>{
  await writeHistoryChange('native:3',7,{ticket,page});await writeHistoryChange('native:4',7,{ticket,page});
  await removeHistoryTicket('native:3',7);expect(await readHistoryRecord('native:3',7)).toBeNull();expect(await readHistoryMessages('native:3',7,1,2)).toEqual([]);
  expect(await readHistoryMessages('native:4',7,1,2)).toHaveLength(2);
});

sqliteTest('a 250-message page uses bounded SQL batches and opens its saved anchor in one snapshot',async()=>{
  const full={...page,messages:Array.from({length:250},(_,i)=>message(i+1)),lastSequence:250};
  await writeHistoryChange('native:batch',7,{ticket,page:full,anchor:{messageId:50,sequence:50,offset:12,atLatest:false}});
  expect(mockMessageWriteCalls).toBe(3);
  const snapshot=await readHistorySnapshot('native:batch',7,record=>record.anchor?.sequence);
  expect(snapshot?.messages).toHaveLength(100);
  expect(snapshot?.messages[0].sequence).toBe(11);
  expect(snapshot?.messages.at(-1)?.sequence).toBe(110);
  expect(snapshot?.record.anchor?.offset).toBe(12);
});

sqliteTest('streaming delta reads one committed row and metadata-only notices read no message rows',async()=>{
  await writeHistoryChange('native:delta',7,{ticket,page:{...page,messages:Array.from({length:600},(_,i)=>message(i+1)),lastSequence:600}});
  await writeHistoryChange('native:delta',7,{sync:sync({messages:[message(599,'stream chunk')],lastSequence:600})});
  const delta=await readHistoryDelta('native:delta',7,[599]);
  expect(delta?.messages.map(row=>[row.id,row.text])).toEqual([[599,'stream chunk']]);
  expect(delta?.record.snapshotCursor).toBe(20);
  expect(mockMessageReads).toHaveLength(1);expect(mockMessageReads[0].rows).toBe(1);
  expect(mockMessageReads[0].sql).toContain('message_id IN (?)');
  mockMessageReads.length=0;
  expect((await readHistoryDelta('native:delta',7,[]))?.messages).toEqual([]);
  expect(mockMessageReads).toEqual([]);
  expect(await listHistoryTicketIds('native:delta')).toEqual([7]);
  expect(mockMessageReads).toEqual([]);
});

sqliteTest('delta deletion requires a committed tombstone, never a missing or other-account row',async()=>{
  await writeHistoryChange('native:delta-delete',7,{ticket,page});
  await writeHistoryChange('native:delta-delete',7,{sync:sync({deletedMessageIds:[2]})});
  const delta=await readHistoryDelta('native:delta-delete',7,[1,2,999]);
  expect(delta?.messages.map(row=>row.id)).toEqual([1]);
  expect(delta?.deletedMessageIds).toEqual([2]);
  expect(await readHistoryDelta('native:other-account',7,[1,2])).toBeNull();
});

sqliteTest('delta metadata and row versions remain in one WAL snapshot across a concurrent replay commit',async()=>{
  const scope='native:delta-snapshot';
  await writeHistoryChange(scope,7,{ticket,page});
  await readHistoryRecord(scope,7);
  const reader=mockConnections[1],original=reader.getFirstAsync;
  let release!:()=>void,entered!:()=>void,paused=false;
  const gate=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
  reader.getFirstAsync=async(sql:string,...params:unknown[])=>{
    const row=await original(sql,...params);
    if(!paused&&sql.includes('FROM help_history_tickets')&&params[0]===scope){paused=true;entered();await gate;}
    return row;
  };
  const reading=readHistoryDelta(scope,7,[1]);
  try{
    await started;
    await writeHistoryChange(scope,7,{sync:sync({messages:[message(1,'new commit')]})});
    release();const delta=await reading;
    expect(delta?.record.snapshotCursor).toBe(10);
    expect(delta?.messages[0].text).toBe('original');
  }finally{release();await reading;reader.getFirstAsync=original;}
  expect((await readHistoryDelta(scope,7,[1]))?.messages[0].text).toBe('new commit');
});

afterAll(async()=>{for(const db of mockConnections)await db.closeAsync();for(const suffix of ['', '-wal','-shm'])try{require('node:fs').unlinkSync(mockDatabaseFile+suffix);}catch{}require('node:fs').rmSync(mockDatabaseDirectory,{recursive:true,force:true});});
sqliteTest('read snapshots are consistent without waiting behind an unrelated writer',async()=>{
  await writeHistoryChange('native:read',7,{ticket,page});
  const {withSQLiteWriteTransaction}=require('../src/shared/storage/sqliteWriteQueue');
  let release!:()=>void,entered!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
  const writer=withSQLiteWriteTransaction(mockConnections[0],async(tx:any)=>{await tx.runAsync('UPDATE help_history_tickets SET data=data WHERE scope=?','native:read');entered();await gate;});
  await started;
  try{const snapshot=await Promise.race([readHistorySnapshot('native:read',7),new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('Read waited for writer')),1000))]);expect(snapshot?.record.ticket.id).toBe(7);expect(snapshot?.messages.map(row=>row.id)).toEqual([1,2]);}finally{release();await writer;}
});
