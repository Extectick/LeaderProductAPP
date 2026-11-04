import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

export type HelpPhotoRect = {x:number;y:number;width:number;height:number};
type PortalContext = {frame:HelpPhotoRect;headerHeight:number;blurTarget?:React.RefObject<View|null>;setFullscreen:(id:string,active:boolean)=>void;put:(id:string,node:React.ReactNode)=>void;remove:(id:string)=>void};
const Context=createContext<PortalContext|null>(null);

/** Place inside the same native window as the picker; native Modal windows need their own host. */
export function HelpPhotoPortalProvider({children,headerHeight=0,foreground,blurTarget}:{children:React.ReactNode;headerHeight?:number;foreground?:React.ReactNode;blurTarget?:React.RefObject<View|null>}) {
  const size=useWindowDimensions(),host=useRef<View>(null);
  const [frame,setFrame]=useState<HelpPhotoRect>({x:0,y:0,width:size.width,height:size.height});
  const [entries,setEntries]=useState<Record<string,React.ReactNode>>({});
  const [fullscreen,setFullscreenEntries]=useState<Record<string,boolean>>({});
  const setFullscreen=useCallback((id:string,active:boolean)=>setFullscreenEntries(previous=>{
    if(Boolean(previous[id])===active)return previous;
    const next={...previous};if(active)next[id]=true;else delete next[id];return next;
  }),[]);
  const put=useCallback((id:string,node:React.ReactNode)=>setEntries(previous=>previous[id]===node?previous:{...previous,[id]:node}),[]);
  const remove=useCallback((id:string)=>setEntries(previous=>{if(!(id in previous))return previous;const next={...previous};delete next[id];return next;}),[]);
  const measure=useCallback(()=>host.current?.measureInWindow((x,y,width,height)=>{if(width>0&&height>0)setFrame(previous=>previous.x===x&&previous.y===y&&previous.width===width&&previous.height===height?previous:{x,y,width,height});}),[]);
  const value=useMemo(()=>({frame,headerHeight,blurTarget,setFullscreen,put,remove}),[frame,headerHeight,blurTarget,setFullscreen,put,remove]);
  return <Context.Provider value={value}><View ref={host} collapsable={false} onLayout={measure} style={{flex:1}}>{children}<View testID="help-photo-portal-host" pointerEvents="box-none" style={[StyleSheet.absoluteFill,{zIndex:1000}]}>{Object.entries(entries).map(([id,node])=><React.Fragment key={id}>{node}</React.Fragment>)}</View>{foreground&&!Object.keys(fullscreen).length?<View testID="help-photo-foreground" pointerEvents="box-none" style={[StyleSheet.absoluteFill,{zIndex:1001}]}>{foreground}</View>:null}</View></Context.Provider>;
}

export function useHelpPhotoPortalFrame(){return useContext(Context)?.frame;}
export function useHelpPhotoHeaderHeight(){return useContext(Context)?.headerHeight??0;}
export function useHelpPhotoBlurTarget(){return useContext(Context)?.blurTarget;}
export function useHelpPhotoFullscreen(id:string,active:boolean){
  const setFullscreen=useContext(Context)?.setFullscreen;
  useLayoutEffect(()=>{setFullscreen?.(id,active);return()=>setFullscreen?.(id,false);},[setFullscreen,id,active]);
}
export function HelpPhotoPortal({id,children}:{id:string;children:React.ReactNode}) {
  const context=useContext(Context);
  useLayoutEffect(()=>{context?.put(id,children);},[context?.put,id,children]);
  useLayoutEffect(()=>()=>context?.remove(id),[context?.remove,id]);
  return context?null:<>{children}</>;
}
