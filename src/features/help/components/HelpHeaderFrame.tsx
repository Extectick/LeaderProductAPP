import React from 'react';
import {ActivityIndicator,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useHelpReducedMotion,useHelpTheme} from '../helpTheme';
import {HELP_LIST_INSET} from '../helpLayout';
import {helpDevRef} from '../helpDiagnostics';
import {HelpIcon} from './HelpPrimitives';
import {APP_TOOLBAR_LAYOUT as layout} from '@/components/ui/appToolbarLayout';

const eyebrowInset=16;
export const helpHeaderFrameHeight=(reserveEyebrow=false)=>layout.actionSize+layout.bottom+(reserveEyebrow?eyebrowInset:layout.top);
export function HelpHeaderFrame({children,onBack,trailing,connecting=false,eyebrow,reserveEyebrow=false,title,contentSurface='pill',backLabel='Назад'}:{children?:React.ReactNode;onBack:()=>void;trailing?:React.ReactNode;connecting?:boolean;eyebrow?:string;reserveEyebrow?:boolean;title?:string;contentSurface?:'pill'|'plain';backLabel?:string}) {
  const c=useHelpTheme(),reducedMotion=useHelpReducedMotion();
  return <View ref={node=>helpDevRef('header.surface',node)} testID="help-header" style={{paddingHorizontal:HELP_LIST_INSET,paddingTop:eyebrow||reserveEyebrow?eyebrowInset:layout.top,paddingBottom:layout.bottom}}>
    {eyebrow?<Text testID="help-header-ticket-number" style={{position:'absolute',top:0,left:HELP_LIST_INSET+4,color:c.muted,fontSize:9,lineHeight:12,includeFontPadding:false,opacity:.75}}>{eyebrow}</Text>:null}
    <View style={{flexDirection:'row',alignItems:'center',gap:layout.gap}}>
      <HelpIcon name="chevron-back" label={backLabel} onPress={onBack} color={c.text} size={24} style={{width:layout.actionSize,height:layout.actionSize,backgroundColor:c.panel,borderRadius:layout.actionSize/2}}/>
      <View testID="help-search-surface" style={{flex:1,minWidth:0,height:layout.actionSize,borderRadius:layout.actionSize/2,flexDirection:'row',alignItems:'center',backgroundColor:contentSurface==='plain'?'transparent':c.panel,paddingHorizontal:contentSurface==='plain'?0:14}}>{title===undefined?children:<Text accessibilityRole="header" numberOfLines={1} style={{flex:1,textAlign:'center',fontSize:17,fontWeight:'600',color:c.text}}>{title}</Text>}</View>
      {trailing}
    </View>
    {connecting?<View pointerEvents="none" style={{position:'absolute',bottom:0,right:HELP_LIST_INSET,flexDirection:'row',alignItems:'center',gap:4,height:14}}>{reducedMotion?<Ionicons name="cloud-offline-outline" size={10} color={c.muted}/>:<ActivityIndicator testID="help-connection-spinner" size={10} color={c.muted}/>}<Text testID="help-connection-status" accessibilityLiveRegion="polite" style={{color:c.muted,fontSize:10,lineHeight:12}}>Соединение…</Text></View>:null}
  </View>;
}
