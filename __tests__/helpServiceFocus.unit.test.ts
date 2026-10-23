import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('react-native',()=>({Platform:{OS:'android'},AppState:{currentState:'active',addEventListener:jest.fn(()=>({remove:jest.fn()}))}}));
jest.mock('../context/AuthContext',()=>({AuthContext:require('react').createContext({profile:{id:5},isAuthenticated:true})}));
jest.mock('../utils/config',()=>({API_BASE_URL:'https://dev.example.test'}));
jest.mock('../src/shared/network/useServerStatus',()=>({useServerStatus:()=>({isReachable:true})}));
jest.mock('../src/features/help/helpSocket',()=>({createHelpSocket:()=>({disconnect:jest.fn(),getSocket:()=>({emit:jest.fn()})})}));
const mockApi={config:jest.fn(),list:jest.fn(),detail:jest.fn(),read:jest.fn()};
jest.mock('../src/features/help/helpApi',()=>({createHelpApi:()=>mockApi,HelpApiError:class extends Error {},loadHelpMedia:jest.fn(),uploadHelpFiles:jest.fn()}));
jest.mock('../src/features/help/helpStorage',()=>({readHelpPending:jest.fn(async()=>[]),getHelpDraft:jest.fn(),setHelpDraft:jest.fn()}));
import { useHelpService } from '../src/features/help/useHelpService';

const detail={ticket:{id:7,status:'OPEN',members:[],unreadCount:1},messages:[{id:1,sequence:1}]};
let service:ReturnType<typeof useHelpService>;
function Harness({focused}:{focused:boolean}){service=useHelpService(focused);return null;}

describe('Help read cursor respects route focus',()=>{
  let screen:TestRenderer.ReactTestRenderer;
  beforeEach(()=>{
    mockApi.config.mockReset().mockResolvedValue({canManage:false});
    mockApi.list.mockReset().mockImplementation(async()=>({tickets:[],nextCursor:null}));
    mockApi.detail.mockReset().mockResolvedValue(detail);
    mockApi.read.mockReset().mockResolvedValue({});
  });
  afterEach(async()=>{if(screen)await act(async()=>screen.unmount());});
  async function render(focused=true){await act(async()=>{screen=TestRenderer.create(React.createElement(Harness,{focused}));});}
  async function focus(focused:boolean){await act(async()=>screen.update(React.createElement(Harness,{focused})));}
  test('background snapshot repair never marks a covered chat read',async()=>{
    await render();await act(async()=>{await service.openTicket(7);});
    mockApi.read.mockClear();await focus(false);
    await act(async()=>{await service.refresh();});
    expect(mockApi.read).not.toHaveBeenCalled();
  });
  test('returning to the chat refreshes snapshot and resumes read receipt',async()=>{
    await render(false);await act(async()=>{await service.openTicket(7);});
    expect(mockApi.read).not.toHaveBeenCalled();
    await focus(true);
    expect(mockApi.read).toHaveBeenCalledWith(7,1);
  });
  test('a detail response arriving after route blur does not mark messages read',async()=>{
    await render();let resolve!:(value:any)=>void;
    mockApi.detail.mockReturnValueOnce(new Promise(done=>{resolve=done;}));
    let request:Promise<unknown>;await act(async()=>{request=service.openTicket(7);});
    await focus(false);await act(async()=>{resolve(detail);await request;});
    expect(mockApi.read).not.toHaveBeenCalled();
  });
});
