import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Animated, AppState, BackHandler, Easing, Keyboard, Linking, PanResponder, Pressable, Text, TextInput, useWindowDimensions, View} from 'react-native';
import {Image} from 'expo-image';
import {Ionicons} from '@expo/vector-icons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Gesture, GestureDetector, GestureHandlerRootView} from 'react-native-gesture-handler';
import Reanimated, {cancelAnimation, Easing as MotionEasing, runOnJS, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSpring, withTiming} from 'react-native-reanimated';
import type {FlatList} from 'react-native';
import {useHelpReducedMotion, useHelpTheme} from '../helpTheme';
import {discardHelpPreparedPhoto, getHelpPhotoPermission, getHelpPhotoPreviewUri, loadHelpPhotoPage, prepareHelpPhoto, presentHelpPhotoPermissions, type HelpLibraryPhoto, type HelpPhotoPermission} from '../helpPhotoLibrary';
import {helpDevActions, helpDevRef, helpDevState} from '../helpDiagnostics';
import {HelpPhotoPreview} from './HelpPhotoPreview';
import {HelpPhotoCamera} from './HelpPhotoCamera';
import {HelpNativeInput, hasNativeHelpInput} from './HelpNativeInput';
import type {HelpLocalFile} from './HelpComposer';
import type {HelpPhotoRect} from './HelpPhotoPortal';

type Selection = {photo:HelpLibraryPhoto;file?:HelpLocalFile;pending?:boolean;failed?:boolean};
type Props = {
  open:boolean; onClose:()=>void; files:HelpLocalFile[]; onFiles:(files:HelpLocalFile[])=>void;
  caption:string; onCaption:(text:string)=>void; onSend:(files:HelpLocalFile[])=>Promise<boolean|void>;
  onPreparing:(preparing:boolean)=>void; onError:(message:string)=>void; onDocuments:()=>void;
  busy:boolean; existingCount:number;
  onVisibility?:(visible:boolean)=>void;
};
const identity=(file:HelpLocalFile)=>file.assetId||file.uri;
const fromFile=(file:HelpLocalFile):Selection=>({photo:{id:identity(file),uri:file.uri,name:file.name,width:file.width||1,height:file.height||1,size:file.size},file});
const message=(error:unknown)=>error instanceof Error?error.message:'Не удалось открыть фотографию. Попробуйте ещё раз.';

/** Lives with the composer, so an in-flight selection survives closing the tray. */
export function HelpPhotoPicker(props:Props) {
  const c=useHelpTheme(),reduced=useHelpReducedMotion(),window=useWindowDimensions(),insets=useSafeAreaInsets();
  const latest=useRef(props);latest.current=props;
  const mounted=useRef(true),generation=useRef(0),pageOffset=useRef(0),loadingPage=useRef(false),checkingPermission=useRef(false);
  const [visible,setVisible]=useState(props.open),[settled,setSettled]=useState(false),[expanded,setExpanded]=useState(false);
  const [permission,setPermission]=useState<HelpPhotoPermission|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const [photos,setPhotos]=useState<HelpLibraryPhoto[]>([]),[hasMore,setHasMore]=useState(true),[width,setWidth]=useState(window.width-16);
  const [selection,setSelection]=useState<Selection[]>(()=>props.files.map(fromFile));
  const chosen=useRef(selection);chosen.current=selection;
  const [preview,setPreview]=useState<{photos:HelpLibraryPhoto[];index:number;origin?:HelpPhotoRect}|null>(null);
  const [cameraExpanded,setCameraExpanded]=useState(false),[cameraVisible,setCameraVisible]=useState(true),[keyboardHeight,setKeyboardHeight]=useState(0);
  const grid=useRef<View>(null),scrollOffset=useRef(new Animated.Value(0)).current;
  const [viewport,setViewport]=useState<HelpPhotoRect>();
  const height=useRef(new Animated.Value(0)).current,actualHeight=useRef(0),dragStart=useRef(0);
  const closedByPull=useRef(false),detachNativeScroll=useRef<(()=>void)|null>(null);
  const pullY=useSharedValue(0),gridScrollY=useSharedValue(0),gridMomentum=useSharedValue(false);
  const pullState=useSharedValue(0),touchX=useSharedValue(0),touchY=useSharedValue(0),pullAllowed=useSharedValue(false),pullHeight=useSharedValue(0),nativeCameraVisible=useSharedValue(true);
  const maximumHeight=Math.max(180,window.height-insets.top-insets.bottom-108-keyboardHeight);
  const collapsedHeight=Math.min(window.height*.6,maximumHeight);
  const geometry=useRef({collapsedHeight,maximumHeight});geometry.current={collapsedHeight,maximumHeight};
  const pending=selection.some(item=>item.pending),failed=selection.some(item=>item.failed),blocked=props.busy||pending;
  const selectedIds=selection.filter(item=>!item.file||item.file.mimeType?.startsWith('image/')).map(item=>item.photo.id);
  const tileSize=(width-4)/3;
  const callbacks=useRef({close:props.onClose,setExpanded});callbacks.current={close:props.onClose,setExpanded};
  const measureGrid=useCallback(()=>grid.current?.measureInWindow((x,y,width,height)=>{if(width>0&&height>0&&mounted.current)setViewport(previous=>previous?.x===x&&previous.y===y&&previous.width===width&&previous.height===height?previous:{x,y,width,height});}),[]);
  const beginPull=useCallback(()=>{if(mounted.current)setSettled(false);},[]);
  const settlePull=useCallback(()=>{if(mounted.current&&latest.current.open)setSettled(true);},[]);
  const closePulled=useCallback(()=>{
    if(!mounted.current||!latest.current.open)return;
    closedByPull.current=true;
    // The panel has already left the screen: release its dock in this commit.
    height.setValue(0);setVisible(false);setExpanded(false);setPreview(null);setCameraExpanded(false);
    latest.current.onClose();
  },[height]);
  const setGridList=useCallback((list:FlatList<HelpLibraryPhoto|null>|null)=>{
    detachNativeScroll.current?.();detachNativeScroll.current=null;
    const scroll=list?.getNativeScrollRef();if(!scroll)return;
    // Keep the portal camera's existing RN Animated value driven on native,
    // alongside Reanimated's UI-thread scroll offset used for gesture arbitration.
    const nativeEvents=Animated as typeof Animated & {attachNativeEvent:(view:unknown,name:string,mapping:unknown[])=>{detach:()=>void}};
    const binding=nativeEvents.attachNativeEvent(scroll,'onScroll',[{nativeEvent:{contentOffset:{y:scrollOffset}}}]);
    detachNativeScroll.current=()=>binding.detach();
  },[scrollOffset]);
  const gridScroll=useAnimatedScrollHandler({
    onScroll:event=>{gridScrollY.value=Math.max(0,event.contentOffset.y);const show=event.contentOffset.y<tileSize;if(nativeCameraVisible.value!==show){nativeCameraVisible.value=show;runOnJS(setCameraVisible)(show);}},
    onMomentumBegin:()=>{gridMomentum.value=true;},onMomentumEnd:()=>{gridMomentum.value=false;},
  },[tileSize]);
  const pullStyle=useAnimatedStyle(()=>({transform:[{translateY:pullY.value}]}));
  useEffect(()=>{pullAllowed.value=props.open&&settled&&!preview&&!cameraExpanded;pullHeight.value=expanded?maximumHeight:collapsedHeight;},[props.open,settled,preview,cameraExpanded,expanded,maximumHeight,collapsedHeight,pullAllowed,pullHeight]);
  const pullGesture=useMemo(()=>Gesture.Pan().withTestId('help-photo-pull').manualActivation(true).maxPointers(1)
    .enabled(props.open&&!preview&&!cameraExpanded)
    .onTouchesDown((event,manager)=>{
      if(!pullAllowed.value||gridScrollY.value>.5||gridMomentum.value||event.numberOfTouches!==1||pullState.value===3){manager.fail();return;}
      const touch=event.allTouches[0];touchX.value=touch.absoluteX;touchY.value=touch.absoluteY;pullState.value=1;
    })
    .onTouchesMove((event,manager)=>{
      if(pullState.value!==1)return;
      if(event.numberOfTouches!==1){pullState.value=0;manager.fail();return;}
      const touch=event.allTouches[0],dy=touch.absoluteY-touchY.value,dx=Math.abs(touch.absoluteX-touchX.value);
      // Decide on UI before ScrollView claims the stream. Up/horizontal gestures
      // fail early; a touch that began in history never transfers mid-gesture.
      if(dy< -6||(dx>10&&dx>Math.abs(dy))){pullState.value=0;manager.fail();}
      else if(dy>8&&dy>dx*1.2)manager.activate();
    })
    .onTouchesUp((_,manager)=>{if(pullState.value===1){pullState.value=0;manager.fail();}})
    .onStart(()=>{cancelAnimation(pullY);pullState.value=2;runOnJS(beginPull)();})
    .onUpdate(event=>{if(pullState.value===2)pullY.value=Math.max(0,Math.min(pullHeight.value,event.translationY));})
    .onEnd((event,success)=>{
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
      if(!success&&pullState.value===2){pullState.value=0;pullY.value=withSpring(0,{damping:25,stiffness:280,mass:.8,overshootClamping:true},finished=>{if(finished)runOnJS(settlePull)();});}
    }),[props.open,preview,cameraExpanded,reduced,beginPull,settlePull,closePulled,pullAllowed,gridScrollY,gridMomentum,pullState,touchX,touchY,pullY,pullHeight]);
  const nativeScrollGesture=useMemo(()=>Gesture.Native().withTestId('help-photo-native-scroll').requireExternalGestureToFail(pullGesture).disallowInterruption(false),[pullGesture]);

  useEffect(()=>{mounted.current=true;const id=height.addListener(({value})=>{actualHeight.current=value;});return()=>{mounted.current=false;++generation.current;height.removeListener(id);height.stopAnimation();detachNativeScroll.current?.();cancelAnimation(pullY);};},[height,pullY]);
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
  useEffect(()=>{if(props.open){closedByPull.current=false;cancelAnimation(pullY);pullY.value=0;pullState.value=0;setVisible(true);Keyboard.dismiss();}else setKeyboardHeight(0);},[props.open,pullY,pullState]);
  useEffect(()=>{
    setSettled(false);height.stopAnimation();
    if(!props.open&&closedByPull.current){height.setValue(0);setVisible(false);return;}
    const animation=Animated.timing(height,{toValue:props.open?(expanded?maximumHeight:collapsedHeight):0,duration:reduced?0:220,easing:Easing.out(Easing.cubic),useNativeDriver:false});
    animation.start(({finished})=>{if(finished&&mounted.current){setSettled(true);if(!latest.current.open){setVisible(false);setExpanded(false);setPreview(null);setCameraExpanded(false);}}});
    return()=>animation.stop();
  },[props.open,expanded,collapsedHeight,maximumHeight,reduced,height]);
  useEffect(()=>{if(settled&&props.open)measureGrid();},[settled,props.open,measureGrid]);

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
    const token=generation.current;setLoading(true);
    try{let result=await getHelpPhotoPermission(request);if(!mounted.current||token!==generation.current)return;
      if(!request&&!result.granted&&result.canAskAgain){result=await getHelpPhotoPermission(true);if(!mounted.current||token!==generation.current)return;}
      setPermission(result);if(result.granted)await loadPage(true);
    }catch(e){if(mounted.current)setError(message(e));}finally{checkingPermission.current=false;if(mounted.current)setLoading(false);}
  },[loadPage]);
  useEffect(()=>{if(props.open)void checkPermission();},[props.open,checkPermission]);
  useEffect(()=>{if(!props.open)return;const listener=AppState.addEventListener('change',state=>{if(state==='active')void checkPermission();});return()=>listener.remove();},[props.open,checkPermission]);
  useEffect(()=>{if(!props.open||preview||cameraExpanded)return;const listener=BackHandler.addEventListener('hardwareBackPress',()=>{latest.current.onClose();return true;});return()=>listener.remove();},[props.open,preview,cameraExpanded]);
  useEffect(()=>{if(!props.open||preview||cameraExpanded)return;const show=Keyboard.addListener('keyboardDidShow',event=>setKeyboardHeight(event.endCoordinates.height));const hide=Keyboard.addListener('keyboardDidHide',()=>setKeyboardHeight(0));return()=>{show.remove();hide.remove();};},[props.open,preview,cameraExpanded]);

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
    try{const result=await latest.current.onSend(files);if(result!==false&&mounted.current){setPreview(null);latest.current.onClose();}}
    catch(e){if(mounted.current)setError(message(e));}
  }
  function showPhoto(photo:HelpLibraryPhoto,origin?:HelpPhotoRect){
    Keyboard.dismiss();const all=photos.some(item=>item.id===photo.id)?photos:[photo,...photos];
    const ready=all.map(item=>chosen.current.find(entry=>entry.photo.id===item.id)?.photo||item);
    setPreview({photos:ready,index:ready.findIndex(item=>item.id===photo.id),origin});
  }
  const pan=useRef(PanResponder.create({
    onMoveShouldSetPanResponder:(_,g)=>Math.abs(g.dy)>8&&Math.abs(g.dy)>Math.abs(g.dx)*1.2,
    onPanResponderGrant:()=>{height.stopAnimation();setSettled(false);dragStart.current=actualHeight.current;},
    onPanResponderMove:(_,g)=>height.setValue(Math.max(80,Math.min(geometry.current.maximumHeight,dragStart.current-g.dy))),
    onPanResponderRelease:(_,g)=>{if(g.dy>100&&actualHeight.current<geometry.current.collapsedHeight*.8){callbacks.current.close();return;}const next=actualHeight.current>(geometry.current.maximumHeight+geometry.current.collapsedHeight)/2||g.vy<-.6;callbacks.current.setExpanded(next);Animated.timing(height,{toValue:next?geometry.current.maximumHeight:geometry.current.collapsedHeight,duration:180,useNativeDriver:false}).start(()=>setSettled(true));},
    onPanResponderTerminate:()=>{Animated.timing(height,{toValue:geometry.current.collapsedHeight,duration:180,useNativeDriver:false}).start(()=>setSettled(true));callbacks.current.setExpanded(false);},
  })).current;
  useEffect(()=>helpDevActions('photo.picker',{
    'photos.close':()=>latest.current.onClose(),'photos.expand':()=>setExpanded(true),
    'photos.select':value=>{const photo=photos[Number(value)];if(photo)return select(photo);},
    'photos.preview':value=>{const photo=photos[Number(value)];if(photo)showPhoto(photo);},
    'photos.refresh':()=>checkPermission(),
  }));
  useEffect(()=>helpDevState({photoPickerOpen:props.open,photoPermission:permission?permission.limited?'limited':permission.granted?'granted':'denied':'unknown',photoLoaded:photos.length,photoSelected:selectedIds.length,photoPreparing:pending,photoFailed:failed,photoPreview:Boolean(preview),photoCamera:cameraExpanded,photoExpanded:expanded}),[props.open,permission,photos.length,selectedIds.length,pending,failed,preview,cameraExpanded,expanded]);

  if(!visible)return null;
  return <>
    <Animated.View ref={node=>helpDevRef('photos.panel',node as unknown as View)} testID="help-photo-panel" onLayout={event=>setWidth(event.nativeEvent.layout.width)} style={{height,overflow:'hidden',marginTop:6}}>
      <GestureHandlerRootView style={{flex:1}}>
      <Reanimated.View testID="help-photo-pull-surface" style={[{flex:1,borderRadius:18,overflow:'hidden',backgroundColor:c.panel},pullStyle]}>
      <View {...pan.panHandlers} testID="help-photo-panel-handle" style={{height:48,alignItems:'center',justifyContent:'center'}}>
        <View style={{position:'absolute',top:5,width:32,height:3,borderRadius:2,backgroundColor:c.muted,opacity:.45}}/>
        <Text style={{color:c.text,fontSize:14,fontWeight:'600'}}>{selectedIds.length?`Выбрано фото: ${selectedIds.length}`:'Фотографии'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Выбрать файлы" disabled={blocked} onPress={props.onDocuments} style={{position:'absolute',left:2,width:44,height:44,alignItems:'center',justifyContent:'center'}}><Ionicons name="document-outline" size={21} color={c.muted}/></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Закрыть фотографии" onPress={props.onClose} style={{position:'absolute',right:2,width:44,height:44,alignItems:'center',justifyContent:'center'}}><Ionicons name="close" size={22} color={c.muted}/></Pressable>
      </View>
      {permission?.limited?<Pressable accessibilityRole="button" onPress={()=>void presentHelpPhotoPermissions().then(()=>checkPermission()).catch(e=>setError(message(e)))} style={{paddingHorizontal:12,paddingBottom:10}}><Text style={{fontSize:13,color:c.accentText}}>Открыты выбранные фото · Добавить ещё</Text></Pressable>:null}
      {error?<Text accessibilityLiveRegion="polite" style={{color:c.danger,fontSize:12,padding:8}}>{error}</Text>:null}
      <GestureDetector gesture={pullGesture}>
      <View ref={grid} collapsable={false} onLayout={measureGrid} testID="help-photo-grid-viewport" style={{flex:1,minHeight:0,overflow:'hidden'}}>
      <GestureDetector gesture={nativeScrollGesture}>
      <Reanimated.FlatList ref={setGridList} testID="help-photo-grid" data={[null,...photos]} keyExtractor={item=>item?.id||'camera'} numColumns={3} extraData={selection} initialNumToRender={18} maxToRenderPerBatch={12} windowSize={5} removeClippedSubviews={false} keyboardShouldPersistTaps="handled" onScroll={gridScroll} scrollEventThrottle={16} bounces={false} overScrollMode="never" onEndReached={()=>{if(permission?.granted&&hasMore&&!loading)void loadPage();}} onEndReachedThreshold={1} columnWrapperStyle={{gap:2}} contentContainerStyle={{gap:2,paddingBottom:4}}
        renderItem={({item,index})=>item?<PhotoTile photo={item} size={tileSize} number={selectedIds.indexOf(item.id)+1} pending={selection.some(entry=>entry.photo.id===item.id&&entry.pending)} disabled={props.busy} onSelect={()=>void select(item)} onPreview={origin=>showPhoto(item,origin)} index={index}/>:<View style={{width:tileSize,height:tileSize}}><HelpPhotoCamera expanded={cameraExpanded} onExpand={()=>{Keyboard.dismiss();setCameraExpanded(true);}} onClose={()=>setCameraExpanded(false)} onCapture={photo=>{setCameraExpanded(false);setPhotos(old=>[photo,...old]);void select(photo);showPhoto(photo);}} onError={value=>setError(value)} disabled={props.busy||chosen.current.length+props.existingCount>=10} tileVisible={props.open&&settled&&Boolean(permission)&&cameraVisible&&!preview} viewport={viewport} tileOrigin={viewport?{x:viewport.x,y:viewport.y,width:tileSize,height:tileSize}:undefined} scrollOffset={scrollOffset}/></View>}
        ListFooterComponent={<View style={{padding:16,alignItems:'center',gap:12}}>{loading?<ActivityIndicator color={c.accent}/>:null}{permission&&!permission.granted?<><Text style={{color:c.muted,textAlign:'center',fontSize:14}}>Разрешите доступ к фотографиям, чтобы выбрать их здесь.</Text><Pressable accessibilityRole="button" accessibilityLabel="Разрешить доступ к фотографиям" onPress={()=>void (permission.canAskAgain?checkPermission(true):Linking.openSettings())} style={{padding:12}}><Text style={{color:c.accentText,fontWeight:'600'}}>{permission.canAskAgain?'Разрешить доступ':'Открыть настройки'}</Text></Pressable></>:permission?.granted&&!photos.length&&!loading?<Text style={{color:c.muted}}>Фотографий пока нет. Можно сделать снимок.</Text>:null}</View>}/>
      </GestureDetector>
      </View>
      </GestureDetector>
      <View testID="help-photo-caption" style={{margin:8,flexShrink:0,minHeight:46,borderRadius:24,backgroundColor:c.surface}}>
        {hasNativeHelpInput?<HelpNativeInput value={props.caption} onChange={props.onCaption} placeholder="Сообщение…" color={c.text} hintColor={c.muted} accentColor={c.accent} editable={!props.busy} reducedMotion={reduced} onGeometry={measureGrid}/>:<TextInput accessibilityLabel="Подпись к фотографиям" value={props.caption} onChangeText={props.onCaption} editable={!props.busy} placeholder="Сообщение…" placeholderTextColor={c.muted} multiline textAlignVertical="center" style={{color:c.text,fontSize:18,lineHeight:22,paddingLeft:45,paddingRight:47,paddingVertical:12,minHeight:46,maxHeight:145,includeFontPadding:false}}/>}
        <Pressable testID="help-photo-back" accessibilityRole="button" accessibilityLabel="Назад к сообщению" onPress={props.onClose} style={{position:'absolute',left:1,bottom:1,width:44,height:44,alignItems:'center',justifyContent:'center'}}><Ionicons name="arrow-back" size={24} color={c.text}/></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={selectedIds.length?`Отправить фотографии: ${selectedIds.length}`:'Отправить сообщение'} disabled={blocked||failed||(!props.caption.trim()&&!selection.some(item=>item.file)&&!props.existingCount)} onPress={()=>void send()} style={{position:'absolute',right:4,bottom:4,width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center',backgroundColor:c.accent,opacity:blocked||failed||(!props.caption.trim()&&!selection.some(item=>item.file)&&!props.existingCount)?.45:1}}>{pending?<ActivityIndicator color="#FFF"/>:<Ionicons name="arrow-up" size={23} color="#FFF"/>}{selectedIds.length?<View style={{position:'absolute',right:-3,top:-5,minWidth:19,height:19,paddingHorizontal:4,borderRadius:10,backgroundColor:c.accent,borderWidth:2,borderColor:c.surface,alignItems:'center',justifyContent:'center'}}><Text style={{color:'#FFF',fontSize:10,fontWeight:'700'}}>{selectedIds.length}</Text></View>:null}</Pressable>
      </View>
      </Reanimated.View>
      </GestureHandlerRootView>
    </Animated.View>
    {preview?<HelpPhotoPreview photos={preview.photos} index={preview.index} origin={preview.origin} selectedIds={selectedIds} caption={props.caption} onCaption={props.onCaption} onToggle={photo=>void select(photo)} onSend={photo=>send(photo)} onClose={()=>setPreview(null)} busy={blocked} error={error} sendDisabled={failed} limitReached={selection.length+props.existingCount>=10}/>:null}
  </>;
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
