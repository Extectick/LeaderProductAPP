import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { HelpLibraryPhoto } from '../helpPhotoLibrary';
import { helpDevActions, helpDevState } from '../helpDiagnostics';
import { useHelpReducedMotion, useHelpTheme } from '../helpTheme';
import type { HelpPhotoRect } from './HelpPhotoPortal';

export type HelpPhotoPreviewProps = {
  photos:HelpLibraryPhoto[];index:number;origin?:HelpPhotoRect;selectedIds:string[];caption:string;
  onCaption:(text:string)=>void;onToggle:(photo:HelpLibraryPhoto)=>void;onSend:(photo:HelpLibraryPhoto)=>Promise<void>;onClose:()=>void;busy:boolean;limitReached?:boolean;error?:string;sendDisabled?:boolean;
};
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const safeIndex=(index:number,length:number)=>clamp(Number.isFinite(index)?Math.floor(index):0,0,Math.max(0,length-1));
const identityPhotoTransform=[{translateX:0},{translateY:0},{scale:1}];
const touchDistance=(event:any)=>{const touches=event.nativeEvent.touches??[];return touches.length<2?0:Math.hypot(touches[0].pageX-touches[1].pageX,touches[0].pageY-touches[1].pageY);};

/** Bounded three-photo viewer. Draft selection and the album caption stay in the picker owner. */
export function HelpPhotoPreview(props:HelpPhotoPreviewProps) {
  const c=useHelpTheme(),reduced=useHelpReducedMotion(),insets=useSafeAreaInsets(),window=useWindowDimensions();
  const [index,setIndex]=useState(()=>safeIndex(props.index,props.photos.length)),[pending,setPending]=useState(false),[error,setError]=useState(''),[zoomed,setZoomed]=useState(false);
  const [loadedIds,setLoadedIds]=useState<string[]>([]);
  const [stage,setStage]=useState({width:window.width,height:Math.max(100,window.height-insets.top-insets.bottom-132),y:insets.top+56});
  const reveal=useRef(new Animated.Value(0)).current,dragX=useRef(new Animated.Value(0)).current,dragY=useRef(new Animated.Value(0)).current,dismissX=useRef(new Animated.Value(0)).current;
  const backdrop=useRef(new Animated.Value(0)).current;
  const zoom=useRef(new Animated.Value(1)).current,panX=useRef(new Animated.Value(0)).current,panY=useRef(new Animated.Value(0)).current;
  const life=useRef({mounted:true,closing:false,sending:false,switching:false});
  const viewport=useRef(stage);viewport.current=stage;
  const indexRef=useRef(index);indexRef.current=index;
  const firstPhotoId=useRef(props.photos[safeIndex(props.index,props.photos.length)]?.id);
  const latest=useRef({props,reduced});latest.current={props,reduced};
  const motion=useRef<Animated.CompositeAnimation|undefined>(undefined);
  const gesture=useRef({mode:'' as ''|'pinch'|'pan'|'horizontal'|'vertical',distance:0,scale:1,x:0,y:0,startScale:1,startX:0,startY:0});
  const photo=props.photos[index],selectedIndex=photo?props.selectedIds.indexOf(photo.id):-1;
  useEffect(()=>{life.current.mounted=true;return()=>{life.current.mounted=false;motion.current?.stop();[reveal,backdrop,dragX,dragY,dismissX,zoom,panX,panY].forEach(value=>value.stopAnimation());};},[reveal,backdrop,dragX,dragY,dismissX,zoom,panX,panY]);
  useEffect(()=>{if(life.current.closing)return;if(reduced){reveal.setValue(1);backdrop.setValue(1);}else{motion.current=Animated.parallel([Animated.timing(reveal,{toValue:1,duration:230,useNativeDriver:true}),Animated.timing(backdrop,{toValue:1,duration:230,useNativeDriver:true})]);motion.current.start();}},[reduced,reveal,backdrop]);
  const resetZoom=useCallback(()=>{gesture.current.scale=1;gesture.current.x=0;gesture.current.y=0;zoom.setValue(1);panX.setValue(0);panY.setValue(0);setZoomed(false);},[zoom,panX,panY]);
  useEffect(()=>{setIndex(safeIndex(props.index,props.photos.length));resetZoom();setError('');},[props.index,resetZoom]);
  useEffect(()=>{setIndex(previous=>safeIndex(previous,props.photos.length));},[props.photos.length]);
  const close=useCallback((down=false)=>{
    if(life.current.closing||!life.current.mounted)return;life.current.closing=true;motion.current?.stop();Keyboard.dismiss();
    if(latest.current.reduced){latest.current.props.onClose();return;}
    const current=latest.current.props,currentPhoto=current.photos[indexRef.current];
    const returnToOrigin=Boolean(current.origin&&current.origin.width>0&&current.origin.height>0&&currentPhoto?.id===firstPhotoId.current);
    motion.current=returnToOrigin?Animated.parallel([Animated.timing(reveal,{toValue:0,duration:210,useNativeDriver:true}),Animated.timing(backdrop,{toValue:0,duration:210,useNativeDriver:true}),Animated.timing(dragY,{toValue:0,duration:210,useNativeDriver:true}),Animated.timing(dismissX,{toValue:0,duration:210,useNativeDriver:true}),Animated.timing(zoom,{toValue:1,duration:210,useNativeDriver:true}),Animated.timing(panX,{toValue:0,duration:210,useNativeDriver:true}),Animated.timing(panY,{toValue:0,duration:210,useNativeDriver:true})]):Animated.parallel([Animated.timing(reveal,{toValue:0,duration:190,useNativeDriver:true}),Animated.timing(backdrop,{toValue:0,duration:190,useNativeDriver:true}),Animated.timing(dragY,{toValue:down?window.height:0,duration:190,useNativeDriver:true}),Animated.timing(dismissX,{toValue:0,duration:190,useNativeDriver:true})]);
    motion.current.start(({finished})=>{if(finished&&life.current.mounted)latest.current.props.onClose();});
  },[dragY,dismissX,reveal,backdrop,zoom,panX,panY,window.height]);
  const restore=useCallback(()=>{if(life.current.closing)return;motion.current?.stop();if(latest.current.reduced){dragX.setValue(0);dragY.setValue(0);dismissX.setValue(0);backdrop.setValue(1);}else{motion.current=Animated.parallel([Animated.spring(dragX,{toValue:0,damping:24,useNativeDriver:true}),Animated.spring(dragY,{toValue:0,damping:24,useNativeDriver:true}),Animated.spring(dismissX,{toValue:0,damping:24,useNativeDriver:true}),Animated.timing(backdrop,{toValue:1,duration:180,useNativeDriver:true})]);motion.current.start();}},[dragX,dragY,dismissX,backdrop]);
  const changePhoto=useCallback((delta:number)=>{
    if(life.current.closing||life.current.switching)return;
    const next=safeIndex(indexRef.current+delta,latest.current.props.photos.length);if(next===indexRef.current){restore();return;}
    life.current.switching=true;
    const finish=()=>{if(!life.current.mounted||life.current.closing)return;indexRef.current=next;setIndex(next);dragX.setValue(0);dragY.setValue(0);dismissX.setValue(0);backdrop.setValue(1);resetZoom();setError('');life.current.switching=false;};
    if(latest.current.reduced){finish();return;}
    motion.current?.stop();motion.current=Animated.timing(dragX,{toValue:delta>0?-viewport.current.width:viewport.current.width,duration:170,useNativeDriver:true});motion.current.start(({finished})=>{if(finished)finish();else life.current.switching=false;});
  },[dragX,dragY,dismissX,backdrop,resetZoom,restore]);
  const setScale=useCallback((scale:number)=>{const next=clamp(scale,1,4);gesture.current.scale=next;zoom.setValue(next);if(next===1){gesture.current.x=0;gesture.current.y=0;panX.setValue(0);panY.setValue(0);}setZoomed(next>1.05);},[zoom,panX,panY]);
  const toggleZoom=useCallback(()=>setScale(gesture.current.scale>1.05?1:2.5),[setScale]);
  const toggle=useCallback(()=>{const current=latest.current.props,currentPhoto=current.photos[indexRef.current];if(!currentPhoto||current.busy||life.current.sending||life.current.closing)return;const selected=current.selectedIds.includes(currentPhoto.id);if(!selected&&current.limitReached)return;current.onToggle(currentPhoto);},[]);
  const send=useCallback(async()=>{const current=latest.current.props,currentPhoto=current.photos[indexRef.current];if(!currentPhoto||current.busy||current.sendDisabled||life.current.sending||life.current.closing)return;life.current.sending=true;setPending(true);setError('');try{await current.onSend(currentPhoto);}catch{if(life.current.mounted&&!life.current.closing)setError('Не удалось отправить фото. Попробуйте ещё раз.');}finally{life.current.sending=false;if(life.current.mounted)setPending(false);}},[]);
  const actions=useRef({close,restore,changePhoto,setScale});actions.current={close,restore,changePhoto,setScale};
  const pan=useRef(PanResponder.create({
    onStartShouldSetPanResponder:()=>!life.current.closing&&!life.current.switching,
    onMoveShouldSetPanResponder:(event,g)=>!life.current.closing&&!life.current.switching&&((event.nativeEvent.touches?.length??0)>1||Math.abs(g.dx)>9||g.dy>9),
    onPanResponderGrant:event=>{const current=gesture.current;current.distance=touchDistance(event);current.startScale=current.scale;current.startX=current.x;current.startY=current.y;current.mode=current.distance?'pinch':current.scale>1.05?'pan':'';motion.current?.stop();reveal.setValue(1);backdrop.setValue(1);dragX.stopAnimation();dragY.stopAnimation();dismissX.stopAnimation();},
    onPanResponderMove:(event,g)=>{
      if(life.current.closing||life.current.switching)return;
      const current=gesture.current,distance=touchDistance(event);if(distance){if(current.mode!=='pinch'||!current.distance){current.distance=distance;current.startScale=current.scale;dragX.setValue(0);dragY.setValue(0);dismissX.setValue(0);backdrop.setValue(1);}current.mode='pinch';current.scale=clamp(current.startScale*distance/current.distance,1,4);zoom.setValue(current.scale);return;}
      if(current.mode==='pinch')return;
      if(current.mode==='pan'){const xBound=viewport.current.width*(current.scale-1)/2,yBound=viewport.current.height*(current.scale-1)/2;current.x=clamp(current.startX+g.dx,-xBound,xBound);current.y=clamp(current.startY+g.dy,-yBound,yBound);panX.setValue(current.x);panY.setValue(current.y);return;}
      // Decide only after intentional movement; a few horizontal pixels at
      // touch-down must not lock a downward pull into paging.
      if(!current.mode){if(g.dy>8&&g.dy>Math.abs(g.dx)*1.15){current.mode='vertical';dragX.setValue(0);Keyboard.dismiss();}else if(Math.abs(g.dx)>8&&Math.abs(g.dx)>Math.abs(g.dy)*1.15)current.mode='horizontal';else return;}
      if(current.mode==='horizontal'){const unavailable=(g.dx>0&&indexRef.current===0)||(g.dx<0&&indexRef.current>=latest.current.props.photos.length-1);dragX.setValue(g.dx*(unavailable?.25:1));}
      else{dragY.setValue(Math.max(0,g.dy));dismissX.setValue(g.dx*.6);backdrop.setValue(1-clamp(g.dy/Math.max(160,viewport.current.height*.6),0,1));}
    },
    onPanResponderRelease:(_,g)=>{const mode=gesture.current.mode;if(mode==='pinch'||mode==='pan'){actions.current.setScale(gesture.current.scale);return;}if(mode==='horizontal'){if(Math.abs(g.dx)>viewport.current.width*.2||Math.abs(g.vx)>.7)actions.current.changePhoto(g.dx<0?1:-1);else actions.current.restore();}else if(mode==='vertical'&&(g.dy>Math.min(110,viewport.current.height*.18)||(g.dy>25&&g.vy>.8)))actions.current.close(true);else actions.current.restore();},
    onPanResponderTerminate:()=>{actions.current.setScale(gesture.current.scale);actions.current.restore();},
    onPanResponderTerminationRequest:()=>false,
  })).current;
  useEffect(()=>helpDevActions('photo-preview',{'photo.preview.close':()=>close(),'photo.preview.next':()=>changePhoto(1),'photo.preview.previous':()=>changePhoto(-1),'photo.preview.toggle':toggle,'photo.preview.zoom':toggleZoom,'photo.preview.send':send,'photo.preview.caption':value=>{if(typeof value==='string')latest.current.props.onCaption(value);}}),[close,changePhoto,toggle,toggleZoom,send]);
  useEffect(()=>helpDevState({photoPreviewIndex:index,photoPreviewCount:props.photos.length,photoPreviewSelected:props.selectedIds.length,photoPreviewZoomed:zoomed,photoPreviewBusy:props.busy||pending}),[index,props.photos.length,props.selectedIds.length,zoomed,props.busy,pending]);
  const dismissRange=Math.max(160,stage.height*.6);
  // Opacity is independent of the return-to-tile geometry, so resetting dragY
  // during close cannot make an already transparent background flash dark.
  const opacity=backdrop;
  const origin=photo?.id===firstPhotoId.current&&props.origin&&props.origin.width>0&&props.origin.height>0?props.origin:undefined;
  const ratio=photo&&photo.width>0&&photo.height>0?photo.width/photo.height:stage.width/stage.height;
  const imageWidth=Math.min(stage.width,stage.height*ratio),imageHeight=Math.min(stage.height,stage.width/ratio);
  const originScale=origin?Math.min(origin.width/imageWidth,origin.height/imageHeight):.92;
  const button={width:48,height:48,borderRadius:24,alignItems:'center' as const,justifyContent:'center' as const};
  const busy=props.busy||pending,selectDisabled=busy||(Boolean(props.limitReached)&&selectedIndex<0);
  const sendCount=props.selectedIds.length||(photo?1:0);
  return <Modal transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={()=>close()}>
    <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{flex:1,overflow:'hidden'}}>
      <Animated.View testID="help-photo-preview-backdrop" pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:'#090B10',opacity}]}/>
      <Animated.View style={{paddingTop:insets.top+4,paddingHorizontal:12,flexDirection:'row',alignItems:'center',height:insets.top+56,zIndex:2,opacity}}>
        <Pressable accessibilityRole="button" accessibilityLabel="Закрыть просмотр фото" onPress={()=>close()} style={button}><Ionicons name="arrow-back" size={26} color="#FFF"/></Pressable><Text accessibilityLiveRegion="polite" style={{flex:1,color:'#FFF',fontSize:16,textAlign:'center'}}>{props.photos.length?index+1:0} из {props.photos.length}</Text>
        <Pressable testID="help-photo-preview-select" accessibilityRole="checkbox" accessibilityLabel={selectedIndex>=0?`Убрать фото из выбранных, номер ${selectedIndex+1}`:'Выбрать фото'} accessibilityState={{checked:selectedIndex>=0,disabled:selectDisabled}} disabled={selectDisabled} onPress={toggle} style={[button,{opacity:selectDisabled?.45:1}]}><View style={{width:29,height:29,borderRadius:15,borderWidth:2,borderColor:'#FFF',backgroundColor:selectedIndex>=0?c.accent:'transparent',alignItems:'center',justifyContent:'center'}}>{selectedIndex>=0?<Text style={{color:'#FFF',fontSize:16,fontWeight:'700'}}>{selectedIndex+1}</Text>:null}</View></Pressable>
      </Animated.View>
      <View testID="help-photo-preview-stage" onLayout={event=>{const layout=event.nativeEvent.layout;if(layout.width>0&&layout.height>0)setStage({width:layout.width,height:layout.height,y:layout.y});}} style={{flex:1,minHeight:100}}>
        <Animated.View testID="help-photo-preview-transition" collapsable={false} style={{flex:1,overflow:'hidden',opacity:origin?1:reveal,transform:[{translateX:Animated.add(dismissX,reveal.interpolate({inputRange:[0,1],outputRange:[origin?origin.x+origin.width/2-stage.width/2:0,0]}))},{translateY:Animated.add(dragY,reveal.interpolate({inputRange:[0,1],outputRange:[origin?origin.y+origin.height/2-stage.y-stage.height/2:0,0]}))},{scale:Animated.multiply(reveal.interpolate({inputRange:[0,1],outputRange:[originScale,1]}),dragY.interpolate({inputRange:[0,dismissRange],outputRange:[1,.56],extrapolate:'clamp'}))}]}}>
          <Animated.View style={{flex:1,transform:[{translateX:dragX}]}}>{props.photos.slice(Math.max(0,index-1),index+2).map((item,offset)=>{const itemIndex=Math.max(0,index-1)+offset,current=itemIndex===index;return <Animated.View testID="help-photo-preview-cell" key={item.id} pointerEvents="none" style={{position:'absolute',left:(itemIndex-index)*stage.width,top:0,width:stage.width,height:stage.height,transform:current?[{translateX:panX},{translateY:panY},{scale:zoom}]:identityPhotoTransform}}><Image testID={current?'help-photo-preview-image':undefined} source={{uri:item.uri}} recyclingKey={item.id} contentFit="contain" cachePolicy="memory-disk" priority={current?'high':'low'} style={StyleSheet.absoluteFill} accessibilityLabel={current?`Фото ${index+1}`:undefined} onLoad={()=>setLoadedIds(previous=>previous.includes(item.id)?previous:[...previous.slice(-19),item.id])} onError={()=>{if(latest.current.props.photos[indexRef.current]?.id===item.id)setError('Не удалось загрузить фото. Выберите другое или попробуйте позже.');}}/></Animated.View>;})}</Animated.View>
        </Animated.View>
        {photo&&!loadedIds.includes(photo.id)&&!error?<View pointerEvents="none" testID="help-photo-preview-loading" style={[StyleSheet.absoluteFill,{alignItems:'center',justifyContent:'center'}]}><ActivityIndicator color="#FFF"/></View>:null}
        {/* A real native touch surface above Expo Image owns the drag from
            touch-down. Paging buttons are later siblings and remain clickable. */}
        <View testID="help-photo-preview-gesture" collapsable={false} pointerEvents="box-only" {...pan.panHandlers} style={StyleSheet.absoluteFill}/>
        {props.photos.length>1?<Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill,{opacity}]}><Pressable accessibilityRole="button" accessibilityLabel="Предыдущее фото" disabled={index===0} onPress={()=>changePhoto(-1)} style={[button,{position:'absolute',left:4,top:'50%',marginTop:-24,backgroundColor:'#00000033',opacity:index===0?0:1}]}><Ionicons name="chevron-back" size={26} color="#FFF"/></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Следующее фото" disabled={index>=props.photos.length-1} onPress={()=>changePhoto(1)} style={[button,{position:'absolute',right:4,top:'50%',marginTop:-24,backgroundColor:'#00000033',opacity:index>=props.photos.length-1?0:1}]}><Ionicons name="chevron-forward" size={26} color="#FFF"/></Pressable></Animated.View>:null}
      </View>
      <Animated.View style={{paddingHorizontal:12,paddingTop:8,paddingBottom:Math.max(12,insets.bottom),zIndex:2,opacity}}>
        {props.error||error?<Text accessibilityRole="alert" style={{color:'#FF9393',fontSize:13,marginBottom:8}}>{props.error||error}</Text>:null}
        <View style={{flexDirection:'row',alignItems:'flex-end',gap:8}}><TextInput testID="help-photo-preview-caption" accessibilityLabel="Подпись к выбранным фото" placeholder="Добавить подпись…" placeholderTextColor="#B1BAC6" value={props.caption} onChangeText={props.onCaption} editable={!busy} multiline maxLength={8000} style={{flex:1,minHeight:48,maxHeight:128,borderRadius:24,paddingHorizontal:17,paddingTop:13,paddingBottom:13,backgroundColor:'#242D38',color:'#FFF',fontSize:16,textAlignVertical:'top'}}/><Pressable testID="help-photo-preview-send" accessibilityRole="button" accessibilityLabel={sendCount?`Отправить ${sendCount} фото`:'Отправить фото'} accessibilityState={{disabled:busy||!photo||Boolean(props.sendDisabled),busy}} disabled={busy||!photo||props.sendDisabled} onPress={()=>void send()} style={[button,{backgroundColor:c.accent,opacity:busy||props.sendDisabled?.65:1}]}>{busy?<ActivityIndicator color="#FFF"/>:<Ionicons name="arrow-up" size={22} color="#FFF"/>}{sendCount>0?<View testID="help-photo-preview-send-count" style={{position:'absolute',right:-2,top:-5,minWidth:20,height:20,paddingHorizontal:4,borderRadius:10,backgroundColor:'#FFF',alignItems:'center',justifyContent:'center'}}><Text style={{color:c.accent,fontSize:12,fontWeight:'700'}}>{sendCount}</Text></View>:null}</Pressable></View>
      </Animated.View>
    </KeyboardAvoidingView>
  </Modal>;
}
