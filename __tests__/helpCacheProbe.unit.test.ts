jest.mock('react-native',()=>({Platform:{OS:'android'}}));
jest.mock('../utils/config',()=>({API_BASE_URL:'https://synthetic-api.invalid'}));
jest.mock('@react-native-async-storage/async-storage',()=>{const values=new Map<string,string>();return{getItem:jest.fn(async(key:string)=>values.get(key)??null),setItem:jest.fn(async(key:string,value:string)=>{values.set(key,value);}),removeItem:jest.fn(async(key:string)=>{values.delete(key);}),clear:jest.fn(async()=>values.clear()),getAllKeys:jest.fn(async()=>[...values.keys()]),multiGet:jest.fn(async(keys:string[])=>keys.map(key=>[key,values.get(key)??null]))};});
jest.mock('../src/features/help/helpHistoryDatabase',()=>require('../src/features/help/helpHistoryDatabase.web'));
const mockActions:Record<string,Function>={},mockProbes:Record<string,Function>={};
jest.mock('../src/features/help/helpDiagnostics',()=>({
  helpDevState:jest.fn(),helpDevActions:jest.fn((_:string,actions:Record<string,Function>)=>{Object.assign(mockActions,actions);return()=>Object.keys(actions).forEach(key=>delete mockActions[key]);}),
  helpDevProbe:jest.fn((name:string,probe:Function)=>{mockProbes[name]=probe;return()=>{delete mockProbes[name];};}),
}));
import AsyncStorage from '@react-native-async-storage/async-storage';
import {installHelpCacheProbe,CACHE_PROBE_USER_ID,CACHE_PROBE_TICKET_ID} from '../qa/help-preview/cacheProbe';
import {cacheHelpPage,readCachedHelpTicket} from '../src/features/help/helpHistory';
import {helpDevState} from '../src/features/help/helpDiagnostics';
import type {HelpTicket} from '../src/features/help/helpApi';

const initialDev=(globalThis as any).__DEV__,initialFetch=global.fetch;
beforeEach(async()=>{(globalThis as any).__DEV__=true;await AsyncStorage.clear();Object.keys(mockActions).forEach(key=>delete mockActions[key]);Object.keys(mockProbes).forEach(key=>delete mockProbes[key]);jest.clearAllMocks();global.fetch=jest.fn(async()=>{throw new Error('Probe must not use network');}) as any;});
afterAll(()=>{(globalThis as any).__DEV__=initialDev;global.fetch=initialFetch;});
test('probe registration is read-only and seed survives reinstall without automatic overwrite',async()=>{
  const dispose=installHelpCacheProbe();expect((await mockProbes.historyCache()).present).toBe(false);expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  expect(CACHE_PROBE_USER_ID).toBeLessThan(0);expect(CACHE_PROBE_TICKET_ID).toBeLessThan(0);
  await mockActions['fixture.cache.write']();const before=await mockProbes.historyCache();
  expect(before).toMatchObject({complete:true,rowCount:2,sequenceSum:4,syncCursor:20,snapshotCursor:20,anchorSequence:1,anchorOffset:-17.25,anchorAtLatest:false,editedPreserved:true,deletedAbsent:true});
  dispose();const writes=(AsyncStorage.setItem as jest.Mock).mock.calls.length;installHelpCacheProbe();
  await mockActions['fixture.cache.read']();expect(await mockProbes.historyCache()).toMatchObject({...before,lastAction:'read'});
  expect((AsyncStorage.setItem as jest.Mock).mock.calls).toHaveLength(writes);expect(global.fetch).not.toHaveBeenCalled();
});
test('clear affects only the fixed negative QA scope and metadata contains no message text',async()=>{
  await cacheHelpPage(7,{id:CACHE_PROBE_TICKET_ID,updatedAt:'2026-10-28T00:00:00Z'} as HelpTicket,{messages:[],nextCursor:null,olderCursor:null,newerCursor:null,hasOlder:false,hasNewer:false,lastReadSequence:0,firstUnreadSequence:null,lastSequence:0,eventCursor:0});
  installHelpCacheProbe();await mockActions['fixture.cache.write']();
  const metadata=JSON.stringify(await mockProbes.historyCache());expect(metadata).not.toContain('SQLite QA');expect(metadata).not.toContain('Synthetic local');
  expect(JSON.stringify((helpDevState as jest.Mock).mock.calls)).not.toContain('SQLite QA');
  await mockActions['fixture.cache.clear']();expect(await mockProbes.historyCache()).toMatchObject({present:false,complete:false,rowCount:0,syncCursor:null,anchorSequence:null});
  expect(await readCachedHelpTicket(7,CACHE_PROBE_TICKET_ID)).not.toBeNull();expect(global.fetch).not.toHaveBeenCalled();
});
test('release mode registers neither writable actions nor the probe',()=>{
  (globalThis as any).__DEV__=false;installHelpCacheProbe();expect(Object.keys(mockActions)).toEqual([]);expect(Object.keys(mockProbes)).toEqual([]);
});
