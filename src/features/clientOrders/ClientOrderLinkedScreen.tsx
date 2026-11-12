import React from 'react';
import {ActivityIndicator,Pressable,ScrollView,Text,View} from 'react-native';
import {AuthContext} from '@/context/AuthContext';
import {API_BASE_URL} from '@/utils/config';
import {useThemeColor} from '@/hooks/useThemeColor';
import {getClientOrder,type ClientOrder} from '@/utils/clientOrdersService';
import {useHeaderContentTopInset} from '@/components/Navigation/useHeaderContentTopInset';
import {useNotificationViewport} from '@/context/NotificationViewportContext';
import {useServicesHeaderSlot} from '../services/headerSlotContext';
import {ProfileOnecConnections} from '../profile/ui/ProfileOnecConnections';
import {ClientOrderReadOnlyView} from './ClientOrdersMobileScreen';
import {clientOrderRoute} from './lib/clientOrderOpening';
import {toUserErrorMessage} from '@/src/shared/errors/userErrorMessage';

type Param=string|string[]|undefined;
const one=(value:Param)=>Array.isArray(value)?value.length===1?value[0]:undefined:value;

/** Source-bound read-only service entry. The mutable order workspace never mounts. */
export function ClientOrderLinkedScreen({orderGuid,orderBaseKey,onBack}:{orderGuid:Param;orderBaseKey:Param;onBack:()=>void}){
 const background=useThemeColor({},'background'),text=useThemeColor({},'text'),accent=useThemeColor({},'tint');
 const auth=React.useContext(AuthContext),userId=auth?.isAuthenticated&&!auth.isLoading&&auth.profile?.profileStatus!=='BLOCKED'?auth.profile?.id:undefined;
 const baseKey=one(orderBaseKey),guid=one(orderGuid),route=baseKey===undefined?null:clientOrderRoute(guid,baseKey);
 const valid=!!route;
 const scope=JSON.stringify([API_BASE_URL,userId??null,baseKey??null,route?.params.orderGuid??null]);
 const latest=React.useRef(scope);latest.current=scope;
 const [attempt,retry]=React.useReducer((n:number)=>n+1,0);
 const [state,setState]=React.useState<{scope:string;order?:ClientOrder;code?:string;error?:string}>({scope:''});
 const current=state.scope===scope?state:undefined;
 const topInset=useHeaderContentTopInset({compact:true,hasSubtitle:true,extraGap:2});
 const {headerBottomOffset}=useNotificationViewport(),{setHeaderOverride}=useServicesHeaderSlot();
 const title=current?.order?.number1c;
 React.useLayoutEffect(()=>{
  setHeaderOverride({title:title?`Заказ ${title}`:'Заказ клиента',subtitle:'Только просмотр',showBack:true,onBack,compact:true,rightSlot:null,bottomSlot:null});
  return()=>setHeaderOverride(null);
 },[setHeaderOverride,title,onBack]);
 React.useEffect(()=>{
  const controller=new AbortController();setState({scope});
  if(valid&&userId&&baseKey!==undefined&&route){
   void getClientOrder(route.params.orderGuid,{baseKey,expectedUserId:userId,signal:controller.signal}).then(order=>{
    if(!controller.signal.aborted&&latest.current===scope)setState({scope,order});
   }).catch(error=>{
    if(!controller.signal.aborted&&latest.current===scope)setState({scope,code:typeof error?.code==='string'?error.code:undefined,error:toUserErrorMessage(error,'Не удалось открыть заказ. Повторите попытку.')});
   });
  }
  return()=>controller.abort();
  // The validated route/user/API identity is captured by scope.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[scope,attempt,valid]);
 const connect=!!current?.code&&['ONEC_AUTH_REQUIRED','ONEC_CREDENTIALS_INVALID','ONEC_ACCESS_DENIED'].includes(current.code);
 return <View testID="client-order-linked-screen" style={{flex:1,paddingTop:Math.max(topInset,headerBottomOffset||0),backgroundColor:background}}>
  {!valid?<Text accessibilityLiveRegion="polite" style={{padding:24,color:text}}>Некорректная ссылка на заказ.</Text>:!userId?<Text style={{padding:24,color:text}}>Для просмотра заказа войдите в приложение.</Text>:connect?<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20}}><ProfileOnecConnections userId={userId} initialBase={baseKey} onConnected={async signal=>{if(!signal.aborted&&latest.current===scope)retry();}}/></ScrollView>:current?.order?<ClientOrderReadOnlyView order={current.order}/>:current?.error?<View style={{padding:24,gap:16}}>
   <Text accessibilityLiveRegion="polite" style={{color:text}}>{current.error}</Text><Pressable accessibilityRole="button" onPress={retry}><Text style={{color:accent}}>Повторить</Text></Pressable>
  </View>:<View accessibilityLiveRegion="polite" style={{padding:32,alignItems:'center'}}><ActivityIndicator color={accent} accessibilityLabel="Загружаю заказ"/></View>}
 </View>;
}
