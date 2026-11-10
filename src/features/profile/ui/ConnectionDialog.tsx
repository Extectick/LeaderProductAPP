import React,{useContext} from 'react';
import {KeyboardAvoidingView,Modal,Platform,Pressable,ScrollView,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {AppDesktopDialog} from '@/components/ui/AppDesktopDialog';
import {useAppSurfaceTheme} from '@/components/ui/appSurfaceTokens';
import {appWebControlProps} from '@/components/ui/appWebInteraction';
import {APP_LAYOUT} from '@/src/shared/layout/appLayout';
import {ConnectionSectionVisibilityContext} from './ConnectionSectionContext';

/** Shared connection editor; callers own drafts, authorization and dismissal. */
export function ConnectionDialog({visible,title,onClose,busy=false,children}:React.PropsWithChildren<{
 visible:boolean;title:string;onClose:()=>void;busy?:boolean;
}>){
 const t=useAppSurfaceTheme(),window=useWindowDimensions(),insets=useSafeAreaInsets();
 const sectionVisible=useContext(ConnectionSectionVisibilityContext);
 const close=()=>{if(!busy)onClose();};
 if(!visible||!sectionVisible)return null;
 if(Platform.OS==='web'&&window.width>APP_LAYOUT.compactMax)return <AppDesktopDialog title={title} onClose={close} dismissDisabled={busy} maxWidth={480} contentStyle={{gap:16}} testID="profile-connection-dialog">{children}</AppDesktopDialog>;
 return <Modal visible transparent animationType="fade" onRequestClose={close}>
  <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{flex:1}}>
   <View style={{flex:1,justifyContent:'center',paddingHorizontal:16,paddingTop:insets.top+16,paddingBottom:insets.bottom+16,backgroundColor:t.dark?'#00000085':'#17203352'}}>
    <Pressable accessible={false} disabled={busy} onPress={close} style={StyleSheet.absoluteFill}/>
    <View testID="profile-connection-dialog" accessibilityViewIsModal style={{width:'100%',maxWidth:480,alignSelf:'center',maxHeight:Math.max(1,window.height-insets.top-insets.bottom-32),flexShrink:1,borderRadius:20,overflow:'hidden',backgroundColor:t.panel}}>
     <View style={{flexDirection:'row',alignItems:'center',gap:12,padding:16}}>
      <Text accessibilityRole="header" style={{flex:1,color:t.text,fontSize:20,lineHeight:27,fontWeight:'600'}}>{title}</Text>
      <Pressable {...appWebControlProps()} accessibilityRole="button" accessibilityLabel="Закрыть диалог" disabled={busy} onPress={close} style={({pressed})=>({width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:pressed?t.soft:'transparent',opacity:busy?.4:1})}><Ionicons name="close-outline" size={23} color={t.muted}/></Pressable>
     </View>
     <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" style={{flexGrow:0,flexShrink:1}} contentContainerStyle={{padding:20,paddingTop:0,gap:16}}>{children}</ScrollView>
    </View>
   </View>
  </KeyboardAvoidingView>
 </Modal>;
}
