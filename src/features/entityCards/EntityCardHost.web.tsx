import React,{useCallback,useEffect,useMemo,useRef} from 'react';
import {Animated,Modal,PanResponder,Pressable,ScrollView,useWindowDimensions,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useHelpReducedMotion,useHelpTheme} from '../help/helpTheme';
import {HELP_VIEWER_HEADER_HEIGHT} from '../help/components/HelpViewerLayout';
import {EntityCardViewer} from './EntityCardViewer';
import {EntityCardBody} from './EntityCardBody';
import type {EntityCardHostProps} from './EntityCardHost.types';

export default function EntityCardHost(props:EntityCardHostProps){
 const c=useHelpTheme(),insets=useSafeAreaInsets(),{height}=useWindowDimensions(),reduced=useHelpReducedMotion();
 const position=useRef(new Animated.Value(height)).current,latest=useRef(props),scroll=useRef(0);latest.current=props;
 const menuOpen=useRef(false),menuChanged=useCallback((open:boolean)=>{menuOpen.current=open;},[]);
 useEffect(()=>{
  const animation=Animated.timing(position,{toValue:props.state.closing?height:0,duration:reduced?0:220,useNativeDriver:false});
  animation.start(({finished})=>{if(finished&&latest.current.state.closing)latest.current.onDismiss();});
  return()=>animation.stop();
 },[height,position,props.state.closing,reduced]);
 const pan=useMemo(()=>PanResponder.create({
  onMoveShouldSetPanResponderCapture:(_,g)=>!menuOpen.current&&!latest.current.state.closing&&scroll.current<=1&&g.dy>8&&g.dy>Math.abs(g.dx)*1.4,
  onPanResponderMove:(_,g)=>position.setValue(Math.max(0,g.dy)),
  onPanResponderRelease:(_,g)=>{if(g.dy>Math.min(160,height*0.2)||g.vy>0.8)latest.current.onClose();else Animated.spring(position,{toValue:0,tension:100,friction:18,useNativeDriver:false}).start();},
  onPanResponderTerminate:()=>Animated.spring(position,{toValue:0,tension:100,friction:18,useNativeDriver:false}).start(),
 }),[height,position]);
 const frame=props.state.frames.at(-1)!;
 useEffect(()=>{scroll.current=frame.scrollOffset;},[frame.key,frame.scrollOffset]);
 return <Modal visible transparent animationType="none" onRequestClose={props.onBack}>
  <View style={{flex:1}}>
   <Pressable accessibilityRole="button" accessibilityLabel="Закрыть карточки" onPress={props.onClose} style={{position:'absolute',inset:0,backgroundColor:'#00000055'}}/>
   <Animated.View {...pan.panHandlers} testID="entity-card-panel" accessibilityViewIsModal style={{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:c.background,overflow:'hidden',transform:[{translateY:position}]}}>
    <EntityCardViewer {...props} topInset={insets.top} bottomInset={insets.bottom} onMenuOpenChange={menuChanged}><EntityCardBody {...props} contentTopInset={HELP_VIEWER_HEADER_HEIGHT+insets.top} ScrollComponent={ScrollView} onScroll={(key,offset)=>{scroll.current=offset;props.onScroll(key,offset);}}/></EntityCardViewer>
   </Animated.View>
  </View>
 </Modal>;
}
