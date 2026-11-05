import React,{useEffect,useMemo,useRef} from 'react';
import {Animated,Modal,PanResponder,Pressable,ScrollView,useWindowDimensions,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useHelpReducedMotion,useHelpTheme} from '../help/helpTheme';
import {EntityCardHeader} from './EntityCardHeader';
import {EntityCardBody} from './EntityCardBody';
import type {EntityCardHostProps} from './EntityCardHost.types';

export default function EntityCardHost(props:EntityCardHostProps){
 const c=useHelpTheme(),insets=useSafeAreaInsets(),{height}=useWindowDimensions(),reduced=useHelpReducedMotion();
 const position=useRef(new Animated.Value(height)).current,latest=useRef(props),scroll=useRef(0);latest.current=props;
 useEffect(()=>{
  const animation=Animated.timing(position,{toValue:props.state.closing?height:0,duration:reduced?0:220,useNativeDriver:false});
  animation.start(({finished})=>{if(finished&&latest.current.state.closing)latest.current.onDismiss();});
  return()=>animation.stop();
 },[height,position,props.state.closing,reduced]);
 const pan=useMemo(()=>PanResponder.create({
  onMoveShouldSetPanResponderCapture:(_,g)=>!latest.current.state.closing&&scroll.current<=1&&g.dy>8&&g.dy>Math.abs(g.dx)*1.4,
  onPanResponderMove:(_,g)=>position.setValue(Math.max(0,g.dy)),
  onPanResponderRelease:(_,g)=>{if(g.dy>Math.min(160,height*0.2)||g.vy>0.8)latest.current.onClose();else Animated.spring(position,{toValue:0,tension:100,friction:18,useNativeDriver:false}).start();},
  onPanResponderTerminate:()=>Animated.spring(position,{toValue:0,tension:100,friction:18,useNativeDriver:false}).start(),
 }),[height,position]);
 const frame=props.state.frames.at(-1)!;
 useEffect(()=>{scroll.current=frame.scrollOffset;},[frame.key,frame.scrollOffset]);
 return <Modal visible transparent animationType="none" onRequestClose={props.onBack}>
  <View style={{flex:1}}>
   <Pressable accessibilityRole="button" accessibilityLabel="Закрыть карточки" onPress={props.onClose} style={{position:'absolute',inset:0,backgroundColor:'#00000055'}}/>
   <Animated.View {...pan.panHandlers} testID="entity-card-panel" accessibilityViewIsModal style={{position:'absolute',top:insets.top,left:0,right:0,bottom:0,backgroundColor:c.background,borderTopLeftRadius:24,borderTopRightRadius:24,overflow:'hidden',transform:[{translateY:position}],maxWidth:840,marginHorizontal:'auto',paddingBottom:insets.bottom}}>
    <EntityCardHeader title={frame.title} canGoBack={props.state.frames.length>1} onBack={props.onBack} onClose={props.onClose}/>
    <EntityCardBody {...props} ScrollComponent={ScrollView} onScroll={(key,offset)=>{scroll.current=offset;props.onScroll(key,offset);}}/>
   </Animated.View>
  </View>
 </Modal>;
}
