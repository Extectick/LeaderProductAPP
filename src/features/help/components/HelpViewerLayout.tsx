import React,{useRef,useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {BlurTargetView} from 'expo-blur';
import {Ionicons} from '@expo/vector-icons';
import {APP_TOOLBAR_LAYOUT} from '@/components/ui/appToolbarLayout';
import {useHelpTheme} from '../helpTheme';
import {HelpBlurSurface} from './HelpPrimitives';
import {HelpHeaderFrame,helpHeaderFrameHeight} from './HelpHeaderFrame';
import {HelpMoreCloseButton} from './HelpChatHeader';

export const HELP_VIEWER_HEADER_HEIGHT=helpHeaderFrameHeight(true);
export type HelpViewerAction={id:string;label:string;icon:React.ComponentProps<typeof Ionicons>['name'];onPress:()=>void;disabled?:boolean;busy?:boolean};
type Props={children:React.ReactNode;onBack:()=>void;backLabel?:string;actions?:readonly HelpViewerAction[];menuOpen?:boolean;onMenuOpenChange?:(open:boolean)=>void;testIDPrefix?:string;bottomInset?:number;menuLabel?:string};

/** Shared viewing surface for HTML and all linked app/1C cards. Hosts own their
 * gesture engine and data; one component owns header, blur, body and actions. */
export function HelpViewerLayout({children,onBack,backLabel='Закрыть просмотр',actions=[],menuOpen,onMenuOpenChange,testIDPrefix='help-viewer',bottomInset=0,menuLabel='Действия просмотра'}:Props){
 const c=useHelpTheme(),target=useRef<View>(null),[localMenu,setLocalMenu]=useState(false);
 const open=menuOpen??localMenu;
 const changeMenu=(value:boolean)=>{if(menuOpen===undefined)setLocalMenu(value);onMenuOpenChange?.(value);};
 const select=(action:HelpViewerAction)=>{changeMenu(false);action.onPress();};
 return <View testID={`${testIDPrefix}-viewer-layout`} style={{flex:1}}>
  <BlurTargetView ref={target} testID={`${testIDPrefix}-viewer-content`} style={{flex:1,paddingBottom:bottomInset}}>{children}</BlurTargetView>
  <View testID={`${testIDPrefix}-viewer-header`} style={{position:'absolute',top:0,left:0,right:0,zIndex:2,height:HELP_VIEWER_HEADER_HEIGHT,backgroundColor:'transparent'}}>
   <View pointerEvents="none" style={[StyleSheet.absoluteFill,{bottom:-36}]}><HelpBlurSurface target={target} edge="bottom"/></View>
   <HelpHeaderFrame reserveEyebrow title="Просмотр" contentSurface="plain" onBack={onBack} backLabel={backLabel} trailing={<HelpMoreCloseButton active={open} onPress={()=>changeMenu(!open)} label={menuLabel} morphToClose={false} testID={`${testIDPrefix}-menu-button`} busy={actions.some(action=>action.busy)}/>}/>
  </View>
  {open?<View testID={`${testIDPrefix}-menu-layer`} pointerEvents="box-none" style={[StyleSheet.absoluteFill,{zIndex:3}]}>
   <Pressable testID={`${testIDPrefix}-menu-dismiss`} accessibilityLabel="Закрыть меню просмотра" onPress={()=>changeMenu(false)} style={StyleSheet.absoluteFill}/>
   <View testID={`${testIDPrefix}-menu`} accessibilityRole="menu" style={{position:'absolute',right:APP_TOOLBAR_LAYOUT.inset,top:HELP_VIEWER_HEADER_HEIGHT-8,minWidth:180,padding:6,borderRadius:16,backgroundColor:c.panel,elevation:6,boxShadow:'0 4px 18px #00000018'}}>
    {actions.map(action=><Pressable key={action.id} testID={`${testIDPrefix}-${action.id}`} accessibilityRole="menuitem" disabled={action.disabled||action.busy} accessibilityState={{disabled:Boolean(action.disabled||action.busy),busy:Boolean(action.busy)}} onPress={()=>select(action)} style={{minHeight:48,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:12,opacity:(action.disabled||action.busy)?0.5:1}}><Ionicons name={action.icon} size={21} color={c.text}/><Text style={{fontSize:15,color:c.text}}>{action.label}</Text></Pressable>)}
   </View>
  </View>:null}
 </View>;
}
