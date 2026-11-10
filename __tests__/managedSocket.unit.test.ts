const mockStateListeners = new Set<(state: string) => void>();
const mockPlatform = {OS:'android'};
const mockAppState = {currentState: 'active', addEventListener: jest.fn((_event, listener) => {
  mockStateListeners.add(listener); return {remove: () => mockStateListeners.delete(listener)};
})};
jest.mock('react-native', () => ({get Platform() {return mockPlatform;}, get AppState() {return mockAppState;}}));
const mockSockets: any[] = [];
const mockIo = jest.fn((_url, options) => {
  const handlers = new Map<string, Set<Function>>();
  const socket: any = {
    connected: false, options, active: false,
    on: jest.fn((event, handler) => {if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event)!.add(handler); return socket;}),
    off: jest.fn((event, handler) => {handlers.get(event)?.delete(handler); return socket;}),
    emit: jest.fn(), connect: jest.fn(() => {socket.active = true;}),
    dispatch(event: string, ...args: any[]) {for (const handler of [...(handlers.get(event) ?? [])]) handler(...args);},
    disconnect: jest.fn(() => {const connected = socket.connected; socket.connected = false; socket.active = false; if (connected) socket.dispatch('disconnect', 'io client disconnect');}),
  };
  mockSockets.push(socket); return socket;
});
jest.mock('socket.io-client', () => ({io: (...args: any[]) => (mockIo as any)(...args)}));
import {createManagedSocketConnection} from '../src/shared/socket/managedSocket';
const flush = async () => {for (let i = 0; i < 20; i++) await Promise.resolve();};
function state(next: string) {mockAppState.currentState = next; for (const listener of [...mockStateListeners]) listener(next);}
function ready(index = mockSockets.length - 1) {const socket = mockSockets[index]; socket.connected = true; socket.dispatch('connect'); return socket;}
function setup(extra = {}) {return createManagedSocketConnection({url:'https://example.invalid',loggerPrefix:'[test]',getAccessToken:async () => 'same-token',refreshAccessToken:async () => 'renewed-token',onSocketReady:jest.fn(),...extra});}
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
  const doc={...target(),visibilityState:'visible',hasFocus:()=>true},win=target();
  Object.defineProperty(globalThis,'document',{configurable:true,value:doc});
  Object.defineProperty(globalThis,'window',{configurable:true,value:win});
  return {doc,win,visibility:(value:string)=>{doc.visibilityState=value;doc.dispatch('visibilitychange');}};
}
beforeEach(() => {jest.useFakeTimers(); mockPlatform.OS='android'; mockSockets.length = 0; mockIo.mockClear(); mockStateListeners.clear(); mockAppState.currentState = 'active';});
afterEach(() => {
  if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);else delete (globalThis as any).document;
  if(originalWindow)Object.defineProperty(globalThis,'window',originalWindow);else delete (globalThis as any).window;
  jest.clearAllTimers(); jest.useRealTimers();
});

test('lock/unlock replaces the old transport even with the same token; repeated active events do not churn', async () => {
  const connection = setup(); await flush(); const old = ready();
  state('background'); expect(old.disconnect).toHaveBeenCalledTimes(1); expect(connection.getSocket()).toBeNull();
  jest.advanceTimersByTime(60_000); await flush(); expect(mockIo).toHaveBeenCalledTimes(1);
  state('active'); state('active'); await flush(); expect(mockIo).toHaveBeenCalledTimes(2);
  expect(mockSockets[1].options).toMatchObject({autoConnect:false,reconnection:false,forceNew:true,auth:{token:'same-token'}});
  ready(); state('active'); await flush(); expect(mockIo).toHaveBeenCalledTimes(2);
  connection.disconnect(); expect(jest.getTimerCount()).toBe(0);
});

test('a token read resolving after background cannot create a stale socket', async () => {
  let resolve!: (token: string) => void;
  const getAccessToken = jest.fn().mockImplementationOnce(() => new Promise<string>(done => {resolve = done;})).mockResolvedValue('current');
  const connection = setup({getAccessToken}); state('background'); state('active'); await flush();
  expect(mockSockets).toHaveLength(1); resolve('old'); await flush(); expect(mockSockets).toHaveLength(1);
  expect(mockSockets[0].options.auth.token).toBe('current'); connection.disconnect();
});

test('server disconnect retries without relying on Socket.IO automatic reconnect', async () => {
  const connection = setup(); await flush(); const socket = ready();
  socket.connected = false; socket.active = false; socket.dispatch('disconnect','io server disconnect');
  jest.advanceTimersByTime(1200); await flush(); expect(mockSockets).toHaveLength(2); ready(); connection.disconnect();
});

test('hung native handshake is replaced after bounded watchdog and late events are ignored', async () => {
  const connection = setup(); await flush(); const old = mockSockets[0];
  jest.advanceTimersByTime(8000); await flush(); expect(old.disconnect).toHaveBeenCalled();
  jest.advanceTimersByTime(1200); await flush(); ready(); old.dispatch('connect_error',new Error('Unauthorized'));
  expect(connection.getSocket()).toBe(mockSockets[1]); expect(jest.getTimerCount()).toBe(0); connection.disconnect();
});

test('token deadline releases the attempt and ignores its eventual completion', async () => {
  let resolve!: (token: string) => void;
  const getAccessToken = jest.fn().mockImplementationOnce(() => new Promise<string>(done => {resolve = done;})).mockResolvedValue('fresh');
  const connection = setup({getAccessToken}); jest.advanceTimersByTime(15_000); await flush();
  jest.advanceTimersByTime(1200); await flush(); ready(); resolve('late'); await flush();
  expect(mockSockets).toHaveLength(1); expect(mockSockets[0].options.auth.token).toBe('fresh'); connection.disconnect();
});

test('failed subscription recovery coalesces requests and disposes the previous socket', async () => {
  const connection = setup(); await flush(); const old=ready();
  connection.recover?.({reason:'subscription',replaceConnected:true});connection.recover?.({reason:'subscription',replaceConnected:true});connection.recover?.();
  await flush();connection.recover?.();expect(mockSockets).toHaveLength(2);expect(old.disconnect).toHaveBeenCalledTimes(1);
  ready(); connection.disconnect(); expect(jest.getTimerCount()).toBe(0);
});

test('web hide and resume retain a live transport and only update focus presence',async()=>{
  const browser=web(),connection=setup();await flush();const socket=ready();
  browser.visibility('hidden');expect(socket.emit).toHaveBeenLastCalledWith('presence:focus',{focused:false});
  jest.advanceTimersByTime(120_000);await flush();browser.visibility('visible');browser.win.dispatch('online');connection.recover?.();await flush();
  expect(mockSockets).toHaveLength(1);expect(socket.disconnect).not.toHaveBeenCalled();expect(connection.getSocket()).toBe(socket);
  expect(socket.emit).toHaveBeenLastCalledWith('presence:focus',{focused:true});
  connection.disconnect();expect(browser.doc.count()+browser.win.count()).toBe(0);expect(jest.getTimerCount()).toBe(0);
});

test('web disconnection while hidden pauses retries and resume reconnects immediately',async()=>{
  const browser=web(),connection=setup();await flush();const socket=ready();browser.visibility('hidden');
  socket.connected=false;socket.dispatch('disconnect','transport close');browser.win.dispatch('online');
  jest.advanceTimersByTime(120_000);await flush();expect(mockSockets).toHaveLength(1);
  browser.visibility('visible');browser.win.dispatch('online');await flush();expect(mockSockets).toHaveLength(2);
  ready();socket.dispatch('connect_error',new Error('Unauthorized'));expect(connection.getSocket()).toBe(mockSockets[1]);connection.disconnect();
});

test('web hiding an incomplete handshake cancels it and ignores its late events',async()=>{
  const browser=web(),connection=setup();await flush();const stale=mockSockets[0];browser.visibility('hidden');
  stale.connected=true;stale.dispatch('connect');stale.dispatch('connect_error',new Error('Unauthorized'));
  jest.advanceTimersByTime(120_000);await flush();expect(connection.getSocket()).toBeNull();expect(mockSockets).toHaveLength(1);
  browser.visibility('visible');await flush();expect(mockSockets).toHaveLength(2);ready();connection.disconnect();
});

test('web hiding during token lookup fences the old result across resume',async()=>{
  const browser=web();let resolve!:(token:string)=>void;
  const getAccessToken=jest.fn().mockImplementationOnce(()=>new Promise<string>(done=>{resolve=done;})).mockResolvedValue('fresh');
  const connection=setup({getAccessToken});browser.visibility('hidden');browser.visibility('visible');await flush();
  resolve('stale');await flush();expect(mockSockets).toHaveLength(1);expect(mockSockets[0].options.auth.token).toBe('fresh');ready();connection.disconnect();
});

test('online recovery bypasses backoff once and keeps the unauthorized refresh requirement',async()=>{
  const browser=web(),refreshAccessToken=jest.fn().mockResolvedValue('refreshed'),connection=setup({refreshAccessToken});await flush();
  mockSockets[0].dispatch('connect_error',new Error('Unauthorized'));
  browser.win.dispatch('online');browser.win.dispatch('online');connection.recover?.();await flush();
  expect(refreshAccessToken).toHaveBeenCalledTimes(1);expect(mockSockets).toHaveLength(2);expect(mockSockets[1].options.auth.token).toBe('refreshed');
  ready();jest.advanceTimersByTime(30_000);await flush();expect(mockSockets).toHaveLength(2);connection.disconnect();
});

test('a tab mounted hidden starts no authentication or handshake until visible',async()=>{
  const browser=web();browser.visibility('hidden');const getAccessToken=jest.fn().mockResolvedValue('token'),connection=setup({getAccessToken});
  jest.advanceTimersByTime(60_000);await flush();expect(getAccessToken).not.toHaveBeenCalled();
  browser.visibility('visible');await flush();expect(getAccessToken).toHaveBeenCalledTimes(1);ready();connection.disconnect();
});

test('unauthorized recovery is bounded, refreshed once, and cannot resurrect after release', async () => {
  let resolve!: (token: string) => void;
  const refreshAccessToken = jest.fn(() => new Promise<string>(done => {resolve = done;}));
  const connection = setup({refreshAccessToken}); await flush(); mockSockets[0].dispatch('connect_error',new Error('Unauthorized'));
  jest.advanceTimersByTime(1200); await flush(); expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  connection.disconnect(); resolve('late'); await flush(); expect(mockSockets).toHaveLength(1); expect(jest.getTimerCount()).toBe(0);
});

test('offline failures back off and stop retrying in background', async () => {
  const connection = setup(); await flush(); mockSockets[0].dispatch('connect_error',new Error('network error'));
  jest.advanceTimersByTime(1200); await flush(); mockSockets[1].dispatch('connect_error',new Error('network error'));
  jest.advanceTimersByTime(1200); await flush(); expect(mockSockets).toHaveLength(2);
  state('background'); jest.advanceTimersByTime(120_000); await flush(); expect(mockSockets).toHaveLength(2);
  state('active'); await flush(); expect(mockSockets).toHaveLength(3); connection.disconnect();
});
