import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {Platform} from 'react-native';
import axios from 'axios';
const mockSecure = new Map<string,string>();
jest.mock('expo-secure-store',()=>({
  getItemAsync:jest.fn(async(key:string)=>mockSecure.get(key)??null),
  setItemAsync:jest.fn(async(key:string,value:string)=>{mockSecure.set(key,value);}),
  deleteItemAsync:jest.fn(async(key:string)=>{mockSecure.delete(key);}),
}));
jest.mock('axios',()=>({__esModule:true,default:{post:jest.fn()}}));
jest.mock('expo-constants',()=>({__esModule:true,default:{expoConfig:{version:'test'}}}));
jest.mock('../utils/config',()=>({API_BASE_URL:'https://help-token.example.test'}));
jest.mock('../utils/apiClient',()=>({apiClient:jest.fn()}));
jest.mock('../src/shared/network/serverStatus',()=>({setServerReachable:jest.fn(),setServerUnavailable:jest.fn()}));
jest.mock('../src/features/services/storage/servicesAccessCache',()=>({clearServicesAccessCache:jest.fn(async()=>{})}));
import {apiClient} from '../utils/apiClient';
import {getAccessToken,getAccessTokenForRequest,getRefreshToken,refreshToken,logout,saveTokens,hasAuthSessionExpired,onAuthSessionExpired} from '../utils/tokenService';
import {createHelpApi} from '../src/features/help/helpApi';

const base='https://help-token.example.test';
const token=(userId=121,exp=Math.floor(Date.now()/1000)+3600,version=1)=>`e30.${Buffer.from(JSON.stringify({userId,exp,version})).toString('base64url')}.test`;
const ok={ok:true,status:200,data:{tickets:[],nextCursor:null}};
const client=apiClient as jest.Mock;
const post=axios.post as jest.Mock;
const reads=()=>jest.mocked(SecureStore.getItemAsync).mock.calls.map(([key])=>key);

beforeEach(async()=>{
  jest.replaceProperty(Platform,'OS','android');
  jest.mocked(SecureStore.getItemAsync).mockReset().mockImplementation(async key=>mockSecure.get(key)??null);
  jest.mocked(SecureStore.setItemAsync).mockReset().mockImplementation(async(key,value)=>{mockSecure.set(key,value);});
  await logout();mockSecure.clear();await AsyncStorage.clear();
  await saveTokens(token(),'refresh-test');
  jest.clearAllMocks();client.mockReset().mockResolvedValue(ok);post.mockReset();
});
afterEach(() => jest.useRealTimers());

test('ordinary Help request performs three fresh access reads and no refresh-token reads',async()=>{
  await expect(createHelpApi(121).list('OPEN','mine')).resolves.toEqual(ok.data);
  expect(reads()).toEqual(['accessToken','accessToken','accessToken']);
  expect(AsyncStorage.multiGet).toHaveBeenCalledTimes(3);
  expect(client).toHaveBeenCalledTimes(1);
  expect(client).toHaveBeenCalledWith('/help/tickets?status=OPEN&scope=mine',expect.objectContaining({skipAuth:true,headers:{Authorization:`Bearer ${mockSecure.get('accessToken')}`}}));
});

test('external rotation is visible on the very next read without local invalidation',async()=>{
  const first=await getAccessToken(),next=token(121,Math.floor(Date.now()/1000)+3600,2);
  mockSecure.set('accessToken',next);
  expect(await getAccessToken()).toBe(next);expect(next).not.toBe(first);
  mockSecure.delete('accessToken');mockSecure.delete('refreshToken');
  expect(await getAccessToken()).toBeNull();
});

test('a request bound to the previous account is rejected before the network',async()=>{
  await saveTokens(token(122),'another-refresh');
  await expect(createHelpApi(121).config()).rejects.toMatchObject({code:'HELP_ACCOUNT_CHANGED'});
  expect(client).not.toHaveBeenCalled();
});

test('account switch between capture and pre-send check blocks the request',async()=>{
  jest.mocked(AsyncStorage.multiGet)
    .mockImplementationOnce(async()=>[['authApiBaseUrl',base]])
    .mockImplementationOnce(async()=>{mockSecure.set('accessToken',token(122));return [['authApiBaseUrl',base]];});
  await expect(createHelpApi(121).config()).rejects.toMatchObject({code:'HELP_ACCOUNT_CHANGED'});
  expect(client).not.toHaveBeenCalled();
});

test.each(['logout','switch','external-switch'] as const)('%s during a request rejects its late response',async change=>{
  client.mockImplementationOnce(async()=>{
    if(change==='logout')await logout();
    else if(change==='switch')await saveTokens(token(122),'another-refresh');
    else mockSecure.set('accessToken',token(122));
    return ok;
  });
  await expect(createHelpApi(121).config()).rejects.toMatchObject({code:'HELP_ACCOUNT_CHANGED'});
  expect(client).toHaveBeenCalledTimes(1);
});

test('same-user rotation during a request keeps its valid response',async()=>{
  client.mockImplementationOnce(async()=>{mockSecure.set('accessToken',token(121,Math.floor(Date.now()/1000)+3600,2));return ok;});
  await expect(createHelpApi(121).config()).resolves.toEqual(ok.data);
});

test('401 refresh retries once with the new token and retains account checks',async()=>{
  const next=token(121,Math.floor(Date.now()/1000)+3600,2);
  client.mockResolvedValueOnce({ok:false,status:401}).mockResolvedValueOnce(ok);
  post.mockResolvedValueOnce({data:{accessToken:next,refreshToken:'rotated-refresh'}});
  await expect(createHelpApi(121).config()).resolves.toEqual(ok.data);
  expect(post).toHaveBeenCalledTimes(1);expect(client).toHaveBeenCalledTimes(2);
  expect(client.mock.calls[1][1].headers.Authorization).toBe(`Bearer ${next}`);
  expect(mockSecure.get('refreshToken')).toBe('rotated-refresh');
});

test('401 response after an account switch cannot refresh or retry the new account',async()=>{
  client.mockImplementationOnce(async()=>{await saveTokens(token(122),'other-refresh');return {ok:false,status:401};});
  await expect(createHelpApi(121).config()).rejects.toMatchObject({code:'HELP_ACCOUNT_CHANGED'});
  expect(post).not.toHaveBeenCalled();expect(client).toHaveBeenCalledTimes(1);
});

test('near-expiry access still refreshes before the first Help request',async()=>{
  mockSecure.set('accessToken',token(121,Math.floor(Date.now()/1000)+30));
  const next=token(121,Math.floor(Date.now()/1000)+3600,2);
  post.mockResolvedValueOnce({data:{accessToken:next,refreshToken:'rotated-refresh'}});
  await createHelpApi(121).config();
  expect(post).toHaveBeenCalledTimes(1);
  expect(client.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${next}`);
});

test('refresh conflict recovers tokens rotated by another runtime without another rotation',async()=>{
  mockSecure.set('accessToken',token(121,Math.floor(Date.now()/1000)+30));
  const next=token(121,Math.floor(Date.now()/1000)+3600,2);
  post.mockImplementationOnce(async()=>{
    mockSecure.set('accessToken',next);mockSecure.set('refreshToken','external-rotation');
    throw {response:{status:409,data:{message:'REFRESH_TOKEN_ROTATED'}}};
  });
  await createHelpApi(121).config();
  expect(post).toHaveBeenCalledTimes(1);expect(hasAuthSessionExpired()).toBe(false);
  expect(client.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${next}`);
});

test('offline refresh retains the current access token and existing retry policy',async()=>{
  const current=token(121,Math.floor(Date.now()/1000)+30);mockSecure.set('accessToken',current);
  const error=jest.spyOn(console,'error').mockImplementation(()=>{});
  post.mockRejectedValueOnce(new Error('offline'));
  try{expect(await getAccessTokenForRequest()).toBe(current);expect(hasAuthSessionExpired()).toBe(false);}
  finally{error.mockRestore();}
});

test('invalid refresh expires the session and prevents sending Help data',async()=>{
  mockSecure.set('accessToken',token(121,Math.floor(Date.now()/1000)+30));
  const expired=jest.fn(),stop=onAuthSessionExpired(expired);
  const error=jest.spyOn(console,'error').mockImplementation(()=>{});
  post.mockRejectedValueOnce({response:{status:401,data:{message:'expired'}}});
  try{
    await expect(createHelpApi(121).config()).rejects.toMatchObject({code:'HELP_ACCOUNT_CHANGED'});
    expect(hasAuthSessionExpired()).toBe(true);expect(expired).toHaveBeenCalledTimes(1);
    expect(mockSecure.has('accessToken')).toBe(false);expect(client).not.toHaveBeenCalled();
  }finally{stop();error.mockRestore();}
});

test('changed API scope invalidates stored auth and cannot send a Help request',async()=>{
  await AsyncStorage.setItem('authApiBaseUrl','https://other.example.test');
  const expired=jest.fn(),stop=onAuthSessionExpired(expired);
  try{
    await expect(createHelpApi(121).config()).rejects.toMatchObject({code:'HELP_ACCOUNT_CHANGED'});
    expect(expired).toHaveBeenCalledWith(expect.objectContaining({reason:'api_base_url_changed'}));
    expect(mockSecure.size).toBe(0);expect(client).not.toHaveBeenCalled();
  }finally{stop();}
});

test.each(['matching','missing'] as const)('legacy tokens migrate with %s API scope',async scope=>{
  const current=token();mockSecure.clear();
  await AsyncStorage.setItem('accessToken',current);await AsyncStorage.setItem('refreshToken','legacy-refresh');
  if(scope==='missing')await AsyncStorage.removeItem('authApiBaseUrl');
  expect(await getAccessToken()).toBe(current);
  expect(await getRefreshToken()).toBe('legacy-refresh');
  expect(mockSecure.get('accessToken')).toBe(current);expect(mockSecure.get('refreshToken')).toBe('legacy-refresh');
  expect(await AsyncStorage.getItem('accessToken')).toBeNull();
  expect(await AsyncStorage.getItem('authApiBaseUrl')).toBe(base);
});

test('refresh-only session on another API is still invalidated',async()=>{
  mockSecure.delete('accessToken');await AsyncStorage.setItem('authApiBaseUrl','https://other.example.test');
  expect(await getAccessToken()).toBeNull();expect(mockSecure.has('refreshToken')).toBe(false);
  expect(hasAuthSessionExpired()).toBe(true);
});

test('a mixed secure-access and legacy-refresh store remains refreshable',async()=>{
  mockSecure.delete('refreshToken');await AsyncStorage.setItem('refreshToken','legacy-refresh');
  await createHelpApi(121).config();
  expect(reads()).toEqual(['accessToken','accessToken','accessToken']);
  expect(await getRefreshToken()).toBe('legacy-refresh');
  expect(mockSecure.get('refreshToken')).toBe('legacy-refresh');
  expect(await AsyncStorage.getItem('refreshToken')).toBeNull();
});

test('API scope changed during a request rejects the late response',async()=>{
  client.mockImplementationOnce(async()=>{await AsyncStorage.setItem('authApiBaseUrl','https://other.example.test');return ok;});
  await expect(createHelpApi(121).config()).rejects.toMatchObject({code:'HELP_ACCOUNT_CHANGED'});
  expect(mockSecure.has('accessToken')).toBe(false);expect(client).toHaveBeenCalledTimes(1);
});

test('missing tokens keep the unauthenticated Help response and never reach the network',async()=>{
  await logout();
  await expect(createHelpApi().config()).rejects.toMatchObject({status:401,code:'UNAUTHORIZED'});
  expect(client).not.toHaveBeenCalled();
});

test('SecureStore read failure preserves the existing AsyncStorage fallback',async()=>{
  const current=token();await AsyncStorage.setItem('accessToken',current);
  jest.mocked(SecureStore.getItemAsync).mockRejectedValue(new Error('unavailable'));
  expect(await getAccessToken()).toBe(current);
});

test('web keeps reading current storage rather than retaining a token in memory',async()=>{
  jest.replaceProperty(Platform,'OS','web');
  const current=token();await AsyncStorage.setItem('accessToken',current);
  expect(await getAccessToken()).toBe(current);
  const next=token(122);await AsyncStorage.setItem('accessToken',next);
  expect(await getAccessToken()).toBe(next);expect(reads()).toEqual([]);
});


test('concurrent near-expiry callers share one refresh including its storage preflight',async()=>{
  mockSecure.set('accessToken',token(121,Math.floor(Date.now()/1000)+30));
  const next=token(121,Math.floor(Date.now()/1000)+3600,2);
  let finish!:(value:any)=>void;
  post.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=[getAccessTokenForRequest(),getAccessTokenForRequest(),getAccessTokenForRequest()];
  for(let i=0;i<100;i++)await Promise.resolve();
  expect(post).toHaveBeenCalledTimes(1);
  finish({data:{accessToken:next,refreshToken:'one-rotation'}});
  expect(await Promise.all(pending)).toEqual([next,next,next]);
  expect(post).toHaveBeenCalledTimes(1);
});

test('timed out credential read preserves auth, clears refresh flight and ignores its late result',async()=>{
  jest.useFakeTimers();
  let finish!:(value:string|null)=>void;
  jest.mocked(SecureStore.getItemAsync).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=refreshToken();
  await jest.advanceTimersByTimeAsync(5000);
  await expect(pending).resolves.toBeNull();
  expect(hasAuthSessionExpired()).toBe(false);expect(post).not.toHaveBeenCalled();
  const next=token(121,Math.floor(Date.now()/1000)+3600,2);
  post.mockResolvedValueOnce({data:{accessToken:next,refreshToken:'recovered'}});
  await expect(refreshToken()).resolves.toBe(next);
  finish('obsolete-read');
  await Promise.resolve();await Promise.resolve();
  expect(post).toHaveBeenCalledTimes(1);
  expect(mockSecure.get('accessToken')).toBe(next);
  expect(mockSecure.get('refreshToken')).toBe('recovered');
  jest.useRealTimers();
});

test.each(['android', 'web'] as const)('%s: a Help auth timeout releases its caller but preserves the shared refresh and never sends late', async (platform) => {
  jest.useFakeTimers(); jest.replaceProperty(Platform, 'OS', platform);
  await saveTokens(token(121, Math.floor(Date.now() / 1000) + 30), 'old-refresh');
  let finish!: (value: unknown) => void;
  post.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const request = createHelpApi(121).config();
  const failure = expect(request).rejects.toMatchObject({ status: 408, code: 'REQUEST_TIMEOUT' });
  await jest.advanceTimersByTimeAsync(15000);
  await failure;
  expect(client).not.toHaveBeenCalled();
  expect(hasAuthSessionExpired()).toBe(false);
  expect(await getRefreshToken()).toBe('old-refresh');
  const flight = refreshToken();
  const next = token(121, Math.floor(Date.now() / 1000) + 3600, 2);
  finish({ data: { accessToken: next, refreshToken: 'completed-refresh' } });
  expect(await flight).toBe(next);
  expect(client).not.toHaveBeenCalled();
  await expect(createHelpApi(121).config()).resolves.toEqual(ok.data);
  expect(client).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('a stalled 401 refresh returns a transient Help error without replaying the original mutation later', async () => {
  jest.useFakeTimers();
  client.mockResolvedValueOnce({ ok: false, status: 401 });
  let finish!: (value: unknown) => void;
  post.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const request = createHelpApi(121).react(82, '👍', false);
  const failure = expect(request).rejects.toMatchObject({ status: 408, code: 'REQUEST_TIMEOUT' });
  await jest.advanceTimersByTimeAsync(15000);
  await failure;
  expect(client).toHaveBeenCalledTimes(1);
  expect(hasAuthSessionExpired()).toBe(false);
  const flight = refreshToken();
  finish({ data: { accessToken: token(121, Math.floor(Date.now() / 1000) + 3600, 2), refreshToken: 'completed-refresh' } });
  await flight;
  expect(client).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('a Help timeout does not cancel or release a pending native credential write', async () => {
  jest.useFakeTimers();
  const next = token(121, Math.floor(Date.now() / 1000) + 3600, 2);
  let release!: () => void;
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => {
    if (key === 'accessToken' && value === next) await new Promise<void>(resolve => { release = resolve; });
    mockSecure.set(key, value);
  });
  const login = saveTokens(next, 'login-refresh');
  for (let index = 0; index < 100 && !release; index++) await Promise.resolve();
  expect(release).toBeDefined();
  const failure = expect(createHelpApi(121).config()).rejects.toMatchObject({ status: 408, code: 'REQUEST_TIMEOUT' });
  await jest.advanceTimersByTimeAsync(15000);
  await failure;
  expect(client).not.toHaveBeenCalled(); expect(post).not.toHaveBeenCalled();
  expect(mockSecure.get('accessToken')).not.toBe(next);
  release(); await login;
  await expect(createHelpApi(121).config()).resolves.toEqual(ok.data);
  expect(await getRefreshToken()).toBe('login-refresh');
  expect(await getAccessToken()).toBe(next);
  expect(client).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});
