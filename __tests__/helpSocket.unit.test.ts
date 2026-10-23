import type { Socket } from 'socket.io-client';

const mockGetToken = jest.fn();
const mockRefresh = jest.fn();
const mockRemoveStateListener = jest.fn();
let mockStateListener: (state: string) => void;
jest.mock('react-native', () => ({ Platform:{OS:'android'},AppState:{currentState:'active',addEventListener:jest.fn((_event,listener)=>{mockStateListener=listener;return{remove:mockRemoveStateListener};})} }));
jest.mock('../utils/config', () => ({ API_BASE_URL:'https://dev.example.test/api' }));
jest.mock('../utils/tokenService', () => ({getAccessTokenForRequest:()=>mockGetToken(),refreshToken:()=>mockRefresh()}));
const mockConnections: {options:any;socket:any;disconnect:jest.Mock;getSocket:jest.Mock}[]=[];
const mockCreate = jest.fn((options:any)=>{
  const socket={disconnect:jest.fn()};
  const instance={options,socket,disconnect:jest.fn(),getSocket:jest.fn(()=>socket)};
  mockConnections.push(instance);return instance;
});
jest.mock('../src/shared/socket/managedSocket', () => ({createManagedSocketConnection:(options:any)=>mockCreate(options)}));
import { createHelpSocket } from '../src/features/help/helpSocket';

function token(userId=5, suffix='a', seconds=300) {return `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({userId,exp:Math.floor(Date.now()/1000)+seconds,jti:suffix})).toString('base64url')}.signature`;}
async function flush(){await Promise.resolve();await Promise.resolve();await Promise.resolve();}
describe('Help scoped socket token rotation',()=>{
  beforeEach(()=>{jest.useFakeTimers();mockConnections.length=0;mockCreate.mockClear();mockRemoveStateListener.mockClear();mockGetToken.mockReset().mockResolvedValue(token());mockRefresh.mockReset().mockResolvedValue(token(5,'refreshed'));});
  afterEach(()=>{jest.clearAllTimers();jest.useRealTimers();});
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
    mockStateListener('active');mockStateListener('active');jest.advanceTimersByTime(30_000);
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
});
