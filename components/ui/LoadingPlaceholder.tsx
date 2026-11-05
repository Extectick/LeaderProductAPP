import React,{memo} from 'react';
import {StyleSheet,View,type StyleProp,type ViewStyle} from 'react-native';

/** Static skeletons cost no timers or animation work in a scrolling chat. */
export const LoadingPlaceholder=memo(function LoadingPlaceholder({dark=false,accessibilityLabel='Загрузка…',variant='card',style,testID='loading-placeholder'}:{
 dark?:boolean;accessibilityLabel?:string;variant?:'card'|'row'|'icon';style?:StyleProp<ViewStyle>;testID?:string;
}){
 const background=dark?'#29313A':'#E8EBEF',bar=dark?'#3B4550':'#D2D8DF';
 return <View testID={testID} pointerEvents="none" accessible accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel} accessibilityState={{busy:true}}
  style={[styles.base,{backgroundColor:background},variant==='icon'?{padding:5}:styles.content,style]}>
  <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{flex:1,justifyContent:'center',gap:variant==='row'?3:12}}>
   {variant==='icon'?<View style={{flex:1,borderRadius:6,backgroundColor:bar}}/>:<>
    {variant==='card'?<View style={{width:40,height:40,borderRadius:12,backgroundColor:bar,marginBottom:4}}/>:null}
    <View style={{height:variant==='row'?5:10,width:'62%',borderRadius:5,backgroundColor:bar}}/>
    <View style={{height:variant==='row'?4:8,width:'88%',borderRadius:4,backgroundColor:bar,opacity:.75}}/>
    {variant==='card'?<View style={{height:8,width:'44%',borderRadius:4,backgroundColor:bar,opacity:.55}}/>:null}
   </>}
  </View>
 </View>;
});
const styles=StyleSheet.create({base:{flex:1,overflow:'hidden',borderRadius:14},content:{padding:18}});
