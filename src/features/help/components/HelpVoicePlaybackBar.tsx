import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Animated,Easing,Pressable,StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useHelpReducedMotion,useHelpTheme} from '../helpTheme';
import {helpDuration} from '../helpUiUtils';
import {HELP_LIST_INSET,HELP_LIST_META_WIDTH} from '../helpLayout';

export type HelpVoicePlaybackRate=1|1.5|2;
export const HELP_VOICE_PLAYBACK_BAR_HEIGHT=44;
export type HelpVoicePlaybackBarProps={
  author:string;
  positionSeconds:number;
  durationSeconds:number;
  playing:boolean;
  loading?:boolean;
  rate:HelpVoicePlaybackRate;
  onToggle:()=>void;
  onRateChange:(rate:HelpVoicePlaybackRate)=>void;
  onClose:()=>void;
  onPressTitle?:()=>void;
};

const finiteSeconds=(value:number)=>Number.isFinite(value)?Math.max(0,value):0;

/** Playback lives above the timeline; this strip never creates an audio player. */
export function HelpVoicePlaybackBar({author,positionSeconds,durationSeconds,playing,loading=false,rate,onToggle,onRateChange,onClose,onPressTitle}:HelpVoicePlaybackBarProps){
  const c=useHelpTheme();const reduced=useHelpReducedMotion();
  const duration=finiteSeconds(durationSeconds);
  const position=Math.min(finiteSeconds(positionSeconds),duration);
  const ratio=duration>0?position/duration:0;
  const [width,setWidth]=useState(0);
  const progress=useRef(new Animated.Value(ratio)).current;
  const nextRate:HelpVoicePlaybackRate=rate===1?1.5:rate===1.5?2:1;
  const name=author.trim()||'Голосовое сообщение';
  const time=`${helpDuration(position)} / ${duration?helpDuration(duration):'—'}`;
  useEffect(()=>{
    progress.stopAnimation();
    if(reduced||!playing||loading){progress.setValue(ratio);return;}
    const animation=Animated.timing(progress,{toValue:ratio,duration:100,easing:Easing.linear,useNativeDriver:true});
    animation.start();return()=>animation.stop();
  },[progress,ratio,playing,loading,reduced]);
  const title=<View pointerEvents="none" style={{minWidth:0,justifyContent:'center'}}>
    <Text numberOfLines={1} style={{color:c.text,fontSize:13,lineHeight:17,fontWeight:'600'}}>{name}</Text>
    <Text numberOfLines={1} style={{color:c.muted,fontSize:10,lineHeight:13,fontVariant:['tabular-nums']}}>{loading?'Загрузка…':`Голосовое · ${time}`}</Text>
  </View>;
  return <View testID="help-voice-playback-bar" style={{height:HELP_VOICE_PLAYBACK_BAR_HEIGHT,marginHorizontal:HELP_LIST_INSET,flexDirection:'row',alignItems:'center'}}>
    <Pressable testID="help-voice-playback-toggle" accessibilityRole="button" accessibilityLabel={loading?'Загрузка голосового сообщения':playing?'Приостановить голосовое сообщение':'Продолжить голосовое сообщение'} accessibilityState={{disabled:loading,busy:loading}} disabled={loading} onPress={onToggle} style={({pressed})=>({width:44,height:44,alignItems:'center',justifyContent:'center',opacity:pressed?.65:1})}>
      {loading?<ActivityIndicator size="small" color={c.accentText}/>:<Ionicons name={playing?'pause':'play'} size={21} color={c.accentText}/>}
    </Pressable>
    {onPressTitle?<Pressable accessibilityRole="button" accessibilityLabel={`К голосовому сообщению ${name}`} onPress={onPressTitle} style={({pressed})=>({flex:1,minWidth:0,height:44,justifyContent:'center',paddingHorizontal:4,opacity:pressed?.65:1})}>{title}</Pressable>:<View accessible accessibilityLabel={`${name}. Голосовое сообщение. ${loading?'Загрузка':time}`} style={{flex:1,minWidth:0,height:40,justifyContent:'center',paddingHorizontal:4}}>{title}</View>}
    <Pressable testID="help-voice-playback-rate" accessibilityRole="button" accessibilityLabel={`Скорость воспроизведения ${String(rate).replace('.',',')}. Установить ${String(nextRate).replace('.',',')}`} accessibilityValue={{text:`${rate}×`}} onPress={()=>onRateChange(nextRate)} style={({pressed})=>({width:44,height:44,alignItems:'center',justifyContent:'center',opacity:pressed?.65:1})}><Text style={{color:rate===1?c.muted:c.accentText,fontSize:13,fontWeight:'600',fontVariant:['tabular-nums']}}>{rate}×</Text></Pressable>
    <Pressable testID="help-voice-playback-close" accessibilityRole="button" accessibilityLabel="Закрыть воспроизведение" onPress={onClose} style={({pressed})=>({width:HELP_LIST_META_WIDTH,height:44,alignItems:'center',justifyContent:'center',opacity:pressed?.65:1})}><Ionicons name="close-outline" size={23} color={c.muted}/></Pressable>
    <View testID="help-voice-playback-progress" accessibilityRole="progressbar" accessibilityLabel="Прослушано голосового сообщения" accessibilityValue={{min:0,max:duration,now:position,text:time}} onLayout={event=>setWidth(Math.max(0,event.nativeEvent.layout.width))} pointerEvents="none" style={{position:'absolute',left:0,right:0,bottom:0,height:2,overflow:'hidden',borderRadius:1}}>
      <View style={[StyleSheet.absoluteFill,{backgroundColor:c.line,opacity:.4}]}/>
      <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill,{backgroundColor:c.accentText,opacity:width>0?.7:0,transform:[{translateX:progress.interpolate({inputRange:[0,1],outputRange:[-width,0],extrapolate:'clamp'})}]}]}/>
    </View>
  </View>;
}
