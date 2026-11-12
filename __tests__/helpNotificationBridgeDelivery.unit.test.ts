import React from 'react';
jest.mock('../src/features/help/components/HelpAiIcon',()=>({HelpAiIcon:'HelpAiIcon'}));
import TestRenderer,{act} from 'react-test-renderer';
let mockActive=true,mockNotice:(value:any)=>void,mockRecord:any,mockSettings:any;
const mockVibrate=jest.fn();
const mockNotify=jest.fn(),mockPush=jest.fn(),mockAck=jest.fn(),mockMark=jest.fn(async()=>{}),mockSync=jest.fn(async()=>{});
jest.mock('react-native',()=>({Platform:{OS:'android'},Vibration:{vibrate:(...args:any[])=>mockVibrate(...args)},AppState:{get currentState(){return mockActive?'active':'background';},addEventListener:()=>({remove:()=>{}})}}));
jest.mock('../context/AuthContext',()=>({AuthContext:require('react').createContext({profile:{id:5},isAuthenticated:true})}));
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush})}));
jest.mock('../components/NotificationHost',()=>({useNotify:()=>mockNotify}));
jest.mock('../utils/notificationStore',()=>({dismissNotificationsByKeys:jest.fn()}));
jest.mock('../utils/notificationSettingsService',()=>({getNotificationSettings:async()=>mockSettings}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpTheme:()=>({surface:'#222',text:'#fff',line:'#333',accent:'#08f'})}));
jest.mock('../src/features/help/helpAccountSync',()=>({acquireHelpAccount:(_:number,fn:any)=>{mockNotice=fn;return{syncTicket:mockSync,release:jest.fn()};},updateHelpPresence:jest.fn(),acknowledgeHelpEvent:(...args:any[])=>mockAck(...args)}));
jest.mock('../src/features/help/helpStorage',()=>({hasPresentedHelpNotification:async()=>false,markHelpNotificationPresented:(...args:any[])=>mockMark(...args)}));
jest.mock('../src/features/help/helpHistoryDatabase',()=>({readHistoryRecord:async()=>mockRecord}));
jest.mock('../src/features/help/helpHistory',()=>({helpHistoryScope:()=>'',readCachedHelpMessage:async()=>({id:70,text:'Prepared answer',assistantRun:{status:'completed'}}),cacheHelpPage:jest.fn()}));
jest.mock('../src/features/help/helpApi',()=>({createHelpApi:()=>({messages:jest.fn()})}));
import {HelpNotificationsBridge} from '../src/features/help/HelpNotificationsBridge';
import {publishHelpActivity} from '../src/features/help/helpActivity';
import {emitHelpPushReceived} from '../src/features/help/helpNotificationEvents';
import {updateHelpPresence} from '../src/features/help/helpAccountSync';
import {Platform} from 'react-native';
let view:TestRenderer.ReactTestRenderer;
async function settle(){await act(async()=>{for(let i=0;i<20;i++)await Promise.resolve();});}
const event={id:90,ticketId:7,messageId:70,actorId:null,type:'MESSAGE_CREATED'};
beforeEach(()=>{mockActive=true;mockSettings={inAppNotificationsEnabled:true,pushNewMessage:true,pushStatusChanged:true};mockRecord={syncCursor:90,snapshotCursor:90,ticket:{id:7,title:'Printer',ownerId:5,itRequested:false,aiEnabled:true,members:[{userId:5,role:'OWNER'}],lastMessage:null}};mockVibrate.mockClear();mockNotify.mockClear();mockAck.mockClear();mockMark.mockClear();mockSync.mockClear();});
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
test('web focus and visibility publish independent presence and only the focused chat acknowledges delivery',async()=>{
 const oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
 const oldPlatform=Platform.OS,browser=new EventTarget(),page=new EventTarget();let focused=true;
 Object.assign(page,{visibilityState:'visible',hasFocus:()=>focused});
 Object.defineProperty(globalThis,'document',{configurable:true,value:page});Object.defineProperty(globalThis,'window',{configurable:true,value:browser});
 Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});
 const release=publishHelpActivity({}, {userId:5,ticketId:7});jest.mocked(updateHelpPresence).mockClear();
 try{
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpNotificationsBridge));});
  expect(updateHelpPresence).toHaveBeenLastCalledWith(5,{active:true,ticketId:7});
  mockNotice({type:'event',event});await settle();expect(mockAck).toHaveBeenCalledWith(5,90,'chat');mockAck.mockClear();
  focused=false;browser.dispatchEvent(new Event('blur'));
  expect(updateHelpPresence).toHaveBeenLastCalledWith(5,{active:false,ticketId:7});
  mockNotice({type:'event',event:{...event,id:91}});await settle();expect(mockAck).not.toHaveBeenCalled();expect(mockNotify).not.toHaveBeenCalled();
  focused=true;browser.dispatchEvent(new Event('focus'));
  expect(updateHelpPresence).toHaveBeenLastCalledWith(5,{active:true,ticketId:7});
  Object.assign(page,{visibilityState:'hidden'});page.dispatchEvent(new Event('visibilitychange'));
  expect(updateHelpPresence).toHaveBeenLastCalledWith(5,{active:false,ticketId:7});
  await act(async()=>view.unmount());jest.mocked(updateHelpPresence).mockClear();browser.dispatchEvent(new Event('focus'));browser.dispatchEvent(new Event('blur'));expect(updateHelpPresence).not.toHaveBeenCalled();
 }finally{
  release();Object.defineProperty(Platform,'OS',{configurable:true,value:oldPlatform});
  if(oldDocument)Object.defineProperty(globalThis,'document',oldDocument);else delete (globalThis as any).document;
  if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else delete (globalThis as any).window;
 }
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

const itCall={...event,type:'IT_REQUESTED',actorId:9};
function waitingCall(){mockRecord.ticket={...mockRecord.ticket,ownerId:9,itRequested:true,members:[{userId:9,role:'OWNER'}]};}
test('creation and its initial message keep a nonmember manager silent',async()=>{
  waitingCall();mockRecord.ticket.itRequested=false;
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpNotificationsBridge));});
  mockNotice({type:'event',event:{...event,type:'TICKET_CREATED',actorId:9}});
  mockNotice({type:'event',event:{...event,id:91,type:'MESSAGE_CREATED',actorId:9}});await settle();
  expect(mockNotify).not.toHaveBeenCalled();expect(mockVibrate).not.toHaveBeenCalled();expect(mockAck).not.toHaveBeenCalled();
});
test('an IT call alerts a nonmember manager once, only when the banner is presented, even after push replay',async()=>{
  waitingCall();mockSettings.pushNewMessage=false;
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpNotificationsBridge));});
  mockNotice({type:'event',event:itCall});await settle();
  expect(mockNotify).toHaveBeenCalledTimes(1);expect(mockNotify.mock.calls[0][0]).toMatchObject({title:'Вызов IT-специалиста',icon:'headset-outline'});
  expect(mockVibrate).not.toHaveBeenCalled();expect(mockAck).not.toHaveBeenCalled();
  const banner=mockNotify.mock.calls[0][0];banner.onPresented();banner.onPresented();await settle();
  emitHelpPushReceived({ticketId:7,messageId:70,eventId:90,eventType:'IT_REQUESTED',recipientUserId:5});await settle();
  expect(mockVibrate).toHaveBeenCalledTimes(1);expect(mockVibrate).toHaveBeenCalledWith([0,250,200,250]);
  expect(mockNotify).toHaveBeenCalledTimes(1);expect(mockAck).toHaveBeenCalledWith(5,90,'banner');
});
test('IT call in the visible chat vibrates once without duplicating a banner',async()=>{
  waitingCall();mockSettings.pushNewMessage=false;
  const release=publishHelpActivity({}, {userId:5,ticketId:7});
  try{
    await act(async()=>{view=TestRenderer.create(React.createElement(HelpNotificationsBridge));});
    mockNotice({type:'event',event:itCall});await settle();mockNotice({type:'event',event:itCall});await settle();
    expect(mockNotify).not.toHaveBeenCalled();expect(mockVibrate).toHaveBeenCalledTimes(1);expect(mockAck).toHaveBeenCalledWith(5,90,'chat');
  }finally{release();}
});
test('ordinary participant messages remain silent on presentation',async()=>{
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpNotificationsBridge));});
  mockNotice({type:'event',event});await settle();mockNotify.mock.calls[0][0].onPresented();await settle();
  expect(mockVibrate).not.toHaveBeenCalled();expect(mockAck).toHaveBeenCalledWith(5,90,'banner');
});
test.each(['background','global-disabled','self','foreign-recipient'])('an IT call does not alert or acknowledge for %s',async reason=>{
  waitingCall();if(reason==='background')mockActive=false;if(reason==='global-disabled')mockSettings.inAppNotificationsEnabled=false;
  const release=publishHelpActivity({}, {userId:5,ticketId:7});
  try{
    await act(async()=>{view=TestRenderer.create(React.createElement(HelpNotificationsBridge));});
    if(reason==='foreign-recipient')emitHelpPushReceived({ticketId:7,eventId:90,eventType:'IT_REQUESTED',recipientUserId:6});
    else mockNotice({type:'event',event:reason==='self'?{...itCall,actorId:5}:itCall});
    await settle();expect(mockNotify).not.toHaveBeenCalled();expect(mockVibrate).not.toHaveBeenCalled();expect(mockAck).not.toHaveBeenCalled();
  }finally{release();}
});
test.each(['AI resumed','IT joined'])('a current snapshot suppresses an obsolete IT call after %s',async state=>{
  waitingCall();if(state==='AI resumed')mockRecord.ticket.itRequested=false;else mockRecord.ticket.members.push({userId:8,role:'IT'});
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpNotificationsBridge));});
  mockNotice({type:'event',event:itCall});await settle();expect(mockNotify).not.toHaveBeenCalled();expect(mockVibrate).not.toHaveBeenCalled();expect(mockAck).not.toHaveBeenCalled();
});
test('an older pre-call snapshot does not discard a new IT request',async()=>{
  waitingCall();mockRecord.ticket.itRequested=false;mockRecord.syncCursor=80;mockRecord.snapshotCursor=80;
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpNotificationsBridge));});
  mockNotice({type:'event',event:itCall});await settle();expect(mockNotify).toHaveBeenCalledTimes(1);
});
test('a disposed banner callback cannot vibrate or acknowledge the previous account',async()=>{
  waitingCall();await act(async()=>{view=TestRenderer.create(React.createElement(HelpNotificationsBridge));});
  mockNotice({type:'event',event:itCall});await settle();const banner=mockNotify.mock.calls[0][0];
  await act(async()=>view.unmount());banner.onPresented();await settle();expect(mockVibrate).not.toHaveBeenCalled();expect(mockAck).not.toHaveBeenCalled();
});
test('an old request cannot vibrate after AI return followed by a newer call',async()=>{
  waitingCall();mockRecord.ticket.lastMessage={id:80,itStatusChange:'REQUESTED'};
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpNotificationsBridge));});
  mockNotice({type:'event',event:itCall});await settle();
  expect(mockNotify).not.toHaveBeenCalled();expect(mockVibrate).not.toHaveBeenCalled();expect(mockAck).not.toHaveBeenCalled();
});
