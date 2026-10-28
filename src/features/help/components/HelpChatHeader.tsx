import React, {useEffect,useRef} from 'react';
import {Animated,Easing,Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {HelpHeaderFrame} from './HelpHeaderFrame';
import {useHelpReducedMotion,useHelpTheme} from '../helpTheme';
import {HELP_LIST_META_WIDTH} from '../helpLayout';
import {helpDevRef} from '../helpDiagnostics';

export type HelpChatSearchFieldProps = {
  query:string;onQueryChange:(query:string)=>void;onClose:()=>void;onSubmit?:()=>void;autoFocus?:boolean;
};

/** Keep this control mounted across header modes so both directions use the same animation value. */
export function HelpMoreCloseButton({active,onPress,activeLabel='Закрыть'}:{active:boolean;onPress:()=>void;activeLabel?:string}) {
  const c=useHelpTheme();const reduced=useHelpReducedMotion();const progress=useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(()=>{
    progress.stopAnimation();
    if(reduced){progress.setValue(active ? 1 : 0);return;}
    const animation=Animated.timing(progress,{toValue:active ? 1 : 0,duration:180,easing:Easing.out(Easing.cubic),useNativeDriver:true});
    animation.start();return()=>animation.stop();
  },[active,reduced,progress]);
  return <Pressable ref={node=>helpDevRef('header.menu',node)} testID="help-header-more-close" accessibilityRole="button" accessibilityLabel={active ? activeLabel : 'Действия с обращением'} accessibilityState={{expanded:active}} onPress={onPress} style={({pressed})=>({width:HELP_LIST_META_WIDTH,height:48,alignItems:'center',justifyContent:'center',opacity:pressed ? .65 : 1})}>
    <Animated.View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill,{alignItems:'center',justifyContent:'center',opacity:progress.interpolate({inputRange:[0,.6,1],outputRange:[1,0,0]}),transform:[{rotate:progress.interpolate({inputRange:[0,1],outputRange:['0deg','90deg']})},{scale:progress.interpolate({inputRange:[0,1],outputRange:[1,.65]})}]}]}><Ionicons name="ellipsis-horizontal" size={24} color={c.text}/></Animated.View>
    <Animated.View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill,{alignItems:'center',justifyContent:'center',opacity:progress.interpolate({inputRange:[0,.25,1],outputRange:[0,0,1]}),transform:[{rotate:progress.interpolate({inputRange:[0,1],outputRange:['-90deg','0deg']})},{scale:progress.interpolate({inputRange:[0,1],outputRange:[.65,1]})}]}]}><Ionicons name="close-outline" size={26} color={c.text}/></Animated.View>
  </Pressable>;
}

export function HelpChatHeader({title,meta,onBack,onMenu,onSearch,search,menuActive=false}:{title:string;meta:string;onBack:()=>void;onMenu?:()=>void;onSearch?:()=>void;search?:HelpChatSearchFieldProps;menuActive?:boolean}) {
  const c=useHelpTheme();
  return <HelpHeaderFrame onBack={search?.onClose??onBack}>
    <View key="content" style={{flex:1,minWidth:0,justifyContent:'center',gap:1}}>
      {search ? <View style={{height:48,flexDirection:'row',alignItems:'center'}}><Ionicons name="search-outline" size={20} color={c.muted} accessible={false}/><TextInput testID="help-chat-search-input" accessibilityLabel="Поиск в переписке" value={search.query} onChangeText={search.onQueryChange} onSubmitEditing={search.onSubmit} autoFocus={search.autoFocus??false} placeholder="Поиск в переписке" placeholderTextColor={c.muted} autoCapitalize="none" autoCorrect={false} returnKeyType="search" clearButtonMode="never" maxLength={100} style={{flex:1,minWidth:0,height:48,paddingHorizontal:8,paddingVertical:0,color:c.text,fontSize:16,includeFontPadding:false}}/></View> : <><Text numberOfLines={1} style={{color:c.text,fontSize:15,lineHeight:20,fontWeight:'600'}}>{title}</Text>{meta ? <Text numberOfLines={1} style={{color:c.muted,fontSize:10,lineHeight:14}}>{meta}</Text> : null}</>}
    </View>
    {onSearch&&!search ? <Pressable key="search" accessibilityRole="button" accessibilityLabel="Поиск в переписке" onPress={onSearch} style={({pressed})=>({width:48,height:48,alignItems:'center',justifyContent:'center',opacity:pressed ? .65 : 1})}><Ionicons name="search-outline" size={21} color={c.muted}/></Pressable> : null}
    {search||onMenu ? <HelpMoreCloseButton key="menu" active={Boolean(search)||menuActive} activeLabel={search ? 'Закрыть поиск' : 'Закрыть меню обращения'} onPress={search?.onClose??onMenu!}/> : <View key="menu-space" style={{width:16}}/>}
  </HelpHeaderFrame>;
}
