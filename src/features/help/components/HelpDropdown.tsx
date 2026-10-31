import React from 'react';
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useHelpReducedMotion, useHelpTheme} from '../helpTheme';

export function HelpDropdown({children, onClose, label, testID, top, left, right, width}: {
  children: React.ReactNode; onClose: () => void; label: string; testID: string;
  top: number; left?: number; right?: number; width: number;
}) {
  const c = useHelpTheme(), reduced = useHelpReducedMotion();
  return <Modal transparent visible animationType={reduced ? 'none' : 'fade'} onRequestClose={onClose} statusBarTranslucent>
    <View testID={`${testID}-overlay`} style={{flex: 1}}>
      <Pressable testID={`${testID}-dismiss`} accessibilityRole="button" accessibilityLabel={label} onPress={onClose} style={StyleSheet.absoluteFill}/>
      <View testID={testID} accessibilityViewIsModal style={{position:'absolute',top,left,right,width,maxWidth:'94%',padding:4,backgroundColor:c.elevated,borderRadius:14,borderWidth:1,borderColor:c.line,elevation:8,shadowColor:'#000',shadowOpacity:.16,shadowRadius:12,shadowOffset:{width:0,height:4}}}>{children}</View>
    </View>
  </Modal>;
}

export function HelpDropdownAction({label, accessibilityLabel=label, icon, onPress, disabled=false}: {label:string; accessibilityLabel?:string; icon:keyof typeof Ionicons.glyphMap; onPress:()=>void; disabled?:boolean}) {
  const c = useHelpTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>({minHeight:48,paddingHorizontal:12,borderRadius:10,flexDirection:'row',alignItems:'center',gap:12,opacity:disabled ? .38 : 1,backgroundColor:pressed?c.soft:'transparent'})}>
    <Ionicons name={icon} size={22} color={c.text}/><Text style={{flexShrink:1,color:c.text,fontSize:16,lineHeight:22}}>{label}</Text>
  </Pressable>;
}
