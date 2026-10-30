import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
jest.mock('react-native',()=>({Platform:{OS:'android'},AppState:{currentState:'active',addEventListener:()=>({remove:()=>{}})}}));
jest.mock('../context/AuthContext',()=>({AuthContext:require('react').createContext({profile:{id:5},isAuthenticated:true})}));
jest.mock('../utils/config',()=>({API_BASE_URL:'https://typing.test'}));
jest.mock('../src/shared/network/useServerStatus',()=>({useServerStatus:()=>({isReachable:true})}));
const mockHandlers:Record<string,Function>={};
const mockSocket={connected:true,on:(key:string,fn:Function)=>{mockHandlers[key]=fn;},off:jest.fn(),emit:jest.fn()};
jest.mock('../src/features/help/helpAccountSync',()=>({acquireHelpAccount:()=>({getSocket:()=>mockSocket,release:()=>{},refresh:async()=>{},syncTicket:async()=>{}})}));
jest.mock('../src/features/help/helpOutbox',()=>({dispatchHelpPending:jest.fn()}));
jest.mock('../src/features/help/helpStorage',()=>({readHelpPending:async()=>[],readLastCreatedOperation:async()=>null,subscribeHelpOutbox:()=>()=>{},getHelpDraft:async()=>'',setHelpDraft:async()=>{},helpClientId:()=>'',saveHelpPending:async()=>{}}));
jest.mock('../src/features/help/helpHistory',()=>({readCachedHelpTickets:async()=>[],cacheHelpTickets:async()=>{}}));
const mockTicket={id:7,status:'OPEN',title:'Ticket',ownerId:5,members:[{userId:9,user:{id:9,name:'Анна',avatarUrl:'https://example.test/member.png'}}]};
jest.mock('../src/features/help/helpApi',()=>({createHelpApi:()=>({config:async()=>({canManage:false,aiEnabled:false}),list:async()=>({tickets:[mockTicket],nextCursor:null})}),HelpApiError:class extends Error{status=0;},loadHelpMedia:jest.fn(),uploadHelpFiles:jest.fn()}));
import {useHelpService} from '../src/features/help/useHelpService';
test('independent typing TTL and stop remove only that participant, preserving avatars for the rest',async()=>{
  jest.useFakeTimers();let service!:ReturnType<typeof useHelpService>,view!:TestRenderer.ReactTestRenderer;
  function Harness(){service=useHelpService();return null;}
  try{
    await act(async()=>{view=TestRenderer.create(React.createElement(Harness));});
    await act(async()=>{mockHandlers['help:typing']({ticketId:7,userId:9,name:'Анна',typing:true});});
    expect(service.typingByTicket[7][0].avatarUrl).toBe('https://example.test/member.png');
    await act(async()=>jest.advanceTimersByTime(2000));
    await act(async()=>{mockHandlers['help:typing']({ticketId:7,userId:10,name:'Борис',avatarUrl:'https://example.test/boris.png',typing:true});});
    expect(service.typingByTicket[7].map(user=>user.userId)).toEqual([9,10]);
    await act(async()=>jest.advanceTimersByTime(3100));
    expect(service.typingByTicket[7].map(user=>user.userId)).toEqual([10]);
    await act(async()=>{mockHandlers['help:typing']({ticketId:7,userId:9,name:'Анна',typing:true});mockHandlers['help:typing']({ticketId:7,userId:10,name:'Борис',typing:false});});
    expect(service.typingByTicket[7].map(user=>user.userId)).toEqual([9]);
  }finally{if(view)await act(async()=>view.unmount());jest.clearAllTimers();jest.useRealTimers();}
});
