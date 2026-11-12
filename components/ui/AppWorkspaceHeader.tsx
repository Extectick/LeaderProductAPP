import React from 'react';
import {Text,View} from 'react-native';
import {APP_TOOLBAR_LAYOUT as layout} from './appToolbarLayout';

export type AppWorkspaceHeaderProps={
  colors:{panel:string;text:string;muted:string};
  children?:React.ReactNode;
  leading?:React.ReactNode;
  trailing?:React.ReactNode;
  footer?:React.ReactNode;
  title?:string;
  eyebrow?:string;
  reserveEyebrow?:boolean;
  eyebrowInset?:number;
  contentSurface?:'pill'|'plain';
  surfaceRef?:React.Ref<View>;
  ids?:{root?:string;content?:string;eyebrow?:string};
};

/** Shared toolbar presentation; each service owns its controls and status. */
export function AppWorkspaceHeader({colors:c,children,leading,trailing,footer,title,eyebrow,reserveEyebrow=false,eyebrowInset=16,contentSurface='pill',surfaceRef,ids}:AppWorkspaceHeaderProps){
  return <View ref={surfaceRef} testID={ids?.root} style={{paddingHorizontal:layout.inset,paddingTop:eyebrow||reserveEyebrow?eyebrowInset:layout.top,paddingBottom:layout.bottom}}>
    {eyebrow?<Text testID={ids?.eyebrow} style={{position:'absolute',top:0,left:layout.inset+4,color:c.muted,fontSize:9,lineHeight:12,includeFontPadding:false,opacity:.75}}>{eyebrow}</Text>:null}
    <View style={{flexDirection:'row',alignItems:'center',gap:layout.gap}}>
      {leading}
      <View testID={ids?.content} style={{flex:1,minWidth:0,height:layout.actionSize,borderRadius:layout.actionSize/2,flexDirection:'row',alignItems:'center',backgroundColor:contentSurface==='plain'?'transparent':c.panel,paddingHorizontal:contentSurface==='plain'?0:14}}>
        {title===undefined?children:<Text accessibilityRole="header" numberOfLines={1} style={{flex:1,textAlign:'center',fontSize:17,fontWeight:'600',color:c.text}}>{title}</Text>}
      </View>
      {trailing}
    </View>
    {footer}
  </View>;
}
