import React, { useContext, useEffect, useRef } from 'react';
import { AppState, Platform, Vibration } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthContext } from '@/context/AuthContext';
import { useNotify } from '@/components/NotificationHost';
import { dismissNotificationsByKeys } from '@/utils/notificationStore';
import { getNotificationSettings, type NotificationSettings } from '@/utils/notificationSettingsService';
import { acquireHelpAccount, updateHelpPresence, acknowledgeHelpEvent } from './helpAccountSync';
import { hasPresentedHelpNotification, markHelpNotificationPresented } from './helpStorage';
import { createHelpApi } from './helpApi';
import {helpHistoryScope,readCachedHelpMessage,cacheHelpPage} from './helpHistory';
import {readHistoryRecord} from './helpHistoryDatabase';
import { readHelpActivity, subscribeHelpActivity } from './helpActivity';
import { subscribeHelpPushReceived, type HelpPushNotice } from './helpNotificationEvents';
import { helpNotificationRoute } from './helpNotificationPolicy';
import { helpAssistantAvatarColor, helpHasAssistantAvatar } from './helpAssistant';
import { useHelpTheme } from './helpTheme';
import { HelpAiIcon } from './components/HelpAiIcon';

export function HelpNotificationsBridge() {
  const auth=useContext(AuthContext),router=useRouter(),notify=useNotify(),colors=useHelpTheme();
  const colorsRef=useRef(colors);colorsRef.current=colors;
  const userId=Number(auth?.profile?.id||0);
  useEffect(()=>{
    if(!auth?.isAuthenticated||!userId)return;
    let alive=true,queue=Promise.resolve(),settings:NotificationSettings|null=null,settingsAt=0;
    const pending=new Set<number>(),presented=new Set<number>();
    const remember=(id:number)=>{presented.add(id);if(presented.size>1000)presented.delete(presented.values().next().value!);};
    const foreground=()=>Platform.OS==='web'?typeof document!=='undefined'&&document.visibilityState==='visible'&&(typeof document.hasFocus!=='function'||document.hasFocus()):AppState.currentState==='active';
    const currentRoute=(ticketId:number)=>helpNotificationRoute(foreground(),readHelpActivity(userId),ticketId);
    const publishPresence=()=>{const ticketId=readHelpActivity(userId);updateHelpPresence(userId,{active:foreground(),ticketId});if(ticketId!==null)dismissNotificationsByKeys([`help:${userId}:${ticketId}`]);};
    const api=createHelpApi(userId);
    async function loadSettings(){
      if(!settings||Date.now()-settingsAt>30000){settings=await getNotificationSettings();settingsAt=Date.now();}
      return settings;
    }
    async function confirmPresentation(eventId:number,ticketId:number,kind:'chat'|'banner',itRequest:boolean){
      if(!alive||currentRoute(ticketId)==='ignore'||presented.has(eventId))return;
      // Reserve synchronously: both socket/push delivery and repeated host
      // callbacks may refer to the same event before the durable write finishes.
      remember(eventId);
      if(itRequest&&Platform.OS!=='web')Vibration.vibrate([0,250,200,250]);
      await markHelpNotificationPresented(userId,eventId);
      if(alive&&currentRoute(ticketId)!=='ignore')acknowledgeHelpEvent(userId,eventId,kind);
    }
    async function handle(notice:HelpPushNotice&{actorId?:number|null;type?:string;fromPush?:boolean}){
      const eventId=notice.eventId,eventType=notice.eventType??notice.type,itRequest=eventType==='IT_REQUESTED';
      if(!alive||!eventId||!Number.isSafeInteger(eventId)||!Number.isSafeInteger(notice.ticketId)||notice.actorId===userId||notice.recipientUserId!==undefined&&notice.recipientUserId!==userId||eventType==='TICKET_CREATED')return;
      if(currentRoute(notice.ticketId)==='ignore')return;
      let repaired=true;
      if(notice.fromPush)try{await account.syncTicket(notice.ticketId);}catch{repaired=false;}
      if(!alive||currentRoute(notice.ticketId)==='ignore')return;
      // A foreground push can still show its preview while REST is unavailable.
      if(!repaired&&currentRoute(notice.ticketId)==='chat')return;
      let record=await readHistoryRecord(helpHistoryScope(userId),notice.ticketId);
      if(!record&&repaired){await account.syncTicket(notice.ticketId);record=await readHistoryRecord(helpHistoryScope(userId),notice.ticketId);}
      if(!alive||currentRoute(notice.ticketId)==='ignore')return;
      if(!record&&!(notice.fromPush&&notice.recipientUserId===userId))return;
      const ticket=record?.ticket;
      // Manager access keeps the queue in sync; it is not a subscription to
      // every private AI conversation. Only a confirmed call alerts all IT.
      const member=ticket?.ownerId===userId||ticket?.members.some(row=>row.userId===userId);
      if(itRequest){
        if(ticket?.ownerId===userId)return;
        const knownThrough=Math.max(record?.syncCursor??0,record?.snapshotCursor??0);
        if(ticket&&knownThrough>=eventId&&(!ticket.itRequested||ticket.members.some(row=>row.role==='IT')))return;
        if(ticket?.lastMessage?.itStatusChange==='REQUESTED'&&notice.messageId&&ticket.lastMessage.id>notice.messageId)return;
        const current=await loadSettings();
        if(!alive||!current?.inAppNotificationsEnabled||currentRoute(notice.ticketId)==='ignore')return;
      }else if(ticket?!member:!(notice.fromPush&&notice.recipientUserId===userId))return;
      if(presented.has(eventId)||await hasPresentedHelpNotification(userId,eventId)){
        if(alive&&currentRoute(notice.ticketId)!=='ignore')acknowledgeHelpEvent(userId,eventId,currentRoute(notice.ticketId)==='chat'?'chat':'banner');
        return;
      }
      if(!alive||currentRoute(notice.ticketId)==='ignore')return;
      if(currentRoute(notice.ticketId)==='chat'){
        await confirmPresentation(eventId,notice.ticketId,'chat',itRequest);return;
      }
      if(pending.has(eventId))return;pending.add(eventId);
      try{
        const current=await loadSettings();
        const enabled=itRequest||(['TICKET_CLOSED','TICKET_REOPENED'].includes(eventType||'')?current?.pushStatusChanged:current?.pushNewMessage);
        if(!alive||!current?.inAppNotificationsEnabled||!enabled||currentRoute(notice.ticketId)==='ignore')return;
        if(!record){
          if(notice.recipientUserId!==userId||!notice.body&&!notice.preview)return;const c=colorsRef.current;
          notify({id:`help:${userId}:${eventId}`,variant:'message',groupKey:`help:${userId}:${notice.ticketId}`,title:itRequest?'Вызов IT-специалиста':notice.ticketTitle||notice.title||'ИИ ассистент',message:notice.preview||notice.body||'Новое сообщение',icon:itRequest?'headset-outline':notice.assistant?'':'headset-outline',avatarContent:!itRequest&&notice.assistant?<HelpAiIcon size={25}/>:null,avatarColor:!itRequest&&notice.assistant?helpAssistantAvatarColor(notice.ticketId):c.accent,backgroundColor:c.surface,textColor:c.text,borderColor:c.line,durationMs:5200,dismissKeys:[`help:${userId}`,`help:${userId}:${notice.ticketId}`],onPresented:()=>{void confirmPresentation(eventId,notice.ticketId,'banner',itRequest).catch(()=>{});},onPress:()=>{if(alive)router.push({pathname:'/services/help',params:{ticketId:String(notice.ticketId),...(notice.messageId?{messageId:String(notice.messageId)}:{}),eventId:String(eventId)}} as any);}});return;
        }
        let message=notice.messageId?await readCachedHelpMessage(userId,notice.ticketId,notice.messageId):record.ticket.lastMessage;
        if(notice.messageId&&!message&&repaired){const page=await api.messages(notice.ticketId,{aroundMessageId:notice.messageId});await cacheHelpPage(userId,record.ticket,page);message=page.messages.find(row=>row.id===notice.messageId)??null;}
        if(!alive||currentRoute(notice.ticketId)==='ignore')return;
        if(currentRoute(notice.ticketId)==='chat'){await confirmPresentation(eventId,notice.ticketId,'chat',itRequest);return;}
        const ticket=record.ticket;
        const assistant=!itRequest&&(helpHasAssistantAvatar(ticket)||Boolean(message?.assistantRun)),member=ticket.members.find(row=>row.role==='IT');
        const c=colorsRef.current;
        notify({id:`help:${userId}:${eventId}`,variant:'message',groupKey:`help:${userId}:${ticket.id}`,title:itRequest?'Вызов IT-специалиста':ticket.title,
          message:message?.text||notice.preview||notice.body||(message?.attachments?.length?'Новое вложение':'Новое сообщение'),
          icon:assistant?'':'headset-outline',avatarContent:assistant?<HelpAiIcon size={25}/>:null,avatarUrl:assistant?undefined:member?.user.avatarUrl||undefined,
          avatarColor:assistant?helpAssistantAvatarColor(ticket.id):c.accent,backgroundColor:c.surface,textColor:c.text,borderColor:c.line,
          durationMs:5200,dismissKeys:[`help:${userId}`,`help:${userId}:${ticket.id}`],
          onPresented:()=>{void confirmPresentation(eventId,notice.ticketId,'banner',itRequest).catch(()=>{});},
          onPress:()=>{if(alive)router.push({pathname:'/services/help',params:{ticketId:String(ticket.id),...(message?.id?{messageId:String(message.id)}:{}),eventId:String(eventId)}} as any);}});
      }finally{pending.delete(eventId);}
    }
    const enqueue=(notice:Parameters<typeof handle>[0])=>{queue=queue.then(()=>handle(notice)).catch(()=>{});};
    const account=acquireHelpAccount(userId,notice=>{
      if(notice.type!=='event')return;const event=notice.event;
      if(!['MESSAGE_CREATED','TICKET_CLOSED','TICKET_REOPENED','IT_JOINED','IT_REQUESTED'].includes(event.type))return;
      enqueue({ticketId:event.ticketId,eventId:event.id,messageId:event.messageId??undefined,actorId:event.actorId,type:event.type});
    });
    const offActivity=subscribeHelpActivity(publishPresence),offPush=subscribeHelpPushReceived(notice=>enqueue({...notice,fromPush:true}));
    const state=AppState.addEventListener('change',publishPresence);
    if(Platform.OS==='web'&&typeof document!=='undefined')document.addEventListener('visibilitychange',publishPresence);
    if(Platform.OS==='web'&&typeof window!=='undefined'){window.addEventListener('focus',publishPresence);window.addEventListener('blur',publishPresence);}
    publishPresence();
    return()=>{alive=false;dismissNotificationsByKeys([`help:${userId}`]);offActivity();offPush();state.remove();if(Platform.OS==='web'&&typeof document!=='undefined')document.removeEventListener('visibilitychange',publishPresence);if(Platform.OS==='web'&&typeof window!=='undefined'){window.removeEventListener('focus',publishPresence);window.removeEventListener('blur',publishPresence);}updateHelpPresence(userId,{active:false,ticketId:null});account.release();};
  },[auth?.isAuthenticated,userId,router,notify]);
  return null;
}
