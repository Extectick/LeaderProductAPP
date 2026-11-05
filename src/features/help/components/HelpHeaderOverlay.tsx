import React from 'react';
import {StyleSheet,View,type LayoutChangeEvent} from 'react-native';
import {HelpBlurSurface} from './HelpPrimitives';

/** One floating header material for the ticket list, chat and every viewer. */
export function HelpHeaderOverlay({children,target,topInset=0,id,backdropId,onLayout}:{
 children:React.ReactNode;target:React.RefObject<View|null>;topInset?:number;
 id:string;backdropId?:string;onLayout?:(event:LayoutChangeEvent)=>void;
}){
 return <View testID={id} onLayout={onLayout} style={{position:'absolute',top:0,left:0,right:0,zIndex:2,paddingTop:topInset}}>
  <View testID={backdropId} pointerEvents="none" style={[StyleSheet.absoluteFill,{bottom:-36}]}><HelpBlurSurface target={target} edge="bottom"/></View>
  {children}
 </View>;
}
