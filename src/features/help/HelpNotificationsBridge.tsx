import { useContext, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
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

export function HelpNotificationsBridge() {
  const auth=useContext(AuthContext),router=useRouter(),notify=useNotify(),colors=useHelpTheme();
  const colorsRef=useRef(colors);colorsRef.current=colors;
  const userId=Number(auth?.profile?.id||0);
  useEffect(()=>{
    if(!auth?.isAuthenticated||!userId)return;
    let alive=true,queue=Promise.resolve(),settings:NotificationSettings|null=null,settingsAt=0;
    const pending=new Set<number>(),presented=new Set<number>();
    const remember=(id:number)=>{presented.add(id);if(presented.size>1000)presented.delete(presented.values().next().value!);};
    const foreground=()=>Platform.OS==='web'?typeof document!=='undefined'&&document.visibilityState==='visible':AppState.currentState==='active';
    const currentRoute=(ticketId:number)=>helpNotificationRoute(foreground(),readHelpActivity(userId),ticketId);
    const publishPresence=()=>{const ticketId=readHelpActivity(userId);updateHelpPresence(userId,{active:foreground(),ticketId});if(ticketId!==null)dismissNotificationsByKeys([`help:${userId}:${ticketId}`]);};
    const api=createHelpApi(userId);
    async function handle(notice:HelpPushNotice&{actorId?:number|null;type?:string;fromPush?:boolean}){
      const eventId=notice.eventId;
      if(!alive||!eventId||!Number.isSafeInteger(eventId)||!Number.isSafeInteger(notice.ticketId)||notice.actorId===userId||notice.recipientUserId!==undefined&&notice.recipientUserId!==userId)return;
      if(currentRoute(notice.ticketId)==='ignore')return;
      let repaired=true;
      if(notice.fromPush)try{await account.syncTicket(notice.ticketId);}catch{repaired=false;}
      // A foreground push can still show its preview while REST is unavailable.
      if(!repaired&&currentRoute(notice.ticketId)==='chat')return;
      if(presented.has(eventId)||await hasPresentedHelpNotification(userId,eventId)){
        if(currentRoute(notice.ticketId)!=='ignore')acknowledgeHelpEvent(userId,eventId,currentRoute(notice.ticketId)==='chat'?'chat':'banner');
        return;
      }
      if(currentRoute(notice.ticketId)==='chat'){
        await markHelpNotificationPresented(userId,eventId);remember(eventId);acknowledgeHelpEvent(userId,eventId,'chat');return;
      }
      if(pending.has(eventId))return;pending.add(eventId);
      try{
        if(!settings||Date.now()-settingsAt>30000){settings=await getNotificationSettings();settingsAt=Date.now();}
        const enabled=['TICKET_CLOSED','TICKET_REOPENED'].includes(notice.type||'')?settings?.pushStatusChanged:settings?.pushNewMessage;
        if(!alive||!settings?.inAppNotificationsEnabled||!enabled||currentRoute(notice.ticketId)==='ignore')return;
        let record=await readHistoryRecord(helpHistoryScope(userId),notice.ticketId);
        if(!record&&repaired){await account.syncTicket(notice.ticketId);record=await readHistoryRecord(helpHistoryScope(userId),notice.ticketId);}
        if(!record){
          if(notice.recipientUserId!==userId||!notice.body&&!notice.preview)return;const c=colorsRef.current;
          notify({id:`help:${userId}:${eventId}`,variant:'message',groupKey:`help:${userId}:${notice.ticketId}`,title:notice.ticketTitle||notice.title||'Помощь',message:notice.preview||notice.body||'Новое сообщение',icon:notice.assistant?'hardware-chip-outline':'headset-outline',avatarColor:notice.assistant?helpAssistantAvatarColor(notice.ticketId):c.accent,backgroundColor:c.surface,textColor:c.text,borderColor:c.line,durationMs:5200,dismissKeys:[`help:${userId}`,`help:${userId}:${notice.ticketId}`],onPresented:()=>{if(!alive)return;remember(eventId);void markHelpNotificationPresented(userId,eventId).then(()=>{if(alive)acknowledgeHelpEvent(userId,eventId,'banner');}).catch(()=>{});},onPress:()=>{if(alive)router.push({pathname:'/services/help',params:{ticketId:String(notice.ticketId),...(notice.messageId?{messageId:String(notice.messageId)}:{}),eventId:String(eventId)}} as any);}});return;
        }
        let message=notice.messageId?await readCachedHelpMessage(userId,notice.ticketId,notice.messageId):record.ticket.lastMessage;
        if(notice.messageId&&!message&&repaired){const page=await api.messages(notice.ticketId,{aroundMessageId:notice.messageId});await cacheHelpPage(userId,record.ticket,page);message=page.messages.find(row=>row.id===notice.messageId)??null;}
        if(!alive||currentRoute(notice.ticketId)==='ignore')return;
        if(currentRoute(notice.ticketId)==='chat'){await markHelpNotificationPresented(userId,eventId);remember(eventId);acknowledgeHelpEvent(userId,eventId,'chat');return;}
        const ticket=record.ticket;
        const assistant=helpHasAssistantAvatar(ticket)||Boolean(message?.assistantRun),member=ticket.members.find(row=>row.role==='IT');
        const c=colorsRef.current;
        notify({id:`help:${userId}:${eventId}`,variant:'message',groupKey:`help:${userId}:${ticket.id}`,title:ticket.title,
          message:message?.text||notice.preview||notice.body||(message?.attachments?.length?'Новое вложение':'Новое сообщение'),
          icon:assistant?'hardware-chip-outline':'headset-outline',avatarUrl:assistant?undefined:member?.user.avatarUrl||undefined,
          avatarColor:assistant?helpAssistantAvatarColor(ticket.id):c.accent,backgroundColor:c.surface,textColor:c.text,borderColor:c.line,
          durationMs:5200,dismissKeys:[`help:${userId}`,`help:${userId}:${ticket.id}`],
          onPresented:()=>{if(!alive)return;remember(eventId);void markHelpNotificationPresented(userId,eventId).then(()=>{if(alive)acknowledgeHelpEvent(userId,eventId,'banner');}).catch(()=>{});},
          onPress:()=>{if(alive)router.push({pathname:'/services/help',params:{ticketId:String(ticket.id),...(message?.id?{messageId:String(message.id)}:{}),eventId:String(eventId)}} as any);}});
      }finally{pending.delete(eventId);}
    }
    const enqueue=(notice:Parameters<typeof handle>[0])=>{queue=queue.then(()=>handle(notice)).catch(()=>{});};
    const account=acquireHelpAccount(userId,notice=>{
      if(notice.type!=='event')return;const event=notice.event;
      if(!['MESSAGE_CREATED','TICKET_CREATED','TICKET_CLOSED','TICKET_REOPENED','IT_JOINED','IT_REQUESTED'].includes(event.type))return;
      enqueue({ticketId:event.ticketId,eventId:event.id,messageId:event.messageId??undefined,actorId:event.actorId,type:event.type});
    });
    const offActivity=subscribeHelpActivity(publishPresence),offPush=subscribeHelpPushReceived(notice=>enqueue({...notice,fromPush:true}));
    const state=AppState.addEventListener('change',publishPresence);
    if(Platform.OS==='web'&&typeof document!=='undefined')document.addEventListener('visibilitychange',publishPresence);
    publishPresence();
    return()=>{alive=false;dismissNotificationsByKeys([`help:${userId}`]);offActivity();offPush();state.remove();if(Platform.OS==='web'&&typeof document!=='undefined')document.removeEventListener('visibilitychange',publishPresence);updateHelpPresence(userId,{active:false,ticketId:null});account.release();};
  },[auth?.isAuthenticated,userId,router,notify]);
  return null;
}
