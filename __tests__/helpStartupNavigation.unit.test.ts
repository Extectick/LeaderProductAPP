import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
const mockReplace=jest.fn();
let mockPath='/',mockParams:Record<string,string>={};
jest.mock('expo-router',()=>({useRouter:()=>({replace:mockReplace}),usePathname:()=>mockPath,useGlobalSearchParams:()=>mockParams}));
jest.mock('../context/AuthContext',()=>({AuthContext:require('react').createContext(null)}));
jest.mock('../utils/profileGate',()=>({getProfileGate:()=> 'active'}));
jest.mock('../utils/telegramAuthService',()=>({isTelegramMiniAppLaunch:()=>false,getTelegramStartAppealId:()=>null,getTelegramStartClientOrderGuid:()=>null}));
jest.mock('../utils/maxAuthService',()=>({isMaxMiniAppLaunch:()=>false,getMaxStartAppealId:()=>null,getMaxStartClientOrderGuid:()=>null}));
jest.mock('../components/StartupLogoLoader',()=> 'StartupLogoLoader');
jest.mock('../utils/pushNotifications',()=>({
  readStartupHelpNotification:jest.fn(),acceptStartupHelpNotification:jest.fn(()=>true),
  helpPushNavigationTarget:(target:any)=>({pathname:'/services/help',params:{ticketId:String(target.ticketId),messageId:target.messageId?String(target.messageId):undefined,eventId:target.eventId?String(target.eventId):undefined,htmlId:undefined,entry:'notification'}}),
}));
import {AuthContext} from '../context/AuthContext';
import {useAuthRedirect} from '../hooks/useAuthRedirect';
import {StartupNavigationContext} from '../src/features/navigation/StartupNavigationContext';
import {readStartupHelpNotification,acceptStartupHelpNotification} from '../utils/pushNotifications';
import RootRedirect from '../app/index';

let view:TestRenderer.ReactTestRenderer;
let gate:ReturnType<typeof useAuthRedirect>;
const auth={isLoading:false,isAuthenticated:true,profile:{id:12}};
function Harness(){
  gate=useAuthRedirect();
  return React.createElement(StartupNavigationContext.Provider,{value:gate.startupNavigationPending},mockPath==='/'?React.createElement(RootRedirect):null);
}
function tree(value:any=auth){return React.createElement(AuthContext.Provider,{value},React.createElement(Harness));}
afterEach(async()=>{if(view)await act(async()=>view.unmount());jest.clearAllMocks();mockPath='/';mockParams={};});

test('cold Help notification keeps startup covered and routes once straight to the ticket',async()=>{
  let resolve!: (value:any)=>void;
  (readStartupHelpNotification as jest.Mock).mockReturnValue(new Promise(done=>{resolve=done;}));
  await act(async()=>{view=TestRenderer.create(tree());});
  expect(gate.startupNavigationPending).toBe(true);expect(mockReplace).not.toHaveBeenCalled();
  const intent={target:{ticketId:42,messageId:1049,eventId:9,recipientUserId:12},response:{id:'native'}};
  await act(async()=>resolve(intent));
  expect(mockReplace).toHaveBeenCalledTimes(1);
  expect(mockReplace).toHaveBeenCalledWith({pathname:'/services/help',params:{ticketId:'42',messageId:'1049',eventId:'9',htmlId:undefined,entry:'notification'}});
  expect(gate.startupNavigationPending).toBe(true);
  expect(acceptStartupHelpNotification).not.toHaveBeenCalled();
  mockPath='/services/help';mockParams={ticketId:'42',messageId:'1049',eventId:'9'};
  await act(async()=>view.update(tree()));
  expect(acceptStartupHelpNotification).toHaveBeenCalledWith(intent,12);
  expect(gate.startupNavigationPending).toBe(false);
  expect(mockReplace).toHaveBeenCalledTimes(1);
});

test('wrong-recipient notification neither opens nor consumes another account’s ticket',async()=>{
  (readStartupHelpNotification as jest.Mock).mockResolvedValue({target:{ticketId:42,recipientUserId:99},response:{id:'other'}});
  await act(async()=>{view=TestRenderer.create(tree());});
  expect(gate.startupNavigationPending).toBe(false);
  expect(mockReplace.mock.calls.every(([value])=>typeof value==='string')).toBe(true);
  expect(acceptStartupHelpNotification).not.toHaveBeenCalled();
});

test('an account change while native metadata resolves cannot open the previous account’s notification',async()=>{
  let resolve!: (value:any)=>void;
  (readStartupHelpNotification as jest.Mock).mockReturnValue(new Promise(done=>{resolve=done;}));
  await act(async()=>{view=TestRenderer.create(tree());});
  await act(async()=>view.update(tree({...auth,profile:{id:99}})));
  await act(async()=>resolve({target:{ticketId:42,recipientUserId:12},response:{id:'previous'}}));
  expect(mockReplace.mock.calls.some(([value])=>typeof value==='object'&&value.pathname==='/services/help')).toBe(false);
  expect(acceptStartupHelpNotification).not.toHaveBeenCalled();
});
