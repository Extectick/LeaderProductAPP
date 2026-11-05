import {LoadingPlaceholder} from '@/components/ui/LoadingPlaceholder';
import React,{useCallback,useContext,useEffect,useRef,useState} from 'react';
import {Animated,Easing,Modal,PanResponder,Platform,Pressable,StyleSheet,Text,useWindowDimensions,View} from 'react-native';
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
const HEADER_HEIGHT=HELP_VIEWER_HEADER_HEIGHT;
export type HelpHtmlOrigin={x:number;y:number;width:number;height:number};

/** Presentation leaves the conversation and its native motion owner mounted. */
export function HelpHtmlViewer({artifact,onClose,link,expectedUserId,imageDataUrl,onOpenEntity}:{artifact:HelpHtmlArtifact;origin?:HelpHtmlOrigin;onClose:()=>void;link?:string;expectedUserId?:number;imageDataUrl?:string;onOpenEntity?:()=>void}){
 const c=useHelpTheme(),reduced=useHelpReducedMotion(),insets=useSafeAreaInsets(),window=useWindowDimensions();
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
 const progress=useRef(new Animated.Value(0)).current,drag=useRef(new Animated.Value(0)).current,closing=useRef(false),scroll=useRef(0);
 const gestureAtTop=useRef(false);
 const current=useRef({onClose,reduced,menu,headerBottom:insets.top+HEADER_HEIGHT});current.current={onClose,reduced,menu,headerBottom:insets.top+HEADER_HEIGHT};
 const close=useCallback(()=>{
  if(closing.current)return;closing.current=true;
  operation.current?.abort();setMenu(false);
  const complete=()=>{const next=afterClose.current;afterClose.current=undefined;current.current.onClose();next?.();};
  if(current.current.reduced){complete();return;}
  Animated.parallel([Animated.timing(progress,{toValue:0,duration:240,easing:Easing.inOut(Easing.cubic),useNativeDriver:true}),Animated.timing(drag,{toValue:0,duration:240,useNativeDriver:true})]).start(({finished})=>{if(finished)complete();});
 },[progress,drag]);
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
 useEffect(()=>{if(!ready)return;if(reduced)progress.setValue(1);else Animated.timing(progress,{toValue:1,duration:340,easing:Easing.out(Easing.cubic),useNativeDriver:true}).start();return()=>{progress.stopAnimation();drag.stopAnimation();};},[progress,drag,reduced,ready]);
 useEffect(()=>{
  if(Platform.OS!=='web')return;
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();if(current.current.menu)setMenu(false);else close();}};
  windowThis().addEventListener('keydown',key);return()=>windowThis().removeEventListener('keydown',key);
 },[close]);
 const pan=useRef(PanResponder.create({
  onStartShouldSetPanResponderCapture:event=>{gestureAtTop.current=scroll.current<=1||event.nativeEvent.pageY<current.current.headerBottom;return false;},
  onMoveShouldSetPanResponderCapture:(_,gesture)=>!closing.current&&!current.current.menu&&gestureAtTop.current&&gesture.dy>8&&Math.abs(gesture.dy)>Math.abs(gesture.dx)*1.5,
  onPanResponderMove:(_,gesture)=>drag.setValue(Math.max(0,gesture.dy)),
  onPanResponderRelease:(_,gesture)=>{if(gesture.dy>100||gesture.vy>1)close();else Animated.spring(drag,{toValue:0,useNativeDriver:true,damping:25,stiffness:260}).start();},
  onPanResponderTerminate:()=>Animated.spring(drag,{toValue:0,useNativeDriver:true,damping:25,stiffness:260}).start(),
 })).current;
 const width=window.width,height=window.height;
 const transform=[{translateY:Animated.add(progress.interpolate({inputRange:[0,1],outputRange:[height,0]}),drag)}];
 return <Modal transparent hardwareAccelerated statusBarTranslucent visible animationType="none" onRequestClose={requestClose} onShow={()=>{}}>
  <View testID="help-html-viewer" {...pan.panHandlers} style={{flex:1}} accessibilityViewIsModal>
   <Animated.View style={[StyleSheet.absoluteFill,{backgroundColor:c.background,opacity:progress}]}/>
   {!ready?<LoadingPlaceholder dark={c.dark} accessibilityLabel="Загрузка страницы" style={{position:'absolute',top:insets.top+64,left:16,right:16,height:220}}/>:null}
   <Animated.View testID="help-html-viewer-panel" style={{position:'absolute',top:0,left:0,width,height,backgroundColor:c.background,overflow:'hidden',opacity:ready?1:0,transform}}>
    <View style={{flex:1}}>
     <HelpViewerLayout testIDPrefix="help-html" title={artifact.title} onBack={close} menuLabel="Действия с HTML" topInset={insets.top} bottomInset={insets.bottom} menuOpen={menu} onMenuOpenChange={setMenu} actions={[
      ...(artifact.entity&&onOpenEntity?[{id:'entity',label:'Открыть карточку',icon:'open-outline' as const,onPress:()=>{const captured=scope.current;if(!expectedUserId||captured.userId!==expectedUserId||captured.expectedUserId!==expectedUserId||captured.id!==artifact.id||closing.current)return;afterClose.current=()=>{if(scope.current.id===captured.id&&scope.current.userId===captured.userId&&scope.current.expectedUserId===captured.expectedUserId&&scope.current.imageDataUrl===captured.imageDataUrl)onOpenEntity();};close();},disabled:!expectedUserId||userId!==expectedUserId}]:[]),
      {id:'download',label:'Скачать',icon:'download-outline',onPress:()=>void action('download'),disabled:!expectedUserId||userId!==expectedUserId,busy},
      {id:'link',label:'Ссылка',icon:'link-outline',onPress:()=>void action('link'),disabled:!link||!expectedUserId||userId!==expectedUserId,busy},
     ]}>
      <HelpHtmlSurface variant={artifact.full!} imageDataUrl={imageDataUrl} label={artifact.title} topInset={HEADER_HEIGHT+insets.top} onReady={()=>setReady(true)} onScroll={offset=>{scroll.current=Math.max(0,offset);}}/>
     </HelpViewerLayout>
     {notice?<View pointerEvents="none" style={{position:'absolute',left:16,right:16,bottom:insets.bottom+16,alignItems:'center'}}><Text accessibilityLiveRegion="polite" style={{backgroundColor:c.panel,color:c.text,borderRadius:12,paddingHorizontal:14,paddingVertical:10,fontSize:13}}>{notice}</Text></View>:null}

    </View>
   </Animated.View>
  </View>
 </Modal>;
}
function windowThis():Window{return globalThis.window;}
