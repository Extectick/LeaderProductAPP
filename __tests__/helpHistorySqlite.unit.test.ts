// Exercise the production SQL and transaction boundaries against SQLite itself.
// The Expo bridge is adapted to Node's SQLite API; device bridge behavior is separate runtime QA.
// Development/release use Node 24. The legacy Node 20 quality job has no built-in SQLite.
const sqliteTest=Number(process.versions.node.split('.')[0])>=22?test:test.skip;
let mockFailMessageId=0;
jest.mock('expo-sqlite',()=>({openDatabaseAsync:async()=>{
  const {DatabaseSync}=require('node:sqlite'),connection=new DatabaseSync(':memory:');
  const db:any={databasePath:'help-history-test',execAsync:async(sql:string)=>connection.exec(sql),
    getFirstAsync:async(sql:string,...params:unknown[])=>connection.prepare(sql).get(...params)??null,
    getAllAsync:async(sql:string,...params:unknown[])=>connection.prepare(sql).all(...params),
    runAsync:async(sql:string,...params:unknown[])=>{if(sql.startsWith('INSERT INTO help_history_messages')&&params[2]===mockFailMessageId)throw new Error('simulated storage failure');return connection.prepare(sql).run(...params);},
    closeAsync:async()=>connection.close(),withExclusiveTransactionAsync:async(work:Function)=>{connection.exec('BEGIN IMMEDIATE');try{await work(db);connection.exec('COMMIT');}catch(error){connection.exec('ROLLBACK');throw error;}},
  };return db;
}}));
jest.mock('../src/shared/storage/sqliteLifecycle',()=>({assertSQLiteAvailable:()=>{},manageSQLiteConnection:()=>{},withSQLiteActivity:(work:Function)=>work()}));
import {readHistoryRecord,readHistoryMessages,writeHistoryChange,removeHistoryTicket} from '../src/features/help/helpHistoryDatabase';
import type {HelpMessage,HelpTicket} from '../src/features/help/helpApi';
import type {HelpHistoryPage,HelpSyncResult} from '../src/features/help/helpHistoryTypes';
const ticket={id:7,title:'Support',updatedAt:'2026-10-28T00:00:00Z'} as HelpTicket;
const message=(id:number,text='original')=>({id,ticketId:7,sequence:id,text} as HelpMessage);
const page:HelpHistoryPage={messages:[message(1),message(2)],hasOlder:false,hasNewer:false,olderCursor:null,newerCursor:null,nextCursor:null,eventCursor:10,snapshotCursor:10,lastSequence:2,lastReadSequence:0,firstUnreadSequence:1};
const sync=(changes:Partial<HelpSyncResult>):HelpSyncResult=>({ticket,events:[],messages:[],deletedMessageIds:[],nextCursor:20,eventCursor:20,snapshotCursor:20,hasMore:false,lastSequence:2,lastReadSequence:0,firstUnreadSequence:1,...changes});
beforeEach(()=>{mockFailMessageId=0;});
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
