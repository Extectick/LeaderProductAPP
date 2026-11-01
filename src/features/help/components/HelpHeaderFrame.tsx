import React from 'react';
import {ActivityIndicator,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useHelpReducedMotion,useHelpTheme} from '../helpTheme';
import {HELP_LIST_INSET} from '../helpLayout';
import {helpDevRef} from '../helpDiagnostics';
import {HelpIcon} from './HelpPrimitives';

export function HelpHeaderFrame({children,onBack,trailing,connecting=false,eyebrow}:{children:React.ReactNode;onBack:()=>void;trailing?:React.ReactNode;connecting?:boolean;eyebrow?:string}) {
  const c=useHelpTheme(),reducedMotion=useHelpReducedMotion();
  return <View ref={node=>helpDevRef('header.surface',node)} testID="help-header" style={{paddingHorizontal:HELP_LIST_INSET,paddingTop:eyebrow?16:4,paddingBottom:16}}>
    {eyebrow?<Text testID="help-header-ticket-number" style={{position:'absolute',top:0,left:HELP_LIST_INSET+4,color:c.muted,fontSize:9,lineHeight:12,includeFontPadding:false,opacity:.75}}>{eyebrow}</Text>:null}
    <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
      <HelpIcon name="chevron-back" label="Назад" onPress={onBack} color={c.text} size={24} style={{width:48,height:48,backgroundColor:c.panel,borderRadius:24}}/>
      <View testID="help-search-surface" style={{flex:1,minWidth:0,height:48,borderRadius:24,flexDirection:'row',alignItems:'center',backgroundColor:c.panel,paddingHorizontal:14}}>{children}</View>
      {trailing}
    </View>
    {connecting?<View pointerEvents="none" style={{position:'absolute',bottom:0,right:HELP_LIST_INSET,flexDirection:'row',alignItems:'center',gap:4,height:14}}>{reducedMotion?<Ionicons name="cloud-offline-outline" size={10} color={c.muted}/>:<ActivityIndicator testID="help-connection-spinner" size={10} color={c.muted}/>}<Text testID="help-connection-status" accessibilityLiveRegion="polite" style={{color:c.muted,fontSize:10,lineHeight:12}}>Соединение…</Text></View>:null}
  </View>;
}
