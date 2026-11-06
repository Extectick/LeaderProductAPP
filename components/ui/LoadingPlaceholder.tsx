import React,{memo} from 'react';
import {StyleSheet,View,type StyleProp,type ViewStyle} from 'react-native';

/** A plain loading surface without decorative elements or animation work. */
export const LoadingPlaceholder=memo(function LoadingPlaceholder({dark=false,accessibilityLabel='Загрузка…',style,testID='loading-placeholder'}:{
 dark?:boolean;accessibilityLabel?:string;variant?:'card'|'row'|'icon';style?:StyleProp<ViewStyle>;testID?:string;
}){
 const background=dark?'#303030':'#E7E7E7';
 return <View testID={testID} pointerEvents="none" accessible accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel} accessibilityState={{busy:true}}
  style={[styles.base,{backgroundColor:background},style]}/>;
});
const styles=StyleSheet.create({base:{flex:1,overflow:'hidden'}});
