import React, {createContext,forwardRef,useContext,useImperativeHandle,useState} from 'react';
import {Animated, View} from 'react-native';
import {HelpDateSeparator} from './HelpTimelineIndicators';
import {HelpDateScrollMotion,HelpDateScrollScope} from './HelpDateScrollMotion';

export const HELP_DATE_PILL_HEIGHT = 24;
export const helpDatePinTop = (headerHeight:number) => Math.max(0,headerHeight-12);
export type HelpDateMarker = {key:string;date:string;y:number;nextY?:number;hidden:boolean;pinned:boolean};
export type HelpDatePresentation = {markers:readonly HelpDateMarker[];scrollOffset:Animated.Value;scrollId:string};
export type HelpTimelineDatesHandle={update:(presentation:HelpDatePresentation|null)=>void};
export const HelpInlineDateContext=createContext<(HelpDatePresentation&{headerHeight:number})|null>(null);

/** Moving dates belong to the real cell, including native IME/tail and snapshots. */
export function HelpInlineDate({rowKey,date,retained=false,onPress}:{rowKey:string;date:string;retained?:boolean;onPress:()=>void}) {
  const presentation=useContext(HelpInlineDateContext);
  const marker=presentation?.markers.find(item=>item.key===rowKey);
  const pill=<HelpDateSeparator date={date} onPress={onPress}/>;
  if(retained||!presentation||!marker)return <View testID="help-inline-date">{pill}</View>;
  return <HelpDateScrollMotion mode="inline" marker={marker} top={helpDatePinTop(presentation.headerHeight)} scrollOffset={presentation.scrollOffset} scrollId={presentation.scrollId}>{pill}</HelpDateScrollMotion>;
}

const DateMarker=React.memo(function DateMarker({marker,presentation,top,onPress}:{marker:HelpDateMarker;presentation:HelpDatePresentation;top:number;onPress:(date:string)=>void}) {
  return <HelpDateScrollMotion mode="pinned" marker={marker} scrollOffset={presentation.scrollOffset} scrollId={presentation.scrollId} top={top}>
    <HelpDateSeparator compact date={marker.date} onPress={()=>onPress(marker.date)}/>
  </HelpDateScrollMotion>;
});

/** Only pinned dates live above the blur. The scrolling originals stay in their cells. */
export function HelpTimelineDates({presentation,headerHeight,bottom,onPress}:{presentation:HelpDatePresentation;headerHeight:number;bottom:number;onPress:(date:string)=>void}) {
  const top=helpDatePinTop(headerHeight);
  return <HelpDateScrollScope scrollId={presentation.scrollId}><View testID="help-date-layer" pointerEvents="box-none" style={{position:'absolute',top,left:0,right:0,bottom,overflow:'hidden',zIndex:3}}>
    {presentation.markers.map(marker=><DateMarker key={marker.key} marker={marker} presentation={presentation} top={top} onPress={onPress}/>)}
  </View></HelpDateScrollScope>;
}

/** Measurements update this leaf, without rerendering the chat/composer tree. */
export const HelpTimelineDatesHost=forwardRef<HelpTimelineDatesHandle,{headerHeight:number;bottom:number;hidden?:boolean;onPress:(date:string)=>void}>(function HelpTimelineDatesHost({hidden,...props},ref){
  const [presentation,setPresentation]=useState<HelpDatePresentation|null>(null);
  useImperativeHandle(ref,()=>({update:setPresentation}),[]);
  return !hidden&&presentation?<HelpTimelineDates {...props} presentation={presentation}/>:null;
});
