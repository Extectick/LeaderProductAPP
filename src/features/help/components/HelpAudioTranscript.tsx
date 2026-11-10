import React,{memo,useCallback,useMemo,useContext,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Animated,Easing,Pressable,Text,View} from 'react-native';
import Reanimated,{cancelAnimation,Easing as NativeEasing,useAnimatedStyle,useSharedValue,withTiming} from 'react-native-reanimated';
import {Ionicons} from '@expo/vector-icons';
import {appWebControlProps} from '@/components/ui/appWebInteraction';
import {useHelpAudioTranscript} from '../helpAudioTranscript';
import {useHelpReducedMotion,useHelpTheme} from '../helpTheme';
import {HelpVisualEffectsContext} from '../helpVisualEffects';
import type {HelpAudioTranscript as Transcript} from '../helpApi';

/** UI state is outside the playback row: starting audio never remounts the text. */
export function useAudioTranscriptPresentation(attachmentId:string,enabled:boolean) {
  const read=useHelpAudioTranscript();
  const [state,setState]=useState<{read:typeof read;id:string;busy:boolean;open:boolean;result?:Transcript;failed?:boolean}>({read,id:attachmentId,busy:false,open:false});
  const current=state.read===read&&state.id===attachmentId?state:undefined;
  const work=useRef<AbortController|null>(null);
  const identity=useRef({read,id:attachmentId});identity.current={read,id:attachmentId};
  useEffect(()=>()=>{work.current?.abort();work.current=null;},[read,attachmentId,enabled]);
  const toggle=useCallback(async()=>{
    if(!read||!enabled||current?.busy||work.current)return;
    if(current?.result){setState({...current,open:!current.open});return;}
    const controller=new AbortController();work.current=controller;
    const valid=()=>!controller.signal.aborted&&identity.current.read===read&&identity.current.id===attachmentId;
    setState({read,id:attachmentId,busy:true,open:false});
    try{
      const result=await read(attachmentId,controller.signal);
      if(!valid())return;
      if(result.status==='transcribed'&&typeof result.text==='string'&&result.text.trim()||result.status==='no_speech')setState({read,id:attachmentId,busy:false,open:true,result});
      else setState({read,id:attachmentId,busy:false,open:false,failed:true});
    }catch{if(valid())setState({read,id:attachmentId,busy:false,open:false,failed:true});}
    finally{if(work.current===controller)work.current=null;}
  },[read,enabled,current,attachmentId]);
  return useMemo(()=>({available:Boolean(read&&enabled),busy:current?.busy??false,open:current?.open??false,failed:current?.failed??false,result:current?.result,toggle}),[read,enabled,current,toggle]);
}
type Presentation=ReturnType<typeof useAudioTranscriptPresentation>;

export const HelpAudioTranscriptButton=memo(function HelpAudioTranscriptButton({value}:{value:Presentation}) {
  const c=useHelpTheme(),reduced=useHelpReducedMotion(),active=useContext(HelpVisualEffectsContext);
  const pulse=useRef(new Animated.Value(0)).current;
  useEffect(()=>{
    pulse.stopAnimation();pulse.setValue(0);
    if(!value.busy||reduced||!active)return;
    const animation=Animated.loop(Animated.timing(pulse,{toValue:1,duration:1000,easing:Easing.linear,useNativeDriver:true}));
    animation.start();return()=>animation.stop();
  },[value.busy,reduced,active,pulse]);
  if(!value.available)return null;
  return <Pressable testID="help-audio-transcript-button" {...appWebControlProps('subtle')} accessibilityRole="button"
    accessibilityLabel={value.busy?'Распознавание голосового':value.failed?'Повторить распознавание':value.open?'Скрыть текст голосового':'Показать текст голосового'}
    accessibilityState={{busy:value.busy,disabled:value.busy,expanded:value.open}} disabled={value.busy} onPress={()=>void value.toggle()}
    hitSlop={4} style={{width:36,height:36,borderRadius:10,alignItems:'center',justifyContent:'center',flexShrink:0}}>
    <View pointerEvents="none" style={{position:'absolute',inset:4,borderWidth:1,borderRadius:7,borderColor:value.busy?c.accentText:c.line}}/>
    {value.busy&&<Animated.View testID="help-audio-transcript-border" pointerEvents="none" style={{position:'absolute',inset:3,borderWidth:1.5,borderRadius:8,borderColor:c.accentText,opacity:reduced?1:pulse.interpolate({inputRange:[0,.2,1],outputRange:[.2,.8,0]}),transform:[{scale:reduced?1:pulse.interpolate({inputRange:[0,1],outputRange:[1,1.18]})}]}}/>}
    <Ionicons name="text-outline" size={17} color={value.open||value.busy?c.accentText:c.muted}/>
  </Pressable>;
});

export const HelpAudioTranscriptText=memo(function HelpAudioTranscriptText({value}:{value:Presentation}) {
  const c=useHelpTheme(),reduced=useHelpReducedMotion();
  const height=useSharedValue(0),measured=useRef(0);
  const latest=useRef({open:value.open,reduced});latest.current={open:value.open,reduced};
  const resize=(size:number)=>{cancelAnimation(height);height.value=latest.current.reduced?size:withTiming(size,{duration:220,easing:NativeEasing.out(NativeEasing.cubic)});};
  useLayoutEffect(()=>{if(!value.result)measured.current=0;resize(value.open?measured.current:0);},[value.open,reduced,value.result]);
  useEffect(()=>()=>cancelAnimation(height),[height]);
  const motion=useAnimatedStyle(()=>({height:height.value}));
  if(!value.result)return null;
  return <Reanimated.View testID="help-audio-transcript-reveal" pointerEvents={value.open?'auto':'none'} accessibilityElementsHidden={!value.open} importantForAccessibility={value.open?'auto':'no-hide-descendants'} style={[{overflow:'hidden'},motion]}>
    <View testID="help-audio-transcript-content" onLayout={event=>{const next=event.nativeEvent.layout.height;if(!Number.isFinite(next)||next<=0||Math.abs(next-measured.current)<.5)return;measured.current=next;if(latest.current.open)resize(next);}}
      style={{position:'absolute',top:0,left:0,right:0,paddingTop:10,paddingBottom:2}}>
      <Text selectable testID="help-audio-transcript-text" style={{fontSize:14,lineHeight:20,color:c.text}}>{value.result.status==='no_speech'?'Речь не распознана':value.result.text}</Text>
      {value.result.truncated&&<Text style={{fontSize:11,lineHeight:16,color:c.muted,marginTop:4}}>Расшифровка неполная</Text>}
    </View>
  </Reanimated.View>;
});
