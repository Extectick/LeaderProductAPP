import React from 'react';
import {StyleSheet,View,type LayoutChangeEvent} from 'react-native';

export type AppHeaderOverlayProps={
  children:React.ReactNode;
  backdrop:React.ReactNode;
  topInset?:number;
  id?:string;
  backdropId?:string;
  onLayout?:(event:LayoutChangeEvent)=>void;
};

/** The same floating header and blur extent for service pages and viewers. */
export function AppHeaderOverlay({children,backdrop,topInset=0,id,backdropId,onLayout}:AppHeaderOverlayProps){
  return <View testID={id} onLayout={onLayout} style={{position:'absolute',top:0,left:0,right:0,zIndex:2,paddingTop:topInset}}>
    <View testID={backdropId} pointerEvents="none" style={[StyleSheet.absoluteFill,{bottom:-36}]}>{backdrop}</View>
    {children}
  </View>;
}
