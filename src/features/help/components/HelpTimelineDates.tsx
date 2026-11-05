import React, {useMemo} from 'react';
import {Animated, View} from 'react-native';
import {HelpDateSeparator} from './HelpTimelineIndicators';

export const HELP_DATE_PILL_HEIGHT = 24;
export const helpDatePinTop = (headerHeight:number) => Math.max(0,headerHeight-12);
export type HelpDateMarker = {key:string;date:string;y:number;nextY?:number;hidden:boolean};
export type HelpDatePresentation = {markers:readonly HelpDateMarker[];scrollOffset:Animated.Value};

/** The same pill follows the scroll, sticks, then is pushed away by the next day. */
export function helpDateMotion(marker:Pick<HelpDateMarker,'y'|'nextY'>,top:number) {
  const pin=marker.y-top;
  if(marker.nextY===undefined)return {inputRange:[pin-1,pin],outputRange:[1,0],extrapolateRight:'clamp' as const};
  const push=Math.max(pin,marker.nextY-top-HELP_DATE_PILL_HEIGHT);
  // Adjacent short/estimated rows can meet at the pin point. Interpolation
  // ranges must remain strictly increasing even while FlashList measures them.
  return push>pin
    ? {inputRange:[pin-1,pin,push,push+HELP_DATE_PILL_HEIGHT],outputRange:[1,0,0,-HELP_DATE_PILL_HEIGHT]}
    : {inputRange:[pin-1,pin,pin+HELP_DATE_PILL_HEIGHT],outputRange:[1,0,-HELP_DATE_PILL_HEIGHT]};
}

const DateMarker=React.memo(function DateMarker({marker,scrollOffset,top,onPress}:{marker:HelpDateMarker;scrollOffset:Animated.Value;top:number;onPress:(date:string)=>void}) {
  const translateY=useMemo(()=>scrollOffset.interpolate(helpDateMotion(marker,top)),[scrollOffset,marker.y,marker.nextY,top]);
  return <Animated.View testID="help-moving-date" accessibilityElementsHidden={marker.hidden} importantForAccessibility={marker.hidden?'no-hide-descendants':'auto'} pointerEvents="box-none" style={{position:'absolute',top:0,left:0,right:0,transform:[{translateY}]}}>
    <HelpDateSeparator compact date={marker.date} onPress={()=>onPress(marker.date)}/>
  </Animated.View>;
});

/** Lives above the header's blur target. No fades, timers or reparenting at the pin boundary. */
export function HelpTimelineDates({presentation,headerHeight,bottom,onPress}:{presentation:HelpDatePresentation;headerHeight:number;bottom:number;onPress:(date:string)=>void}) {
  const top=helpDatePinTop(headerHeight);
  return <View testID="help-date-layer" pointerEvents="box-none" style={{position:'absolute',top,left:0,right:0,bottom,overflow:'hidden',zIndex:3}}>
    {presentation.markers.map(marker=><DateMarker key={marker.key} marker={marker} scrollOffset={presentation.scrollOffset} top={top} onPress={onPress}/>)}
  </View>;
}
