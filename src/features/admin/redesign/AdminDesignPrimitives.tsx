import React,{useState} from 'react';
import {ActivityIndicator,KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,useWindowDimensions} from 'react-native';
import {Ionicons,MaterialCommunityIcons} from '@expo/vector-icons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useHelpTheme} from '../../help/helpTheme';
import {ScreenBlurProvider,ScreenBlurTarget} from '@/components/ui/AppScreenBlur';
import {AdminSceneHeader,ADMIN_HEADER_HEIGHT} from './AdminSceneHeader';
import {HelpSheet} from '../../help/components/HelpPrimitives';

export type IconName=React.ComponentProps<typeof Ionicons>['name'];
export function DesignIcon({name,mci,size=26}:{name:string;mci?:boolean;size?:number}) {
  const t=useHelpTheme();return mci?<MaterialCommunityIcons name={name as any} size={size} color={t.accent}/>:<Ionicons name={name as IconName} size={size} color={t.accent}/>;
}
export function DesignList({top,children}:{top:number;children:React.ReactNode}) {
  const insets=useSafeAreaInsets();return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingTop:top+8,paddingBottom:insets.bottom+24,flexGrow:1}}>{children}</ScrollView>;
}
export function DesignRow({title,subtitle,meta,icon,mci,onPress,trailing,muted=false,expanded}:{title:string;subtitle?:string;meta?:string;icon:string;mci?:boolean;onPress:()=>void;trailing?:React.ReactNode;muted?:boolean;expanded?:boolean}) {
  const t=useHelpTheme();return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={expanded===undefined?undefined:{expanded}} onPress={onPress} style={({pressed,hovered}:any)=>[p.row,{backgroundColor:pressed||hovered?t.soft:'transparent'}]}>
    <View style={[p.icon,{backgroundColor:muted?t.panel:t.soft}]}><DesignIcon name={icon} mci={mci}/></View>
    <View style={{flex:1,minWidth:0,gap:3}}><Text numberOfLines={2} style={[p.title,{color:muted?t.muted:t.text}]}>{title}</Text>{!!subtitle&&<Text numberOfLines={2} style={[p.subtitle,{color:t.muted}]}>{subtitle}</Text>}{!!meta&&<Text style={{fontSize:12,lineHeight:18,color:t.muted}}>{meta}</Text>}</View>
    {trailing??<Ionicons name="chevron-forward" size={21} color={t.muted}/>}
  </Pressable>;
}
export function DesignEmpty({title='Ничего не найдено',description='Попробуйте другое название',icon='search-outline'}:{title?:string;description?:string;icon?:IconName}) {
  const t=useHelpTheme();return <View style={p.empty}><Ionicons name={icon} size={36} color={t.muted}/><Text style={[p.title,{color:t.text,textAlign:'center'}]}>{title}</Text><Text style={[p.subtitle,{color:t.muted,textAlign:'center'}]}>{description}</Text></View>;
}
export function DesignGroup({title,children}:{title?:string;children:React.ReactNode}) {
  const t=useHelpTheme();return <View style={{marginTop:18,marginHorizontal:16}}>{!!title&&<Text style={[p.label,{color:t.muted}]}>{title.toLocaleUpperCase('ru')}</Text>}<View style={{borderRadius:18,overflow:'hidden',backgroundColor:t.incoming}}>{children}</View></View>;
}
export function DesignField({label,value,onChangeText,multiline=false,numeric=false}:{label:string;value:string;onChangeText:(value:string)=>void;multiline?:boolean;numeric?:boolean}) {
  const t=useHelpTheme();return <View style={p.field}><Text style={{color:t.muted,fontSize:12,lineHeight:18}}>{label}</Text><TextInput accessibilityLabel={label} placeholder={label} placeholderTextColor={t.muted} value={value} onChangeText={onChangeText} multiline={multiline} keyboardType={numeric?'number-pad':'default'} style={[p.input,{color:t.text},multiline&&{minHeight:90,textAlignVertical:'top'}]}/></View>;
}
export function DesignToggle({title,description,value,onChange,disabled=false}:{title:string;description?:string;value:boolean;onChange:(value:boolean)=>void;disabled?:boolean}) {
  const t=useHelpTheme();return <View style={p.setting}><View style={{flex:1,gap:4}}><Text style={{color:disabled?t.muted:t.text,fontSize:15,lineHeight:21}}>{title}</Text>{!!description&&<Text style={{color:t.muted,fontSize:12,lineHeight:18}}>{description}</Text>}</View><Switch accessibilityLabel={title} value={value} onValueChange={onChange} disabled={disabled} thumbColor="#FFFFFF" trackColor={{false:t.line,true:t.accent}}/></View>;
}
export function DesignChoice({title,value,onPress}:{title:string;value:string;onPress:()=>void}) {
  const t=useHelpTheme();return <Pressable accessibilityRole="button" accessibilityLabel={`${title}: ${value}`} onPress={onPress} style={({pressed})=>[p.setting,{backgroundColor:pressed?t.soft:'transparent'}]}><View style={{flex:1,gap:4}}><Text style={{color:t.muted,fontSize:12}}>{title}</Text><Text style={{color:t.text,fontSize:16,lineHeight:22}}>{value}</Text></View><Ionicons name="chevron-forward" size={20} color={t.muted}/></Pressable>;
}
export function DesignButton({label,onPress,secondary=false,danger=false,disabled=false}:{label:string;onPress:()=>void;secondary?:boolean;danger?:boolean;disabled?:boolean}) {
  const t=useHelpTheme();return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({pressed})=>[p.button,{opacity:disabled ? 0.4 : pressed ? 0.8 : 1,backgroundColor:secondary?t.panel:danger?t.danger:t.accent}]}><Text style={{fontSize:15,fontWeight:'600',color:secondary?(danger?t.danger:t.accentText):'#FFFFFF'}}>{label}</Text></Pressable>;
}
export function DesignHint({children,error=false}:{children:React.ReactNode;error?:boolean}) {
  const t=useHelpTheme();return <Text accessibilityRole={error?'alert':undefined} style={{color:error?t.danger:t.muted,fontSize:13,lineHeight:20,marginHorizontal:24,marginTop:14}}>{children}</Text>;
}
export function DesignSheet({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}) {
  const {height}=useWindowDimensions(),insets=useSafeAreaInsets();
  const [atTop,setAtTop]=useState(true);
  return <HelpSheet title={title} onClose={onClose} scrollOffset={atTop?0:1}>
    <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled scrollEventThrottle={32} onScroll={event=>setAtTop(event.nativeEvent.contentOffset.y<=1)} style={{maxHeight:Math.max(160,height-insets.top-insets.bottom-160)}}>{children}</ScrollView>
  </HelpSheet>;
}
export function DesignOption({title,selected=false,onPress}:{title:string;selected?:boolean;onPress:()=>void}) {
  const t=useHelpTheme();return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{selected}} onPress={onPress} style={({pressed})=>[p.setting,{backgroundColor:selected||pressed?t.soft:'transparent'}]}><Text style={{flex:1,color:t.text,fontSize:16,lineHeight:22}}>{title}</Text>{selected&&<Ionicons name="checkmark" size={22} color={t.accent}/>}</Pressable>;
}
export function DesignHero({title,subtitle,icon,mci}:{title:string;subtitle?:string;icon:string;mci?:boolean}) {
  const t=useHelpTheme();return <View style={p.hero}><View style={[p.icon,{width:76,height:76,borderRadius:38,backgroundColor:t.soft}]}><DesignIcon name={icon} mci={mci} size={36}/></View><Text style={{fontSize:22,lineHeight:28,fontWeight:'700',color:t.text,textAlign:'center',marginTop:4}}>{title}</Text>{!!subtitle&&<Text style={{fontSize:14,lineHeight:21,color:t.muted,textAlign:'center'}}>{subtitle}</Text>}</View>;
}
type EditorProps={title:string;caption:string;onClose:()=>void;onSave?:()=>void;error?:string;busy?:boolean;saveDisabled?:boolean;backLabel?:string;saveLabel?:string;children:React.ReactNode};
export function DesignEditor(props:EditorProps) {
  return <Modal visible animationType="slide" onRequestClose={props.busy?()=>{}:props.onClose} presentationStyle="fullScreen"><ScreenBlurProvider><EditorSurface {...props}/></ScreenBlurProvider></Modal>;
}
function EditorSurface({title,caption,onClose,onSave,error,busy=false,saveDisabled=false,backLabel='Назад к разделу',saveLabel='Сохранить изменения',children}:EditorProps) {
  const t=useHelpTheme(),insets=useSafeAreaInsets();
  return <KeyboardAvoidingView style={{flex:1,backgroundColor:t.background}} behavior={Platform.OS==='ios'?'padding':undefined}>
    <ScreenBlurTarget style={{flex:1}}><ScrollView testID="admin-editor-content" keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingTop:insets.top+ADMIN_HEADER_HEIGHT+12,paddingBottom:insets.bottom+28}}><View pointerEvents={busy?'none':'auto'}>{children}</View></ScrollView></ScreenBlurTarget>
    <AdminSceneHeader caption={caption}>
      <Pressable accessibilityRole="button" accessibilityLabel={backLabel} disabled={busy} onPress={onClose} style={[p.round,{backgroundColor:t.panel}]}><Ionicons name="chevron-back" size={24} color={t.text}/></Pressable><View style={{flex:1,height:48,borderRadius:24,backgroundColor:t.panel,paddingHorizontal:16,justifyContent:'center'}}><Text numberOfLines={1} style={{fontSize:16,fontWeight:'600',color:t.text}}>{title}</Text></View>{onSave&&<Pressable accessibilityRole="button" accessibilityLabel={saveLabel} disabled={busy||saveDisabled} onPress={onSave} style={[p.round,{backgroundColor:t.soft}]}>{busy?<ActivityIndicator color={t.accentText}/>:<Ionicons name="checkmark" size={24} color={t.accentText}/>}</Pressable>}
    </AdminSceneHeader>
    {!!error&&<View accessibilityRole="alert" style={{position:'absolute',left:16,right:16,bottom:insets.bottom+12,borderRadius:18,padding:16,backgroundColor:t.panel}}><Text style={{color:t.danger,fontSize:14,lineHeight:21}}>{error}</Text></View>}
  </KeyboardAvoidingView>;
}
const p=StyleSheet.create({row:{minHeight:88,paddingVertical:16,paddingLeft:18,paddingRight:29,flexDirection:'row',alignItems:'center',gap:16},icon:{width:50,height:50,borderRadius:25,alignItems:'center',justifyContent:'center'},title:{fontSize:16,lineHeight:22,fontWeight:'600'},subtitle:{fontSize:14,lineHeight:20},empty:{padding:32,gap:14,alignItems:'center'},label:{fontSize:11,lineHeight:18,letterSpacing:.7,marginLeft:16,marginBottom:8},field:{paddingHorizontal:16,paddingTop:14,paddingBottom:10,gap:4},input:{fontSize:16,lineHeight:22,padding:0,minHeight:28,...Platform.select({web:{outlineStyle:'none'} as any})},setting:{minHeight:64,paddingHorizontal:16,paddingVertical:14,flexDirection:'row',alignItems:'center',gap:12},button:{marginHorizontal:16,marginTop:20,minHeight:48,borderRadius:24,paddingHorizontal:16,alignItems:'center',justifyContent:'center'},round:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center'},sheetHeading:{paddingLeft:20,paddingRight:8,paddingBottom:8,flexDirection:'row',alignItems:'center',gap:8},hero:{alignItems:'center',paddingHorizontal:24,paddingBottom:10,gap:10}});
