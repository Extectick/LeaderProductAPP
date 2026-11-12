import React,{useCallback,useEffect,useRef,useState} from 'react';
import {View,type ScrollViewProps} from 'react-native';
import {BottomSheetBackdrop,BottomSheetModal,BottomSheetScrollView,BottomSheetFlatList,type BottomSheetBackdropProps} from '@gorhom/bottom-sheet';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useHelpTheme} from '../help/helpTheme';
import {HELP_VIEWER_HEADER_HEIGHT} from '../help/components/HelpViewerLayout';
import {EntityCardViewer} from './EntityCardViewer';
import {EntityCardBody} from './EntityCardBody';
import type {EntityCardHostProps} from './EntityCardHost.types';
import {EntityCardPortalContext,useEntityCardPortalContext} from './EntityCardPortalContext';

const EntityScroll=BottomSheetScrollView as React.ComponentType<React.PropsWithChildren<ScrollViewProps>>;
/** Native sheet owns its pan/scroll animation; the Help timeline keeps its own geometry owner. */
export default function EntityCardHost(props:EntityCardHostProps){
 const portalContext=useEntityCardPortalContext();
 const c=useHelpTheme(),insets=useSafeAreaInsets(),modal=useRef<BottomSheetModal>(null),presented=useRef(false);
 const [menuOpen,setMenuOpen]=useState(false);
 const rendererOwnsScroll=['web','html'].includes(props.state.frames.at(-1)?.kind||'');
 const latest=useRef(props);latest.current=props;
 useEffect(()=>{
  if(latest.current.state.closing){latest.current.onDismiss();return;}
  modal.current?.present();presented.current=true;
  return()=>{modal.current?.dismiss();};
 },[]);
 useEffect(()=>{if(props.state.closing&&presented.current)modal.current?.dismiss();},[props.state.closing]);
 const renderBackdrop=useCallback((p:BottomSheetBackdropProps)=><BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.35} pressBehavior="none" onPress={()=>latest.current.onClose()}/>,[]);
 return <BottomSheetModal ref={modal} name="app-entity-card" index={0} snapPoints={['100%']} topInset={0}
  enableDynamicSizing={false} animateOnMount enablePanDownToClose enableDismissOnClose enableOverDrag={false} enableContentPanningGesture={!menuOpen&&!rendererOwnsScroll}
  keyboardBehavior="interactive" keyboardBlurBehavior="none" android_keyboardInputMode="adjustResize" enableBlurKeyboardOnGesture
  backdropComponent={renderBackdrop} handleComponent={null} onDismiss={props.onDismiss}
  backgroundStyle={{backgroundColor:c.background,borderTopLeftRadius:0,borderTopRightRadius:0}}>
  <EntityCardPortalContext value={portalContext}><View testID="entity-card-panel" style={{flex:1,backgroundColor:c.background}} accessibilityViewIsModal>
   <EntityCardViewer {...props} topInset={insets.top} bottomInset={insets.bottom} onMenuOpenChange={setMenuOpen}><EntityCardBody {...props} contentTopInset={HELP_VIEWER_HEADER_HEIGHT+insets.top} ScrollComponent={EntityScroll} ListComponent={BottomSheetFlatList}/></EntityCardViewer>
  </View></EntityCardPortalContext>
 </BottomSheetModal>;
}
