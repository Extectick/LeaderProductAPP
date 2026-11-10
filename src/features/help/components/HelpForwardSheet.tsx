import React,{useEffect,useId,useRef,useState} from 'react';
import {Platform,ScrollView,Text,View,useWindowDimensions} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {HelpTicket} from '../helpApi';
import type {HelpTypingUser} from '../helpTypingModel';
import {useHelpTheme} from '../helpTheme';
import {APP_LAYOUT} from '@/src/shared/layout/appLayout';
import {HelpSheet} from './HelpPrimitives';
import {HelpTicketRow} from './HelpTicketRow';
import {HelpWebScrollbar} from './HelpWebScrollbar';

type Props={
 tickets:HelpTicket[];currentTicketId?:number;userId:number;dateNow:number;
 drafts?:Record<number,string>;typing?:Record<number,HelpTypingUser[]>;
 onForward:(ticket:HelpTicket)=>Promise<void>;onClose:()=>void;onError:(message:string)=>void;
};

/** Same rows and scrollbar as the main list; one scroll owner inside the sheet. */
export function HelpForwardSheet({tickets,currentTicketId,userId,dateNow,drafts,typing,onForward,onClose,onError}:Props){
 const c=useHelpTheme(),window=useWindowDimensions(),insets=useSafeAreaInsets();
 const scroll=useRef<ScrollView>(null),id=useId(),pending=useRef(false),alive=useRef(true);
 const [offset,setOffset]=useState(0),[busy,setBusy]=useState(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const destinations=tickets.filter(ticket=>ticket.status==='OPEN'&&ticket.id!==currentTicketId&&(ticket.ownerId===userId||ticket.members.some(member=>member.userId===userId)));
 const desktop=Platform.OS==='web'&&window.width>APP_LAYOUT.compactMax;
 const height=Math.min(456,Math.max(1,window.height-insets.top-insets.bottom-160),Math.max(120,destinations.length*76));
 const scrollId=`help-forward-scroll-${id}`;
 const forward=async(ticket:HelpTicket)=>{
  if(pending.current)return;pending.current=true;setBusy(true);
  try{await onForward(ticket);}
  catch(error){if(alive.current)onError(error instanceof Error?error.message:'Не удалось переслать сообщение. Попробуйте ещё раз.');}
  finally{pending.current=false;if(alive.current)setBusy(false);}
 };
 return <HelpSheet title="Переслать в обращение" onClose={onClose} scrollOffset={offset} resizable={false} maxWidth={560} scrollable={false}>
  <View testID="help-forward-list-frame" style={{height,minHeight:0,marginHorizontal:desktop?-24:-18,position:'relative'}}>
   <ScrollView ref={scroll} testID="help-forward-list" nativeID={scrollId} showsVerticalScrollIndicator={Platform.OS!=='web'} keyboardShouldPersistTaps="handled"
    scrollEventThrottle={16} onScroll={event=>setOffset(Math.max(0,event.nativeEvent.contentOffset.y))} style={{flex:1}}>
    {destinations.map(ticket=><HelpTicketRow key={ticket.id} ticket={ticket} dateNow={dateNow} draft={drafts?.[ticket.id]} typing={typing?.[ticket.id]} disabled={busy} diagnostics={false} onPress={()=>void forward(ticket)}/>)}
    {!destinations.length?<View style={{padding:24,justifyContent:'center',minHeight:120}}><Text style={{color:c.muted,fontSize:14,lineHeight:21,textAlign:'center'}}>Нет других открытых обращений для пересылки.</Text></View>:null}
   </ScrollView>
   {Platform.OS==='web'?<HelpWebScrollbar scrollRef={scroll} scrollId={scrollId} top={0} bottom={0} active/>:null}
  </View>
 </HelpSheet>;
}
