import {LoadingPlaceholder} from '@/components/ui/LoadingPlaceholder';
import React,{useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {Modal,PanResponder,Platform,Pressable,StyleSheet,Text,useWindowDimensions,View} from 'react-native';
import Reanimated,{cancelAnimation,Easing,runOnJS,useAnimatedStyle,useSharedValue,withSpring,withTiming} from 'react-native-reanimated';
import {Gesture,GestureDetector,GestureHandlerRootView} from 'react-native-gesture-handler';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {HelpHtmlArtifact} from '../helpHtml';
import {useHelpReducedMotion,useHelpTheme} from '../helpTheme';
import {HelpHtmlSurface} from './HelpHtmlSurface';
import {AuthContext} from '@/context/AuthContext';
import {API_BASE_URL} from '@/utils/config';
import {helpOriginTracker} from '../helpClientContext';
import {parseEntityLink} from '../../../shared/entityLinks';
import {copyHelpHtmlLink,downloadHelpHtml} from '../helpHtmlActions';
import {HelpViewerLayout,HELP_VIEWER_HEADER_HEIGHT} from './HelpViewerLayout';
import {helpWebViewerFrame,HelpViewerWindowContext,isHelpViewerTouch} from '../helpViewerWindow';
const HEADER_HEIGHT=HELP_VIEWER_HEADER_HEIGHT;
export type HelpHtmlOrigin={x:number;y:number;width:number;height:number};

/** Presentation leaves the conversation and its native motion owner mounted. */
export function HelpHtmlViewer({artifact,onClose,link,expectedUserId,imageDataUrl,onOpenEntity}:{artifact:HelpHtmlArtifact;origin?:HelpHtmlOrigin;onClose:()=>void;link?:string;expectedUserId?:number;imageDataUrl?:string;onOpenEntity?:()=>void}){
 const c=useHelpTheme(),reduced=useHelpReducedMotion(),insets=useSafeAreaInsets(),window=useWindowDimensions();
 const [expanded,setExpanded]=useState(false);
 const frame=Platform.OS==='web'?helpWebViewerFrame(window.width,window.height,expanded):{compact:true,windowed:false,top:0,left:0,width:window.width,height:window.height,borderRadius:0};
 const topInset=frame.windowed?0:insets.top,bottomInset=frame.windowed?0:insets.bottom;
 const toggleExpanded=useCallback(()=>setExpanded(value=>!value),[]);
 const windowControls=useMemo(()=>Platform.OS==='web'&&!frame.compact?{expanded,onToggleExpanded:toggleExpanded}:null,[frame.compact,expanded,toggleExpanded]);
 const auth=useContext(AuthContext),userId=auth?.isAuthenticated?auth.profile?.id:undefined;
 const [menu,setMenu]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const operation=useRef<AbortController|null>(null),afterClose=useRef<(()=>void)|undefined>(undefined),scope=useRef({id:artifact.id,userId,expectedUserId,link,imageDataUrl});scope.current={id:artifact.id,userId,expectedUserId,link,imageDataUrl};
 const hintLink=artifact.full?artifact.entity?.url||'':'';
 useEffect(()=>{
  if(!auth?.isAuthenticated||!expectedUserId||userId!==expectedUserId||!hintLink)return;
  return helpOriginTracker.temporary(`${API_BASE_URL}:${userId}`,parseEntityLink(hintLink));
 },[artifact.id,userId,expectedUserId,auth?.isAuthenticated,hintLink]);
 useEffect(()=>{setMenu(false);setBusy(false);setNotice('');return()=>{operation.current?.abort();operation.current=null;afterClose.current=undefined;};},[artifact.id,userId,expectedUserId,link,imageDataUrl]);
 const [ready,setReady]=useState(false);
 const progress=useSharedValue(0),drag=useSharedValue(0),scroll=useSharedValue(0),closing=useRef(false),mounted=useRef(true);
 const pullAllowed=useSharedValue(false),pullState=useSharedValue(0),touchX=useSharedValue(0),touchY=useSharedValue(0);
 const gestureAtTop=useRef(false);
 const current=useRef({onClose,reduced,menu,headerBottom:insets.top+HEADER_HEIGHT});current.current={onClose,reduced,menu,headerBottom:insets.top+HEADER_HEIGHT};
 const completeClose=useCallback(()=>{
  if(!mounted.current)return;
  const next=afterClose.current;afterClose.current=undefined;current.current.onClose();next?.();
 },[]);
 const close=useCallback(()=>{
  if(closing.current)return;closing.current=true;pullAllowed.value=false;
  operation.current?.abort();setMenu(false);cancelAnimation(progress);cancelAnimation(drag);
  if(current.current.reduced){progress.value=0;drag.value=0;completeClose();return;}
  // Both terms use the same easing/duration: the page continues down from its
  // current drag position rather than snapping back before its closing motion.
  drag.value=withTiming(0,{duration:240,easing:Easing.inOut(Easing.cubic)});
  progress.value=withTiming(0,{duration:240,easing:Easing.inOut(Easing.cubic)},finished=>{if(finished)runOnJS(completeClose)();});
 },[progress,drag,pullAllowed,completeClose]);
 async function action(kind:'download'|'link'){
  if(operation.current||!expectedUserId||userId!==expectedUserId||closing.current)return;
  const captured=scope.current,controller=new AbortController();operation.current=controller;setBusy(true);setMenu(false);setNotice('');
  const isCurrent=()=>!controller.signal.aborted&&!closing.current&&operation.current===controller&&scope.current.id===captured.id&&scope.current.userId===captured.userId&&scope.current.expectedUserId===captured.expectedUserId&&scope.current.link===captured.link&&scope.current.imageDataUrl===captured.imageDataUrl;
  try{
   const options={expectedUserId,signal:controller.signal,isCurrent};
   if(kind==='download'){if(imageDataUrl)await downloadHelpHtml(artifact,c.text,options,imageDataUrl);else await downloadHelpHtml(artifact,c.text,options);}else if(link)await copyHelpHtmlLink(artifact,link,options);else throw Error('HELP_HTML_LINK_MISSING');
   if(isCurrent())setNotice(kind==='download'?'HTML подготовлен для сохранения':'Ссылка скопирована');
  }catch(error){if(isCurrent()&&(error as Error).name!=='AbortError')setNotice(kind==='download'?'Не удалось скачать HTML. Попробуйте ещё раз.':'Не удалось скопировать ссылку. Попробуйте ещё раз.');}
  finally{if(isCurrent()){operation.current=null;setBusy(false);}}
 }
 const requestClose=()=>{if(current.current.menu)setMenu(false);else close();};
 useEffect(()=>{if(!ready||closing.current)return;if(reduced)progress.value=1;else progress.value=withTiming(1,{duration:340,easing:Easing.out(Easing.cubic)});},[progress,reduced,ready]);
 useEffect(()=>{pullAllowed.value=ready&&!menu&&!closing.current;},[ready,menu,pullAllowed]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;pullAllowed.value=false;cancelAnimation(progress);cancelAnimation(drag);};},[progress,drag,pullAllowed]);
 // Modal owns Escape and focus on web. A second keydown listener would close
 // the menu here and then close the page again on Modal's keyup handler.
 const height=window.height;
 // WebView owns a native touch stream, so an outer RN PanResponder cannot
 // reliably steal it. Hold its native recognizer until this UI-thread gesture
 // chooses between a top-edge pull and ordinary page scrolling/zooming.
 const pull=useMemo(()=>Gesture.Pan().withTestId('help-html-pull').manualActivation(true).maxPointers(1).enabled(Platform.OS!=='web'&&ready&&!menu)
  .onTouchesDown((event,manager)=>{
   if(!pullAllowed.value||event.numberOfTouches!==1){manager.fail();return;}
   const touch=event.allTouches[0];
   if(scroll.value>1&&touch.absoluteY>=insets.top+HEADER_HEIGHT){manager.fail();return;}
   touchX.value=touch.absoluteX;touchY.value=touch.absoluteY;pullState.value=1;
  })
  .onTouchesMove((event,manager)=>{
   if(pullState.value!==1)return;
   if(!pullAllowed.value||event.numberOfTouches!==1){pullState.value=0;manager.fail();return;}
   const touch=event.allTouches[0],dx=touch.absoluteX-touchX.value,dy=touch.absoluteY-touchY.value;
   if(Math.abs(dx)>8&&Math.abs(dx)>=Math.abs(dy)){pullState.value=0;manager.fail();return;}
   if(dy< -8){pullState.value=0;manager.fail();return;}
   if(dy>8&&dy>Math.abs(dx)*1.5){pullState.value=2;manager.activate();}
  })
  .onTouchesUp((_,manager)=>{if(pullState.value===1){pullState.value=0;manager.fail();}})
  .onStart(()=>{cancelAnimation(drag);})
  .onUpdate(event=>{if(pullState.value===2)drag.value=Math.max(0,Math.min(height,event.translationY));})
  .onEnd((event,success)=>{
   if(pullState.value!==2)return;
   pullState.value=0;
   if(success&&(drag.value>100||(drag.value>24&&event.velocityY>1000))){pullAllowed.value=false;runOnJS(close)();}
   else drag.value=reduced?0:withSpring(0,{damping:25,stiffness:260,overshootClamping:true});
  })
  .onFinalize((_,success)=>{const wasPull=pullState.value===2;pullState.value=0;if(!success&&wasPull)drag.value=reduced?0:withSpring(0,{damping:25,stiffness:260,overshootClamping:true});}),
 [ready,menu,reduced,height,insets.top,close,drag,pullAllowed,pullState,scroll,touchX,touchY]);
 const nativeScroll=useMemo(()=>Gesture.Native().withTestId('help-html-native-scroll').requireExternalGestureToFail(pull).disallowInterruption(false),[pull]);
 const scrolled=useCallback((offset:number)=>{if(Number.isFinite(offset))scroll.value=Math.max(0,offset);},[scroll]);
 const panelStyle=useAnimatedStyle(()=>({transform:[{translateY:height*(1-progress.value)+drag.value}]}),[height]);
 const backdropStyle=useAnimatedStyle(()=>({opacity:progress.value*Math.max(0,1-drag.value/Math.max(1,height))}),[height]);
 // The browser fallback keeps its existing responder; it never competes with
 // the Android/iOS native WebView gesture above.
 const pan=useMemo(()=>Platform.OS==='web'?PanResponder.create({
  onStartShouldSetPanResponderCapture:event=>{gestureAtTop.current=frame.compact&&isHelpViewerTouch(event)&&(scroll.value<=1||event.nativeEvent.pageY<current.current.headerBottom);return false;},
  onMoveShouldSetPanResponderCapture:(event,gesture)=>frame.compact&&isHelpViewerTouch(event)&&!closing.current&&!current.current.menu&&gestureAtTop.current&&gesture.dy>8&&Math.abs(gesture.dy)>Math.abs(gesture.dx)*1.5,
  onPanResponderMove:(_,gesture)=>{drag.value=Math.max(0,gesture.dy);},
  onPanResponderRelease:(_,gesture)=>{if(gesture.dy>100||(gesture.dy>24&&gesture.vy>1))close();else drag.value=current.current.reduced?0:withSpring(0,{damping:25,stiffness:260,overshootClamping:true});},
  onPanResponderTerminate:()=>{drag.value=current.current.reduced?0:withSpring(0,{damping:25,stiffness:260,overshootClamping:true});},
 }).panHandlers:undefined,[close,drag,scroll,frame.compact]);
 return <Modal transparent hardwareAccelerated statusBarTranslucent visible animationType="none" onRequestClose={requestClose} onShow={()=>{}}>
  <GestureHandlerRootView style={{flex:1}}><GestureDetector gesture={pull}><View testID="help-html-viewer" {...pan} collapsable={false} style={{flex:1}} accessibilityViewIsModal>
   <Reanimated.View style={[StyleSheet.absoluteFill,{backgroundColor:frame.windowed?'#00000055':c.background},backdropStyle]}/>
   {frame.windowed?<Pressable testID="help-html-viewer-backdrop" focusable={false} accessibilityRole="button" accessibilityLabel="Закрыть страницу" onPress={requestClose} style={StyleSheet.absoluteFill}/>:null}
   {!ready?<LoadingPlaceholder dark={c.dark} accessibilityLabel="Загрузка страницы" style={{position:'absolute',top:frame.top+topInset+64,left:frame.left+16,width:Math.max(0,frame.width-32),height:Math.min(220,Math.max(0,frame.height-topInset-80))}}/>:null}
   <Reanimated.View testID="help-html-viewer-panel" style={[{position:'absolute',top:frame.top,left:frame.left,width:frame.width,height:frame.height,borderRadius:frame.borderRadius,backgroundColor:c.background,overflow:'hidden',opacity:ready?1:0,...(frame.windowed?{boxShadow:'0 12px 48px #00000026'}:{})},panelStyle]}>
    <View style={{flex:1}}>
     <HelpViewerWindowContext.Provider value={windowControls}><HelpViewerLayout testIDPrefix="help-html" title={artifact.title} onBack={close} menuLabel="Действия с HTML" topInset={topInset} bottomInset={bottomInset} menuOpen={menu} onMenuOpenChange={setMenu} actions={[
      ...(artifact.entity&&onOpenEntity?[{id:'entity',label:'Открыть карточку',icon:'open-outline' as const,onPress:()=>{const captured=scope.current;if(!expectedUserId||captured.userId!==expectedUserId||captured.expectedUserId!==expectedUserId||captured.id!==artifact.id||closing.current)return;afterClose.current=()=>{if(scope.current.id===captured.id&&scope.current.userId===captured.userId&&scope.current.expectedUserId===captured.expectedUserId&&scope.current.imageDataUrl===captured.imageDataUrl)onOpenEntity();};close();},disabled:!expectedUserId||userId!==expectedUserId}]:[]),
      {id:'download',label:'Скачать',icon:'download-outline',onPress:()=>void action('download'),disabled:!expectedUserId||userId!==expectedUserId,busy},
      {id:'link',label:'Ссылка',icon:'link-outline',onPress:()=>void action('link'),disabled:!link||!expectedUserId||userId!==expectedUserId,busy},
     ]}>
      <HelpHtmlSurface variant={artifact.full!} imageDataUrl={imageDataUrl} label={artifact.title} topInset={HEADER_HEIGHT+topInset} nativeGesture={nativeScroll} onReady={()=>setReady(true)} onScroll={scrolled}/>
     </HelpViewerLayout></HelpViewerWindowContext.Provider>
     {notice?<View pointerEvents="none" style={{position:'absolute',left:16,right:16,bottom:bottomInset+16,alignItems:'center'}}><Text accessibilityLiveRegion="polite" style={{backgroundColor:c.panel,color:c.text,borderRadius:12,paddingHorizontal:14,paddingVertical:10,fontSize:13}}>{notice}</Text></View>:null}

    </View>
   </Reanimated.View>
  </View></GestureDetector></GestureHandlerRootView>
 </Modal>;
}
