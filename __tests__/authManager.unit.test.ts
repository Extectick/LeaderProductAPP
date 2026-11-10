const mockAsyncStorage = new Map<string, string>();
const mockSecureStorage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockAsyncStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockAsyncStorage.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    mockAsyncStorage.delete(key);
  }),
  multiGet: jest.fn(async (keys: string[]) => keys.map((key) => [key, mockAsyncStorage.get(key) ?? null])),
  multiSet: jest.fn(async (items: [string, string][]) => {
    items.forEach(([key, value]) => mockAsyncStorage.set(key, value));
  }),
  multiRemove: jest.fn(async (keys: string[]) => {
    keys.forEach((key) => mockAsyncStorage.delete(key));
  }),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecureStorage.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStorage.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStorage.delete(key);
  }),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 35 },
}));

jest.mock('expo-constants', () => ({
  expoConfig: { version: '9.9.9' },
  manifest2: null,
  deviceName: 'Unit Test Device',
}));

jest.mock('@/utils/config', () => ({
  API_BASE_URL: 'http://api.test',
}));

jest.mock('@/src/shared/network/serverStatus', () => ({
  setServerReachable: jest.fn(),
  setServerUnavailable: jest.fn(),
}));

jest.mock('@/src/features/services/storage/servicesAccessCache', () => ({
  clearServicesAccessCache: jest.fn(async () => undefined),
}));

const mockAxiosPost = jest.fn();
jest.mock('axios', () => ({
  post: (...args: any[]) => mockAxiosPost(...args),
}));

describe('auth token manager', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockAsyncStorage.clear();
    mockSecureStorage.clear();
  });

  it('refreshes token with device metadata and stores returned device session', async () => {
    const tokenService = require('@/utils/tokenService');
    await tokenService.saveTokens('old-access', 'old-refresh', { id: 1 }, 'device-old');

    mockAxiosPost.mockResolvedValueOnce({
      data: {
        data: {
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
          deviceSessionId: 'device-new',
          profile: { id: 1 },
        },
      },
    });

    await expect(tokenService.refreshToken()).resolves.toBe('new-access');

    expect(mockAxiosPost).toHaveBeenCalledWith(
      'http://api.test/auth/token',
      expect.objectContaining({
        refreshToken: 'old-refresh',
        deviceSessionId: 'device-old',
        installId: expect.stringMatching(/^lp-/),
        platform: 'android',
        appVersion: '9.9.9',
      }),
      expect.any(Object)
    );
    await expect(tokenService.getRefreshToken()).resolves.toBe('new-refresh');
    await expect(tokenService.getDeviceSessionId()).resolves.toBe('device-new');
  });

  it('uses the token pair written by another runtime without rotating it again', async () => {
    const tokenService = require('@/utils/tokenService');
    await tokenService.saveTokens('old-access', 'old-refresh', { id: 1 }, 'device-1');

    mockAxiosPost.mockImplementationOnce(async () => {
      mockSecureStorage.set('refreshToken', 'rotated-refresh');
      mockSecureStorage.set('accessToken', 'fresh-access-from-other-runtime');
      throw {
        response: {
          status: 409,
          data: {
            message: 'already rotated',
            error: { details: { reason: 'REFRESH_TOKEN_ROTATED' } },
          },
        },
      };
    });
    await expect(tokenService.refreshToken()).resolves.toBe('fresh-access-from-other-runtime');

    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    expect(tokenService.hasAuthSessionExpired()).toBe(false);
    await expect(tokenService.getRefreshToken()).resolves.toBe('rotated-refresh');
  });

  it('recovers when axios exposes refresh rotation conflict without response object', async () => {
    const tokenService = require('@/utils/tokenService');
    await tokenService.saveTokens('old-access', 'old-refresh', { id: 1 }, 'device-1');

    mockAxiosPost.mockImplementationOnce(async () => {
      mockSecureStorage.set('accessToken', 'fresh-access-from-other-runtime');
      mockSecureStorage.set('refreshToken', 'fresh-refresh-from-other-runtime');
      throw {
        status: 409,
        message: 'Request failed with status code 409',
      };
    });

    await expect(tokenService.refreshToken()).resolves.toBe('fresh-access-from-other-runtime');

    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    expect(tokenService.hasAuthSessionExpired()).toBe(false);
    await expect(tokenService.getRefreshToken()).resolves.toBe('fresh-refresh-from-other-runtime');
  });

  it('refreshes an access token shortly before it expires', async () => {
    const tokenService = require('@/utils/tokenService');
    const soonExpiring = `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 30 }))
      .toString('base64url')}.signature`;
    await tokenService.saveTokens(soonExpiring, 'old-refresh', { id: 1 }, 'device-1');
    mockAxiosPost.mockResolvedValueOnce({
      data: {
        data: {
          accessToken: 'fresh-access',
          refreshToken: 'fresh-refresh',
          deviceSessionId: 'device-1',
          profile: { id: 1 },
        },
      },
    });

    await expect(tokenService.getAccessTokenForRequest()).resolves.toBe('fresh-access');
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    await expect(tokenService.getRefreshToken()).resolves.toBe('fresh-refresh');
  });

  it('keeps the local session and backs off refresh attempts while the API is unavailable', async () => {
    const tokenService = require('@/utils/tokenService');
    const expiredRefresh = `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 60 }))
      .toString('base64url')}.signature`;
    await tokenService.saveTokens('expired-access', expiredRefresh, { id: 1 }, 'device-1');
    mockAxiosPost.mockRejectedValueOnce(new Error('Network Error'));

    await expect(tokenService.refreshToken()).resolves.toBeNull();
    await expect(tokenService.refreshToken()).resolves.toBeNull();

    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    expect(tokenService.hasAuthSessionExpired()).toBe(false);
    expect(tokenService.getLastRefreshFailure()).toMatchObject({ kind: 'network' });
    await expect(tokenService.getRefreshToken()).resolves.toBe(expiredRefresh);
    expect(mockAsyncStorage.get('profile')).toBe(JSON.stringify({ id: 1 }));
  });
  it('a token refresh started before avatar upload cannot restore the old profile', async () => {
    const tokenService = require('@/utils/tokenService');
    const cache = require('@/src/features/profile/model/ownProfileCache');
    await tokenService.saveTokens('old-access','old-refresh',{id:1,avatarUrl:'old'},'device');
    let finish!: (value: unknown) => void;
    mockAxiosPost.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const refreshing = tokenService.refreshToken();
    for (let index=0;index<100&&!finish;index++) await Promise.resolve();
    expect(finish).toBeDefined();
    await cache.commitOwnProfileMutation({id:1,avatarUrl:'uploaded'},cache.beginOwnProfileMutation());
    finish({data:{data:{accessToken:'new-access',refreshToken:'new-refresh',profile:{id:1,avatarUrl:'old'},deviceSessionId:'device'}}});
    await refreshing;
    expect(JSON.parse(mockAsyncStorage.get('profile')!)).toMatchObject({id:1,avatarUrl:'uploaded'});
    expect(await tokenService.getAccessToken()).toBe('new-access');
  });

});

/** Resolve only synthetic credentials; these tests never contact an API. */
describe('refresh session races',()=>{
  beforeEach(()=>{
    jest.resetModules();jest.clearAllMocks();mockAxiosPost.mockReset();
    jest.spyOn(console,'warn').mockImplementation(()=>undefined);
    jest.spyOn(console,'error').mockImplementation(()=>undefined);
    mockAsyncStorage.clear();mockSecureStorage.clear();
  });
  const response=(access='rotated-access',refresh='rotated-refresh',id=1)=>({data:{data:{accessToken:access,refreshToken:refresh,profile:{id}}}});
  const invalid=()=>({response:{status:403,data:{message:'Неверный или просроченный refresh токен'}}});
  const settleUntil=async(check:()=>boolean)=>{for(let i=0;i<300&&!check();i++)await Promise.resolve();expect(check()).toBe(true);};

  test.each(['android','web'])('%s: expected invalid refresh expires once without a development error screen or deleting drafts',async platform=>{
    require('react-native').Platform.OS=platform;
    const auth=require('@/utils/tokenService');
    await auth.saveTokens('old-access','old-refresh',{id:1});
    mockAsyncStorage.set('help.draft.1','unsent draft');mockAsyncStorage.set('help.outbox.1','pending operation');
    const expired=jest.fn(),stop=auth.onAuthSessionExpired(expired);
    mockAxiosPost.mockRejectedValueOnce(invalid());
    try{
      expect(await auth.refreshToken()).toBeNull();expect(await auth.refreshToken()).toBeNull();
      expect(expired).toHaveBeenCalledTimes(1);expect(auth.hasAuthSessionExpired()).toBe(true);
      expect(await auth.getAccessToken()).toBeNull();expect(await auth.getRefreshToken()).toBeNull();
      expect(console.error).not.toHaveBeenCalled();
      expect(mockAsyncStorage.get('help.draft.1')).toBe('unsent draft');
      expect(mockAsyncStorage.get('help.outbox.1')).toBe('pending operation');
      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    }finally{stop();}
  });

  test.each(['android','web'])('%s: a token rotated during lock acquisition is reused without another POST',async platform=>{
    require('react-native').Platform.OS=platform;
    const auth=require('@/utils/tokenService'),storage=require('@react-native-async-storage/async-storage');
    await auth.saveTokens('old-access','old-refresh',{id:1});
    const tokens=platform==='web'?mockAsyncStorage:mockSecureStorage;
    let changed=false;
    storage.getItem.mockImplementation(async(key:string)=>{
      if(key==='authRefreshLock'&&!changed){changed=true;tokens.set('accessToken','other-access');tokens.set('refreshToken','other-refresh');}
      return mockAsyncStorage.get(key)??null;
    });
    expect(await auth.refreshToken()).toBe('other-access');
    expect(mockAxiosPost).not.toHaveBeenCalled();expect(auth.hasAuthSessionExpired()).toBe(false);
  });

  test('403 from a spent token recovers an already-written pair without logging an error',async()=>{
    const auth=require('@/utils/tokenService');await auth.saveTokens('old-access','old-refresh',{id:1});
    mockAxiosPost.mockImplementationOnce(async()=>{mockSecureStorage.set('accessToken','other-access');mockSecureStorage.set('refreshToken','other-refresh');throw invalid();});
    expect(await auth.refreshToken()).toBe('other-access');
    expect(console.error).not.toHaveBeenCalled();expect(auth.hasAuthSessionExpired()).toBe(false);
  });

  test.each(['success','403'])('late refresh %s cannot overwrite or expire a newer login',async outcome=>{
    const auth=require('@/utils/tokenService');await auth.saveTokens('old-access','old-refresh',{id:1});
    let finish!:(result:any)=>void,fail!:(error:any)=>void;
    mockAxiosPost.mockImplementationOnce(()=>new Promise((resolve,reject)=>{finish=resolve;fail=reject;}));
    const expired=jest.fn(),stop=auth.onAuthSessionExpired(expired),pending=auth.refreshToken();
    try{
      await settleUntil(()=>Boolean(finish));await auth.saveTokens('account-2-access','account-2-refresh',{id:2});
      if(outcome==='success')finish(response());else fail(invalid());
      expect(await pending).toBeNull();
      expect(await auth.getAccessToken()).toBe('account-2-access');expect(await auth.getRefreshToken()).toBe('account-2-refresh');
      expect(JSON.parse(mockAsyncStorage.get('profile')!)).toEqual({id:2});
      expect(expired).not.toHaveBeenCalled();expect(auth.hasAuthSessionExpired()).toBe(false);
    }finally{stop();}
  });

  test('late refresh cannot restore credentials after logout',async()=>{
    const auth=require('@/utils/tokenService');await auth.saveTokens('old-access','old-refresh',{id:1});
    let finish!:(result:any)=>void;
    mockAxiosPost.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const pending=auth.refreshToken();await settleUntil(()=>Boolean(finish));await auth.logout();finish(response());
    expect(await pending).toBeNull();expect(await auth.getAccessToken()).toBeNull();expect(await auth.getRefreshToken()).toBeNull();
  });

  test('request preflight never falls back to an old access token after a new login',async()=>{
    const auth=require('@/utils/tokenService');
    const old=`e30.${Buffer.from(JSON.stringify({userId:1,exp:Math.floor(Date.now()/1000)+20})).toString('base64url')}.test`;
    await auth.saveTokens(old,'old-refresh',{id:1});
    let finish!:(result:any)=>void;mockAxiosPost.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const pending=auth.getAccessTokenForRequest();await settleUntil(()=>Boolean(finish));
    await auth.saveTokens('new-login-access','new-login-refresh',{id:2});finish(response());
    expect(await pending).toBeNull();expect(await auth.getAccessToken()).toBe('new-login-access');
  });

  test('a login queued during failed-session removal wins and gets no stale expiry event',async()=>{
    const auth=require('@/utils/tokenService'),secure=require('expo-secure-store');
    await auth.saveTokens('old-access','old-refresh',{id:1});
    let finishRemove!:(value?:unknown)=>void;
    secure.deleteItemAsync.mockImplementation(async(key:string)=>{if(key==='accessToken')await new Promise(resolve=>{finishRemove=resolve;});mockSecureStorage.delete(key);});
    const expired=jest.fn(),stop=auth.onAuthSessionExpired(expired);mockAxiosPost.mockRejectedValueOnce(invalid());
    try{
      const pending=auth.refreshToken();await settleUntil(()=>Boolean(finishRemove));
      const login=auth.saveTokens('new-login-access','new-login-refresh',{id:2});finishRemove();
      await Promise.all([pending,login]);
      expect(await auth.getAccessToken()).toBe('new-login-access');expect(await auth.getRefreshToken()).toBe('new-login-refresh');
      expect(expired).not.toHaveBeenCalled();expect(auth.hasAuthSessionExpired()).toBe(false);
    }finally{stop();}
  });
});

describe('browser tab refresh coordination',()=>{
  beforeEach(()=>{jest.resetModules();jest.clearAllMocks();mockAxiosPost.mockReset();mockAsyncStorage.clear();mockSecureStorage.clear();});
  test('two browser runtimes rotate once and consume the same successor',async()=>{
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
    const queues=new Map<string,Promise<unknown>>();
    const request=jest.fn((name:string,_options:any,work:()=>Promise<unknown>)=>{
      const previous=queues.get(name)??Promise.resolve();
      const next=previous.catch(()=>{}).then(work);
      queues.set(name,next);return next;
    });
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request}}});
    try{
      require('react-native').Platform.OS='web';const first=require('@/utils/tokenService');
      await first.saveTokens('old-access','old-refresh',{id:1});
      jest.resetModules();require('react-native').Platform.OS='web';const second=require('@/utils/tokenService');
      let finish!:(data:any)=>void;
      mockAxiosPost.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
      const one=first.refreshToken(),two=second.refreshToken();
      for(let i=0;i<300&&(!finish||request.mock.calls.filter(([name])=>name.endsWith(':refresh')).length<2);i++)await Promise.resolve();
      expect(finish).toBeDefined();expect(request.mock.calls.filter(([name])=>name.endsWith(':refresh'))).toHaveLength(2);
      finish({data:{data:{accessToken:'fresh-access',refreshToken:'fresh-refresh',profile:{id:1}}}});
      expect(await Promise.all([one,two])).toEqual(['fresh-access','fresh-access']);
      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
      expect(await first.getRefreshToken()).toBe('fresh-refresh');expect(await second.getRefreshToken()).toBe('fresh-refresh');
    }finally{
      if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else Reflect.deleteProperty(globalThis,'navigator');
    }
  });
});

describe('credential storage operation fencing',()=>{
  beforeEach(()=>{jest.resetModules();jest.clearAllMocks();mockAxiosPost.mockReset();mockAsyncStorage.clear();mockSecureStorage.clear();});
  const tickUntil=async(check:()=>boolean)=>{for(let i=0;i<300&&!check();i++)await Promise.resolve();expect(check()).toBe(true);};
  const invalid=()=>({response:{status:403,data:{message:'expired'}}});

  test('a failed token write drains its unfinished sibling before the next login can write',async()=>{
    const auth=require('@/utils/tokenService'),secure=require('expo-secure-store'),storage=require('@react-native-async-storage/async-storage');
    let release!:(value?:unknown)=>void;
    secure.setItemAsync.mockImplementation(async(key:string,value:string)=>{
      if(value==='old-access')throw new Error('secure write failed');
      if(value==='old-refresh')await new Promise(resolve=>{release=resolve;});
      mockSecureStorage.set(key,value);
    });
    storage.setItem.mockImplementation(async(key:string,value:string)=>{if(value==='old-access')throw new Error('fallback write failed');mockAsyncStorage.set(key,value);});
    const first=auth.saveTokens('old-access','old-refresh',{id:1}).catch(()=> 'failed');
    await tickUntil(()=>Boolean(release));
    const second=auth.saveTokens('new-access','new-refresh',{id:2});
    for(let i=0;i<30;i++)await Promise.resolve();
    expect(secure.setItemAsync.mock.calls.some(([,value]:string[])=>value==='new-refresh')).toBe(false);
    release();expect(await first).toBe('failed');await second;
    expect(await auth.getAccessToken()).toBe('new-access');expect(await auth.getRefreshToken()).toBe('new-refresh');
  });

  test('a failed removal drains its sibling before a queued login and emits no stale expiration',async()=>{
    const auth=require('@/utils/tokenService'),secure=require('expo-secure-store'),storage=require('@react-native-async-storage/async-storage');
    await auth.saveTokens('old-access','old-refresh',{id:1});
    let release!:(value?:unknown)=>void;
    secure.deleteItemAsync.mockImplementation(async(key:string)=>{if(key==='accessToken')throw new Error('secure removal failed');if(key==='refreshToken')await new Promise(resolve=>{release=resolve;});mockSecureStorage.delete(key);});
    storage.removeItem.mockImplementation(async(key:string)=>{if(key==='accessToken')throw new Error('fallback removal failed');mockAsyncStorage.delete(key);});
    const expired=jest.fn(),stop=auth.onAuthSessionExpired(expired);mockAxiosPost.mockRejectedValueOnce(invalid());
    try{
      const refreshing=auth.refreshToken();await tickUntil(()=>Boolean(release));
      const login=auth.saveTokens('new-access','new-refresh',{id:2});
      for(let i=0;i<30;i++)await Promise.resolve();
      expect(secure.setItemAsync.mock.calls.some(([,value]:string[])=>value==='new-refresh')).toBe(false);
      release();await Promise.all([refreshing,login]);
      expect(await auth.getRefreshToken()).toBe('new-refresh');expect(expired).not.toHaveBeenCalled();expect(auth.hasAuthSessionExpired()).toBe(false);
    }finally{stop();}
  });

  test('late legacy reads cannot repopulate tokens after logout',async()=>{
    const auth=require('@/utils/tokenService'),storage=require('@react-native-async-storage/async-storage');
    mockAsyncStorage.set('authApiBaseUrl','http://api.test');mockAsyncStorage.set('accessToken','legacy-access');mockAsyncStorage.set('refreshToken','legacy-refresh');
    let release!:(value:unknown)=>void,paused=false;
    storage.getItem.mockImplementation(async(key:string)=>{if(key==='accessToken'&&!paused){paused=true;return new Promise(resolve=>{release=resolve;});}return mockAsyncStorage.get(key)??null;});
    const reading=auth.getAccessToken();await tickUntil(()=>Boolean(release));await auth.logout();release('legacy-access');
    expect(await reading).toBeNull();expect(await auth.getAccessToken()).toBeNull();expect(await auth.getRefreshToken()).toBeNull();expect(mockSecureStorage.size).toBe(0);
  });

  test('a storage timeout while recovering from 403 is transient and preserves credentials',async()=>{
    const auth=require('@/utils/tokenService'),secure=require('expo-secure-store');
    await auth.saveTokens('old-access','old-refresh',{id:1});
    let failRead=false;
    secure.getItemAsync.mockImplementation(async(key:string)=>{if(key==='refreshToken'&&failRead){failRead=false;const error=new Error('timeout');error.name='TimeoutError';throw error;}return mockSecureStorage.get(key)??null;});
    mockAxiosPost.mockImplementationOnce(async()=>{failRead=true;throw invalid();});
    expect(await auth.refreshToken()).toBeNull();expect(auth.hasAuthSessionExpired()).toBe(false);
    expect(auth.getLastRefreshFailure()).toMatchObject({kind:'unknown',status:503});
    expect(await auth.getAccessToken()).toBe('old-access');expect(await auth.getRefreshToken()).toBe('old-refresh');
  });
});

test('a cross-runtime account change cannot supply credentials to an older request',async()=>{
  jest.resetModules();jest.clearAllMocks();mockAxiosPost.mockReset();mockAsyncStorage.clear();mockSecureStorage.clear();jest.useFakeTimers();
  try{
    const auth=require('@/utils/tokenService'),storage=require('@react-native-async-storage/async-storage');
    const jwt=(userId:number,seconds:number)=>`e30.${Buffer.from(JSON.stringify({userId,exp:Math.floor(Date.now()/1000)+seconds})).toString('base64url')}.test`;
    const old=jwt(1,20),current=jwt(2,3600);
    await auth.saveTokens(old,'old-refresh',{id:1});let changed=false;
    storage.getItem.mockImplementation(async(key:string)=>{if(key==='authRefreshLock'&&!changed){changed=true;mockSecureStorage.set('accessToken',current);mockSecureStorage.set('refreshToken','other-account-refresh');}return mockAsyncStorage.get(key)??null;});
    const pending=auth.getAccessTokenForRequest();await jest.runAllTimersAsync();
    expect(await pending).toBeNull();expect(mockAxiosPost).not.toHaveBeenCalled();
    expect(await auth.getAccessToken()).toBe(current);expect(await auth.getRefreshToken()).toBe('other-account-refresh');
    expect(auth.hasAuthSessionExpired()).toBe(false);
  }finally{jest.useRealTimers();}
});

describe('foreground auth recovery', () => {
  beforeEach(() => {
    jest.resetModules(); jest.clearAllMocks(); mockAxiosPost.mockReset();
    mockAsyncStorage.clear(); mockSecureStorage.clear();
    jest.useFakeTimers();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.useRealTimers());
  const jwt = (userId: number, seconds = 30) => `e30.${Buffer.from(JSON.stringify({ userId, exp: Math.floor(Date.now() / 1000) + seconds })).toString('base64url')}.test`;
  const settleUntil = async (check: () => boolean) => {
    for (let index = 0; index < 300 && !check(); index++) await Promise.resolve();
    expect(check()).toBe(true);
  };

  test.each(['android', 'web'] as const)('%s: recovery signals expedite a transient retry and concurrent consumers rotate only once', async (platform) => {
    require('react-native').Platform.OS = platform;
    const auth = require('@/utils/tokenService');
    const old = jwt(1), fresh = jwt(1, 3600);
    await auth.saveTokens(old, 'old-refresh', { id: 1 });
    mockAxiosPost.mockRejectedValueOnce(new Error('offline'));
    expect(await auth.refreshToken()).toBeNull();
    expect(await auth.refreshToken()).toBeNull();
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);

    expect(auth.resumeAuthRefresh()).toBe(true);
    for (let index = 0; index < 20; index++) expect(auth.resumeAuthRefresh()).toBe(false);
    expect(mockAxiosPost).toHaveBeenCalledTimes(1); // resuming does not send by itself
    let finish!: (value: unknown) => void;
    mockAxiosPost.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const consumers = [auth.getAccessTokenForRequest(), auth.getAccessTokenForRequest(), auth.getAccessTokenForRequest()];
    await settleUntil(() => Boolean(finish));
    expect(auth.resumeAuthRefresh()).toBe(false);
    expect(mockAxiosPost).toHaveBeenCalledTimes(2);
    finish({ data: { accessToken: fresh, refreshToken: 'fresh-refresh' } });
    expect(await Promise.all(consumers)).toEqual([fresh, fresh, fresh]);
    expect(await auth.getRefreshToken()).toBe('fresh-refresh');
    expect(auth.hasAuthSessionExpired()).toBe(false);
  });

  test('a failed expedited server retry retains backoff and repeated foreground events are rate limited', async () => {
    const auth = require('@/utils/tokenService');
    await auth.saveTokens(jwt(1), 'old-refresh');
    mockAxiosPost.mockRejectedValue({ response: { status: 503, data: { message: 'unavailable' } } });
    await auth.refreshToken();
    expect(auth.resumeAuthRefresh()).toBe(true);
    await auth.refreshToken();
    await jest.advanceTimersByTimeAsync(4999);
    expect(auth.resumeAuthRefresh()).toBe(false);
    await auth.refreshToken();
    expect(mockAxiosPost).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    // Ordinary retry still observes the increased 10s backoff.
    await auth.refreshToken();
    expect(mockAxiosPost).toHaveBeenCalledTimes(2);
    expect(auth.resumeAuthRefresh()).toBe(true);
    await auth.refreshToken();
    expect(mockAxiosPost).toHaveBeenCalledTimes(3);
  });

  test.each([401, 403, 429])('foreground cannot bypass refresh status %s', async (status) => {
    const auth = require('@/utils/tokenService');
    await auth.saveTokens(jwt(1), 'old-refresh');
    mockAxiosPost.mockRejectedValueOnce({ response: { status, data: { message: 'rejected' } } });
    await auth.refreshToken();
    expect(auth.resumeAuthRefresh()).toBe(false);
    await auth.refreshToken();
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    expect(auth.hasAuthSessionExpired()).toBe(status !== 429);
    if (status === 429) expect(await auth.getRefreshToken()).toBe('old-refresh');
  });

  test('foreground does not bypass a rotation conflict or discard its shared recovery', async () => {
    const auth = require('@/utils/tokenService');
    await auth.saveTokens(jwt(1), 'old-refresh');
    mockAxiosPost.mockRejectedValueOnce({ response: { status: 409, data: { message: 'REFRESH_TOKEN_ROTATED' } } });
    const pending = auth.refreshToken();
    await jest.advanceTimersByTimeAsync(4999);
    expect(auth.resumeAuthRefresh()).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(await pending).toBeNull();
    expect(auth.getLastRefreshFailure()).toMatchObject({ kind: 'rotated' });
    expect(auth.resumeAuthRefresh()).toBe(false);
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    expect(await auth.getRefreshToken()).toBe('old-refresh');
  });

  test('an expedited refresh cannot expire a newer login after its late 403', async () => {
    const auth = require('@/utils/tokenService');
    await auth.saveTokens(jwt(1), 'old-refresh');
    mockAxiosPost.mockRejectedValueOnce(new Error('offline'));
    await auth.refreshToken();
    expect(auth.resumeAuthRefresh()).toBe(true);
    let fail!: (error: unknown) => void;
    mockAxiosPost.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    const pending = auth.refreshToken();
    await settleUntil(() => Boolean(fail));
    expect(auth.resumeAuthRefresh()).toBe(false);
    const current = jwt(2, 3600);
    await auth.saveTokens(current, 'new-login-refresh', { id: 2 });
    fail({ response: { status: 403, data: { message: 'expired' } } });
    expect(await pending).toBeNull();
    expect(await auth.getAccessToken()).toBe(current);
    expect(await auth.getRefreshToken()).toBe('new-login-refresh');
    expect(auth.hasAuthSessionExpired()).toBe(false);
  });
});
