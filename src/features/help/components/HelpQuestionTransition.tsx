import React,{useEffect,useLayoutEffect,useRef} from 'react';
import {Dimensions,type LayoutChangeEvent} from 'react-native';
import Reanimated,{cancelAnimation,Easing,useAnimatedStyle,useSharedValue,withTiming} from 'react-native-reanimated';
import {useHelpReducedMotion} from '../helpTheme';

/** Horizontal presentation only; the existing reveal/dock still owns height. */
export function HelpQuestionTransition({index,identity,children}:{index:number;identity:string;children:React.ReactNode}) {
  const reduced=useHelpReducedMotion();
  const x=useSharedValue(0),width=useRef(Math.max(1,Dimensions.get('window').width));
  const previous=useRef({index,identity});
  useLayoutEffect(()=>{
    const before=previous.current;previous.current={index,identity};
    cancelAnimation(x);
    if(reduced || index===before.index){x.value=0;return;}
    // Next enters from the right and moves left; Back does the reverse.
    // There is only the current interactive tree, never an outgoing ghost.
    x.value=(index>before.index?1:-1)*width.current;
    x.value=withTiming(0,{duration:200,easing:Easing.out(Easing.cubic)});
  },[index,identity,reduced,x]);
  useEffect(()=>()=>cancelAnimation(x),[x]);
  const motion=useAnimatedStyle(()=>({transform:[{translateX:x.value}]}));
  const measure=(event:LayoutChangeEvent)=>{
    const next=event.nativeEvent.layout.width;
    if(Number.isFinite(next)&&next>0)width.current=next;
  };
  return <Reanimated.View testID="help-question-transition" onLayout={measure} style={motion}>{children}</Reanimated.View>;
}
