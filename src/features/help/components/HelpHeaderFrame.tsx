import React from 'react';
import {ActivityIndicator,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useHelpReducedMotion,useHelpTheme} from '../helpTheme';
import {HELP_LIST_INSET} from '../helpLayout';
import {helpDevRef} from '../helpDiagnostics';
import {HelpIcon} from './HelpPrimitives';

export function HelpHeaderFrame({children,onBack,trailing,connecting=false}:{children:React.ReactNode;onBack:()=>void;trailing?:React.ReactNode;connecting?:boolean}) {
  const c=useHelpTheme(),reducedMotion=useHelpReducedMotion();
  return <View ref={node=>helpDevRef('header.surface',node)} testID="help-header" style={{paddingHorizontal:HELP_LIST_INSET,paddingTop:4,paddingBottom:16}}>
    <View style={{height:32,flexDirection:'row',alignItems:'center',gap:8}}><Text style={{color:c.muted,fontSize:13,lineHeight:18,fontWeight:'500'}}>Поддержка</Text>{connecting?<View style={{flexDirection:'row',alignItems:'center',gap:5,minHeight:18}}><View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{width:14,height:14,alignItems:'center',justifyContent:'center'}}>{reducedMotion?<Ionicons name="cloud-offline-outline" size={14} color={c.accentText}/>:<ActivityIndicator testID="help-connection-spinner" size={14} color={c.accentText}/>}</View><Text testID="help-connection-status" accessibilityLiveRegion="polite" style={{color:c.muted,fontSize:12,lineHeight:18,opacity:.8}}>Соединение…</Text></View>:null}</View>
    <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
      <HelpIcon name="chevron-back" label="Назад" onPress={onBack} color={c.text} size={24} style={{width:48,height:48,backgroundColor:c.panel,borderRadius:24}}/>
      <View testID="help-search-surface" style={{flex:1,minWidth:0,height:48,borderRadius:24,flexDirection:'row',alignItems:'center',backgroundColor:c.panel,paddingHorizontal:14}}>{children}</View>
      {trailing}
    </View>
  </View>;
}
