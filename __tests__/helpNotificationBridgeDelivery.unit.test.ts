import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
let mockActive=true,mockNotice:(value:any)=>void;
const mockNotify=jest.fn(),mockPush=jest.fn(),mockAck=jest.fn(),mockMark=jest.fn(async()=>{}),mockSync=jest.fn(async()=>{});
jest.mock('react-native',()=>({Platform:{OS:'android'},AppState:{get currentState(){return mockActive?'active':'background';},addEventListener:()=>({remove:()=>{}})}}));
jest.mock('../context/AuthContext',()=>({AuthContext:require('react').createContext({profile:{id:5},isAuthenticated:true})}));
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush})}));
jest.mock('../components/NotificationHost',()=>({useNotify:()=>mockNotify}));
jest.mock('../utils/notificationStore',()=>({dismissNotificationsByKeys:jest.fn()}));
jest.mock('../utils/notificationSettingsService',()=>({getNotificationSettings:async()=>({inAppNotificationsEnabled:true,pushNewMessage:true,pushStatusChanged:true})}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpTheme:()=>({surface:'#222',text:'#fff',line:'#333',accent:'#08f'})}));
jest.mock('../src/features/help/helpAccountSync',()=>({acquireHelpAccount:(_:number,fn:any)=>{mockNotice=fn;return{syncTicket:mockSync,release:jest.fn()};},updateHelpPresence:jest.fn(),acknowledgeHelpEvent:(...args:any[])=>mockAck(...args)}));
jest.mock('../src/features/help/helpStorage',()=>({hasPresentedHelpNotification:async()=>false,markHelpNotificationPresented:(...args:any[])=>mockMark(...args)}));
jest.mock('../src/features/help/helpHistoryDatabase',()=>({readHistoryRecord:async()=>({ticket:{id:7,title:'Printer',aiEnabled:true,members:[],lastMessage:null}})}));
jest.mock('../src/features/help/helpHistory',()=>({helpHistoryScope:()=>'',readCachedHelpMessage:async()=>({id:70,text:'Prepared answer',assistantRun:{status:'completed'}}),cacheHelpPage:jest.fn()}));
jest.mock('../src/features/help/helpApi',()=>({createHelpApi:()=>({messages:jest.fn()})}));
import {HelpNotificationsBridge} from '../src/features/help/HelpNotificationsBridge';
import {publishHelpActivity} from '../src/features/help/helpActivity';
import {emitHelpPushReceived} from '../src/features/help/helpNotificationEvents';
let view:TestRenderer.ReactTestRenderer;
async function settle(){await act(async()=>{for(let i=0;i<20;i++)await Promise.resolve();});}
const event={id:90,ticketId:7,messageId:70,actorId:null,type:'MESSAGE_CREATED'};
beforeEach(()=>{mockActive=true;mockNotify.mockClear();mockAck.mockClear();mockMark.mockClear();mockSync.mockClear();});
afterEach(async()=>{if(view)await act(async()=>view.unmount());});
test('another open Help chat receives a banner; presentation is acknowledged only after the host commits it',async()=>{
  const release=publishHelpActivity({}, {userId:5,ticketId:8});
  try{await act(async()=>{view=TestRenderer.create(React.createElement(HelpNotificationsBridge));});mockNotice({type:'event',event});await settle();
    expect(mockNotify).toHaveBeenCalledTimes(1);expect(mockAck).not.toHaveBeenCalled();
    const banner=mockNotify.mock.calls[0][0];expect(banner).toMatchObject({title:'Printer',message:'Prepared answer',variant:'message'});
    banner.onPresented();await settle();expect(mockMark).toHaveBeenCalledWith(5,90);expect(mockAck).toHaveBeenCalledWith(5,90,'banner');
    banner.onPress();expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({params:{ticketId:'7',messageId:'70',eventId:'90'}}));
  }finally{release();}
});
test('the exact visible chat acknowledges handling without a banner or a read receipt',async()=>{
  const release=publishHelpActivity({}, {userId:5,ticketId:7});
  try{await act(async()=>{view=TestRenderer.create(React.createElement(HelpNotificationsBridge));});mockNotice({type:'event',event});await settle();expect(mockNotify).not.toHaveBeenCalled();expect(mockAck).toHaveBeenCalledWith(5,90,'chat');}
  finally{release();}
});
test('a foreground push synchronizes before acknowledgement; a background event stays unacknowledged for push fallback',async()=>{
  const release=publishHelpActivity({}, {userId:5,ticketId:7});
  try{await act(async()=>{view=TestRenderer.create(React.createElement(HelpNotificationsBridge));});emitHelpPushReceived({ticketId:7,messageId:70,eventId:90});await settle();expect(mockSync).toHaveBeenCalledWith(7);expect(mockAck).toHaveBeenCalledWith(5,90,'chat');mockAck.mockClear();mockActive=false;mockNotice({type:'event',event:{...event,id:91}});await settle();expect(mockAck).not.toHaveBeenCalled();}
  finally{release();}
});
test('a foreground push addressed to another signed-in account never reveals a preview or acknowledges it',async()=>{
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpNotificationsBridge));});
  emitHelpPushReceived({ticketId:7,messageId:70,eventId:90,recipientUserId:6,preview:'Private answer'});await settle();
  expect(mockNotify).not.toHaveBeenCalled();expect(mockSync).not.toHaveBeenCalled();expect(mockAck).not.toHaveBeenCalled();
});
