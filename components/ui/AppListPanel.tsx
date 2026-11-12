import React,{forwardRef,useRef,useState,useEffect} from 'react';
import {Keyboard,Platform,Pressable,StyleSheet,Text,View,type LayoutChangeEvent} from 'react-native';
import {BlurTargetView} from 'expo-blur';
import {Ionicons} from '@expo/vector-icons';
import {AppBlurActivityContext,AppEdgeBlur} from './AppScreenBlur';
import {AppHeaderOverlay} from './AppHeaderOverlay';
import {AppWorkspaceHeader} from './AppWorkspaceHeader';
import {AppSearchField} from './AppSearchField';
import {AppWebScrollbar,type AppWebScrollbarProps} from './AppWebScrollbar';
import {useAppSurfaceTheme} from './appSurfaceTokens';
import {useAppListPanelState,type AppListLoadState,type AppListBindings} from './AppListPanelState';
import {appWebControlProps,appWebControlContentProps} from './appWebInteraction';

export type AppListPanelInsets={paddingTop:number;paddingBottom:number};
export type AppListPanelListProps=AppListPanelInsets&AppListBindings;
export type AppListPanelProps={
  header:React.ReactNode;footer?:React.ReactNode;
  renderList:(insets:AppListPanelListProps)=>React.ReactNode;
  loadState?:AppListLoadState;
  scrollRef:AppWebScrollbarProps['scrollRef'];scrollId:string;active:boolean;
  topInset?:number;bottomInset?:number;headerKey?:string;initialHeaderHeight?:number;initialFooterHeight?:number;
  onHeaderHeight?:(height:number)=>void;onFooterHeight?:(height:number)=>void;
  scrollbarLabel?:string;
  ids?:{root?:string;viewport?:string;header?:string;backdrop?:string;footer?:string;scrollbar?:string;thumb?:string};
};

/** Shared desktop list chrome. The service retains its list, data and scroll owner. */
export function AppListPanel({header,footer,renderList,scrollRef,scrollId,active,topInset=0,bottomInset=0,headerKey='default',
  initialHeaderHeight=120+topInset,initialFooterHeight=64,onHeaderHeight,onFooterHeight,scrollbarLabel,loadState,ids={}}:AppListPanelProps){
  const colors=useAppSurfaceTheme(),target=useRef<View|null>(null);
  const [headerMeasurement,setHeaderMeasurement]=useState({topInset,key:headerKey,height:initialHeaderHeight});
  const [footerHeight,setFooterHeight]=useState(initialFooterHeight);
  // Preserve the compact web safe-area behavior while keeping the list mounted
  // when the desktop header changes at a responsive breakpoint.
  const [keyboardVisible,setKeyboardVisible]=useState(()=>Boolean(Keyboard.isVisible?.())&&(Keyboard.metrics?.()?.height??0)>0);
  useEffect(()=>{
    if(!bottomInset)return;
    const show=Keyboard.addListener(Platform.OS==='ios'?'keyboardWillShow':'keyboardDidShow',event=>setKeyboardVisible(event.endCoordinates.height>0));
    const hide=Keyboard.addListener(Platform.OS==='ios'?'keyboardWillHide':'keyboardDidHide',()=>setKeyboardVisible(false));
    return()=>{show.remove();hide.remove();};
  },[bottomInset]);
  const hasFooter=footer!==undefined&&footer!==null&&footer!==false;
  const headerHeight=headerMeasurement.topInset===topInset&&headerMeasurement.key===headerKey?headerMeasurement.height:initialHeaderHeight;
  const listInsets={paddingTop:headerHeight,paddingBottom:hasFooter?footerHeight+8:16};
  const listState=useAppListPanelState(loadState,active,listInsets);
  const measureHeader=(event:LayoutChangeEvent)=>{
    const height=event.nativeEvent.layout.height;if(height<=0)return;
    setHeaderMeasurement(previous=>previous.topInset===topInset&&previous.key===headerKey&&Math.abs(previous.height-height)<.5?previous:{topInset,key:headerKey,height});
    onHeaderHeight?.(height);
  };
  const measureFooter=(event:LayoutChangeEvent)=>{
    const height=event.nativeEvent.layout.height;if(height<=0)return;
    setFooterHeight(previous=>Math.abs(previous-height)<.5?previous:height);onFooterHeight?.(height);
  };
  return <AppBlurActivityContext.Provider value={active}>
    <View testID={ids.root??'app-list-panel'} style={{flex:1,minHeight:0,minWidth:0,overflow:'hidden',backgroundColor:colors.background}}>
      <BlurTargetView ref={target} testID={ids.viewport??'app-list-panel-viewport'} style={{flex:1,minHeight:0}}>
        {renderList({...listInsets,...listState})}
      </BlurTargetView>
      <AppHeaderOverlay id={ids.header??'app-list-panel-header'} backdropId={ids.backdrop??'app-list-panel-header-backdrop'} topInset={topInset} onLayout={measureHeader}
        backdrop={active?<AppEdgeBlur target={target} edge="bottom" dark={colors.dark} backgroundColor={colors.background}/>:null}>
        {header}
      </AppHeaderOverlay>
      {hasFooter?<View testID={ids.footer??'app-list-panel-footer'} onLayout={measureFooter}
        style={{position:'absolute',bottom:0,left:0,right:0,paddingHorizontal:16,paddingTop:8,paddingBottom:8+(keyboardVisible?0:bottomInset)}}>
        <View testID="app-list-panel-footer-backdrop" pointerEvents="none" style={[StyleSheet.absoluteFill,{top:8}]}>
          {active?<AppEdgeBlur target={target} edge="top" dark={colors.dark} backgroundColor={colors.background}/>:null}
        </View>
        {footer}
      </View>:<View testID="app-list-panel-bottom-fade" pointerEvents="none" style={{position:'absolute',bottom:0,left:0,right:0,height:32}}>
        {active?<AppEdgeBlur target={target} edge="top" dark={colors.dark} backgroundColor={colors.background} featherSize={32}/>:null}
      </View>}
      <AppWebScrollbar scrollRef={scrollRef} scrollId={scrollId} top={headerHeight} bottom={hasFooter?footerHeight:0} active={active}
        colors={colors} label={scrollbarLabel} testID={ids.scrollbar} thumbTestID={ids.thumb}/>
    </View>
  </AppBlurActivityContext.Provider>;
}

export function AppListPanelHeader({title,value,onChangeText,searchLabel,disabled=false,autoFocus=false,trailing,renderToolbar}: {
  title:string;value:string;onChangeText:(value:string)=>void;searchLabel:string;disabled?:boolean;autoFocus?:boolean;
  trailing?:React.ReactNode;renderToolbar?:(children:React.ReactNode)=>React.ReactNode;
}){
  const colors=useAppSurfaceTheme();
  const search=<AppSearchField value={value} onChangeText={onChangeText} label={searchLabel} colors={colors} disabled={disabled} autoFocus={autoFocus}/>;
  return <>
    <View style={{paddingHorizontal:16,paddingTop:18,paddingBottom:8}}>
      <Text accessibilityRole="header" style={{color:colors.text,fontSize:22,lineHeight:26,fontWeight:'600',includeFontPadding:false}}>{title}</Text>
    </View>
    {renderToolbar?renderToolbar(search):<AppWorkspaceHeader colors={colors} trailing={trailing}>{search}</AppWorkspaceHeader>}
  </>;
}

export const AppListPanelMenuButton=forwardRef<View,{onPress:()=>void;label:string;expanded?:boolean;disabled?:boolean;color?:string}>(
  function AppListPanelMenuButton({onPress,label,expanded=false,disabled=false,color},ref){
    const colors=useAppSurfaceTheme();
    return <Pressable {...appWebControlProps()} ref={ref} accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{expanded,disabled}} disabled={disabled} onPress={onPress}
      style={({pressed})=>({width:48,height:48,borderRadius:24,backgroundColor:colors.panel,alignItems:'center',justifyContent:'center',opacity:disabled ? .38 : pressed ? .65 : 1})}>
      <Ionicons {...appWebControlContentProps()} name="ellipsis-horizontal" size={24} color={color??colors.text}/>
    </Pressable>;
  });

export function AppListPanelActionButton({text,icon='add-outline',onPress,disabled=false}: {
  text:string;icon?:React.ComponentProps<typeof Ionicons>['name'];onPress:()=>void;disabled?:boolean;
}){
  const colors=useAppSurfaceTheme();
  return <Pressable {...appWebControlProps('filled')} accessibilityRole="button" accessibilityLabel={text} accessibilityState={{disabled}} disabled={disabled} onPress={onPress}
    style={({pressed})=>({height:48,borderRadius:24,backgroundColor:disabled?colors.elevated:colors.accent,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,opacity:pressed&&!disabled ? .8 : 1})}>
    <Ionicons {...appWebControlContentProps()} name={icon} size={22} color={disabled?colors.muted:'#FFF'}/>
    <Text {...appWebControlContentProps()} style={{color:disabled?colors.muted:'#FFF',fontSize:14}}>{text}</Text>
  </Pressable>;
}
