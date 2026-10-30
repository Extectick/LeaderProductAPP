import React from 'react';
import {ActivityIndicator,StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useHelpReducedMotion,useHelpTheme} from '../helpTheme';
import {HELP_LIST_INSET} from '../helpLayout';
import {helpDevRef} from '../helpDiagnostics';
import {HelpIcon} from './HelpPrimitives';

export function HelpHeaderFrame({children,onBack,connecting=false}:{children:React.ReactNode;onBack:()=>void;connecting?:boolean}) {
  const c=useHelpTheme(),reducedMotion=useHelpReducedMotion();
  return <View ref={node=>helpDevRef('header.surface',node)} testID="help-header" style={{paddingHorizontal:HELP_LIST_INSET,paddingTop:4,paddingBottom:16}}>
    <View style={{height:32,flexDirection:'row',alignItems:'center',gap:8}}><Text style={{color:c.muted,fontSize:13,lineHeight:18,fontWeight:'500'}}>Поддержка</Text>{connecting?<View style={{flexDirection:'row',alignItems:'center',gap:5,minHeight:18}}><View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{width:14,height:14,alignItems:'center',justifyContent:'center'}}>{reducedMotion?<Ionicons name="cloud-offline-outline" size={14} color={c.accentText}/>:<ActivityIndicator testID="help-connection-spinner" size={14} color={c.accentText}/>}</View><Text testID="help-connection-status" accessibilityLiveRegion="polite" style={{color:c.muted,fontSize:12,lineHeight:18,opacity:.8}}>Соединение…</Text></View>:null}</View>
    <View style={{flexDirection:'row',alignItems:'center',gap:StyleSheet.hairlineWidth}}>
      <HelpIcon name="chevron-back" label="Назад" onPress={onBack} color={c.text} size={24} style={{width:44,height:48,backgroundColor:c.panel,borderTopLeftRadius:24,borderBottomLeftRadius:24,borderTopRightRadius:0,borderBottomRightRadius:0}}/>
      <View testID="help-search-surface" style={{flex:1,minWidth:0,height:48,borderTopLeftRadius:0,borderBottomLeftRadius:0,borderTopRightRadius:24,borderBottomRightRadius:24,flexDirection:'row',alignItems:'center',backgroundColor:c.panel,paddingLeft:14}}>{children}</View>
    </View>
  </View>;
}
