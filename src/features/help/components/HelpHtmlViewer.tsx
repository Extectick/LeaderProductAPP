import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Animated,Easing,Modal,PanResponder,Platform,Pressable,StyleSheet,Text,useWindowDimensions,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import type {HelpHtmlArtifact} from '../helpHtml';
import {useHelpReducedMotion,useHelpTheme} from '../helpTheme';
import {HelpHtmlSurface} from './HelpHtmlSurface';
import {APP_TOOLBAR_LAYOUT} from '@/components/ui/appToolbarLayout';
const HEADER_HEIGHT=16+APP_TOOLBAR_LAYOUT.actionSize+APP_TOOLBAR_LAYOUT.bottom;
export type HelpHtmlOrigin={x:number;y:number;width:number;height:number};

/** Presentation leaves the conversation and its native motion owner mounted. */
export function HelpHtmlViewer({artifact,origin,onClose}:{artifact:HelpHtmlArtifact;origin?:HelpHtmlOrigin;onClose:()=>void}){
 const c=useHelpTheme(),reduced=useHelpReducedMotion(),insets=useSafeAreaInsets(),window=useWindowDimensions();
 const [fullReady,setFullReady]=useState(false),[compactReady,setCompactReady]=useState(!origin||!artifact.compact);
 const ready=fullReady&&compactReady;
 const progress=useRef(new Animated.Value(0)).current,drag=useRef(new Animated.Value(0)).current,closing=useRef(false),scroll=useRef(0);
 const gestureAtTop=useRef(false);
 const current=useRef({onClose,reduced});current.current={onClose,reduced};
 const close=useCallback(()=>{
  if(closing.current)return;closing.current=true;
  if(current.current.reduced){current.current.onClose();return;}
  Animated.parallel([Animated.timing(progress,{toValue:0,duration:240,easing:Easing.inOut(Easing.cubic),useNativeDriver:true}),Animated.timing(drag,{toValue:0,duration:240,useNativeDriver:true})]).start(({finished})=>{if(finished)current.current.onClose();});
 },[progress,drag]);
 useEffect(()=>{if(!ready)return;if(reduced)progress.setValue(1);else Animated.timing(progress,{toValue:1,duration:340,easing:Easing.out(Easing.cubic),useNativeDriver:true}).start();return()=>{progress.stopAnimation();drag.stopAnimation();};},[progress,drag,reduced,ready]);
 useEffect(()=>{
  if(Platform.OS!=='web')return;
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();close();}};
  windowThis().addEventListener('keydown',key);return()=>windowThis().removeEventListener('keydown',key);
 },[close]);
 const pan=useRef(PanResponder.create({
  onStartShouldSetPanResponderCapture:event=>{gestureAtTop.current=scroll.current<=0||event.nativeEvent.pageY<insets.top+HEADER_HEIGHT;return false;},
  onMoveShouldSetPanResponderCapture:(_,gesture)=>gestureAtTop.current&&gesture.dy>8&&Math.abs(gesture.dy)>Math.abs(gesture.dx)*1.5,
  onPanResponderMove:(_,gesture)=>drag.setValue(Math.max(0,gesture.dy)),
  onPanResponderRelease:(_,gesture)=>{if(gesture.dy>100||gesture.vy>1)close();else Animated.spring(drag,{toValue:0,useNativeDriver:true,damping:25,stiffness:260}).start();},
  onPanResponderTerminate:()=>Animated.spring(drag,{toValue:0,useNativeDriver:true,damping:25,stiffness:260}).start(),
 })).current;
 const width=window.width,height=window.height-insets.top;
 const start=origin&&origin.width>0&&origin.height>0?origin:undefined;
 const sx=start?start.width/width:1,sy=start?start.height/height:1;
 const dx=start?start.x+start.width/2-width/2:0,dy=start?start.y+start.height/2-(insets.top+height/2):height;
 const transform=[{translateX:progress.interpolate({inputRange:[0,1],outputRange:[dx,0]})},{translateY:Animated.add(progress.interpolate({inputRange:[0,1],outputRange:[dy,0]}),drag)},{scaleX:progress.interpolate({inputRange:[0,1],outputRange:[sx,1]})},{scaleY:progress.interpolate({inputRange:[0,1],outputRange:[sy,1]})}];
 return <Modal transparent statusBarTranslucent visible animationType="none" onRequestClose={close} onShow={()=>{}}>
  <View testID="help-html-viewer" {...pan.panHandlers} style={{flex:1}} accessibilityViewIsModal>
   <Animated.View style={[StyleSheet.absoluteFill,{backgroundColor:c.background,opacity:progress}]}/>
   <Animated.View style={{position:'absolute',top:insets.top,left:0,width,height,backgroundColor:c.background,overflow:'hidden',opacity:ready?1:0,transform}}>
    <Animated.View style={{flex:1,opacity:start?progress.interpolate({inputRange:[0,.35,1],outputRange:[0,0,1]}):1}}>
     <View testID="help-html-viewer-header" style={{height:HEADER_HEIGHT,paddingTop:16,paddingBottom:APP_TOOLBAR_LAYOUT.bottom,flexDirection:'row',alignItems:'center',paddingHorizontal:16}}>
      <View style={{width:44}}/><Text accessibilityRole="header" style={{flex:1,textAlign:'center',fontSize:17,fontWeight:'600',color:c.text}}>Просмотр</Text>
      <Pressable testID="help-html-close" accessibilityRole="button" accessibilityLabel="Закрыть просмотр" onPress={close} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><Ionicons name="close" size={26} color={c.text}/></Pressable>
     </View>
     <View style={{flex:1,paddingBottom:insets.bottom}}><HelpHtmlSurface variant={artifact.full!} label={artifact.title} onReady={()=>setFullReady(true)} onScroll={offset=>{scroll.current=offset;}}/></View>
    </Animated.View>
    {start&&artifact.compact?<Animated.View pointerEvents="none" style={{position:'absolute',left:(width-start.width)/2,top:(height-start.height)/2,width:start.width,height:start.height,opacity:progress.interpolate({inputRange:[0,.45,.8,1],outputRange:[1,1,0,0]}),transform:[{scaleX:width/start.width},{scaleY:height/start.height}]}}><HelpHtmlSurface compact variant={artifact.compact} label={artifact.title} onReady={()=>setCompactReady(true)}/></Animated.View>:null}
   </Animated.View>
  </View>
 </Modal>;
}
function windowThis():Window{return globalThis.window;}
