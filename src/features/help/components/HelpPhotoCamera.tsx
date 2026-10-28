import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, BackHandler, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { BlurView } from 'expo-blur';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { HelpLibraryPhoto } from '../helpPhotoLibrary';
import { helpDevActions, helpDevState } from '../helpDiagnostics';
import { useHelpReducedMotion, useHelpTheme } from '../helpTheme';
import { HelpPhotoPortal, useHelpPhotoPortalFrame, type HelpPhotoRect } from './HelpPhotoPortal';

export type HelpPhotoCameraProps = {
  expanded:boolean;onExpand:()=>void;onClose:()=>void;onCapture:(photo:HelpLibraryPhoto)=>void;onError:(message:string)=>void;disabled?:boolean;
  /** Window coordinates from the picker; update while its first row scrolls. */
  tileOrigin?:HelpPhotoRect;tileVisible?:boolean;layoutRevision?:number|string|boolean;
  /** The grid clips the portal camera exactly like its other cells. */
  viewport?:HelpPhotoRect;scrollOffset?:Animated.Value;
};
let photoSequence=0;
const validRect=(rect:HelpPhotoRect|undefined)=>Boolean(rect&&rect.width>0&&rect.height>0&&Object.values(rect).every(Number.isFinite));

/** One persistent CameraView moves in the portal, never between native Modal windows. */
export function HelpPhotoCamera(props:HelpPhotoCameraProps) {
  const c=useHelpTheme(),reduced=useHelpReducedMotion(),insets=useSafeAreaInsets(),host=useHelpPhotoPortalFrame(),id=useId();
  const [permission,requestPermission,refreshPermission]=useCameraPermissions();
  const [facing,setFacing]=useState<CameraType>('back'),[ready,setReady]=useState(false),[taking,setTaking]=useState(false),[asking,setAsking]=useState(false);
  const [expandedSurface,setExpandedSurface]=useState(props.expanded);
  const [active,setActive]=useState(AppState.currentState==='active'),[measured,setMeasured]=useState<HelpPhotoRect>();
  const camera=useRef<CameraView>(null),tile=useRef<View>(null),progress=useRef(new Animated.Value(props.expanded?1:0)).current;
  const life=useRef({mounted:true,pending:false,asking:false,generation:0});
  const autoRequested=useRef(false),scrollPosition=useRef(0),transitionScroll=useRef(0),wasExpanded=useRef(props.expanded);
  const live=useRef({props,permission,requestPermission,refreshPermission,ready,active});live.current={props,permission,requestPermission,refreshPermission,ready,active};
  const tileRect=validRect(props.tileOrigin)?props.tileOrigin:measured;
  const showCamera=Boolean(permission?.granted&&active&&(props.expanded||(props.tileVisible!==false&&!props.disabled))&&validRect(tileRect));
  const floating=props.expanded||expandedSurface;
  if(props.expanded&&!wasExpanded.current)transitionScroll.current=scrollPosition.current;
  wasExpanded.current=props.expanded;
  const scrollTranslate=React.useMemo(()=>props.scrollOffset?Animated.multiply(props.scrollOffset,-1):0,[props.scrollOffset]);
  useEffect(()=>{if(!props.scrollOffset)return;const key=props.scrollOffset.addListener(({value})=>{scrollPosition.current=value;});return()=>props.scrollOffset?.removeListener(key);},[props.scrollOffset]);
  useEffect(()=>{life.current.mounted=true;const listener=AppState.addEventListener('change',state=>{setActive(state==='active');if(state!=='active'){life.current.generation++;setReady(false);}else void live.current.refreshPermission().catch(()=>{});});return()=>{life.current.mounted=false;life.current.generation++;listener.remove();progress.stopAnimation();};},[progress]);
  useEffect(()=>{if(!showCamera)setReady(false);},[showCamera]);
  useEffect(()=>{if(!props.expanded)life.current.generation++;},[props.expanded]);
  useEffect(()=>{
    // Gallery permission has finished before tileVisible becomes true. Ask once
    // for the live thumbnail too, rather than waiting for the fullscreen camera.
    if(!permission||permission.granted||!permission.canAskAgain||!active||props.tileVisible===false||props.disabled||autoRequested.current||life.current.asking)return;
    autoRequested.current=true;life.current.asking=true;setAsking(true);
    void live.current.requestPermission().catch(()=>{}).finally(()=>{life.current.asking=false;if(life.current.mounted)setAsking(false);});
  },[permission,active,props.tileVisible,props.disabled]);
  useEffect(()=>{progress.stopAnimation();if(props.expanded)setExpandedSurface(true);if(reduced){progress.setValue(props.expanded?1:0);setExpandedSurface(props.expanded);}else Animated.timing(progress,{toValue:props.expanded?1:0,duration:230,useNativeDriver:false}).start(({finished})=>{if(finished&&life.current.mounted&&!live.current.props.expanded)setExpandedSurface(false);});},[props.expanded,progress,reduced]);
  const measure=useCallback(()=>tile.current?.measureInWindow((x,y,width,height)=>{if(width>0&&height>0&&life.current.mounted)setMeasured(previous=>previous?.x===x&&previous.y===y&&previous.width===width&&previous.height===height?previous:{x,y,width,height});}),[]);
  useEffect(()=>{if(validRect(props.tileOrigin))setMeasured(props.tileOrigin);},[props.tileOrigin?.x,props.tileOrigin?.y,props.tileOrigin?.width,props.tileOrigin?.height]);
  useEffect(()=>{
    if(props.tileOrigin||props.tileVisible===false||props.expanded)return;
    // A sheet transition changes window coordinates without changing tile-local
    // layout. Re-measure through that short transition, then stop polling.
    let frame:number,alive=true;const until=Date.now()+280;
    const tick=()=>{if(!alive)return;measure();if(Date.now()<until)frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);return()=>{alive=false;cancelAnimationFrame(frame);};
  },[measure,props.tileVisible,props.expanded,props.layoutRevision,Boolean(props.tileOrigin),host?.x,host?.y,host?.width,host?.height]);
  const expand=useCallback(async()=>{
    const current=live.current;if(current.props.disabled||life.current.asking||!life.current.mounted)return;
    if(current.permission?.granted){current.props.onExpand();return;}
    if(current.permission?.canAskAgain===false){current.props.onError('Разрешите доступ к камере в настройках приложения.');return;}
    life.current.asking=true;setAsking(true);
    try{const result=await current.requestPermission();if(!life.current.mounted||live.current.props.disabled)return;if(result.granted)live.current.props.onExpand();else live.current.props.onError('Для съёмки фото нужен доступ к камере.');}
    catch{if(life.current.mounted)live.current.props.onError('Не удалось запросить доступ к камере.');}
    finally{life.current.asking=false;if(life.current.mounted)setAsking(false);}
  },[]);
  const close=useCallback(()=>{life.current.generation++;live.current.props.onClose();},[]);
  useEffect(()=>{if(!props.expanded)return;const subscription=BackHandler.addEventListener('hardwareBackPress',()=>{close();return true;});return()=>subscription.remove();},[props.expanded,close]);
  const capture=useCallback(async()=>{
    const current=live.current;
    if(life.current.pending||!life.current.mounted||!current.props.expanded||current.props.disabled||!current.active||!current.ready||!camera.current)return;
    life.current.pending=true;setTaking(true);const generation=life.current.generation;
    try{
      const picture=await camera.current.takePictureAsync({quality:1,skipProcessing:false,exif:false,base64:false,imageType:'jpg'});
      if(!picture?.uri||!(picture.width>0&&picture.height>0))throw new Error('Invalid capture');
      let size:number|undefined;
      if(picture.uri.startsWith('file:')){try{const info=await FileSystem.getInfoAsync(picture.uri);if(info.exists&&'size'in info)size=info.size;}catch{/* Metadata is optional; draft preparation validates the actual file. */}}
      if(!life.current.mounted||generation!==life.current.generation)return;
      const stamp=Date.now(),extension=picture.format==='png'?'png':'jpg';
      live.current.props.onCapture({id:`capture:${stamp}:${++photoSequence}`,uri:picture.uri,name:`Фото-${stamp}.${extension}`,width:picture.width,height:picture.height,...(size===undefined?{}:{size})});
    }catch{if(life.current.mounted&&generation===life.current.generation)live.current.props.onError('Не удалось сделать фото. Попробуйте ещё раз.');}
    finally{life.current.pending=false;if(life.current.mounted)setTaking(false);}
  },[]);
  const flip=useCallback(()=>{if(life.current.pending||live.current.props.disabled||!live.current.props.expanded)return;setReady(false);setFacing(value=>value==='back'?'front':'back');},[]);
  useEffect(()=>helpDevActions('photo-camera',{'photo.camera.open':expand,'photo.camera.close':close,'photo.camera.capture':capture,'photo.camera.flip':flip}),[expand,close,capture,flip]);
  useEffect(()=>helpDevState({photoCameraExpanded:props.expanded,photoCameraReady:ready,photoCameraActive:showCamera,photoCameraCapturing:taking}),[props.expanded,ready,showCamera,taking]);
  const clip=props.viewport??host??{x:0,y:0,width:tileRect?.width??1,height:(tileRect?.y??0)+(tileRect?.height??1)};
  const base={x:(tileRect?.x??0)-clip.x,y:(tileRect?.y??0)-clip.y,width:tileRect?.width??1,height:tileRect?.height??1};
  const interpolate=(from:number,to:number)=>progress.interpolate({inputRange:[0,1],outputRange:[from,to]});
  const button={width:48,height:48,borderRadius:24,alignItems:'center' as const,justifyContent:'center' as const,backgroundColor:'#00000055'};
  return <>
    <View ref={tile} collapsable={false} onLayout={measure} style={{width:'100%',aspectRatio:1,backgroundColor:c.panel}}>
      <Pressable testID="help-photo-camera-tile" accessibilityRole="button" accessibilityLabel="Открыть камеру" accessibilityState={{disabled:Boolean(props.disabled||asking)}} disabled={props.disabled||asking} onPress={()=>void expand()} style={[StyleSheet.absoluteFill,{minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center'}]}>{asking?<ActivityIndicator color={c.text}/>:<Ionicons name="camera" size={32} color={c.text}/>}</Pressable>
    </View>
    <HelpPhotoPortal id={`camera-${id}`}><View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {expandedSurface?<Animated.View onStartShouldSetResponder={()=>true} style={[StyleSheet.absoluteFill,{backgroundColor:'#000',opacity:progress}]}/>:null}
      {showCamera?<Animated.View testID="help-photo-camera-clip" pointerEvents="none" style={{position:'absolute',left:interpolate(clip.x-(host?.x??0),0),top:interpolate(clip.y-(host?.y??0),0),width:interpolate(clip.width,host?.width??clip.width),height:interpolate(clip.height,host?.height??clip.height),overflow:'hidden'}}>
        <Animated.View testID="help-photo-camera-scroll" style={{position:'absolute',left:0,top:0,width:'100%',height:'100%',transform:[{translateY:floating?0:scrollTranslate}]}}>
          <Animated.View testID="help-photo-camera-frame" style={{position:'absolute',left:interpolate(base.x,0),top:interpolate(base.y-(floating?transitionScroll.current:0),0),width:interpolate(base.width,host?.width??base.width),height:interpolate(base.height,host?.height??base.height),overflow:'hidden',borderRadius:interpolate(3,0),backgroundColor:'#000'}}>
            <CameraView ref={camera} testID="help-photo-camera-preview" style={StyleSheet.absoluteFill} facing={facing} mode="picture" mute active={active} previewBlurRadius={floating?0:10} onCameraReady={()=>setReady(true)} onMountError={()=>{setReady(false);live.current.props.onError('Камера недоступна. Закройте другие приложения камеры и попробуйте ещё раз.');}}/>
            {!floating?<>{Platform.OS==='ios'?<BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill}/>:null}<View testID="help-photo-camera-icon" style={[StyleSheet.absoluteFill,{alignItems:'center',justifyContent:'center',backgroundColor:'#00000018'}]}><Ionicons name="camera" size={32} color="#FFF"/></View></>:null}
          </Animated.View>
        </Animated.View>
      </Animated.View>:null}
      {expandedSurface?<Animated.View testID="help-photo-camera-controls" style={[StyleSheet.absoluteFill,{opacity:progress}]} pointerEvents="box-none">
        <View style={{position:'absolute',top:insets.top+8,left:12,right:12,flexDirection:'row',alignItems:'center'}}><Pressable accessibilityRole="button" accessibilityLabel="Закрыть камеру" onPress={close} style={button}><Ionicons name="close" size={27} color="#FFF"/></Pressable><Text style={{flex:1,color:'#FFF',fontSize:16,fontWeight:'600',textAlign:'center',paddingRight:48}}>Фото</Text></View>
        <View style={{position:'absolute',bottom:Math.max(insets.bottom,16)+18,left:24,right:24,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><View style={{width:48}}/><Pressable testID="help-photo-camera-shutter" accessibilityRole="button" accessibilityLabel="Сделать фото" accessibilityState={{disabled:!ready||taking||Boolean(props.disabled),busy:taking}} disabled={!ready||taking||props.disabled} onPress={()=>void capture()} style={{width:80,height:80,borderRadius:40,borderWidth:4,borderColor:'#FFF',padding:5,opacity:ready?1:.5}}><View style={{flex:1,borderRadius:32,backgroundColor:'#FFF',alignItems:'center',justifyContent:'center'}}>{taking?<ActivityIndicator color={c.accent}/>:null}</View></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Переключить камеру" disabled={taking||props.disabled} onPress={flip} style={button}><Ionicons name="camera-reverse-outline" size={28} color="#FFF"/></Pressable></View>
      </Animated.View>:null}
    </View></HelpPhotoPortal>
  </>;
}
