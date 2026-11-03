import React from 'react';
import {StyleSheet,Text,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppEdgeBlur,useScreenBlurTarget} from '@/components/ui/AppScreenBlur';
import {APP_TOOLBAR_LAYOUT} from '@/components/ui/appToolbarLayout';
import {useHelpTheme} from '../../help/helpTheme';

export const ADMIN_HEADER_HEIGHT=110;

/** Directory, section lists and full-screen cards share the same transparent edge. */
export function AdminSceneHeader({caption,children}:{caption:string;children:React.ReactNode}) {
  const t=useHelpTheme(),insets=useSafeAreaInsets(),target=useScreenBlurTarget();
  return <View testID="admin-scene-header" style={[s.header,{paddingTop:insets.top+16}]}>
    <AppEdgeBlur target={target} edge="bottom" backgroundColor={t.background} dark={t.dark}/>
    <Text style={[s.caption,{color:t.muted}]}>{caption}</Text>
    <View style={s.toolbar}>{children}</View>
  </View>;
}

const s=StyleSheet.create({
  header:{position:'absolute',top:0,left:0,right:0,paddingHorizontal:APP_TOOLBAR_LAYOUT.inset,paddingBottom:12},
  caption:{fontSize:12,lineHeight:18,marginLeft:2,marginBottom:16},
  toolbar:{flexDirection:'row',alignItems:'center',gap:APP_TOOLBAR_LAYOUT.gap},
});
