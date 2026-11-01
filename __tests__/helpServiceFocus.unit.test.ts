import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('react-native',()=>({Platform:{OS:'android'},AppState:{currentState:'active',addEventListener:jest.fn(()=>({remove:jest.fn()}))}}));
jest.mock('../context/AuthContext',()=>({AuthContext:require('react').createContext({profile:{id:5},isAuthenticated:true})}));
jest.mock('../utils/config',()=>({API_BASE_URL:'https://dev.example.test'}));
jest.mock('../src/shared/network/useServerStatus',()=>({useServerStatus:()=>({isReachable:true})}));
jest.mock('../src/features/help/helpSocket',()=>({createHelpSocket:()=>({disconnect:jest.fn(),getSocket:()=>({emit:jest.fn()})})}));
jest.mock('../src/features/help/helpAccountSync',()=>({acquireHelpAccount:()=>({getSocket:()=>null,release:jest.fn(),refresh:jest.fn(async()=>{}),syncTicket:jest.fn(async()=>{})})}));
jest.mock('../src/features/help/helpOutbox',()=>({dispatchHelpPending:jest.fn()}));
jest.mock('../src/features/help/helpDiagnostics',()=>({helpDevEvent:jest.fn()}));
const mockApi={config:jest.fn(),list:jest.fn(),detail:jest.fn(),read:jest.fn(),sync:jest.fn(),messages:jest.fn(),search:jest.fn(),react:jest.fn()};
jest.mock('../src/features/help/helpApi',()=>({createHelpApi:()=>mockApi,HelpApiError:class extends Error {},loadHelpMedia:jest.fn(),uploadHelpFiles:jest.fn()}));
jest.mock('../src/features/help/helpStorage',()=>({helpClientId:()=> 'qa-send',saveHelpPending:jest.fn(async()=>{}),readHelpPending:jest.fn(async()=>[]),readLastCreatedOperation:jest.fn(async()=>null),subscribeHelpOutbox:jest.fn(()=>()=>{}),getHelpDraft:jest.fn(),setHelpDraft:jest.fn()}));
jest.mock('../src/features/help/helpHistory',()=>({
  readCachedHelpTickets:jest.fn(async()=>[]),readCachedHelpTicket:jest.fn(async()=>null),cacheHelpTickets:jest.fn(async()=>{}),cacheHelpPage:jest.fn(async()=>{}),cacheHelpSync:jest.fn(async()=>{}),forgetHelpTicket:jest.fn(async()=>{}),saveHelpViewport:jest.fn(async()=>{}),readCachedHelpMessage:jest.fn(async()=>null),readCachedHelpRange:jest.fn(async()=>[{id:1,ticketId:7,sequence:1}]),
}));
import { useHelpService } from '../src/features/help/useHelpService';
import { helpViewCache } from '../src/features/help/helpViewCache';

const detail={ticket:{id:7,status:'OPEN',members:[],unreadCount:1},messages:[{id:1,ticketId:7,sequence:1}],lastReadSequence:0,firstUnreadSequence:1,lastSequence:1,eventCursor:1};
let service:ReturnType<typeof useHelpService>;
function Harness({focused}:{focused:boolean}){service=useHelpService(focused);return null;}

describe('Help accepted sends and history replay',()=>{
  let screen:TestRenderer.ReactTestRenderer;
  const history=require('../src/features/help/helpHistory');
  const storage=require('../src/features/help/helpStorage');
  const outbox=require('../src/features/help/helpOutbox');
  const accepted={...detail,messages:[{id:100,ticketId:7,sequence:100,clientMessageId:'qa-send'}],lastSequence:100,hasOlder:true,hasNewer:false};
  beforeEach(()=>{
    const cache=helpViewCache('https://dev.example.test:5:true');cache.lists.clear();cache.windows.clear();
    mockApi.config.mockResolvedValue({canManage:false});mockApi.list.mockResolvedValue({tickets:[],nextCursor:null});
    mockApi.detail.mockResolvedValue(detail);
    history.readCachedHelpTicket.mockReset().mockResolvedValue(null);
    history.readCachedHelpRange.mockReset().mockResolvedValue(detail.messages);
    storage.readHelpPending.mockReset().mockResolvedValue([]);
    outbox.dispatchHelpPending.mockReset();
  });
  afterEach(async()=>{if(screen)await act(async()=>screen.unmount());history.readCachedHelpTicket.mockReset().mockResolvedValue(null);history.readCachedHelpRange.mockReset().mockResolvedValue(detail.messages);storage.readHelpPending.mockReset().mockResolvedValue([]);});
  async function open(){await act(async()=>{screen=TestRenderer.create(React.createElement(Harness,{focused:true}));});await act(async()=>{await service.openTicket(7);});}
  test('accepted text replaces an older window with its server-confirmed tail',async()=>{
    await open();let done!:(value:any)=>void;outbox.dispatchHelpPending.mockReturnValue(new Promise(resolve=>{done=resolve;}));
    await act(async()=>{await service.sendMessage(7,{text:'QA',clientMessageId:'qa-send'});});
    expect(service.messages.map(row=>row.id)).toEqual([1]);expect(service.busy).toBe(false);
    await act(async()=>{done(accepted);});
    expect(service.messages.map(row=>row.id)).toEqual([100]);expect(service.navigationTarget?.kind).toBe('latest');expect(service.hasNewer).toBe(false);
  });
  test('accepted send does not steal a later user scroll',async()=>{
    await open();let done!:(value:any)=>void;outbox.dispatchHelpPending.mockReturnValue(new Promise(resolve=>{done=resolve;}));
    await act(async()=>{await service.sendMessage(7,{text:'QA'});service.cancelNavigation();});
    await act(async()=>{done(accepted);});
    expect(service.messages.map(row=>row.id)).toEqual([1]);
  });
  test('late cache replay cannot overwrite an accepted send with an old page',async()=>{
    await open();history.readCachedHelpTicket.mockResolvedValue({record:{ticket:detail.ticket,lastSequence:1,lastReadSequence:0,ranges:[]}});
    let oldRows!:(value:any)=>void;history.readCachedHelpRange.mockReturnValueOnce(new Promise(resolve=>{oldRows=resolve;}));
    let refresh!:Promise<any>;await act(async()=>{refresh=service.refresh();});
    outbox.dispatchHelpPending.mockResolvedValue(accepted);
    await act(async()=>{await service.sendMessage(7,{text:'QA'});});
    await act(async()=>{oldRows(detail.messages);await refresh;});
    expect(service.messages.map(row=>row.id)).toEqual([100]);
  });
  test('an uncovered empty cache range preserves the displayed messages',async()=>{
    await open();history.readCachedHelpTicket.mockResolvedValue({record:{ticket:detail.ticket,lastSequence:1,lastReadSequence:0,ranges:[]}});
    history.readCachedHelpRange.mockResolvedValue([]);
    await act(async()=>{await service.refresh();});expect(service.messages.map(row=>row.id)).toEqual([1]);
  });
});

describe('Help read cursor respects route focus',()=>{
  let screen:TestRenderer.ReactTestRenderer;
  beforeEach(()=>{
    const cache=helpViewCache('https://dev.example.test:5:true');cache.lists.clear();cache.windows.clear();
    mockApi.config.mockReset().mockResolvedValue({canManage:false});
    mockApi.list.mockReset().mockImplementation(async()=>({tickets:[],nextCursor:null}));
    mockApi.detail.mockReset().mockResolvedValue(detail);
    mockApi.read.mockReset().mockResolvedValue({});
    mockApi.sync.mockReset().mockResolvedValue({...detail,events:[],messages:[],deletedMessageIds:[],nextCursor:1,hasMore:false});
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
  test('returning to the chat refreshes data but waits for actual visible rows before reading',async()=>{
    await render(false);await act(async()=>{await service.openTicket(7);});
    expect(mockApi.read).not.toHaveBeenCalled();
    await focus(true);
    expect(mockApi.read).not.toHaveBeenCalled();
    await act(async()=>{await service.markVisibleRead(1);});
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


describe('Help optimistic reactions',()=>{
  let screen:TestRenderer.ReactTestRenderer;
  const original={id:1,ticketId:7,sequence:1,reactions:[{emoji:'👍',mine:false,count:1,userIds:[9]}]};
  const response=(reactions:any[])=>({...detail,messages:[{...original,reactions}]});
  beforeEach(()=>{
    const cache=helpViewCache('https://dev.example.test:5:true');cache.lists.clear();cache.windows.clear();
    mockApi.config.mockResolvedValue({canManage:false});mockApi.list.mockResolvedValue({tickets:[],nextCursor:null});
    mockApi.detail.mockResolvedValue(response(original.reactions));mockApi.react.mockReset();
    require('../src/features/help/helpHistory').readCachedHelpRange.mockResolvedValue([original]);
  });
  afterEach(async()=>{if(screen)await act(async()=>screen.unmount());});
  async function open(){await act(async()=>{screen=TestRenderer.create(React.createElement(Harness,{focused:true}));});await act(async()=>{await service.openTicket(7);});}
  test('reacts before HTTP completes, preserves other users and never locks the composer',async()=>{
    await open();let done!:(value:any)=>void;mockApi.react.mockReturnValueOnce(new Promise(resolve=>{done=resolve;}));
    let request!:Promise<unknown>;await act(async()=>{request=service.toggleReaction(service.messages[0],'👍');});
    expect(service.messages[0].reactions).toEqual([{emoji:'👍',mine:true,count:2,userIds:[9,5]}]);expect(service.busy).toBe(false);
    await act(async()=>{done(response(service.messages[0].reactions));await request;});
    expect(mockApi.react).toHaveBeenCalledWith(1,'👍',false);expect(service.messages[0].reactions[0].mine).toBe(true);
  });
  test('two fast taps show the final choice immediately and send ordered explicit states',async()=>{
    await open();let first!:(value:any)=>void,second!:(value:any)=>void;
    mockApi.react.mockReturnValueOnce(new Promise(resolve=>{first=resolve;})).mockReturnValueOnce(new Promise(resolve=>{second=resolve;}));
    let a!:Promise<unknown>,b!:Promise<unknown>;await act(async()=>{a=service.toggleReaction(service.messages[0],'👍');b=service.toggleReaction(service.messages[0],'👍');});
    expect(service.messages[0].reactions).toEqual(original.reactions);expect(mockApi.react).toHaveBeenCalledTimes(1);
    await act(async()=>{first(response([{emoji:'👍',mine:true,count:2,userIds:[9,5]}]));await a;});
    expect(service.messages[0].reactions).toEqual(original.reactions);expect(mockApi.react).toHaveBeenLastCalledWith(1,'👍',true);
    await act(async()=>{second(response(original.reactions));await b;});expect(service.messages[0].reactions).toEqual(original.reactions);
  });
  test('a failed request restores the reaction while preserving typed-message availability',async()=>{
    await open();mockApi.react.mockRejectedValueOnce(new Error('Reaction failed'));
    await act(async()=>{await expect(service.toggleReaction(service.messages[0],'👍')).rejects.toThrow('Reaction failed');});
    expect(service.messages[0].reactions).toEqual(original.reactions);expect(service.busy).toBe(false);expect(service.error).toBe('Reaction failed');
  });
  test('a reaction outside the returned history window remains visible after confirmation',async()=>{
    await open();mockApi.react.mockResolvedValueOnce({...detail,messages:[]});
    await act(async()=>{await service.toggleReaction(service.messages[0],'👍');});
    expect(service.messages[0].reactions).toEqual([{emoji:'👍',mine:true,count:2,userIds:[9,5]}]);
  });
});
