import React, {memo} from 'react';
import {ActivityIndicator, Platform, Pressable, Text, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import type {HelpMessage, HelpUser} from '../helpApi';
import {useHelpTheme} from '../helpTheme';
import {HelpAvatar} from './HelpPrimitives';
import {HelpAiIcon} from './HelpAiIcon';
import {APP_WEB_FONT,appWebControlProps,appWebControlContentProps} from '@/components/ui/appWebInteraction';

/** A timeline event, without a message bubble or an extra card surface. */
export const HelpItStatus = memo(function HelpItStatus({status, user, text}: {
  status: NonNullable<HelpMessage['itStatusChange']>; user?: HelpUser | null; text?: string;
}) {
  const c = useHelpTheme();
  const label = text || (status === 'REQUESTED' ? 'Вызван IT-специалист' : status === 'JOINED' || status === 'LEFT' ? `${user?.name || 'IT-специалист'} ${status==='LEFT'?'отключился':'подключился'}` : 'Продолжаем с AI');
  return <View testID={`help-it-status-${status}`} accessibilityLiveRegion="polite"
    style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,paddingVertical:12,paddingHorizontal:24}}>
    {(status === 'JOINED' || status === 'LEFT') && user ? <HelpAvatar id={user.id} name={user.name} uri={user.avatarUrl} size={24}/>
      : status === 'AI_RESUMED' ? <HelpAiIcon size={18} color={c.muted}/>
      : <Ionicons name="headset-outline" size={18} color={c.muted}/>}
    <Text style={{color:c.muted,fontSize:12,lineHeight:18,flexShrink:1,textAlign:'center'}}>{label}</Text>
  </View>;
});

export function HelpContinueAi({busy, disabled, onPress}: {busy:boolean;disabled:boolean;onPress:()=>void}) {
  const c=useHelpTheme(),blocked=busy||disabled;
  return <View testID="help-continue-ai-surface" style={{borderRadius:24,backgroundColor:c.panel}}><Pressable {...appWebControlProps('subtle')} testID="help-continue-ai" accessibilityRole="button" accessibilityLabel="Продолжить с AI"
    accessibilityState={{busy,disabled:blocked}} disabled={blocked} onPress={()=>{if(!blocked)onPress();}}
    style={({pressed})=>({minHeight:48,borderRadius:24,paddingHorizontal:20,alignItems:'center',justifyContent:'center',backgroundColor:pressed&&!blocked?c.soft:c.panel})}>
    {/* Keep the surface opaque while disabled: this control floats above history. */}
    <View {...appWebControlContentProps()} pointerEvents="none" style={{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9,opacity:disabled&&!busy?.45:1}}>
      <View style={{width:20,height:20,alignItems:'center',justifyContent:'center'}}>{busy?<ActivityIndicator size="small" color={c.accentText}/>:<HelpAiIcon size={20} color={c.accentText}/>}</View>
      <Text style={{color:c.accentText,fontSize:15,lineHeight:20,fontWeight:'500',...(Platform.OS==='web'?{fontFamily:APP_WEB_FONT}:{})}}>Продолжить с AI</Text>
    </View>
  </Pressable></View>;
}
