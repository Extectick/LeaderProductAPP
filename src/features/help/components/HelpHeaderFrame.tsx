import React from 'react';
import {StyleSheet,Text,View} from 'react-native';
import {useHelpTheme} from '../helpTheme';
import {HELP_LIST_INSET} from '../helpLayout';
import {helpDevRef} from '../helpDiagnostics';
import {HelpIcon} from './HelpPrimitives';

export function HelpHeaderFrame({children,onBack}:{children:React.ReactNode;onBack:()=>void}) {
  const c=useHelpTheme();
  return <View ref={node=>helpDevRef('header.surface',node)} testID="help-header" style={{paddingHorizontal:HELP_LIST_INSET,paddingTop:4,paddingBottom:16}}>
    <View style={{height:32,justifyContent:'center'}}><Text style={{color:c.muted,fontSize:13,lineHeight:18,fontWeight:'500'}}>Поддержка</Text></View>
    <View style={{flexDirection:'row',alignItems:'center',gap:StyleSheet.hairlineWidth}}>
      <HelpIcon name="chevron-back" label="Назад" onPress={onBack} color={c.text} size={24} style={{width:44,height:48,backgroundColor:c.panel,borderTopLeftRadius:24,borderBottomLeftRadius:24,borderTopRightRadius:0,borderBottomRightRadius:0}}/>
      <View testID="help-search-surface" style={{flex:1,minWidth:0,height:48,borderTopLeftRadius:0,borderBottomLeftRadius:0,borderTopRightRadius:24,borderBottomRightRadius:24,flexDirection:'row',alignItems:'center',backgroundColor:c.panel,paddingLeft:14}}>{children}</View>
    </View>
  </View>;
}
