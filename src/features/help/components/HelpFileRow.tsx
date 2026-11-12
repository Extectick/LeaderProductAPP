import React from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import {MaterialCommunityIcons} from '@expo/vector-icons';
import Svg, {Circle} from 'react-native-svg';
import type {HelpAttachment} from '../helpApi';
import {useHelpTheme} from '../helpTheme';
import {helpFileBytes, helpFileFormat, helpFileTransferText} from '../helpFilePresentation';

export type HelpFileRowProps = {
  file: HelpAttachment;
  state: 'idle' | 'busy' | 'ready' | 'failed' | 'cancelled';
  progress?: {downloaded: number; total: number | null};
  uploading?: boolean;
  disabled?: boolean;
  onPress: () => void;
  onCancel?: () => void;
  testID: string;
  variant?: 'message' | 'assistant';
  trailing?: React.ReactNode;
};

const RING_RADIUS=26, RING_LENGTH=2*Math.PI*RING_RADIUS;

/** Presentation only: transfer lifetime and account fences stay with the caller. */
export function HelpFileRow({file,state,progress,uploading=false,disabled=false,onPress,onCancel,testID,variant='message',trailing}:HelpFileRowProps) {
  const c=useHelpTheme(),busy=uploading||state==='busy',format=helpFileFormat(file.name,file.mimeType);
  const knownTotal=progress?.total;
  const ratio=typeof knownTotal==='number'&&Number.isFinite(knownTotal)&&knownTotal>0
    ? Math.min(1,Math.max(0,(Number.isFinite(progress?.downloaded)?progress!.downloaded:0)/knownTotal)) : null;
  const subtitle=busy ? uploading?'Отправка…':progress?helpFileTransferText(progress):'Подготовка загрузки…'
    :state==='failed'?'Не загружен · Повторить':state==='cancelled'?'Загрузка отменена · Повторить':helpFileBytes(file.size);
  const action=busy?`${uploading?'Отправка':'Загрузка'} файла ${file.name}`:state==='failed'||state==='cancelled'?`Повторить загрузку ${file.name}`:`Скачать ${file.name}`;
  const inactive=disabled||busy;
  // Keep cancel beside the main action: a disabled HTML button must never
  // contain another button (and would suppress its pointer/keyboard events).
  return <View>
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={action} accessibilityHint={format.label}
    accessible={!(busy&&onCancel&&!uploading)}
    accessibilityState={{busy,disabled:inactive}} disabled={inactive} onPress={onPress}
    style={[styles.row,variant==='assistant'&&{backgroundColor:c.elevated,borderRadius:16,paddingHorizontal:12},disabled&&!busy?{opacity:.55}:undefined]}>
    <View style={styles.iconSlot}>
      <View style={[styles.iconCircle,{backgroundColor:c.dark?'#4A9FE1':c.accent}]}>
        <MaterialCommunityIcons name={format.icon} size={27} color="#FFFFFF" accessible={false}/>
      </View>
      {busy?<View testID={`${testID}-progress`} pointerEvents="none" accessible accessibilityRole="progressbar"
        accessibilityLabel={`${uploading?'Отправка':'Загрузка'} ${file.name}`}
        accessibilityValue={ratio===null?{text:subtitle}:{min:0,max:100,now:Math.round(ratio*100),text:subtitle}}
        style={styles.ring}>
        {ratio===null?<ActivityIndicator size={56} color={c.dark?'#FFFFFF':c.accent} style={StyleSheet.absoluteFill}/>
          :<Svg width={56} height={56} viewBox="0 0 56 56">
            <Circle cx={28} cy={28} r={RING_RADIUS} fill="none" stroke={c.dark?'#FFFFFF35':c.line} strokeWidth={2}/>
            <Circle testID={`${testID}-progress-arc`} cx={28} cy={28} r={RING_RADIUS} fill="none" stroke={c.dark?'#FFFFFF':c.accent} strokeWidth={2.5}
              strokeLinecap="round" strokeDasharray={[RING_LENGTH,RING_LENGTH]} strokeDashoffset={RING_LENGTH*(1-ratio)} transform="rotate(-90 28 28)"/>
          </Svg>}
      </View>:null}
    </View>
    <View style={styles.action}>
      <Text numberOfLines={1} ellipsizeMode="middle" style={[styles.name,{color:c.text}]}>{file.name}</Text>
      <View style={styles.metadata}>
        <Text testID={`${testID}-subtitle`} numberOfLines={1} accessibilityLiveRegion="polite" style={[styles.subtitle,{color:state==='failed'?c.danger:c.muted}]}>{subtitle}</Text>
        {trailing}
      </View>
    </View>
    </Pressable>
    {busy&&onCancel&&!uploading?<Pressable testID={`${testID}-cancel`} accessibilityRole="button" accessibilityLabel={`Отменить загрузку файла ${file.name}`}
      onPress={event=>{event?.stopPropagation?.();onCancel();}} style={[styles.cancelTarget,{left:variant==='assistant'?12:0}]}/>:null}
  </View>;
}

const styles=StyleSheet.create({
  row:{minHeight:64,flexDirection:'row',alignItems:'center',gap:12,paddingVertical:4},
  iconSlot:{width:56,height:56,alignItems:'center',justifyContent:'center'},
  iconCircle:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center'},
  ring:{position:'absolute',top:0,right:0,bottom:0,left:0,alignItems:'center',justifyContent:'center'},
  cancelTarget:{position:'absolute',top:'50%',marginTop:-28,width:56,height:56,borderRadius:28},
  action:{flex:1,minWidth:0,minHeight:56,justifyContent:'center',gap:4,paddingVertical:4},
  metadata:{flexDirection:'row',alignItems:'center',gap:8},
  name:{fontSize:15,lineHeight:20,fontWeight:'500'},
  subtitle:{flex:1,minWidth:0,fontSize:12,lineHeight:16,fontVariant:['tabular-nums']},
});
