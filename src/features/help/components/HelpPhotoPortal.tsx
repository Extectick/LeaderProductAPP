import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

export type HelpPhotoRect = {x:number;y:number;width:number;height:number};
type PortalContext = {frame:HelpPhotoRect;put:(id:string,node:React.ReactNode)=>void;remove:(id:string)=>void};
const Context=createContext<PortalContext|null>(null);

/** Place inside the same native window as the picker; native Modal windows need their own host. */
export function HelpPhotoPortalProvider({children}:{children:React.ReactNode}) {
  const size=useWindowDimensions(),host=useRef<View>(null);
  const [frame,setFrame]=useState<HelpPhotoRect>({x:0,y:0,width:size.width,height:size.height});
  const [entries,setEntries]=useState<Record<string,React.ReactNode>>({});
  const put=useCallback((id:string,node:React.ReactNode)=>setEntries(previous=>previous[id]===node?previous:{...previous,[id]:node}),[]);
  const remove=useCallback((id:string)=>setEntries(previous=>{if(!(id in previous))return previous;const next={...previous};delete next[id];return next;}),[]);
  const measure=useCallback(()=>host.current?.measureInWindow((x,y,width,height)=>{if(width>0&&height>0)setFrame(previous=>previous.x===x&&previous.y===y&&previous.width===width&&previous.height===height?previous:{x,y,width,height});}),[]);
  const value=useMemo(()=>({frame,put,remove}),[frame,put,remove]);
  return <Context.Provider value={value}><View ref={host} collapsable={false} onLayout={measure} style={{flex:1}}>{children}<View testID="help-photo-portal-host" pointerEvents="box-none" style={[StyleSheet.absoluteFill,{zIndex:1000}]}>{Object.entries(entries).map(([id,node])=><React.Fragment key={id}>{node}</React.Fragment>)}</View></View></Context.Provider>;
}

export function useHelpPhotoPortalFrame(){return useContext(Context)?.frame;}
export function HelpPhotoPortal({id,children}:{id:string;children:React.ReactNode}) {
  const context=useContext(Context);
  useLayoutEffect(()=>{context?.put(id,children);},[context?.put,id,children]);
  useLayoutEffect(()=>()=>context?.remove(id),[context?.remove,id]);
  return context?null:<>{children}</>;
}
