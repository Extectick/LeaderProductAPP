// Exercise the production SQL and transaction boundaries against SQLite itself.
// The Expo bridge is adapted to Node's SQLite API; device bridge behavior is separate runtime QA.
// Development/release use Node 24. The legacy Node 20 quality job has no built-in SQLite.
const sqliteTest=Number(process.versions.node.split('.')[0])>=22?test:test.skip;
let mockFailMessageId=0;
let mockMessageWriteCalls=0;
const mockConnections:any[]=[];
const mockDatabaseFile=require("node:path").join(process.cwd(),"tmp",`help-read-${process.pid}-${Date.now()}.db`);
jest.mock('expo-sqlite',()=>({openDatabaseAsync:async()=>{
  const {DatabaseSync}=require('node:sqlite'),connection=new DatabaseSync(mockDatabaseFile);
  const db:any={databasePath:'help-history-test',execAsync:async(sql:string)=>connection.exec(sql),
    getFirstAsync:async(sql:string,...params:unknown[])=>connection.prepare(sql).get(...params)??null,
    getAllAsync:async(sql:string,...params:unknown[])=>connection.prepare(sql).all(...params),
    runAsync:async(sql:string,...params:unknown[])=>{if(sql.startsWith('INSERT INTO help_history_messages')){mockMessageWriteCalls++;if(params.some((value,index)=>index%6===2&&value===mockFailMessageId))throw new Error('simulated storage failure');}return connection.prepare(sql).run(...params);},
    closeAsync:async()=>connection.close(),withExclusiveTransactionAsync:async(work:Function)=>{connection.exec('BEGIN IMMEDIATE');try{await work(db);connection.exec('COMMIT');}catch(error){connection.exec('ROLLBACK');throw error;}},
  };mockConnections.push(db);return db;
}}));
jest.mock('../src/shared/storage/sqliteLifecycle',()=>({assertSQLiteAvailable:()=>{},manageSQLiteConnection:()=>{},withSQLiteActivity:(work:Function)=>work()}));
import {readHistoryRecord,readHistoryMessages,writeHistoryChange,removeHistoryTicket,readHistorySnapshot} from '../src/features/help/helpHistoryDatabase';
import type {HelpMessage,HelpTicket} from '../src/features/help/helpApi';
import type {HelpHistoryPage,HelpSyncResult} from '../src/features/help/helpHistoryTypes';
const ticket={id:7,title:'Support',updatedAt:'2026-10-28T00:00:00Z'} as HelpTicket;
const message=(id:number,text='original')=>({id,ticketId:7,sequence:id,text} as HelpMessage);
const page:HelpHistoryPage={messages:[message(1),message(2)],hasOlder:false,hasNewer:false,olderCursor:null,newerCursor:null,nextCursor:null,eventCursor:10,snapshotCursor:10,lastSequence:2,lastReadSequence:0,firstUnreadSequence:1};
const sync=(changes:Partial<HelpSyncResult>):HelpSyncResult=>({ticket,events:[],messages:[],deletedMessageIds:[],nextCursor:20,eventCursor:20,snapshotCursor:20,hasMore:false,lastSequence:2,lastReadSequence:0,firstUnreadSequence:1,...changes});
beforeEach(()=>{mockFailMessageId=0;mockMessageWriteCalls=0;});
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

afterAll(async()=>{for(const db of mockConnections)await db.closeAsync();for(const suffix of ['', '-wal','-shm'])try{require('node:fs').unlinkSync(mockDatabaseFile+suffix);}catch{}});
sqliteTest('read snapshots are consistent without waiting behind an unrelated writer',async()=>{
  await writeHistoryChange('native:read',7,{ticket,page});
  const {withSQLiteWriteTransaction}=require('../src/shared/storage/sqliteWriteQueue');
  let release!:()=>void,entered!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
  const writer=withSQLiteWriteTransaction(mockConnections[0],async(tx:any)=>{await tx.runAsync('UPDATE help_history_tickets SET data=data WHERE scope=?','native:read');entered();await gate;});
  await started;
  try{const snapshot=await Promise.race([readHistorySnapshot('native:read',7),new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('Read waited for writer')),1000))]);expect(snapshot?.record.ticket.id).toBe(7);expect(snapshot?.messages.map(row=>row.id)).toEqual([1,2]);}finally{release();await writer;}
});
