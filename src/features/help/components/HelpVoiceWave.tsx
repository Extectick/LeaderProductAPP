import React from 'react';
import {View} from 'react-native';
import Reanimated,{useAnimatedStyle,withTiming,type SharedValue} from 'react-native-reanimated';

export const HELP_VOICE_WAVE_SAMPLES=16;

/** Native maxAmplitude is linear 0..1; preserve quiet speech without amplifying invalid input. */
export function helpVoiceMeter(amplitude:number,previous:number){
  const signal=Number.isFinite(amplitude)?Math.max(0,Math.min(1,amplitude)):0;
  const db=20*Math.log10(Math.max(.00001,signal));
  return Math.max(Math.max(0,Math.min(1,(db+60)/54)),(Number.isFinite(previous)?Math.max(0,Math.min(1,previous)):0)*.72);
}

/** The newest real microphone sample is at the centre; older samples travel outwards. */
export function helpVoiceLiveBarValue(samples:readonly number[],index:number,count:number){
  'worklet';
  const distance=Math.abs(index-Math.floor(count/2));
  const value=samples[samples.length-1-distance]??0;
  return Math.max(0,Math.min(1,value))*(1-distance/(Math.floor(count/2)+1)*.35);
}

export function helpVoiceTrimBars(samples:readonly number[],count:number){
  return Array.from({length:count},(_,i)=>{
    const from=Math.floor(i*samples.length/count),to=Math.max(from+1,Math.floor((i+1)*samples.length/count));
    let peak=0;
    for(let n=from;n<to&&n<samples.length;n++)peak=Math.max(peak,samples[n]);
    return peak;
  });
}

function LiveBar({samples,index,count,color,reduced}:{samples:SharedValue<number[]>;index:number;count:number;color:string;reduced:boolean}){
  const motion=useAnimatedStyle(()=>{
    const level=helpVoiceLiveBarValue(samples.value,index,count),scale=Math.max(2/36,level);
    const opacity=level>.02?1:0;
    return {opacity:reduced?opacity:withTiming(opacity,{duration:100}),transform:[{scaleY:reduced?scale:withTiming(scale,{duration:100})}]};
  });
  return <Reanimated.View testID={`help-voice-live-bar-${index}`} style={[{width:3,height:36,borderRadius:2,backgroundColor:color},motion]}/>;
}

/** Only microphone polling publishes samples; there is no independent repaint timer. */
export const HelpVoiceWave=React.memo(function HelpVoiceWave({samples,history,width,paused,duration,range,accent,line,reduced}:{
  samples:SharedValue<number[]>;history:React.MutableRefObject<number[]>;width:number;paused:boolean;duration:number;range:[number,number];accent:string;line:string;reduced:boolean;
}){
  const maximum=Math.max(3,Math.floor(width/6));
  const liveCount=Math.min(31,maximum%2?maximum:maximum-1);
  const count=paused?Math.min(80,maximum):liveCount;
  const bars=paused?helpVoiceTrimBars(history.current,count):null;
  return <View pointerEvents="none" testID={paused?'help-voice-trim-wave':'help-voice-live-wave'} style={{height:44,alignItems:'center',justifyContent:'center'}}>
    {!paused?<View style={{position:'absolute',height:1,width:'100%',backgroundColor:line}}/>:null}
    <View style={{height:44,width:paused?'100%':Math.min(width,count*6),flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
      {Array.from({length:count},(_,index)=>paused?<View key={index} style={{width:4,borderRadius:2,height:Math.max(3,(bars?.[index]??0)*36),backgroundColor:duration>0&&(index/count<range[0]/duration||index/count>range[1]/duration)?line:accent}}/>:<LiveBar key={index} samples={samples} index={index} count={count} color={accent} reduced={reduced}/>)}
    </View>
  </View>;
});
