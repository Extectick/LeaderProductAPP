/** Actual sidebar with fixture routing/access; never imported by the app. */
import React from 'react';
import {View,useWindowDimensions} from 'react-native';
import WebSidebar from '../../components/Navigation/WebSidebar';
import {appLayoutMode} from '../../src/shared/layout/appLayout';
export function ResponsivePreviewShell({children}:{children:React.ReactNode}){
  const layout=appLayoutMode(useWindowDimensions().width);
  return <View style={{flex:1,flexDirection:'row',minWidth:0}}>
    <View key="sidebar" style={{display:layout==='compact'?'none':'flex'}}><WebSidebar compact={layout!=='wide'} visible={layout!=='compact'}/></View>
    <View key="content" style={{flex:1,minWidth:0}}>{children}</View>
  </View>;
}
