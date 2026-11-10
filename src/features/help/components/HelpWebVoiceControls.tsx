import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, AppState, Pressable, Text, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useAudioPlayer, useAudioPlayerStatus} from 'expo-audio';
import {useSharedValue} from 'react-native-reanimated';
import {useHelpAudioCommands} from '../HelpAudioPlayback';
import {useHelpReducedMotion, useHelpTheme} from '../helpTheme';
import {helpDuration} from '../helpUiUtils';
import {HelpVoiceWave, HELP_VOICE_WAVE_SAMPLES} from './HelpVoiceWave';
import type {HelpLocalFile} from './HelpComposer';
import {APP_WEB_FONT, appWebControlProps, appWebControlContentProps} from '../../../../components/ui/appWebInteraction';


/** Browser presentation uses the Android row and waveform. MediaRecorder stays
 * in the composer, which owns permissions, interruptions and the send fence. */
export function HelpWebVoiceControls({preparing, locked, working, duration, meter, draft, screenActive, onCancel, onStop, onLock, error}:{
  preparing:boolean; locked:boolean; working:boolean; duration:number; meter:number[];
  draft?:HelpLocalFile; screenActive?:boolean; onCancel:()=>void; onStop:()=>void; onLock:()=>void; error:(message:string)=>void;
}) {
  const c=useHelpTheme(),reduced=useHelpReducedMotion(),commands=useHelpAudioCommands();
  const [width,setWidth]=useState(1);
  const samples=useSharedValue<number[]>([]),history=useRef<number[]>([]);
  const paused=Boolean(draft),total=draft?.durationMs??duration;
  const player=useAudioPlayer(draft?.uri??null,{updateInterval:80}),playback=useAudioPlayerStatus(player);
  history.current=draft?.voiceWave??meter;
  useEffect(()=>{samples.value=meter.slice(-HELP_VOICE_WAVE_SAMPLES);},[meter,samples]);
  // A send, navigation or unmount cannot leave a private preview playing.
  useEffect(()=>{if(working||screenActive===false)player.pause();},[working,screenActive,player]);
  useEffect(()=>{const sub=AppState.addEventListener('change',state=>{if(state!=='active')player.pause();});return()=>sub.remove();},[player]);
  useEffect(()=>()=>{try{player.pause();}catch{/* player may already be released */}},[player]);
  async function togglePlayback(){
    if(working||!draft||screenActive===false)return;
    try{
      if(playback.playing){player.pause();return;}
      commands?.stop();
      if(playback.didJustFinish||playback.currentTime>=total/1000)await player.seekTo(0);
      player.play();
    }catch{error('Не удалось прослушать запись. Попробуйте ещё раз.');}
  }
  return <>
    <View testID={paused?'help-web-voice-preview':preparing?'help-web-voice-preparing':locked?'help-web-voice-locked':'help-web-voice-holding'} style={{height:48,borderRadius:24,backgroundColor:c.panel,flexDirection:'row',alignItems:'center',paddingLeft:12,paddingRight:74,gap:7}}>
      {paused?<Pressable {...appWebControlProps('subtle')} accessibilityRole="button" accessibilityLabel="Удалить голосовое сообщение" disabled={working} onPress={()=>{player.pause();onCancel();}} style={{width:28,height:44,alignItems:'center',justifyContent:'center'}}><Ionicons {...appWebControlContentProps()} name="trash-outline" size={27} color={c.danger}/></Pressable>:preparing?<ActivityIndicator size="small" color={c.muted}/>:<View style={{width:13,height:13,borderRadius:7,backgroundColor:'#DB5059'}}/>}
      <Text accessibilityLabel={preparing?'Включение микрофона':`Длительность записи ${helpDuration(total/1000)}`} style={{color:c.text,fontSize:14,fontFamily:APP_WEB_FONT,fontVariant:['tabular-nums'],minWidth:35}}>{helpDuration(playback.playing?playback.currentTime:total/1000)}</Text>
      <View onLayout={event=>setWidth(event.nativeEvent.layout.width)} style={{flex:1,minWidth:25,height:44}}>
        <HelpVoiceWave samples={samples} history={history} width={width} paused={paused} duration={total} range={[0,total]} accent={c.accent} line={c.line} reduced={reduced}/>
        {paused?<Pressable {...appWebControlProps('subtle')} accessibilityRole="button" accessibilityLabel={playback.playing?'Приостановить прослушивание':'Прослушать голосовое сообщение'} disabled={working} onPress={()=>void togglePlayback()} style={{position:'absolute',left:'50%',marginLeft:-16,top:6,width:32,height:32,borderRadius:16,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'}}><Ionicons {...appWebControlContentProps()} name={playback.playing?'pause':'play'} size={20} color={c.accentText}/></Pressable>:null}
      </View>
      {!paused?<Pressable {...appWebControlProps('subtle')} accessibilityRole="button" accessibilityLabel="Отменить запись" onPress={onCancel} disabled={working} style={{height:44,flexDirection:'row',alignItems:'center',gap:3}}>{!locked?<Ionicons {...appWebControlContentProps()} name="chevron-back" size={15} color={c.muted}/>:null}<Text style={{color:c.muted,fontSize:12,fontFamily:APP_WEB_FONT}}>{locked?'ОТМЕНА':'Отмена'}</Text></Pressable>:null}
    </View>
    {!paused&&!preparing&&!working?<Pressable {...appWebControlProps('subtle')} accessibilityRole="button" accessibilityLabel={locked?'Остановить запись и прослушать':'Закрепить запись'} onPress={locked?onStop:onLock} style={{position:'absolute',right:11,bottom:72,width:36,height:44,borderRadius:16,backgroundColor:c.panel,alignItems:'center',justifyContent:'center',gap:2}}><Ionicons {...appWebControlContentProps()} name={locked?'stop':'lock-closed-outline'} size={locked?20:18} color={c.accentText}/>{!locked?<Ionicons {...appWebControlContentProps()} name="chevron-up" size={14} color={c.accentText}/>:null}</Pressable>:null}
  </>;
}
