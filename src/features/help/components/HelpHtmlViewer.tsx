import React,{useCallback,useContext,useEffect,useRef,useState} from 'react';
import {Animated,Easing,Modal,PanResponder,Platform,Pressable,StyleSheet,Text,useWindowDimensions,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import type {HelpHtmlArtifact} from '../helpHtml';
import {useHelpReducedMotion,useHelpTheme} from '../helpTheme';
import {HelpHtmlSurface} from './HelpHtmlSurface';
import {APP_TOOLBAR_LAYOUT} from '@/components/ui/appToolbarLayout';
import {AuthContext} from '@/context/AuthContext';
import {HelpIcon} from './HelpPrimitives';
import {copyHelpHtmlLink,downloadHelpHtml} from '../helpHtmlActions';
import {BlurTargetView} from 'expo-blur';
import {HelpBlurSurface} from './HelpPrimitives';
const HEADER_HEIGHT=16+APP_TOOLBAR_LAYOUT.actionSize+APP_TOOLBAR_LAYOUT.bottom;
export type HelpHtmlOrigin={x:number;y:number;width:number;height:number};

/** Presentation leaves the conversation and its native motion owner mounted. */
export function HelpHtmlViewer({artifact,origin,onClose,link,expectedUserId}:{artifact:HelpHtmlArtifact;origin?:HelpHtmlOrigin;onClose:()=>void;link?:string;expectedUserId?:number}){
 const c=useHelpTheme(),reduced=useHelpReducedMotion(),insets=useSafeAreaInsets(),window=useWindowDimensions();
 const blurTarget=useRef<View>(null);
 const auth=useContext(AuthContext),userId=auth?.isAuthenticated?auth.profile?.id:undefined;
 const [menu,setMenu]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const operation=useRef<AbortController|null>(null),scope=useRef({id:artifact.id,userId,expectedUserId,link});scope.current={id:artifact.id,userId,expectedUserId,link};
 useEffect(()=>{setMenu(false);setBusy(false);setNotice('');return()=>{operation.current?.abort();operation.current=null;};},[artifact.id,userId,expectedUserId,link]);
 const [fullReady,setFullReady]=useState(false),[compactReady,setCompactReady]=useState(!origin||!artifact.compact);
 const ready=fullReady&&compactReady;
 const progress=useRef(new Animated.Value(0)).current,drag=useRef(new Animated.Value(0)).current,closing=useRef(false),scroll=useRef(0);
 const gestureAtTop=useRef(false);
 const current=useRef({onClose,reduced,menu});current.current={onClose,reduced,menu};
 const close=useCallback(()=>{
  if(closing.current)return;closing.current=true;
  operation.current?.abort();setMenu(false);
  if(current.current.reduced){current.current.onClose();return;}
  Animated.parallel([Animated.timing(progress,{toValue:0,duration:240,easing:Easing.inOut(Easing.cubic),useNativeDriver:true}),Animated.timing(drag,{toValue:0,duration:240,useNativeDriver:true})]).start(({finished})=>{if(finished)current.current.onClose();});
 },[progress,drag]);
 async function action(kind:'download'|'link'){
  if(operation.current||!expectedUserId||userId!==expectedUserId||closing.current)return;
  const captured=scope.current,controller=new AbortController();operation.current=controller;setBusy(true);setMenu(false);setNotice('');
  const isCurrent=()=>!controller.signal.aborted&&!closing.current&&operation.current===controller&&scope.current.id===captured.id&&scope.current.userId===captured.userId&&scope.current.expectedUserId===captured.expectedUserId&&scope.current.link===captured.link;
  try{
   const options={expectedUserId,signal:controller.signal,isCurrent};
   if(kind==='download')await downloadHelpHtml(artifact,c.text,options);else if(link)await copyHelpHtmlLink(artifact,link,options);else throw Error('HELP_HTML_LINK_MISSING');
   if(isCurrent())setNotice(kind==='download'?'HTML подготовлен для сохранения':'Ссылка скопирована');
  }catch(error){if(isCurrent()&&(error as Error).name!=='AbortError')setNotice(kind==='download'?'Не удалось скачать HTML. Попробуйте ещё раз.':'Не удалось скопировать ссылку. Попробуйте ещё раз.');}
  finally{if(isCurrent()){operation.current=null;setBusy(false);}}
 }
 const requestClose=()=>{if(current.current.menu)setMenu(false);else close();};
 useEffect(()=>{if(!ready)return;if(reduced)progress.setValue(1);else Animated.timing(progress,{toValue:1,duration:340,easing:Easing.out(Easing.cubic),useNativeDriver:true}).start();return()=>{progress.stopAnimation();drag.stopAnimation();};},[progress,drag,reduced,ready]);
 useEffect(()=>{
  if(Platform.OS!=='web')return;
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();if(current.current.menu)setMenu(false);else close();}};
  windowThis().addEventListener('keydown',key);return()=>windowThis().removeEventListener('keydown',key);
 },[close]);
 const pan=useRef(PanResponder.create({
  onStartShouldSetPanResponderCapture:event=>{gestureAtTop.current=scroll.current<=0||event.nativeEvent.pageY<insets.top+HEADER_HEIGHT;return false;},
  onMoveShouldSetPanResponderCapture:(_,gesture)=>!current.current.menu&&gestureAtTop.current&&gesture.dy>8&&Math.abs(gesture.dy)>Math.abs(gesture.dx)*1.5,
  onPanResponderMove:(_,gesture)=>drag.setValue(Math.max(0,gesture.dy)),
  onPanResponderRelease:(_,gesture)=>{if(gesture.dy>100||gesture.vy>1)close();else Animated.spring(drag,{toValue:0,useNativeDriver:true,damping:25,stiffness:260}).start();},
  onPanResponderTerminate:()=>Animated.spring(drag,{toValue:0,useNativeDriver:true,damping:25,stiffness:260}).start(),
 })).current;
 const width=window.width,height=window.height-insets.top;
 const start=origin&&origin.width>0&&origin.height>0?origin:undefined;
 const sx=start?start.width/width:1,sy=start?start.height/height:1;
 const dx=start?start.x+start.width/2-width/2:0,dy=start?start.y+start.height/2-(insets.top+height/2):height;
 const transform=[{translateX:progress.interpolate({inputRange:[0,1],outputRange:[dx,0]})},{translateY:Animated.add(progress.interpolate({inputRange:[0,1],outputRange:[dy,0]}),drag)},{scaleX:progress.interpolate({inputRange:[0,1],outputRange:[sx,1]})},{scaleY:progress.interpolate({inputRange:[0,1],outputRange:[sy,1]})}];
 return <Modal transparent statusBarTranslucent visible animationType="none" onRequestClose={requestClose} onShow={()=>{}}>
  <View testID="help-html-viewer" {...pan.panHandlers} style={{flex:1}} accessibilityViewIsModal>
   <Animated.View style={[StyleSheet.absoluteFill,{backgroundColor:c.background,opacity:progress}]}/>
   <Animated.View style={{position:'absolute',top:insets.top,left:0,width,height,backgroundColor:c.background,overflow:'hidden',opacity:ready?1:0,transform}}>
    <Animated.View style={{flex:1,opacity:start?progress.interpolate({inputRange:[0,.35,1],outputRange:[0,0,1]}):1}}>
     <BlurTargetView ref={blurTarget} style={{flex:1,paddingBottom:insets.bottom}}><HelpHtmlSurface variant={artifact.full!} label={artifact.title} topInset={HEADER_HEIGHT} onReady={()=>setFullReady(true)} onScroll={offset=>{scroll.current=offset;}}/></BlurTargetView>
     <View testID="help-html-viewer-header" style={{position:'absolute',top:0,left:0,right:0,zIndex:2,height:HEADER_HEIGHT,paddingTop:16,paddingBottom:APP_TOOLBAR_LAYOUT.bottom,flexDirection:'row',alignItems:'center',gap:APP_TOOLBAR_LAYOUT.gap,paddingHorizontal:APP_TOOLBAR_LAYOUT.inset,backgroundColor:'transparent'}}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill,{bottom:-36}]}><HelpBlurSurface target={blurTarget} edge="bottom"/></View>
      <HelpIcon name="chevron-back" label="Закрыть просмотр" onPress={close} color={c.text} size={24} style={{width:APP_TOOLBAR_LAYOUT.actionSize,height:APP_TOOLBAR_LAYOUT.actionSize,backgroundColor:c.panel,borderRadius:APP_TOOLBAR_LAYOUT.actionSize/2}}/>
      <Text accessibilityRole="header" style={{flex:1,textAlign:'center',fontSize:17,fontWeight:'600',color:c.text}}>Просмотр</Text>
      <Pressable testID="help-html-menu-button" accessibilityRole="button" accessibilityLabel="Действия с HTML" accessibilityState={{expanded:menu,busy}} onPress={()=>setMenu(value=>!value)} style={({pressed})=>({width:APP_TOOLBAR_LAYOUT.actionSize,height:APP_TOOLBAR_LAYOUT.actionSize,borderRadius:APP_TOOLBAR_LAYOUT.actionSize/2,backgroundColor:c.panel,alignItems:'center',justifyContent:'center',opacity:pressed ? .65 : 1})}><Ionicons name="ellipsis-horizontal" size={24} color={c.text}/></Pressable>
     </View>
     {notice?<View pointerEvents="none" style={{position:'absolute',left:16,right:16,bottom:insets.bottom+16,alignItems:'center'}}><Text accessibilityLiveRegion="polite" style={{backgroundColor:c.panel,color:c.text,borderRadius:12,paddingHorizontal:14,paddingVertical:10,fontSize:13}}>{notice}</Text></View>:null}
     {menu?<View testID="help-html-menu-layer" pointerEvents="box-none" style={[StyleSheet.absoluteFill,{zIndex:3}]}><Pressable testID="help-html-menu-dismiss" accessibilityLabel="Закрыть меню просмотра" onPress={()=>setMenu(false)} style={StyleSheet.absoluteFill}/><View testID="help-html-menu" accessibilityRole="menu" style={{position:'absolute',right:APP_TOOLBAR_LAYOUT.inset,top:HEADER_HEIGHT-8,minWidth:180,padding:6,borderRadius:16,backgroundColor:c.panel,elevation:6,boxShadow:'0 4px 18px #00000018'}}>
      <Pressable testID="help-html-download" accessibilityRole="menuitem" disabled={busy||!expectedUserId||userId!==expectedUserId} accessibilityState={{disabled:busy||!expectedUserId||userId!==expectedUserId}} onPress={()=>void action('download')} style={{minHeight:48,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:12,opacity:busy ? .5 : 1}}><Ionicons name="download-outline" size={21} color={c.text}/><Text style={{fontSize:15,color:c.text}}>Скачать</Text></Pressable>
      <Pressable testID="help-html-link" accessibilityRole="menuitem" disabled={busy||!link||!expectedUserId||userId!==expectedUserId} accessibilityState={{disabled:busy||!link||!expectedUserId||userId!==expectedUserId}} onPress={()=>void action('link')} style={{minHeight:48,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:12,opacity:busy||!link ? .5 : 1}}><Ionicons name="link-outline" size={21} color={c.text}/><Text style={{fontSize:15,color:c.text}}>Ссылка</Text></Pressable>
     </View></View>:null}
    </Animated.View>
    {start&&artifact.compact?<Animated.View pointerEvents="none" style={{position:'absolute',left:(width-start.width)/2,top:(height-start.height)/2,width:start.width,height:start.height,opacity:progress.interpolate({inputRange:[0,.45,.8,1],outputRange:[1,1,0,0]}),transform:[{scaleX:width/start.width},{scaleY:height/start.height}]}}><HelpHtmlSurface compact variant={artifact.compact} label={artifact.title} onReady={()=>setCompactReady(true)}/></Animated.View>:null}
   </Animated.View>
  </View>
 </Modal>;
}
function windowThis():Window{return globalThis.window;}
