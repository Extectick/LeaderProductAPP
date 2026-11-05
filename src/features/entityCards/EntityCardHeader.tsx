import React from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useHelpTheme} from '../help/helpTheme';

export function EntityCardHeader({title,canGoBack,onBack,onClose}:{title:string;canGoBack:boolean;onBack:()=>void;onClose:()=>void}){
 const c=useHelpTheme();
 return <View style={[styles.header,{borderBottomColor:c.line}]}>
  <View style={[styles.grip,{backgroundColor:c.muted}]} accessible={false}/>
  <View style={styles.row}>
   {canGoBack?<Pressable accessibilityRole="button" accessibilityLabel="Назад к предыдущей карточке" testID="entity-card-back" onPress={onBack} style={styles.button}><Ionicons name="chevron-back" color={c.text} size={24}/></Pressable>:<View style={styles.button}/>}
   <Text accessibilityRole="header" numberOfLines={2} style={[styles.title,{color:c.text}]}>{title}</Text>
   <Pressable accessibilityRole="button" accessibilityLabel="Закрыть карточки" testID="entity-card-close" onPress={onClose} style={styles.button}><Ionicons name="close" color={c.text} size={25}/></Pressable>
  </View>
 </View>;
}
const styles=StyleSheet.create({header:{borderBottomWidth:StyleSheet.hairlineWidth,paddingTop:8,paddingBottom:8},grip:{width:36,height:4,borderRadius:2,opacity:0.45,alignSelf:'center',marginBottom:7},row:{flexDirection:'row',alignItems:'center',paddingHorizontal:8,gap:4},button:{width:44,height:44,alignItems:'center',justifyContent:'center'},title:{flex:1,minWidth:0,fontSize:17,lineHeight:22,fontWeight:'700'}});
