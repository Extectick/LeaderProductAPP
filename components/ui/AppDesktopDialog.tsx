import React,{useCallback,useEffect,useRef} from 'react';
import {Modal,Pressable,ScrollView,StyleSheet,Text,View,useWindowDimensions,type StyleProp,type ViewStyle} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useAppSurfaceTheme} from './appSurfaceTokens';
import {appWebControlContentProps,appWebControlProps} from './appWebInteraction';

export type AppDesktopDialogProps={
  visible?:boolean;
  title?:string;
  accessibilityLabel?:string;
  onClose:()=>void;
  children:React.ReactNode;
  maxWidth?:number;
  maxHeight?:number;
  height?:number;
  scrollable?:boolean;
  contentStyle?:StyleProp<ViewStyle>;
  footer?:React.ReactNode;
  showClose?:boolean;
  dismissDisabled?:boolean;
  initialFocusRef?:React.RefObject<{focus:()=>void}|null>;
  returnFocusRef?:React.RefObject<{focus:()=>void}|null>;
  testID?:string;
};

/** Desktop presentation shared by sheets and editors; callers retain their mobile presentation. */
export function AppDesktopDialog({visible=true,title,accessibilityLabel,onClose,children,maxWidth=480,maxHeight,height,
  scrollable=true,contentStyle,footer,showClose=true,dismissDisabled=false,initialFocusRef,returnFocusRef,testID='app-desktop-dialog'}:AppDesktopDialogProps){
  const c=useAppSurfaceTheme(),window=useWindowDimensions();
  const closed=useRef(false),latest=useRef({onClose,dismissDisabled});latest.current={onClose,dismissDisabled};
  useEffect(()=>{closed.current=false;},[visible]);
  const present=useRef(visible);
  useEffect(()=>{
    present.current=visible;
    if(!visible)return;
    return()=>{
      present.current=false;
      if(returnFocusRef)requestAnimationFrame(()=>{
        // An editor's expand trigger may disappear after shortening the draft.
        // Restore its still-mounted, enabled composer after Modal releases focus.
        const target=returnFocusRef.current as ({focus:()=>void;isConnected?:boolean;disabled?:boolean;readOnly?:boolean})|null;
        if(!present.current&&target&&target.isConnected!==false&&!target.disabled&&!target.readOnly)target.focus();
      });
    };
  },[visible,returnFocusRef]);
  const close=useCallback(()=>{if(closed.current||latest.current.dismissDisabled)return;closed.current=true;latest.current.onClose();},[]);
  if(!visible)return null;
  const availableHeight=Math.max(1,window.height-48),limit=Math.min(maxHeight??availableHeight,availableHeight);
  const bodyStyle=[{paddingHorizontal:24,paddingBottom:24},contentStyle];
  // RN-web Modal owns its topmost Escape handler, focus trap and return focus.
  // Keeping the backdrop out of tab order makes the close control the safe
  // initial focus for confirmations, before any potentially destructive action.
  return <Modal visible transparent animationType="none" accessibilityLabel={title??accessibilityLabel??'Диалог'} onRequestClose={close} onShow={()=>initialFocusRef?.current?.focus()}>
    <View testID={`${testID}-backdrop`} style={{flex:1,alignItems:'center',justifyContent:'center',padding:24,backgroundColor:c.dark?'#00000085':'#17203352'}}>
      <View testID={`${testID}-dismiss`} accessible={false} aria-hidden onPointerDown={close} style={StyleSheet.absoluteFill}/>
      <View testID={testID} style={{width:'100%',maxWidth,maxHeight:limit,height:height===undefined?undefined:Math.min(height,limit),minHeight:0,flexShrink:1,
        borderRadius:20,borderWidth:1,borderColor:c.line,backgroundColor:c.panel,overflow:'hidden',boxShadow:'0 24px 72px rgba(0,0,0,0.22)'}}>
        {title||showClose?<View style={{flexDirection:'row',alignItems:'center',minHeight:72,paddingLeft:24,paddingRight:16,paddingVertical:16,gap:16}}>
          {title?<Text accessibilityRole="header" style={{flex:1,minWidth:0,color:c.text,fontSize:20,lineHeight:27,fontWeight:'600'}}>{title}</Text>:<View style={{flex:1}}/>}
          {showClose?<Pressable {...appWebControlProps()} testID={`${testID}-close`} accessibilityRole="button" accessibilityLabel="Закрыть диалог" disabled={dismissDisabled} accessibilityState={{disabled:dismissDisabled}} onPress={close}
            style={({pressed})=>({width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:pressed?c.soft:'transparent',opacity:dismissDisabled?.4:1,flexShrink:0})}>
            <Ionicons {...appWebControlContentProps()} name="close-outline" size={23} color={c.muted}/>
          </Pressable>:null}
        </View>:null}
        {scrollable?<ScrollView testID={`${testID}-content`} keyboardShouldPersistTaps="handled" style={{minHeight:0,flexGrow:0,flexShrink:1,flexBasis:'auto'}} contentContainerStyle={bodyStyle}>{children}</ScrollView>
          :<View testID={`${testID}-content`} style={[{minHeight:0,flexShrink:1},bodyStyle,height!==undefined?{flex:1}:null]}>{children}</View>}
        {footer?<View testID={`${testID}-footer`} style={{padding:24,paddingTop:16,borderTopWidth:1,borderColor:c.line}}>{footer}</View>:null}
      </View>
    </View>
  </Modal>;
}
