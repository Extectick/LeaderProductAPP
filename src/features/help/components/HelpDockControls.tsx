import React from 'react';
import {StyleSheet, View} from 'react-native';

/** A full-scene sibling keeps Android hit testing inside every ancestor's bounds.
 * The native chat layout copies the dock's IME translation onto this surface;
 * older clients use their settled inset without changing the dock's geometry. */
export function HelpDockControls({nativeID, nativeSynced, dockHeight, imeInset, children}: {
  nativeID:string; nativeSynced:boolean; dockHeight:number; imeInset:number; children:(bottom:number)=>React.ReactNode;
}) {
  const bottom=Math.max(0,dockHeight)+(nativeSynced?0:Math.max(0,imeInset))+12;
  return <View testID="help-dock-controls" nativeID={nativeID} collapsable={false} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    {children(bottom)}
  </View>;
}
