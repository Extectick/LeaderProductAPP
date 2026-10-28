jest.mock('@react-native-async-storage/async-storage', () => {
  const data = new Map<string, string>();
  return { getItem: jest.fn(async (key: string) => data.get(key) ?? null), setItem: jest.fn(async (key: string,value: string) => {data.set(key,value);}), removeItem: jest.fn(async (key: string) => {data.delete(key);}), clear: jest.fn(async () => data.clear()) };
});
jest.mock('@/utils/config', () => ({API_BASE_URL:'https://dev.example.test'}));
jest.mock('@/utils/apiClient', () => ({apiClient:jest.fn()}));
jest.mock('@/utils/tokenService', () => ({getAccessToken:jest.fn(),getAccessTokenForRequest:jest.fn(),refreshToken:jest.fn()}));
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
beforeEach(async () => {
  jest.clearAllMocks(); await AsyncStorage.clear();
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
  const append=jest.spyOn(FormData.prototype,'append').mockImplementation(()=>{});
  (apiClient as jest.Mock).mockReset().mockResolvedValue({ok:true,status:200,data:{attachments:[]}});
  try {
    await uploadHelpFiles(files,1);
    expect(append.mock.calls.map(call=>(call[1] as unknown as {name:string}).name)).toEqual(files.map(file=>file.name));
    expect(apiClient).toHaveBeenCalledTimes(1);
    await expect(uploadHelpFiles([...files,files[0]],1)).rejects.toThrow('от 1 до 10');
    expect(apiClient).toHaveBeenCalledTimes(1);
  }finally{append.mockRestore();}
});
