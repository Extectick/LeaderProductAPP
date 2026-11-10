import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { SQLiteTestDatabase } from './helpers/sqliteTestDatabase';
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('../src/shared/monitoring', () => ({ captureException: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => {
  const data = new Map<string, string>();
  return { getItem: jest.fn(async (key: string) => data.get(key) ?? null), setItem: jest.fn(async (key: string,value: string) => {data.set(key,value);}), removeItem: jest.fn(async (key: string) => {data.delete(key);}), clear: jest.fn(async () => data.clear()) };
});
jest.mock('@/utils/config', () => ({API_BASE_URL:'https://dev.example.test'}));
jest.mock('@/utils/apiClient', () => ({apiClient:jest.fn()}));
jest.mock('@/utils/tokenService', () => ({getAccessToken:jest.fn(),getAccessTokenForRequest:jest.fn(),refreshToken:jest.fn()}));
jest.mock('expo-file-system/legacy',()=>({cacheDirectory:'file:///cache/',makeDirectoryAsync:jest.fn(async()=>{}),copyAsync:jest.fn(async()=>{}),moveAsync:jest.fn(async()=>{}),deleteAsync:jest.fn(async()=>{}),getInfoAsync:jest.fn(),createUploadTask:jest.fn(),createDownloadResumable:jest.fn(),FileSystemUploadType:{MULTIPART:1}}));
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { apiClient } from '@/utils/apiClient';
import { getAccessToken, getAccessTokenForRequest, refreshToken } from '@/utils/tokenService';
import { getHelpDraft, setHelpDraft, saveHelpPending, readHelpPending, removeHelpPending, sameHelpPayload, type HelpPending } from '@/src/features/help/helpStorage';
import { createHelpApi, helpAttachmentUrl, uploadHelpFiles, loadHelpMedia, type HelpAttachment } from '@/src/features/help/helpApi';
import { parseHelpPush } from '@/src/features/help/helpPush';

const jwt = (userId:number, version=1) => `header.${Buffer.from(JSON.stringify({userId,version})).toString('base64')}.signature`;
const originalFetch = global.fetch;
const originalPlatform = Platform.OS;
let directory: string;
let db: SQLiteTestDatabase;
beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'leader-help-client-sqlite-'));
  db = new SQLiteTestDatabase(join(directory, 'help.db'));
  require('expo-sqlite').openDatabaseAsync.mockResolvedValue(db);
  await getHelpDraft(1, 'schema-init');
});
afterAll(async () => {
  await db.closeAsync();
  if (dirname(directory) !== tmpdir() || !basename(directory).startsWith('leader-help-client-sqlite-')) throw new Error('Unsafe SQLite fixture cleanup path');
  rmSync(directory, { recursive: true, force: true });
});
beforeEach(async () => {
  jest.clearAllMocks(); await AsyncStorage.clear();
  await db.execAsync('DELETE FROM help_outbox; DELETE FROM help_account_state; DELETE FROM help_history_messages; DELETE FROM help_history_tickets;');
  (getAccessTokenForRequest as jest.Mock).mockResolvedValue(jwt(1));
  (getAccessToken as jest.Mock).mockResolvedValue(jwt(1));
});
afterEach(() => { global.fetch=originalFetch; Object.defineProperty(Platform,'OS',{configurable:true,value:originalPlatform}); });
const pending = (key: string): HelpPending => ({key,ticketId:7,create:false,createdAt:1,input:{text:key,clientMessageId:key}});
test('drafts and pending requests are isolated by account', async () => {
  await setHelpDraft(1,'new','draft'); await saveHelpPending(1,pending('a'));
  expect(await getHelpDraft(2,'new')).toBe(''); expect(await readHelpPending(2)).toEqual([]);
  expect(await getHelpDraft(1,'new')).toBe('draft');
});
test('concurrent queue writes and removal preserve other requests', async () => {
  await Promise.all([saveHelpPending(1,pending('a')),saveHelpPending(1,pending('b'))]);
  await Promise.all([removeHelpPending(1,'a'),saveHelpPending(1,pending('c'))]);
  expect((await readHelpPending(1)).map(p=>p.key)).toEqual(['b','c']);
});
test('unknown-result request cannot be silently mutated or duplicated', async () => {
  await saveHelpPending(1,pending('a')); await saveHelpPending(1,pending('a'));
  await expect(saveHelpPending(1,{...pending('a'),input:{text:'changed'}})).rejects.toThrow();
  expect(await readHelpPending(1)).toHaveLength(1);
});
test('draft writes remain ordered when immediately cleared', async () => {
  await Promise.all([setHelpDraft(1,'x','old'),setHelpDraft(1,'x','new'),setHelpDraft(1,'x','')]);
  expect(await getHelpDraft(1,'x')).toBe('');
});
test('retry payload distinguishes quote, forward and attachments', () => {
  expect(sameHelpPayload({text:'a'},{text:'a',attachmentIds:[]})).toBe(true);
  expect(sameHelpPayload({text:'a',replyToId:1},{text:'a',replyToId:2})).toBe(false);
  expect(sameHelpPayload({text:'a',forwardedFromId:1},{text:'a'})).toBe(false);
});
test('attachment token cannot leak to another origin or non-Help route', () => {
  const attachment = (url:string) => ({url} as HelpAttachment);
  expect(helpAttachmentUrl(attachment('/help/attachments/abc/content'))).toBe('https://dev.example.test/help/attachments/abc/content');
  expect(()=>helpAttachmentUrl(attachment('https://evil.test/help/attachments/a/content'))).toThrow();
  expect(()=>helpAttachmentUrl(attachment('/profile'))).toThrow();
  expect(()=>helpAttachmentUrl(attachment('/help/attachments/../../profile'))).toThrow();
});
test('push payload only accepts Help events with valid positive ticket IDs', () => {
  expect(parseHelpPush({type:'HELP_MESSAGE',ticketId:12})?.ticketId).toBe(12);
  expect(parseHelpPush({type:'APPEAL_MESSAGE',ticketId:12})).toBeNull();
  expect(parseHelpPush({type:'HELP_MESSAGE',ticketId:-1})).toBeNull();
  expect(parseHelpPush({type:'HELP_MESSAGE',ticketId:'javascript:evil'})).toBeNull();
});

test('bound transport never starts a request for a different current account', async () => {
  (getAccessTokenForRequest as jest.Mock).mockResolvedValue(jwt(2));
  await expect(createHelpApi(1).create({text:'private'})).rejects.toMatchObject({code:'HELP_ACCOUNT_CHANGED',status:0});
  expect(apiClient).not.toHaveBeenCalled();
});

test('transport uses explicit captured bearer and disables automatic auth replay', async () => {
  (apiClient as jest.Mock).mockResolvedValue({ok:true,status:200,data:{id:1}});
  await createHelpApi(1).create({text:'private',clientMessageId:'exact'});
  expect(apiClient).toHaveBeenCalledWith('/help/tickets',expect.objectContaining({
    skipAuth:true,headers:{Authorization:`Bearer ${jwt(1)}`},body:{text:'private',clientMessageId:'exact'},
  }));
});

test('401 refresh cannot replay an old mutation under a new account', async () => {
  (apiClient as jest.Mock).mockResolvedValue({ok:false,status:401});
  (refreshToken as jest.Mock).mockImplementation(async()=> {
    (getAccessToken as jest.Mock).mockResolvedValue(jwt(2)); return jwt(2);
  });
  await expect(createHelpApi(1).create({text:'private'})).rejects.toMatchObject({code:'HELP_ACCOUNT_CHANGED',status:0});
  expect(apiClient).toHaveBeenCalledTimes(1);
});

test('401 refresh retries the exact payload only for the same account', async () => {
  (apiClient as jest.Mock).mockResolvedValueOnce({ok:false,status:401}).mockResolvedValueOnce({ok:true,status:200,data:{id:1}});
  (refreshToken as jest.Mock).mockResolvedValue(jwt(1,2));
  const body={text:'private',clientMessageId:'immutable'};
  await createHelpApi(1).create(body);
  expect(apiClient).toHaveBeenCalledTimes(2);
  expect((apiClient as jest.Mock).mock.calls[1][1]).toEqual(expect.objectContaining({skipAuth:true,body,headers:{Authorization:`Bearer ${jwt(1,2)}`}}));
});

test('switch during async blob preparation prevents upload into the new account', async () => {
  Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});
  const append=jest.spyOn(FormData.prototype,'append').mockImplementation(()=>{});
  global.fetch=jest.fn(async()=>({blob:async()=>{
    (getAccessToken as jest.Mock).mockResolvedValue(jwt(2)); return {type:'image/png'};
  }})) as any;
  try {
    await expect(uploadHelpFiles([{uri:'blob:local-private',name:'private.png'}],1)).rejects.toMatchObject({code:'HELP_ACCOUNT_CHANGED'});
    expect(apiClient).not.toHaveBeenCalled();
  } finally { append.mockRestore(); }
});

test('a response received after switching account retains unknown outcome instead of exposing data', async () => {
  (apiClient as jest.Mock).mockImplementation(async()=>{
    (getAccessToken as jest.Mock).mockResolvedValue(jwt(2)); return {ok:true,status:200,data:{private:true}};
  });
  await expect(createHelpApi(1).create({text:'private'})).rejects.toMatchObject({code:'HELP_ACCOUNT_CHANGED',status:0});
});

test('media 401 refresh never fetches again with another account bearer', async () => {
  Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});
  global.fetch=jest.fn(async()=>({ok:false,status:401})) as any;
  (refreshToken as jest.Mock).mockImplementation(async()=>{
    (getAccessToken as jest.Mock).mockResolvedValue(jwt(2)); return jwt(2);
  });
  await expect(loadHelpMedia({url:'/help/attachments/private/content'} as HelpAttachment,1)).rejects.toMatchObject({code:'HELP_ACCOUNT_CHANGED'});
  expect(global.fetch).toHaveBeenCalledTimes(1);
});
test('native image cache keys include account and API scope', async () => {
  Object.defineProperty(Platform,'OS',{configurable:true,value:'android'});
  const attachment={id:'photo-1',url:'/help/attachments/photo-1/content'} as HelpAttachment;
  expect(await loadHelpMedia(attachment,1)).toMatchObject({cacheKey:'help:1:photo-1:https://dev.example.test'});
  (getAccessTokenForRequest as jest.Mock).mockResolvedValue(jwt(2));(getAccessToken as jest.Mock).mockResolvedValue(jwt(2));
  expect(await loadHelpMedia(attachment,2)).toMatchObject({cacheKey:'help:2:photo-1:https://dev.example.test'});
});
test('upload accepts ten attachments in original order and rejects eleven before transport', async () => {
  Object.defineProperty(Platform,'OS',{configurable:true,value:'android'});
  const files=Array.from({length:10},(_,i)=>({uri:`file://photo-${i}`,name:`photo-${i}.jpg`,mimeType:'image/jpeg'}));
  const fs=require('expo-file-system/legacy');
  fs.getInfoAsync.mockResolvedValue({exists:true,isDirectory:false});
  fs.createUploadTask.mockImplementation((_url:string,uri:string)=>({uploadAsync:jest.fn(async()=>({status:201,body:JSON.stringify({attachments:[{id:decodeURIComponent(uri.split('/').at(-1)!),name:decodeURIComponent(uri.split('/').at(-1)!)}]})})),cancelAsync:jest.fn()}));
  const result=await uploadHelpFiles(files,1);
  expect(result.map(row=>row.id)).toEqual(files.map(file=>file.name));
  expect(result.map(row=>row.name)).toEqual(files.map(file=>file.name));
  expect(fs.createUploadTask).toHaveBeenCalledTimes(10);
  expect(fs.createUploadTask).toHaveBeenCalledWith('https://dev.example.test/help/attachments',expect.stringMatching(/\/photo-0.jpg$/),expect.objectContaining({fieldName:'files',headers:{Authorization:`Bearer ${jwt(1)}`}}));
  expect(fs.deleteAsync).toHaveBeenCalledTimes(10);
  expect(fs.copyAsync.mock.calls.map((call:any)=>call[0].from)).toEqual(files.map(file=>file.uri));
  await expect(uploadHelpFiles([...files,files[0]],1)).rejects.toThrow('от 1 до 10');
  expect(fs.createUploadTask).toHaveBeenCalledTimes(10);
});

test('missing Android recording fails before HTTP with a file-specific error',async()=>{
  Object.defineProperty(Platform,'OS',{configurable:true,value:'android'});
  const fs=require('expo-file-system/legacy');fs.getInfoAsync.mockResolvedValue({exists:false});
  await expect(uploadHelpFiles([{uri:'file:///gone.m4a',name:'voice.m4a'}],1)).rejects.toMatchObject({code:'HELP_FILE_UNAVAILABLE'});
  expect(fs.createUploadTask).not.toHaveBeenCalled();
});

test('native upload cannot return private attachments after switching account',async()=>{
  Object.defineProperty(Platform,'OS',{configurable:true,value:'android'});
  const fs=require('expo-file-system/legacy');fs.getInfoAsync.mockResolvedValue({exists:true});
  fs.createUploadTask.mockReturnValue({uploadAsync:jest.fn(async()=>{(getAccessToken as jest.Mock).mockResolvedValue(jwt(2));return {status:201,body:JSON.stringify({attachments:[{id:'private'}]})};}),cancelAsync:jest.fn()});
  await expect(uploadHelpFiles([{uri:'file:///voice.m4a',name:'voice.m4a'}],1)).rejects.toMatchObject({code:'HELP_ACCOUNT_CHANGED'});
});

test('native multipart refreshes only the same account after 401',async()=>{
  Object.defineProperty(Platform,'OS',{configurable:true,value:'android'});
  const fs=require('expo-file-system/legacy');fs.getInfoAsync.mockResolvedValue({exists:true});
  fs.createUploadTask.mockReturnValueOnce({uploadAsync:async()=>({status:401,body:'{}'}),cancelAsync:jest.fn()})
    .mockReturnValueOnce({uploadAsync:async()=>({status:201,body:JSON.stringify({attachments:[{id:'voice'}]})}),cancelAsync:jest.fn()});
  (refreshToken as jest.Mock).mockImplementation(async()=>{(getAccessToken as jest.Mock).mockResolvedValue(jwt(1,2));return jwt(1,2);});
  expect(await uploadHelpFiles([{uri:'file:///voice.m4a',name:'voice.m4a'}],1)).toEqual([{id:'voice'}]);
  expect(fs.createUploadTask.mock.calls[1][2].headers.Authorization).toBe(`Bearer ${jwt(1,2)}`);
});

test('failed native upload removes only its temporary named copy',async()=>{
  Object.defineProperty(Platform,'OS',{configurable:true,value:'android'});
  const fs=require('expo-file-system/legacy');fs.getInfoAsync.mockResolvedValue({exists:true});
  fs.createUploadTask.mockReturnValue({uploadAsync:jest.fn().mockRejectedValue(new Error('native network failure')),cancelAsync:jest.fn()});
  await expect(uploadHelpFiles([{uri:'file:///recording.m4a',name:'../запись.m4a'}],1)).rejects.toMatchObject({code:'HELP_UPLOAD_FAILED'});
  expect(fs.copyAsync).toHaveBeenCalledWith({from:'file:///recording.m4a',to:expect.stringMatching(/\/\.\._%D0/)});
  expect(fs.deleteAsync).toHaveBeenCalledWith(expect.stringMatching(/^file:\/\/\/cache\/help-upload-[^/]+\/$/),{idempotent:true});
  expect(fs.deleteAsync).not.toHaveBeenCalledWith('file:///recording.m4a',expect.anything());
});

test('sent voice retains an independent account-scoped local copy and replay does not download',async()=>{
 Object.defineProperty(Platform,'OS',{configurable:true,value:'android'});
 const fs=require('expo-file-system/legacy'),known=new Set(['file:///draft/voice.m4a']);
 const attachment={id:'sent-voice',url:'/help/attachments/sent-voice/content',name:'voice.m4a',mimeType:'audio/mp4',kind:'AUDIO',size:128} as HelpAttachment;
 fs.getInfoAsync.mockImplementation(async(uri:string)=>({exists:known.has(uri),isDirectory:false,size:128}));
 fs.copyAsync.mockImplementation(async({from,to}:{from:string;to:string})=>{if(!known.has(from))throw Error('missing');known.add(to);});
 fs.createUploadTask.mockImplementation((_url:string,_uri:string,_options:any,onProgress:any)=>({uploadAsync:async()=>{onProgress?.({totalBytesSent:64,totalBytesExpectedToSend:128});return{status:201,body:JSON.stringify({attachments:[attachment]})};},cancelAsync:jest.fn()}));
 const progress=jest.fn();await uploadHelpFiles([{uri:'file:///draft/voice.m4a',name:'voice.m4a'}],1,progress);
 expect(progress).toHaveBeenCalledWith({transferred:64,total:128});
 known.delete('file:///draft/voice.m4a');
 const source=await loadHelpMedia(attachment,1);
 expect(source.uri).toContain('/help-audio/https%3A%2F%2Fdev.example.test/1/sent-voice.m4a');
 expect(fs.createDownloadResumable).not.toHaveBeenCalled();
 (getAccessTokenForRequest as jest.Mock).mockResolvedValue(jwt(2));(getAccessToken as jest.Mock).mockResolvedValue(jwt(2));
 await expect(loadHelpMedia(attachment,1)).rejects.toMatchObject({code:'HELP_ACCOUNT_CHANGED'});
});

test('remote voice downloads with measured byte progress and native cache replays without network',async()=>{
 Object.defineProperty(Platform,'OS',{configurable:true,value:'android'});
 const fs=require('expo-file-system/legacy'),known=new Set<string>();
 const attachment={id:'remote-voice',url:'/help/attachments/remote-voice/content',name:'remote.m4a',mimeType:'audio/mp4',kind:'AUDIO',size:200} as HelpAttachment;
 fs.getInfoAsync.mockImplementation(async(uri:string)=>({exists:known.has(uri),isDirectory:false,size:200}));
 fs.moveAsync.mockImplementation(async({from,to}:{from:string;to:string})=>{known.delete(from);known.add(to);});
 const cancel=jest.fn(async()=>{});
 fs.createDownloadResumable.mockImplementation((_url:string,path:string,_options:any,onProgress:any)=>({downloadAsync:async()=>{onProgress({totalBytesWritten:50,totalBytesExpectedToWrite:200});known.add(path);return{status:200,uri:path};},cancelAsync:cancel}));
 const progress=jest.fn(),source=await loadHelpMedia(attachment,1,{onProgress:progress});
 expect(progress.mock.calls.map((call:any)=>call[0])).toEqual([{transferred:50,total:200},{transferred:200,total:200}]);
 expect(cancel).toHaveBeenCalledTimes(1);
 expect(await loadHelpMedia(attachment,1)).toEqual(source);
 expect(fs.createDownloadResumable).toHaveBeenCalledTimes(1);
});

test('canceled audio download does not publish its incomplete cache',async()=>{
 Object.defineProperty(Platform,'OS',{configurable:true,value:'android'});
 const fs=require('expo-file-system/legacy'),controller=new AbortController();
 fs.getInfoAsync.mockResolvedValue({exists:false});
 const attachment={id:'cancel-voice',url:'/help/attachments/cancel-voice/content',name:'voice.m4a',kind:'AUDIO',size:200} as HelpAttachment;
 const cancel=jest.fn(async()=>{});
 fs.createDownloadResumable.mockImplementation((_url:string,path:string)=>({downloadAsync:async()=>{controller.abort();return{status:200,uri:path};},cancelAsync:cancel}));
 await expect(loadHelpMedia(attachment,1,{signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});
 expect(fs.moveAsync).not.toHaveBeenCalled();expect(cancel).toHaveBeenCalled();
 expect(fs.deleteAsync).toHaveBeenCalledWith(expect.stringContaining('.part'),{idempotent:true});
});

test('truncated web audio is rejected and cannot become a replay cache hit',async()=>{
 Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});
 const attachment={id:'truncated-web-voice',url:'/help/attachments/truncated-web-voice/content',name:'voice.webm',mimeType:'audio/webm',kind:'AUDIO',size:200} as HelpAttachment;
 global.fetch=jest.fn(async()=>({ok:true,status:200,headers:{get:()=>null},blob:async()=>({size:100})})) as any;
 await expect(loadHelpMedia(attachment,1)).rejects.toThrow('Неполное голосовое');
 await expect(loadHelpMedia(attachment,1)).rejects.toThrow('Неполное голосовое');
 expect(global.fetch).toHaveBeenCalledTimes(2);
});

test('web sent voice reuses its retained Blob after the composer URL is released',async()=>{
 Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});
 const attachment={id:'own-web-voice',url:'/help/attachments/own-web-voice/content',name:'voice.webm',mimeType:'audio/webm',kind:'AUDIO',size:4} as HelpAttachment;
 const blob={size:4,type:'audio/webm'} as File;
 (apiClient as jest.Mock).mockResolvedValue({ok:true,status:201,data:{attachments:[attachment]}});
 const originalForm=global.FormData,originalCreate=URL.createObjectURL;
 global.FormData=class{append(){}} as any;URL.createObjectURL=jest.fn(()=> 'blob:retained-owned-audio');global.fetch=jest.fn() as any;
 try{
   await uploadHelpFiles([{uri:'blob:composer-already-released',file:blob,name:'voice.webm',mimeType:'audio/webm'}],1);
   expect(await loadHelpMedia(attachment,1)).toEqual({uri:'blob:retained-owned-audio'});
   expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
   expect(global.fetch).not.toHaveBeenCalled();
 }finally{global.FormData=originalForm;URL.createObjectURL=originalCreate;}
});

test('audio transcription uses authenticated saved reads and long cancellable recognition',async()=>{
  (apiClient as jest.Mock).mockResolvedValue({ok:true,status:200,data:{attachmentId:'voice-1',status:'transcribed',text:'Заказ'}});
  const signal=new AbortController().signal;
  await createHelpApi(1).audioTranscript('voice-1',false,signal);
  expect(apiClient).toHaveBeenLastCalledWith('/help/attachments/voice-1/transcript',expect.objectContaining({method:'GET',signal,timeoutMs:30000,headers:{Authorization:`Bearer ${jwt(1)}`}}));
  await createHelpApi(1).audioTranscript('voice-1',true,signal);
  expect(apiClient).toHaveBeenLastCalledWith('/help/attachments/voice-1/transcript',expect.objectContaining({method:'POST',body:{},signal,timeoutMs:120000}));
});
test('cancelled transcript does not publish a late successful response',async()=>{
  const controller=new AbortController();
  (apiClient as jest.Mock).mockImplementationOnce(async()=>{controller.abort();return{ok:true,status:200,data:{attachmentId:'voice-1',status:'transcribed',text:'late'}};});
  await expect(createHelpApi(1).audioTranscript('voice-1',false,controller.signal)).rejects.toThrow();
});
