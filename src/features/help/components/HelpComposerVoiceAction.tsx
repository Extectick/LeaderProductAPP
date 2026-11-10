import React from 'react';
import {Animated,Platform,type GestureResponderHandlers} from 'react-native';
import {appWebControlProps} from '@/components/ui/appWebInteraction';

/** One stable action owns the hold gesture and keyboard focus through record/lock/send.
 * RN-web maps role="button" to a real button, so its children must stay decorative. */
export function HelpComposerVoiceAction({panHandlers,label,sendAction,canStart,disabled,onStart,onSend,style,children}:{
 panHandlers:GestureResponderHandlers;label:string;sendAction:boolean;canStart:boolean;disabled:boolean;
 onStart:()=>void;onSend:()=>void;style:React.ComponentProps<typeof Animated.View>['style'];children:React.ReactNode;
}){
 const pointerAction=React.useRef<'record'|'send'|null>(null);
 const activate=()=>{if(!disabled){if(sendAction)onSend();else if(canStart)onStart();}};
 return <Animated.View {...panHandlers} {...appWebControlProps('filled')} testID="help-composer-voice-action"
  accessible accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}}
  onAccessibilityTap={activate}
  {...(Platform.OS==='web'?{
   'aria-disabled':disabled,
   tabIndex:disabled?-1:0,
   onPointerDown:()=>{pointerAction.current=sendAction?'send':'record';},
   onClick:(event:React.MouseEvent)=>{
    const startedAs=pointerAction.current;pointerAction.current=null;
    // Lock can change this same button before the initiating pointer is released.
    // That release finishes the record gesture, not a new press on Send.
    if(event.detail>0&&startedAs==='record')return;
    // Pointer hold/release belongs to PanResponder. A native button click sends;
    // a screen-reader-generated click may start recording without a pointer.
    if(sendAction||event.detail===0)activate();
   },
   onKeyDown:(event:React.KeyboardEvent)=>{
    if(!sendAction&&canStart&&(event.key==='Enter'||event.key===' ')&&!event.repeat){event.preventDefault();activate();}
   },
  }:{})} style={style}>{children}</Animated.View>;
}
