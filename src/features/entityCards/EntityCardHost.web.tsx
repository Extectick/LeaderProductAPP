import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Animated,Modal,PanResponder,Pressable,ScrollView,useWindowDimensions,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useHelpReducedMotion,useHelpTheme} from '../help/helpTheme';
import {HELP_VIEWER_HEADER_HEIGHT} from '../help/components/HelpViewerLayout';
import {EntityCardViewer} from './EntityCardViewer';
import {EntityCardBody} from './EntityCardBody';
import type {EntityCardHostProps} from './EntityCardHost.types';
import {helpWebViewerFrame,HelpViewerWindowContext,isHelpViewerTouch} from '../help/helpViewerWindow';

export default function EntityCardHost(props:EntityCardHostProps){
 const c=useHelpTheme(),insets=useSafeAreaInsets(),{width,height}=useWindowDimensions(),reduced=useHelpReducedMotion();
 const [expanded,setExpanded]=useState(false),layout=helpWebViewerFrame(width,height,expanded);
 const menuDismiss=useRef<(()=>boolean)|null>(null),registerMenuDismiss=useCallback((handler:(()=>boolean)|null)=>{menuDismiss.current=handler;},[]);
 const toggleExpanded=useCallback(()=>setExpanded(value=>!value),[]);
 const controls=useMemo(()=>({canExpand:!layout.compact,expanded,onToggleExpanded:toggleExpanded,registerMenuDismiss}),[layout.compact,expanded,toggleExpanded,registerMenuDismiss]);
 const topInset=layout.windowed?0:insets.top,bottomInset=layout.windowed?0:insets.bottom;
 const position=useRef(new Animated.Value(height)).current,latest=useRef(props),scroll=useRef(0);latest.current=props;
 const menuOpen=useRef(false),menuChanged=useCallback((open:boolean)=>{menuOpen.current=open;},[]);
 useEffect(()=>{
  const animation=Animated.timing(position,{toValue:props.state.closing?height:0,duration:reduced?0:220,useNativeDriver:false});
  animation.start(({finished})=>{if(finished&&latest.current.state.closing)latest.current.onDismiss();});
  return()=>animation.stop();
 },[height,position,props.state.closing,reduced]);
 const pan=useMemo(()=>PanResponder.create({
  onMoveShouldSetPanResponderCapture:(event,g)=>!['web','html'].includes(latest.current.state.frames.at(-1)?.kind||'')&&layout.compact&&isHelpViewerTouch(event)&&!menuOpen.current&&!latest.current.state.closing&&scroll.current<=1&&g.dy>8&&g.dy>Math.abs(g.dx)*1.4,
  onPanResponderMove:(_,g)=>position.setValue(Math.max(0,g.dy)),
  onPanResponderRelease:(_,g)=>{if(g.dy>Math.min(160,height*0.2)||g.vy>0.8)latest.current.onClose();else Animated.spring(position,{toValue:0,tension:100,friction:18,useNativeDriver:false}).start();},
  onPanResponderTerminate:()=>Animated.spring(position,{toValue:0,tension:100,friction:18,useNativeDriver:false}).start(),
 }),[height,position,layout.compact]);
 const frame=props.state.frames.at(-1)!;
 useEffect(()=>{scroll.current=frame.scrollOffset;},[frame.key,frame.scrollOffset]);
 // RN Web Modal owns Escape and focus trapping/restoration. A single close
 // path dismisses a menu before the viewer, including nested-card views.
 const requestClose=()=>{if(!menuDismiss.current?.())props.onClose();};
 return <Modal visible transparent animationType="none" onRequestClose={requestClose}>
  <View style={{flex:1}}>
   <Pressable focusable={false} accessibilityRole="button" accessibilityLabel="Закрыть карточки" onPress={requestClose} style={{position:'absolute',inset:0,backgroundColor:'#00000055'}}/>
   <Animated.View {...pan.panHandlers} testID="entity-card-panel" accessibilityViewIsModal style={{position:'absolute',top:layout.top,left:layout.left,width:layout.width,height:layout.height,borderRadius:layout.borderRadius,backgroundColor:c.background,overflow:'hidden',transform:[{translateY:position}],...(layout.windowed?{boxShadow:'0 12px 48px #00000026'}:{})}}>
    <HelpViewerWindowContext.Provider value={controls}><EntityCardViewer {...props} topInset={topInset} bottomInset={bottomInset} onMenuOpenChange={menuChanged}><EntityCardBody {...props} contentTopInset={HELP_VIEWER_HEADER_HEIGHT+topInset} ScrollComponent={ScrollView} onScroll={(key,offset)=>{scroll.current=offset;props.onScroll(key,offset);}}/></EntityCardViewer></HelpViewerWindowContext.Provider>
   </Animated.View>
  </View>
 </Modal>;
}
