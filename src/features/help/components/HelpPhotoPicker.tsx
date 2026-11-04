import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useId} from 'react';
import {ActivityIndicator, AppState, BackHandler, Keyboard, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View} from 'react-native';
import {BlurTargetView} from 'expo-blur';
import {Image} from 'expo-image';
import {Ionicons} from '@expo/vector-icons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Gesture, GestureDetector, GestureHandlerRootView} from 'react-native-gesture-handler';
import Reanimated, {cancelAnimation, Easing as MotionEasing, measure, runOnJS, scrollTo, useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useFrameCallback, useSharedValue, withDecay, withSpring, withTiming, type SharedValue} from 'react-native-reanimated';
import {useHelpReducedMotion, useHelpTheme} from '../helpTheme';
import {discardHelpPreparedPhoto, getHelpPhotoPermission, getHelpPhotoPreviewUri, loadHelpPhotoPage, prepareHelpPhoto, presentHelpPhotoPermissions, type HelpLibraryPhoto, type HelpPhotoPermission} from '../helpPhotoLibrary';
import {helpDevActions, helpDevRef, helpDevState} from '../helpDiagnostics';
import {HelpPhotoPreview} from './HelpPhotoPreview';
import {HelpPhotoCamera} from './HelpPhotoCamera';
import type {HelpLocalFile} from './HelpComposer';
import {HelpPhotoPortal,useHelpPhotoHeaderHeight,useHelpPhotoBlurTarget,useHelpPhotoFullscreen,useHelpPhotoPortalFrame,type HelpPhotoRect} from './HelpPhotoPortal';

type Selection = {photo:HelpLibraryPhoto;file?:HelpLocalFile;pending?:boolean;failed?:boolean};
type Props = {
  blurTarget?:React.RefObject<View|null>; open:boolean; onClose:()=>void; files:HelpLocalFile[]; onFiles:(files:HelpLocalFile[])=>void;
  caption:string; onCaption:(text:string)=>void; onSend:(files:HelpLocalFile[])=>Promise<boolean|void>;
  onPreparing:(preparing:boolean)=>void; onError:(message:string)=>void; onDocuments:()=>void;
  busy:boolean; existingCount:number;
  onVisibility?:(visible:boolean)=>void;
};
const identity=(file:HelpLocalFile)=>file.assetId||file.uri;
const fromFile=(file:HelpLocalFile):Selection=>({photo:{id:identity(file),uri:file.uri,name:file.name,width:file.width||1,height:file.height||1,size:file.size},file});
const message=(error:unknown)=>error instanceof Error?error.message:'Не удалось открыть фотографию. Попробуйте ещё раз.';
export const helpPhotoSheetMaximumHeight=(windowHeight:number,topInset:number,bottomInset:number,keyboardTop:number|null)=>Math.max(180,Math.min(windowHeight-bottomInset,keyboardTop??Infinity)-topInset);

/** Lives with the composer, so an in-flight selection survives closing the tray. */
export function HelpPhotoPicker(props:Props) {
  const c=useHelpTheme(),reduced=useHelpReducedMotion(),window=useWindowDimensions(),insets=useSafeAreaInsets();
  const latest=useRef(props);latest.current=props;
  const mounted=useRef(true),generation=useRef(0),pageOffset=useRef(0),loadingPage=useRef(false),checkingPermission=useRef(false);
  const [visible,setVisible]=useState(props.open),[settled,setSettled]=useState(false),[panelLayoutHeight,setPanelLayoutHeight]=useState(0);
  const [permission,setPermission]=useState<HelpPhotoPermission|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const [photos,setPhotos]=useState<HelpLibraryPhoto[]>([]),[hasMore,setHasMore]=useState(true),[width,setWidth]=useState(window.width);
  const [selection,setSelection]=useState<Selection[]>(()=>props.files.map(fromFile));
  const chosen=useRef(selection);chosen.current=selection;
  const [preview,setPreview]=useState<{photos:HelpLibraryPhoto[];index:number;origin?:HelpPhotoRect}|null>(null);
  const [cameraExpanded,setCameraExpanded]=useState(false),[cameraVisible,setCameraVisible]=useState(true),[keyboardTop,setKeyboardTop]=useState<number|null>(null);
  const grid=useAnimatedRef<View>(),localGridBlur=useRef<View>(null),gridList=useAnimatedRef<import('react-native').FlatList<any>>();
  const gridBlur=useHelpPhotoBlurTarget()??localGridBlur;
  const [expanded,setExpanded]=useState(false);
  const [viewport,setViewport]=useState<HelpPhotoRect>();
  const height=useSharedValue(0),measuredHeight=useSharedValue(0),dragStart=useSharedValue(0),resizing=useRef(false);
  const portalId=useId(),portalFrame=useHelpPhotoPortalFrame(),chatHeaderHeight=useHelpPhotoHeaderHeight();
  useHelpPhotoFullscreen(portalId,props.open&&(cameraExpanded||Boolean(preview)));
  const closedByPull=useRef(false);
  const pullY=useSharedValue(0),gridScrollY=useSharedValue(0),gridMomentum=useSharedValue(false),gridDragStart=useSharedValue(0);
  const pullState=useSharedValue(0),touchX=useSharedValue(0),touchY=useSharedValue(0),pullAllowed=useSharedValue(false),pullHeight=useSharedValue(0),nativeCameraVisible=useSharedValue(true);
  const availableHeight=Math.max(0,Math.min(portalFrame?.height??window.height,keyboardTop===null?Infinity:keyboardTop-(portalFrame?.y??0)));
  const maximumHeight=availableHeight;
  const collapsedHeight=Math.min(maximumHeight,window.height*.6);
  const panelHeight=expanded||keyboardTop!==null?maximumHeight:collapsedHeight;
  const headerHeight=40,captionInset=keyboardTop===null?insets.bottom:0;
  const captionFocused=useRef(false),keepKeyboardOnClose=useRef(false);
  const viewportHeight=useSharedValue(availableHeight),expansionLimit=useSharedValue(maximumHeight),gridTarget=useSharedValue(0),gridMaximum=useSharedValue(0);
  const momentumPosition=useSharedValue(-1);
  const captionHeight=useSharedValue(58+insets.bottom);
  const measuredGridY=useSharedValue(0),cameraOffset=useSharedValue(0),cameraViewportHeight=useSharedValue(0);
  const gridBaseline=useRef<{revision:number;width:number}|null>(null);
  const pending=selection.some(item=>item.pending),failed=selection.some(item=>item.failed),blocked=props.busy||pending;
  const selectedIds=selection.filter(item=>!item.file||item.file.mimeType?.startsWith('image/')).map(item=>item.photo.id);
  const tileSize=(width-4)/3;
  const needsPermission=Boolean(permission&&!permission.granted);
  const skeletonCount=Math.max(11,Math.ceil(maximumHeight/Math.max(1,tileSize))*3-1);
  const galleryItems=useMemo<(HelpLibraryPhoto|{skeleton:string}|null)[]>(()=>[null,...(permission?.granted?photos:Array.from({length:skeletonCount},(_,index)=>({skeleton:`permission-${index}`})))],[permission?.granted,photos,skeletonCount]);
  const gridRevision=useRef(0);
  const measureGrid=useCallback(()=>{
    if(resizing.current||!latest.current.open)return;
    const baseline=height.value,revision=gridRevision.current;
    grid.current?.measureInWindow((x,y,width,height)=>{
      if(width>0&&height>0&&mounted.current&&latest.current.open&&!resizing.current&&revision===gridRevision.current){
        // Keep one coordinate origin while this opening moves. The UI-thread
        // probe below follows real sheet/IME geometry, including parent motion.
        if(gridBaseline.current?.revision!==revision||gridBaseline.current.width!==width){
          gridBaseline.current={revision,width};measuredGridY.value=y;cameraOffset.value=0;cameraViewportHeight.value=Math.max(0,height-headerHeight-captionHeight.value);
          measuredHeight.value=baseline;setViewport({x,y,width,height});
        }
      }
    });
  },[height,measuredHeight,grid,measuredGridY,cameraOffset,cameraViewportHeight]);
  const beginPull=useCallback(()=>{if(mounted.current)setSettled(false);},[]);
  const settlePull=useCallback(()=>{if(mounted.current&&latest.current.open)setSettled(true);},[]);
  const closePulled=useCallback(()=>{
    if(!mounted.current||!latest.current.open)return;
    closedByPull.current=true;
    // The panel has already left the screen: release its dock in this commit.
    height.value=0;setPanelLayoutHeight(0);setVisible(false);setPreview(null);setCameraExpanded(false);
    latest.current.onClose();
  },[height]);
  const gridScroll=useAnimatedScrollHandler({
    onBeginDrag:()=>{cancelAnimation(gridTarget);},
    onScroll:event=>{gridScrollY.value=Math.max(0,event.contentOffset.y);gridMaximum.value=Math.max(0,(event.contentSize?.height??0)-(event.layoutMeasurement?.height??0));const show=event.contentOffset.y<tileSize+headerHeight;if(nativeCameraVisible.value!==show){nativeCameraVisible.value=show;runOnJS(setCameraVisible)(show);}},
    onMomentumBegin:()=>{gridMomentum.value=true;},onMomentumEnd:()=>{gridMomentum.value=false;},
  },[tileSize,headerHeight]);
  useAnimatedReaction(()=>gridTarget.value,(value,previous)=>{if(previous!==null&&value!==previous)scrollTo(gridList,0,value,false);},[gridList]);
  const cameraFrame=useFrameCallback(()=>{
    if(!nativeCameraVisible.value)return;
    // Animated refs are opaque on the UI runtime (Reanimated 4.7+ maps them
    // to shareable objects). Only the public APIs may dereference them.
    const rect=measure(grid);
    if(rect&&rect.height>0){cameraOffset.value=rect.pageY-measuredGridY.value;cameraViewportHeight.value=Math.max(0,Math.min(rect.height,height.value)-headerHeight-Math.max(0,insets.top-(viewportHeight.value-height.value))-captionHeight.value);}
  },false);
  useEffect(()=>{cameraFrame.setActive(visible&&Boolean(viewport)&&cameraVisible&&!preview&&!cameraExpanded);return()=>cameraFrame.setActive(false);},[cameraFrame,visible,viewport,cameraVisible,preview,cameraExpanded]);
  const pullStyle=useAnimatedStyle(()=>({transform:[{translateY:pullY.value}],borderTopLeftRadius:Math.min(22,Math.max(0,viewportHeight.value-height.value)),borderTopRightRadius:Math.min(22,Math.max(0,viewportHeight.value-height.value))}));
  useEffect(()=>{pullAllowed.value=props.open&&visible&&!preview&&!cameraExpanded;pullHeight.value=panelHeight;expansionLimit.value=maximumHeight;viewportHeight.value=availableHeight;},[props.open,visible,preview,cameraExpanded,panelHeight,maximumHeight,availableHeight,pullAllowed,pullHeight,expansionLimit,viewportHeight]);
  const finishExpansion=useCallback(()=>{if(!mounted.current)return;setExpanded(true);resizing.current=false;setSettled(true);setPanelLayoutHeight(height.value);measureGrid();},[height,measureGrid]);
  const finishCollapse=useCallback(()=>{if(!mounted.current)return;setExpanded(false);resizing.current=false;setSettled(true);setPanelLayoutHeight(height.value);measureGrid();},[height,measureGrid]);
  const pullGesture=useMemo(()=>Gesture.Pan().withTestId('help-photo-pull').manualActivation(true).maxPointers(1)
    .enabled(props.open&&!preview&&!cameraExpanded)
    .onTouchesDown((event,manager)=>{
      if(!pullAllowed.value||event.numberOfTouches!==1||pullState.value===3){manager.fail();return;}
      const touch=event.allTouches[0];touchX.value=touch.absoluteX;touchY.value=touch.absoluteY;pullState.value=1;
    })
    .onTouchesMove((event,manager)=>{
      if(pullState.value!==1)return;
      if(event.numberOfTouches!==1){pullState.value=0;manager.fail();return;}
      const touch=event.allTouches[0],dy=touch.absoluteY-touchY.value,dx=Math.abs(touch.absoluteX-touchX.value);
      // Own the complete vertical stream, including reversals and inertia.
      if(Math.abs(dy)>8&&Math.abs(dy)>dx*1.2){
        pullState.value=dy>0&&height.value<=collapsedHeight+.5&&gridTarget.value<=.5?2:4;manager.activate();
      }else if(dx>10&&dx>Math.abs(dy)){pullState.value=0;manager.fail();}
    })
    .onTouchesUp((_,manager)=>{if(pullState.value===1){pullState.value=0;manager.fail();}})
    .onStart(()=>{cancelAnimation(height);cancelAnimation(pullY);cancelAnimation(gridTarget);cancelAnimation(momentumPosition);momentumPosition.value=-1;dragStart.value=height.value;gridDragStart.value=height.value<expansionLimit.value-.5?0:gridTarget.value;if(pullState.value!==4)pullState.value=2;runOnJS(beginPull)();})
    .onUpdate(event=>{
      if(pullState.value===4){
        const range=expansionLimit.value-collapsedHeight;
        const position=Math.max(0,dragStart.value-collapsedHeight+gridDragStart.value-event.translationY);
        height.value=collapsedHeight+Math.min(range,position);
        gridTarget.value=Math.min(gridMaximum.value,Math.max(0,position-range));
      }
      else if(pullState.value===2)pullY.value=Math.max(0,Math.min(pullHeight.value,event.translationY));
    })
    .onEnd((event,success)=>{
      if(!success)return;
      if(pullState.value===4){
        pullState.value=0;
        const range=expansionLimit.value-collapsedHeight;
        const snap=()=>{
          'worklet';
          const full=height.value>=expansionLimit.value-.5||event.velocityY<=0;
          if(height.value>=expansionLimit.value-.5){runOnJS(finishExpansion)();return;}
          momentumPosition.value=withSpring(full?range:0,{damping:25,stiffness:280,mass:.8,overshootClamping:true},finished=>{
            if(finished)runOnJS(full?finishExpansion:finishCollapse)();
          });
        };
        if(!reduced&&Math.abs(event.velocityY)>80){
          momentumPosition.value=height.value-collapsedHeight+gridTarget.value;
          momentumPosition.value=withDecay({velocity:-event.velocityY,clamp:[0,range+gridMaximum.value]},finished=>{if(finished)snap();});
        }else{
          const full=height.value>=expansionLimit.value-.5||event.velocityY<=0;
          height.value=withSpring(full?expansionLimit.value:collapsedHeight,{damping:25,stiffness:280,mass:.8,overshootClamping:true},finished=>{
            if(finished)runOnJS(full?finishExpansion:finishCollapse)();
          });
        }
        return;
      }
      if(pullState.value!==2)return;
      if(success&&(pullY.value>Math.min(140,pullHeight.value*.22)||(pullY.value>24&&event.velocityY>900))){
        pullState.value=3;
        pullY.value=withTiming(pullHeight.value+12,{duration:reduced?0:180,easing:MotionEasing.out(MotionEasing.cubic)},finished=>{if(finished)runOnJS(closePulled)();});
      }else{
        pullState.value=0;
        pullY.value=withSpring(0,{damping:25,stiffness:280,mass:.8,overshootClamping:true},finished=>{if(finished)runOnJS(settlePull)();});
      }
    })
    .onFinalize((_,success)=>{
      if(pullState.value===1)pullState.value=0;
      if(!success&&pullState.value===4){pullState.value=0;gridTarget.value=gridDragStart.value;height.value=withSpring(dragStart.value,{damping:25,stiffness:280,mass:.8,overshootClamping:true},finished=>{if(finished)runOnJS(settlePull)();});}
      if(!success&&pullState.value===2){pullState.value=0;pullY.value=withSpring(0,{damping:25,stiffness:280,mass:.8,overshootClamping:true},finished=>{if(finished)runOnJS(settlePull)();});}
    }),[props.open,preview,cameraExpanded,reduced,beginPull,settlePull,closePulled,finishExpansion,finishCollapse,collapsedHeight,momentumPosition,gridDragStart,pullAllowed,gridScrollY,gridMomentum,pullState,touchX,touchY,pullY,pullHeight,expansionLimit,gridTarget,gridMaximum,height,dragStart]);
  useAnimatedReaction(()=>momentumPosition.value,position=>{
    if(position<0)return;
    const range=Math.max(0,expansionLimit.value-collapsedHeight);
    height.value=collapsedHeight+Math.min(range,position);
    gridTarget.value=Math.min(gridMaximum.value,Math.max(0,position-range));
  },[collapsedHeight]);
  // Keep the native list viewport fixed while the clipping panel grows. Fabric
  // commits and safe-area changes must never resize/cancel the scroll at full height.
  const gridFrameStyle=useAnimatedStyle(()=>({transform:[{translateY:Math.max(0,insets.top-(viewportHeight.value-height.value))}]}));
  const headerFrameStyle=useAnimatedStyle(()=>{const top=Math.max(0,insets.top-(viewportHeight.value-height.value));return{height:40+top,paddingTop:top};});
  const nativeScrollGesture=useMemo(()=>Gesture.Native().withTestId('help-photo-native-scroll').requireExternalGestureToFail(pullGesture).disallowInterruption(false),[pullGesture]);
  useLayoutEffect(()=>{
    if(props.open&&visible)gridList.current?.scrollToOffset({offset:0,animated:false});
  },[props.open,visible,gridList]);

  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;++generation.current;cancelAnimation(height);cancelAnimation(pullY);cancelAnimation(gridTarget);cancelAnimation(momentumPosition);};},[height,pullY,gridTarget,momentumPosition]);
  useEffect(()=>{props.onPreparing(pending||failed);},[pending,failed,props.onPreparing]);
  useEffect(()=>{props.onVisibility?.(visible);},[visible,props.onVisibility]);
  useEffect(()=>{if(!props.open&&!pending){const next=props.files.map(fromFile);chosen.current=next;setSelection(next);}},[props.files,props.open,pending]);
  useEffect(()=>{
    if(!props.open)return;
    // A disk draft can finish restoring after the user opens the tray. Merge
    // those ready files without replacing selections still being prepared.
    const next=[...chosen.current];let changed=false;
    for(const file of props.files){const at=next.findIndex(item=>item.photo.id===identity(file));
      if(at<0){next.push(fromFile(file));changed=true;}
      else if(next[at].file&&next[at].file!.uri!==file.uri){next[at]=fromFile(file);changed=true;}
    }
    if(changed){chosen.current=next;setSelection(next);}
  },[props.files,props.open]);
  useEffect(()=>{
    cancelAnimation(gridTarget);cancelAnimation(momentumPosition);momentumPosition.value=-1;gridMomentum.value=false;
    if(props.open){
      ++gridRevision.current;setViewport(undefined);measuredHeight.value=0;setExpanded(false);
      gridTarget.value=0;gridScrollY.value=0;nativeCameraVisible.value=true;setCameraVisible(true);
      // A new opening starts at the camera row even when a closing transition
      // was interrupted. Old native scroll/inertia must not survive the sheet.
      closedByPull.current=false;keepKeyboardOnClose.current=false;
      cancelAnimation(pullY);pullY.value=0;pullState.value=0;setVisible(true);Keyboard.dismiss();
    }
  },[props.open,pullY,pullState,measuredHeight,gridTarget,gridScrollY,gridMomentum,nativeCameraVisible]);
  // Release the touch shield even if a closing animation is interrupted.
  useEffect(()=>{
    if(props.open)return;
    const timer=setTimeout(()=>{if(!latest.current.open){height.value=0;setPanelLayoutHeight(0);setVisible(false);setPreview(null);setCameraExpanded(false);}},260);
    return()=>clearTimeout(timer);
  },[props.open,height]);
  const finishHeight=useCallback(()=>{
    if(!mounted.current)return;
    resizing.current=false;setSettled(true);setPanelLayoutHeight(height.value);
    if(!latest.current.open){
      height.value=0;pullY.value=0;setPanelLayoutHeight(0);setVisible(false);setPreview(null);setCameraExpanded(false);
      if(captionFocused.current){captionFocused.current=false;if(!keepKeyboardOnClose.current)Keyboard.dismiss();}
    }
    else measureGrid();
  },[measureGrid,height,pullY]);
  useEffect(()=>{
    resizing.current=true;setSettled(false);cancelAnimation(height);
    if(!props.open&&closedByPull.current){height.value=0;setVisible(false);return;}
    if(!props.open){
      // Preserve the grid's committed size while the entire sheet slides away.
      // Collapsing its height reflows/remounts the cells before it leaves view.
      pullY.value=withTiming(height.value+12,{duration:reduced?0:220,easing:MotionEasing.out(MotionEasing.cubic)},finished=>{if(finished)runOnJS(finishHeight)();});
      return()=>cancelAnimation(pullY);
    }
    const target=panelHeight;
    if(Math.abs(height.value-target)<.5){finishHeight();return;}
    height.value=withTiming(target,{duration:reduced?0:220,easing:MotionEasing.out(MotionEasing.cubic)},finished=>{if(finished)runOnJS(finishHeight)();});
    if(props.open)setPanelLayoutHeight(target);
    // Permission/IME interruption must not leave a half-height touch shield.
    const completion=setTimeout(()=>{if(mounted.current){height.value=target;finishHeight();}},260);
    return()=>{clearTimeout(completion);cancelAnimation(height);};
  },[props.open,panelHeight,reduced,height,pullY,finishHeight]);
  useEffect(()=>{
    if(!settled||!props.open)return;
    // The portal commits after its owner. Measure after that native commit,
    // not only before it; IME layout and a previous close can leave old bounds.
    let alive=true,frame:number;const until=Date.now()+280;
    const tick=()=>{if(!alive)return;measureGrid();if(Date.now()<until)frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);
    return()=>{alive=false;cancelAnimationFrame(frame);};
  },[settled,props.open,panelHeight,measureGrid]);

  const restorePanel = useCallback(() => {
    if (!mounted.current || !latest.current.open || preview || cameraExpanded) return;
    // Permission dialogs can interrupt UI-thread animations without changing
    // `open`. Re-establish both panel geometry and its camera clipping on return.
    setVisible(true);setSettled(false);resizing.current=true;
    cancelAnimation(height);cancelAnimation(pullY);pullY.value=0;pullState.value=0;
    height.value=panelHeight;setPanelLayoutHeight(panelHeight);finishHeight();
  }, [preview,cameraExpanded,height,pullY,pullState,panelHeight,reduced,finishHeight]);

  const restorePanelRef=useRef(restorePanel);restorePanelRef.current=restorePanel;

  const loadPage=useCallback(async(reset=false)=>{
    if(loadingPage.current)return;
    loadingPage.current=true;setLoading(true);setError('');const token=generation.current,offset=reset?0:pageOffset.current;
    try{const result=await loadHelpPhotoPage(offset);if(!mounted.current||token!==generation.current)return;
      pageOffset.current=offset+result.photos.length;setPhotos(old=>reset?result.photos:[...old,...result.photos.filter(photo=>!old.some(item=>item.id===photo.id))]);setHasMore(result.hasMore);
    }catch(e){if(mounted.current&&token===generation.current)setError(message(e));}
    finally{loadingPage.current=false;if(mounted.current&&token===generation.current)setLoading(false);}
  },[]);
  const checkPermission=useCallback(async(request=false)=>{
    if(checkingPermission.current)return;checkingPermission.current=true;
    const token=generation.current;const requested=request;setLoading(true);setError('');
    try{const result=await getHelpPhotoPermission(request);if(!mounted.current||token!==generation.current)return;
      setPermission(result);if(result.granted)await loadPage(true);else setPhotos([]);
    }catch(e){if(mounted.current)setError(message(e));}finally{checkingPermission.current=false;if(mounted.current){setLoading(false);if(requested)restorePanelRef.current();}}
  },[loadPage]);
  useEffect(()=>{if(props.open)void checkPermission();},[props.open,checkPermission]);
  useEffect(()=>{
    if(!props.open)return;
    const resume=()=>{if(!mounted.current||!latest.current.open)return;restorePanel();void checkPermission(false);};
    const state=AppState.addEventListener('change',value=>{if(value==='active')resume();});
    const focus=AppState.addEventListener('focus',resume);
    return()=>{state.remove();focus.remove();};
  },[props.open,checkPermission,restorePanel]);
  useEffect(()=>{if(!props.open||preview||cameraExpanded)return;const listener=BackHandler.addEventListener('hardwareBackPress',()=>{latest.current.onClose();return true;});return()=>listener.remove();},[props.open,preview,cameraExpanded]);
  useEffect(()=>{
    if(!props.open||preview||cameraExpanded){setKeyboardTop(null);return;}
    const show=Keyboard.addListener('keyboardDidShow',event=>{
      if(captionFocused.current)setKeyboardTop(Number.isFinite(event.endCoordinates.screenY)?event.endCoordinates.screenY:(portalFrame?.y??0)+(portalFrame?.height??window.height)-event.endCoordinates.height);
      else{setKeyboardTop(null);Keyboard.dismiss();}
    });
    const hide=Keyboard.addListener('keyboardDidHide',()=>setKeyboardTop(null));
    return()=>{show.remove();hide.remove();};
  },[props.open,preview,cameraExpanded,portalFrame?.y,portalFrame?.height,window.height]);

  function commit(next:Selection[]){chosen.current=next;setSelection(next);latest.current.onFiles(next.flatMap(item=>item.file?[item.file]:[]));}
  async function select(photo:HelpLibraryPhoto){
    if(latest.current.busy)return;
    const existing=chosen.current.find(item=>item.photo.id===photo.id);
    if(existing){commit(chosen.current.filter(item=>item!==existing));return;}
    if(chosen.current.length+latest.current.existingCount>=10){setError('В одном сообщении можно прикрепить до 10 файлов.');return;}
    const entry:Selection={photo,pending:true};commit([...chosen.current,entry]);setError('');
    try{const file=await prepareHelpPhoto(photo);
      if(!mounted.current||!chosen.current.includes(entry)){await discardHelpPreparedPhoto(file);return;}
      commit(chosen.current.map(item=>item===entry?{photo:{...photo,uri:file.uri,width:file.width||photo.width,height:file.height||photo.height},file}:item));
    }catch(e){if(mounted.current&&chosen.current.includes(entry)){commit(chosen.current.map(item=>item===entry?{photo,failed:true}:item));setError(message(e));}}
  }
  async function send(photo?:HelpLibraryPhoto){
    if(latest.current.busy||chosen.current.some(item=>item.pending||item.failed))return;
    let files=chosen.current.flatMap(item=>item.file?[item.file]:[]);
    if(!files.length&&photo){
      if(latest.current.existingCount>=10){setError('В одном сообщении можно прикрепить до 10 файлов.');return;}
      const entry:Selection={photo,pending:true};commit([entry]);
      try{const file=await prepareHelpPhoto(photo);if(!mounted.current||!chosen.current.includes(entry)){await discardHelpPreparedPhoto(file);return;}files=[file];commit([{photo:{...photo,uri:file.uri},file}]);}
      catch(e){if(mounted.current&&chosen.current.includes(entry)){commit(chosen.current.map(item=>item===entry?{photo,failed:true}:item));setError(message(e));}return;}
    }
    if(!mounted.current||(!files.length&&!latest.current.caption.trim()&&!latest.current.existingCount))return;
    const hadKeyboard=Keyboard.isVisible?.()??captionFocused.current;
    try{const result=await latest.current.onSend(files);if(result!==false&&mounted.current){keepKeyboardOnClose.current=hadKeyboard;setPreview(null);latest.current.onClose();}}
    catch(e){if(mounted.current)setError(message(e));}
  }
  function showPhoto(photo:HelpLibraryPhoto,origin?:HelpPhotoRect){
    Keyboard.dismiss();const all=photos.some(item=>item.id===photo.id)?photos:[photo,...photos];
    const ready=all.map(item=>chosen.current.find(entry=>entry.photo.id===item.id)?.photo||item);
    setPreview({photos:ready,index:ready.findIndex(item=>item.id===photo.id),origin});
  }
  const beginResize=useCallback(()=>{
    gridList.current?.scrollToOffset({offset:gridScrollY.value,animated:false});
    resizing.current=true;setSettled(false);
  },[gridList,gridScrollY]);
  const endResize=useCallback(()=>{if(!mounted.current)return;resizing.current=false;setExpanded(height.value>(collapsedHeight+maximumHeight)/2);setSettled(true);setPanelLayoutHeight(height.value);measureGrid();},[measureGrid,height,collapsedHeight,maximumHeight]);
  const closeResize=useCallback(()=>{resizing.current=false;latest.current.onClose();},[]);
  const resizeGesture=useMemo(()=>Gesture.Pan().withTestId('help-photo-resize').maxPointers(1).activeOffsetY([-8,8])
    .onStart(()=>{cancelAnimation(height);cancelAnimation(gridTarget);cancelAnimation(momentumPosition);momentumPosition.value=-1;dragStart.value=height.value;runOnJS(beginResize)();})
    .onUpdate(event=>{height.value=Math.max(80,Math.min(maximumHeight,dragStart.value-event.translationY));if(height.value<maximumHeight-.5){gridTarget.value=0;gridScrollY.value=0;}})
    .onEnd((event,success)=>{
      if(!success)return;
      if(event.translationY>100&&height.value<panelHeight*.8){runOnJS(closeResize)();return;}
      const target=height.value>(collapsedHeight+maximumHeight)/2||event.velocityY< -600?maximumHeight:collapsedHeight;
      height.value=withSpring(target,{damping:25,stiffness:280,mass:.8,overshootClamping:true},finished=>{if(finished)runOnJS(endResize)();});
    })
    .onFinalize((_,success)=>{if(!success)height.value=withSpring(panelHeight,{damping:25,stiffness:280,mass:.8,overshootClamping:true},finished=>{if(finished)runOnJS(endResize)();});}),
    [height,dragStart,panelHeight,maximumHeight,collapsedHeight,beginResize,endResize,closeResize]);
  useEffect(()=>helpDevActions('photo.picker',{
    'photos.close':()=>latest.current.onClose(),
    'photos.select':value=>{const photo=photos[Number(value)];if(photo)return select(photo);},
    'photos.preview':value=>{const photo=photos[Number(value)];if(photo)showPhoto(photo);},
    'photos.refresh':()=>checkPermission(),
  }));
  useEffect(()=>helpDevState({photoPickerOpen:props.open,photoPermission:permission?permission.limited?'limited':permission.granted?'granted':'denied':'unknown',photoLoaded:photos.length,photoSelected:selectedIds.length,photoPreparing:pending,photoFailed:failed,photoPreview:Boolean(preview),photoCamera:cameraExpanded,photoExpanded:expanded}),[props.open,permission,photos.length,selectedIds.length,pending,failed,preview,cameraExpanded,expanded]);

  if(!visible)return null;
  return <HelpPhotoPortal id={portalId}><View testID="help-photo-overlay" pointerEvents={props.open?'box-none':'none'} style={{position:'absolute',top:0,left:0,right:0,bottom:0}}>
    <Pressable accessibilityLabel="Закрыть панель вложений" onPress={props.onClose} style={{position:'absolute',top:chatHeaderHeight,left:0,right:0,bottom:0}}/>
    <KeyboardAvoidingView testID="help-photo-keyboard-frame" pointerEvents="box-none" behavior="height" enabled={visible&&!preview&&!cameraExpanded} style={StyleSheet.absoluteFill}>
    <HelpPhotoPanel height={height} layoutHeight={panelLayoutHeight} bottom={0} onWidth={setWidth}>
      <GestureHandlerRootView style={{flex:1}}>
      <Reanimated.View testID="help-photo-pull-surface" style={[{flex:1,overflow:'hidden',backgroundColor:c.panel},pullStyle]}>
      {permission?.limited?<Pressable accessibilityRole="button" onPress={()=>void presentHelpPhotoPermissions().then(()=>checkPermission()).catch(e=>setError(message(e)))} style={{paddingHorizontal:12,paddingBottom:10}}><Text style={{fontSize:13,color:c.accentText}}>Открыты выбранные фото · Добавить ещё</Text></Pressable>:null}
      {error?<Text accessibilityLiveRegion="polite" style={{color:c.danger,fontSize:12,padding:8}}>{error}</Text>:null}
      <GestureDetector gesture={pullGesture}>
      <Reanimated.View ref={grid} collapsable={false} onLayout={measureGrid} testID="help-photo-grid-viewport" style={[{height:maximumHeight,minHeight:0,overflow:'hidden'},gridFrameStyle]}>
      <GestureDetector gesture={nativeScrollGesture}>
      <BlurTargetView ref={gridBlur} style={{flex:1}}><Reanimated.FlatList ref={gridList} testID="help-photo-grid" data={galleryItems} keyExtractor={item=>item?'skeleton'in item?item.skeleton:item.id:'camera'} numColumns={3} extraData={selection} initialNumToRender={18} maxToRenderPerBatch={12} windowSize={5} removeClippedSubviews={false} keyboardShouldPersistTaps="handled" scrollEnabled={false} onContentSizeChange={(_width,contentHeight)=>{gridMaximum.value=Math.max(0,contentHeight-maximumHeight);}} onScroll={gridScroll} scrollEventThrottle={16} bounces={false} overScrollMode="never" onEndReached={()=>{if(permission?.granted&&hasMore&&!loading)void loadPage();}} onEndReachedThreshold={1} columnWrapperStyle={{gap:2}} contentContainerStyle={{gap:2,paddingTop:headerHeight,paddingBottom:58+captionInset+insets.top}}
        renderItem={({item,index})=>item&&'skeleton'in item?<View testID="help-photo-permission-skeleton" accessible={false} importantForAccessibility="no-hide-descendants" style={{width:tileSize,height:tileSize,backgroundColor:c.line,opacity:.65}}/>:item?<PhotoTile photo={item} size={tileSize} number={selectedIds.indexOf(item.id)+1} pending={selection.some(entry=>entry.photo.id===item.id&&entry.pending)} disabled={props.busy} onSelect={()=>void select(item)} onPreview={origin=>showPhoto(item,origin)} index={index}/>:<View style={{width:tileSize,height:tileSize}}><HelpPhotoCamera onPermissionSettled={restorePanel} expanded={cameraExpanded} onExpand={()=>{Keyboard.dismiss();setCameraExpanded(true);}} onClose={()=>setCameraExpanded(false)} onCapture={photo=>{setCameraExpanded(false);setPhotos(old=>[photo,...old]);void select(photo);showPhoto(photo);}} onError={value=>setError(value)} disabled={props.busy||chosen.current.length+props.existingCount>=10} tileVisible={visible&&Boolean(viewport)&&Boolean(permission)&&cameraVisible&&!preview} viewport={viewport?{...viewport,y:viewport.y+headerHeight,height:Math.max(0,viewport.height-headerHeight)}:undefined} tileOrigin={viewport?{x:viewport.x,y:viewport.y+headerHeight,width:tileSize,height:tileSize}:undefined} scrollOffsetShared={gridScrollY} sheetOffset={cameraOffset} sheetViewportHeight={cameraViewportHeight}/></View>}
        ListFooterComponent={permission?.granted?<View style={{padding:16,alignItems:'center',gap:12}}>{loading?<ActivityIndicator color={c.accent}/>:!photos.length?<Text style={{color:c.muted}}>Фотографий пока нет. Можно сделать снимок.</Text>:null}</View>:null}/></BlurTargetView>
      </GestureDetector>
      {needsPermission?<View testID="help-photo-permission-overlay" pointerEvents="box-none" style={{position:'absolute',top:headerHeight+tileSize,left:0,right:0,bottom:58+captionInset,alignItems:'center',justifyContent:'center'}}>
        <Pressable accessibilityRole="button" accessibilityLabel="Разрешить использование фотографий" disabled={loading} onPress={()=>void checkPermission(true)} style={({pressed})=>({minHeight:48,paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,opacity:loading||pressed?.6:1})}>
          {loading?<ActivityIndicator color={c.accentText}/>:<Ionicons name="images-outline" size={24} color={c.accentText}/>}
          <Text style={{color:c.accentText,fontSize:16,fontWeight:'600',textAlign:'center'}}>Разрешить использование</Text>
        </Pressable>
      </View>:null}
      </Reanimated.View>
      </GestureDetector>
      <GestureDetector gesture={resizeGesture}><Reanimated.View testID="help-photo-panel-handle" style={[{position:'absolute',top:0,left:0,right:0,zIndex:2,backgroundColor:c.panel},headerFrameStyle]}>
        <View style={{height:40,alignItems:'center',justifyContent:'center'}}>
        <View style={{position:'absolute',top:5,width:32,height:3,borderRadius:2,backgroundColor:c.muted,opacity:.45}}/>
        <Text style={{color:c.text,fontSize:14,fontWeight:'600'}}>{selectedIds.length?`Выбрано фото: ${selectedIds.length}`:'Фотографии'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Выбрать файлы" disabled={blocked} onPress={props.onDocuments} style={{position:'absolute',left:2,top:-2,width:44,height:44,alignItems:'center',justifyContent:'center'}}><Ionicons name="document-outline" size={21} color={c.muted}/></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Закрыть фотографии" onPress={props.onClose} style={{position:'absolute',right:2,top:-2,width:44,height:44,alignItems:'center',justifyContent:'center'}}><Ionicons name="close" size={22} color={c.muted}/></Pressable>
        </View>
      </Reanimated.View></GestureDetector>
      <View testID="help-photo-caption" onLayout={event=>{captionHeight.value=event.nativeEvent.layout.height;}} style={{position:'absolute',left:0,right:0,bottom:0,margin:0,paddingTop:8,paddingBottom:captionInset+4,minHeight:58+captionInset}}>
        <View testID="help-photo-caption-surface" style={{minHeight:46,marginHorizontal:8,borderRadius:24,backgroundColor:c.surface,borderWidth:StyleSheet.hairlineWidth,borderColor:c.line}}>
        <TextInput testID="help-photo-message-input" accessibilityLabel="Сообщение к вложениям" value={props.caption} onChangeText={props.onCaption}
          placeholder="Сообщение…" placeholderTextColor={c.muted} multiline editable
          onFocus={()=>{captionFocused.current=true;}} onBlur={()=>{captionFocused.current=false;}}
          textAlignVertical="top" underlineColorAndroid="transparent" scrollEnabled
          style={{minHeight:46,maxHeight:150,marginRight:48,paddingHorizontal:16,paddingTop:12,paddingBottom:12,fontSize:17,lineHeight:22,color:c.text}}/>
        <Pressable accessibilityRole="button" accessibilityLabel={selectedIds.length?`Отправить фотографии: ${selectedIds.length}`:'Отправить сообщение'} disabled={blocked||failed||(!props.caption.trim()&&!selection.some(item=>item.file)&&!props.existingCount)} onPress={()=>void send()} style={{position:'absolute',right:4,bottom:4,width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center',backgroundColor:c.accent,opacity:blocked||failed||(!props.caption.trim()&&!selection.some(item=>item.file)&&!props.existingCount)?.45:1}}>{pending?<ActivityIndicator color="#FFF"/>:<Ionicons name="arrow-up" size={23} color="#FFF"/>}{selectedIds.length?<View style={{position:'absolute',right:-3,top:-5,minWidth:19,height:19,paddingHorizontal:4,borderRadius:10,backgroundColor:c.accent,borderWidth:2,borderColor:c.surface,alignItems:'center',justifyContent:'center'}}><Text style={{color:'#FFF',fontSize:10,fontWeight:'700'}}>{selectedIds.length}</Text></View>:null}</Pressable>
        </View>
      </View>
      </Reanimated.View>
      </GestureHandlerRootView>
    </HelpPhotoPanel>
    </KeyboardAvoidingView>
    {preview?<HelpPhotoPreview captionEditable photos={preview.photos} index={preview.index} origin={preview.origin} selectedIds={selectedIds} caption={props.caption} onCaption={props.onCaption} onToggle={photo=>void select(photo)} onSend={photo=>send(photo)} onClose={()=>setPreview(null)} busy={blocked} error={error} sendDisabled={failed} limitReached={selection.length+props.existingCount>=10}/>:null}
  </View></HelpPhotoPortal>;
}

/** The portal mounts this later than the picker. Bind its animated style here,
 * so Reanimated's initial native style reads the current height, not the zero
 * captured before permission dialogs and before the portal view existed. */
function HelpPhotoPanel({height,layoutHeight,bottom,onWidth,children}:{height:SharedValue<number>;layoutHeight:number;bottom:number;onWidth:(width:number)=>void;children:React.ReactNode}) {
  // Keep Fabric's committed Yoga size aligned with the completed animation.
  // A camera/permission subtree commit must not restore the initial zero size.
  const panelStyle=useAnimatedStyle(()=>({height:height.value}),[height]);
  return <Reanimated.View ref={(node:View|null)=>helpDevRef('photos.panel',node as unknown as View)} testID="help-photo-panel"
    onLayout={event=>onWidth(event.nativeEvent.layout.width)}
    style={[{position:'absolute',bottom,left:0,right:0,overflow:'hidden'},panelStyle,{height:layoutHeight}]}>{children}</Reanimated.View>;
}

function PhotoTile({photo,size,number,pending,disabled,onSelect,onPreview,index}:{photo:HelpLibraryPhoto;size:number;number:number;pending:boolean;disabled:boolean;onSelect:()=>void;onPreview:(origin:HelpPhotoRect)=>void;index:number}) {
  const c=useHelpTheme(),node=useRef<View>(null);
  const [uri,setUri]=useState<string|null>(null);
  useEffect(()=>{let alive=true;setUri(null);void getHelpPhotoPreviewUri(photo).then(value=>{if(alive)setUri(value);}).catch(()=>{});return()=>{alive=false;};},[photo.id,photo.uri]);
  return <View ref={node} collapsable={false} style={{width:size,height:size,backgroundColor:c.elevated}}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Открыть фотографию ${index}`} onPress={()=>node.current?.measureInWindow((x,y,width,height)=>onPreview({x,y,width,height}))} style={{flex:1}}>
      {uri?<Image source={{uri}} contentFit="cover" recyclingKey={photo.id} cachePolicy="memory-disk" transition={100} style={{flex:1,opacity:number?.8:1}}/>:<View style={{flex:1,alignItems:'center',justifyContent:'center'}}><Ionicons name="cloud-download-outline" size={28} color={c.muted}/></View>}
    </Pressable>
    <Pressable accessibilityRole="checkbox" accessibilityLabel={`Выбрать фотографию ${index}`} accessibilityState={{checked:number>0,disabled}} disabled={disabled} onPress={onSelect} style={{position:'absolute',right:0,top:0,width:44,height:44,alignItems:'center',justifyContent:'center'}}>
      <View style={{width:25,height:25,borderRadius:13,borderWidth:2,borderColor:'#FFF',alignItems:'center',justifyContent:'center',backgroundColor:number?c.accent:'#00000035'}}>{pending?<ActivityIndicator size="small" color="#FFF"/>:number?<Text style={{color:'#FFF',fontSize:13,fontWeight:'700'}}>{number}</Text>:null}</View>
    </Pressable>
  </View>;
}
