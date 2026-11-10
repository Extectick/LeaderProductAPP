import type { Socket } from 'socket.io-client';

const mockGetToken = jest.fn();
const mockRefresh = jest.fn();
const mockResumeRefresh = jest.fn();
const mockPlatform={OS:'android'};
const mockAppState={currentState:'active',addEventListener:jest.fn((_event,listener)=>{mockStateListener=listener;return{remove:mockRemoveStateListener};})};
const mockRemoveStateListener = jest.fn();
let mockStateListener: (state: string) => void;
jest.mock('react-native', () => ({get Platform(){return mockPlatform;},get AppState(){return mockAppState;}}));
jest.mock('../utils/config', () => ({ API_BASE_URL:'https://dev.example.test/api' }));
jest.mock('../utils/tokenService', () => ({getAccessTokenForRequest:()=>mockGetToken(),refreshToken:()=>mockRefresh(),resumeAuthRefresh:()=>mockResumeRefresh()}));
const mockConnections: {options:any;socket:any;disconnect:jest.Mock;getSocket:jest.Mock;recover:jest.Mock}[]=[];
const mockCreate = jest.fn((options:any)=>{
  const socket={disconnect:jest.fn(),connected:true};
  const instance={options,socket,disconnect:jest.fn(),getSocket:jest.fn(()=>socket),recover:jest.fn()};
  mockConnections.push(instance);return instance;
});
jest.mock('../src/shared/socket/managedSocket', () => ({createManagedSocketConnection:(options:any)=>mockCreate(options)}));
import { createHelpSocket } from '../src/features/help/helpSocket';

function token(userId=5, suffix='a', seconds=300) {return `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({userId,exp:Math.floor(Date.now()/1000)+seconds,jti:suffix})).toString('base64url')}.signature`;}
async function flush(){for(let i=0;i<20;i++)await Promise.resolve();}
const originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
const originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
function web(){
  mockPlatform.OS='web';
  const target=()=>{const listeners=new Map<string,Set<Function>>();return{
    addEventListener:(event:string,listener:Function)=>{if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event)!.add(listener);},
    removeEventListener:(event:string,listener:Function)=>listeners.get(event)?.delete(listener),
    dispatch:(event:string)=>{for(const listener of [...listeners.get(event)??[]])listener();},
    count:()=>[...listeners.values()].reduce((n,list)=>n+list.size,0),
  };};
  const doc={...target(),visibilityState:'visible'},win=target();
  Object.defineProperty(globalThis,'document',{configurable:true,value:doc});Object.defineProperty(globalThis,'window',{configurable:true,value:win});
  return{doc,win,visibility:(value:string)=>{doc.visibilityState=value;doc.dispatch('visibilitychange');}};
}
describe('Help scoped socket token rotation',()=>{
  beforeEach(()=>{jest.useFakeTimers();mockPlatform.OS='android';mockAppState.currentState='active';mockResumeRefresh.mockReset().mockReturnValue(false);mockConnections.length=0;mockCreate.mockClear();mockRemoveStateListener.mockClear();mockGetToken.mockReset().mockResolvedValue(token());mockRefresh.mockReset().mockResolvedValue(token(5,'refreshed'));});
  afterEach(()=>{
    if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);else delete (globalThis as any).document;
    if(originalWindow)Object.defineProperty(globalThis,'window',originalWindow);else delete (globalThis as any).window;
    jest.clearAllTimers();jest.useRealTimers();
  });
  test('binds only validated current-account token and forwards socket readiness',async()=>{
    const ready=jest.fn();const connection=createHelpSocket(5,ready);await flush();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(await mockConnections[0].options.getAccessToken()).toBe(await mockGetToken());
    mockConnections[0].options.onSocketReady(mockConnections[0].socket);
    expect(ready).toHaveBeenCalledWith(mockConnections[0].socket);expect(connection.getSocket()).toBe(mockConnections[0].socket);
    connection.disconnect();
  });
  test('rotated token replaces live connection after 30 seconds; unchanged token does not churn',async()=>{
    const connection=createHelpSocket(5,jest.fn());await flush();
    jest.advanceTimersByTime(30_000);await flush();expect(mockCreate).toHaveBeenCalledTimes(1);
    mockGetToken.mockResolvedValue(token(5,'b'));jest.advanceTimersByTime(30_000);await flush();
    expect(mockConnections[0].disconnect).toHaveBeenCalledTimes(1);expect(mockCreate).toHaveBeenCalledTimes(2);
    connection.disconnect();
  });
  test('foreground refreshes immediately and deduplicates overlapping checks',async()=>{
    const connection=createHelpSocket(5,jest.fn());await flush();
    let resolve!:(value:string)=>void;mockGetToken.mockReturnValue(new Promise<string>(done=>{resolve=done;}));
    mockStateListener('active');mockStateListener('active');jest.advanceTimersByTime(5_000);
    expect(mockGetToken).toHaveBeenCalledTimes(2);
    resolve(token(5,'foreground'));await flush();expect(mockCreate).toHaveBeenCalledTimes(2);connection.disconnect();
  });
  test.each([null,'broken',token(6),token(5,'expired',-1)])('refuses missing, malformed, foreign or expired JWT: %s',async(value)=>{
    mockGetToken.mockResolvedValue(value);const connection=createHelpSocket(5,jest.fn());await flush();
    expect(mockCreate).not.toHaveBeenCalled();expect(connection.getSocket()).toBeNull();connection.disconnect();
  });
  test('account switch disconnects old socket and never opens one as the other account',async()=>{
    const connection=createHelpSocket(5,jest.fn());await flush();mockGetToken.mockResolvedValue(token(6));
    mockStateListener('active');await flush();
    expect(mockConnections[0].disconnect).toHaveBeenCalledTimes(1);expect(mockCreate).toHaveBeenCalledTimes(1);expect(connection.getSocket()).toBeNull();connection.disconnect();
  });
  test('managed reconnect and forced refresh also reject another account',async()=>{
    const connection=createHelpSocket(5,jest.fn());await flush();mockRefresh.mockResolvedValue(token(6));
    expect(await mockConnections[0].options.refreshAccessToken()).toBeNull();
    expect(mockConnections[0].disconnect).toHaveBeenCalledTimes(1);
    expect(connection.getSocket()).toBeNull();connection.disconnect();
  });
  test('cleanup blocks pending token result, removes listener/timers, and suppresses stale readiness',async()=>{
    let resolve!:(value:string)=>void;mockGetToken.mockReturnValue(new Promise<string>(done=>{resolve=done;}));
    const ready=jest.fn();const connection=createHelpSocket(5,ready);connection.disconnect();resolve(token());await flush();
    expect(mockCreate).not.toHaveBeenCalled();expect(mockRemoveStateListener).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);expect(connection.getSocket()).toBeNull();
    mockGetToken.mockResolvedValue(token());const second=createHelpSocket(5,ready);await flush();second.disconnect();
    mockConnections[0].options.onSocketReady(mockConnections[0].socket);
    expect(ready).not.toHaveBeenCalled();expect(mockConnections[0].socket.disconnect).toHaveBeenCalledTimes(1);
  });
  test('same-token disconnected socket requests recovery and coalesces concurrent checks',async()=>{
    const connection=createHelpSocket(5,jest.fn());await flush();mockConnections[0].socket.connected=false;
    connection.recover?.();connection.recover?.();mockStateListener('active');await flush();
    expect(mockConnections[0].recover).toHaveBeenCalledTimes(1);expect(mockCreate).toHaveBeenCalledTimes(1);connection.disconnect();
  });
  test('a stalled token read times out and a later foreground check recovers; late result is ignored',async()=>{
    const connection=createHelpSocket(5,jest.fn());await flush();
    let resolve!:(value:string)=>void;mockGetToken.mockReturnValueOnce(new Promise<string>(done=>{resolve=done;}));
    mockStateListener('active');jest.advanceTimersByTime(12_000);await flush();
    mockGetToken.mockResolvedValue(token(5,'fresh'));mockStateListener('active');await flush();
    expect(mockCreate).toHaveBeenCalledTimes(2);resolve(token(5,'stale'));await flush();
    expect(mockCreate).toHaveBeenCalledTimes(2);connection.disconnect();expect(jest.getTimerCount()).toBe(0);
  });

  test.each(['timeout','abort'])('abandoned managed auth read cannot trigger a late forced refresh: %s',async(reason)=>{
    const connection=createHelpSocket(5,jest.fn());await flush();
    let resolve!:(value:string)=>void;mockGetToken.mockReturnValueOnce(new Promise<string>(done=>{resolve=done;}));
    const controller=new AbortController();
    const pending=mockConnections[0].options.refreshAccessToken(controller.signal);
    if(reason==='abort')controller.abort();else jest.advanceTimersByTime(12_000);
    await flush();expect(await pending).toBeNull();resolve(token());await flush();
    expect(mockRefresh).not.toHaveBeenCalled();connection.disconnect();
  });

  test('web hide retains its connection, pauses token checks and resume coalesces liveness recovery',async()=>{
    const browser=web(),connection=createHelpSocket(5,jest.fn());await flush();browser.visibility('hidden');
    browser.win.dispatch('online');connection.recover?.();jest.advanceTimersByTime(60_000);await flush();
    expect(mockGetToken).toHaveBeenCalledTimes(1);expect(mockResumeRefresh).not.toHaveBeenCalled();expect(mockConnections[0].disconnect).not.toHaveBeenCalled();
    browser.visibility('visible');browser.win.dispatch('focus');browser.win.dispatch('online');await flush();
    expect(mockGetToken).toHaveBeenCalledTimes(2);expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockConnections[0].recover).toHaveBeenCalledTimes(1);expect(mockConnections[0].recover).toHaveBeenCalledWith({reason:'online',replaceConnected:false});
    connection.disconnect();expect(browser.doc.count()+browser.win.count()).toBe(0);expect(jest.getTimerCount()).toBe(0);
  });

  test.each(['web','android'])('resume starts a fresh token check and late hidden results cannot bind: %s',async(platform)=>{
    const browser=platform==='web'?web():null;
    const visibility=(visible:boolean)=>{if(browser)browser.visibility(visible?'visible':'hidden');else{mockAppState.currentState=visible?'active':'background';mockStateListener(mockAppState.currentState);}};
    let resolve!:(value:string)=>void;mockGetToken.mockImplementationOnce(()=>new Promise<string>(done=>{resolve=done;}));
    const connection=createHelpSocket(5,jest.fn());visibility(false);mockGetToken.mockResolvedValue(token(5,'fresh'));visibility(true);await flush();
    expect(mockCreate).toHaveBeenCalledTimes(1);resolve(token(6));await flush();
    expect(mockCreate).toHaveBeenCalledTimes(1);expect(mockConnections[0].disconnect).not.toHaveBeenCalled();connection.disconnect();
  });

  test('a hidden initial mount defers authentication until the page becomes visible',async()=>{
    const browser=web();browser.visibility('hidden');const connection=createHelpSocket(5,jest.fn());await flush();
    expect(mockGetToken).not.toHaveBeenCalled();browser.visibility('visible');await flush();expect(mockCreate).toHaveBeenCalledTimes(1);connection.disconnect();
  });

  test('coalesced foreground recovery retains an explicit failed subscription replacement',async()=>{
    const connection=createHelpSocket(5,jest.fn());await flush();
    connection.recover?.({reason:'subscription',replaceConnected:true});expect(mockResumeRefresh).not.toHaveBeenCalled();
    mockStateListener('active');await flush();
    expect(mockResumeRefresh).toHaveBeenCalledTimes(1);expect(mockConnections[0].recover).toHaveBeenCalledTimes(1);
    expect(mockConnections[0].recover).toHaveBeenCalledWith({reason:'foreground',replaceConnected:true});connection.disconnect();
  });

  test.each(['web','android'])('background discards a pending failed-probe replacement before resume: %s',async(platform)=>{
    const browser=platform==='web'?web():null;
    const visibility=(visible:boolean)=>{if(browser)browser.visibility(visible?'visible':'hidden');else{mockAppState.currentState=visible?'active':'background';mockStateListener(mockAppState.currentState);}};
    const connection=createHelpSocket(5,jest.fn());await flush();
    let resolve!:(value:string)=>void;mockGetToken.mockImplementationOnce(()=>new Promise<string>(done=>{resolve=done;}));
    connection.recover?.({reason:'subscription',replaceConnected:true});visibility(false);
    const healthy={connected:true,disconnect:jest.fn()};mockConnections[0].getSocket.mockReturnValue(healthy);
    visibility(true);await flush();resolve(token());await flush();
    expect(mockConnections[0].recover).toHaveBeenCalledTimes(1);
    expect(mockConnections[0].recover).toHaveBeenCalledWith({reason:'foreground',replaceConnected:false});
    expect(connection.getSocket()).toBe(healthy);connection.disconnect();
  });

  test('a delayed failed-probe replacement cannot replace another transport installed by managed reconnect',async()=>{
    const connection=createHelpSocket(5,jest.fn());await flush();
    let resolve!:(value:string)=>void;mockGetToken.mockImplementationOnce(()=>new Promise<string>(done=>{resolve=done;}));
    connection.recover?.({reason:'subscription',replaceConnected:true});
    const healthy={connected:true,disconnect:jest.fn()};mockConnections[0].getSocket.mockReturnValue(healthy);
    resolve(token());await flush();
    expect(mockConnections[0].recover).toHaveBeenCalledWith({reason:'subscription',replaceConnected:false});
    expect(mockCreate).toHaveBeenCalledTimes(1);expect(connection.getSocket()).toBe(healthy);connection.disconnect();
  });

  test.each(['web','android'].flatMap(platform=>['missing','expired'].map(failed=>({platform,failed}))))('resume retries once after the inherited pre-background refresh settles transiently: $platform/$failed',async({platform,failed})=>{
    const browser=platform==='web'?web():null;
    const visibility=(visible:boolean)=>{if(browser)browser.visibility(visible?'visible':'hidden');else{mockAppState.currentState=visible?'active':'background';mockStateListener(mockAppState.currentState);}};
    const connection=createHelpSocket(5,jest.fn());await flush();
    let resolve!:(value:string|null)=>void,settled=false,backoff=false;
    const inheritedFlight=new Promise<string|null>(done=>{resolve=done;});
    mockGetToken.mockReset().mockImplementation(()=>settled?Promise.resolve(token(5,'fresh')):inheritedFlight);
    mockResumeRefresh.mockImplementation(()=>{if(!backoff)return false;backoff=false;return true;});
    connection.recover?.({reason:'manual'});visibility(false);visibility(true);connection.recover?.({reason:'online'});
    expect(mockGetToken).toHaveBeenCalledTimes(2);
    settled=true;backoff=true;resolve(failed==='expired'?token(5,'old',-1):null);await flush();
    expect(mockGetToken).toHaveBeenCalledTimes(3);expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(connection.getSocket()).toBe(mockConnections[1].socket);connection.disconnect();
  });

  test('a protected refresh backoff or failed expedited attempt does not become a retry loop',async()=>{
    const connection=createHelpSocket(5,jest.fn());await flush();mockGetToken.mockReset().mockResolvedValue(null);
    mockResumeRefresh.mockReturnValue(false);connection.recover?.({reason:'online'});await flush();
    expect(mockGetToken).toHaveBeenCalledTimes(1);
    mockGetToken.mockClear();mockResumeRefresh.mockReset().mockReturnValueOnce(false).mockReturnValue(true);
    connection.recover?.({reason:'manual'});await flush();
    expect(mockGetToken).toHaveBeenCalledTimes(2);expect(mockResumeRefresh).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(5000);await flush();expect(mockGetToken).toHaveBeenCalledTimes(2);connection.disconnect();
  });

  test('an expedited reset accepted before the read forbids another retry after that attempt fails',async()=>{
    const connection=createHelpSocket(5,jest.fn());await flush();
    let resolve!:(value:null)=>void;mockGetToken.mockReset().mockImplementation(()=>new Promise<null>(done=>{resolve=done;}));
    mockResumeRefresh.mockReturnValue(true);connection.recover?.({reason:'manual'});
    jest.advanceTimersByTime(6000);resolve(null);await flush();
    expect(mockGetToken).toHaveBeenCalledTimes(1);expect(mockResumeRefresh).toHaveBeenCalledTimes(1);connection.disconnect();
  });

  test('the single post-flight retry shares the original token deadline and ignores late results',async()=>{
    const connection=createHelpSocket(5,jest.fn());await flush();
    let first!:(value:null)=>void,second!:(value:string)=>void;
    mockGetToken.mockReset().mockImplementationOnce(()=>new Promise<null>(done=>{first=done;})).mockImplementationOnce(()=>new Promise<string>(done=>{second=done;}));
    mockResumeRefresh.mockReset().mockReturnValueOnce(false).mockReturnValue(true);connection.recover?.({reason:'foreground'});
    jest.advanceTimersByTime(11000);first(null);await flush();expect(mockGetToken).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(1000);await flush();second(token(5,'late'));await flush();
    expect(mockCreate).toHaveBeenCalledTimes(1);expect(mockGetToken).toHaveBeenCalledTimes(2);connection.disconnect();
  });

  test('a timed-out original check cannot reset backoff or start a late second request',async()=>{
    const connection=createHelpSocket(5,jest.fn());await flush();let resolve!:(value:null)=>void;
    mockGetToken.mockReset().mockImplementation(()=>new Promise<null>(done=>{resolve=done;}));
    mockResumeRefresh.mockReset().mockReturnValueOnce(false).mockReturnValue(true);connection.recover?.({reason:'online'});
    jest.advanceTimersByTime(12000);await flush();resolve(null);await flush();
    expect(mockGetToken).toHaveBeenCalledTimes(1);expect(mockResumeRefresh).toHaveBeenCalledTimes(1);connection.disconnect();
  });

  test.each(['valid','foreign','expired-foreign','malformed'])('a settled %s token never requests a second refresh after wake',async(kind)=>{
    const currentToken=token();mockGetToken.mockResolvedValue(currentToken);
    const connection=createHelpSocket(5,jest.fn());await flush();let resolve!:(value:string)=>void;
    mockGetToken.mockReset().mockImplementation(()=>new Promise<string>(done=>{resolve=done;}));
    mockResumeRefresh.mockReset().mockReturnValueOnce(false).mockReturnValue(true);
    connection.recover?.({reason:'online'});
    resolve(kind==='valid'?currentToken:kind==='foreign'?token(6):kind==='expired-foreign'?token(6,'expired',-1):'malformed');await flush();
    expect(mockGetToken).toHaveBeenCalledTimes(1);expect(mockResumeRefresh).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    if(kind==='valid')expect(connection.getSocket()).toBe(mockConnections[0].socket);
    else expect(connection.getSocket()).toBeNull();
    connection.disconnect();
  });

});
