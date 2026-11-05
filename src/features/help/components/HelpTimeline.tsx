import React, {forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Easing, Platform, ScrollView, type ScrollViewProps, View, type ViewProps, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { FlashList, type FlashListRef, type ListRenderItem } from '@shopify/flash-list';
import Reanimated,{cancelAnimation,Easing as UiEasing,runOnUI,useAnimatedStyle,useSharedValue,withTiming} from 'react-native-reanimated';
import type { HelpMessage } from '../helpApi';
import type {HelpPending} from '../helpDurableTypes';
import type { HelpNavigationTarget, HelpViewportAnchor } from '../helpHistoryTypes';
import { helpTimelineRows, helpVisibleRows, helpNavigationIndex, helpTimelineRowType, type HelpTimelineRow } from '../helpTimelineModel';
import { helpDateJumpMode } from '../helpDateNavigation';
import { helpDevActions, helpDevEvent, helpDevProbe, helpDevState } from '../helpDiagnostics';
import { helpDayKey } from '../helpUiUtils';
import { createHelpImageCache, HelpImageCacheContext, HelpMediaLoadingContext } from '../helpMediaLoading';
import { useHelpReducedMotion, useHelpTheme } from '../helpTheme';
import { HelpDateSeparator, HelpUnreadSeparator, HelpHistoryStatus, HelpJumpToLatest } from './HelpTimelineIndicators';
import {HelpTimelineDates,helpDatePinTop,HELP_DATE_PILL_HEIGHT,type HelpDateMarker,type HelpDatePresentation} from './HelpTimelineDates';
import { hasNativeChatLayout, hasNativeAtomicTailMotion } from './HelpNativeChatLayout';
import { HELP_COMPOSER_ACTION_RIGHT } from '../helpLayout';
import { HELP_LATEST_SCROLL_BEZIER, helpLatestNavigationMotion, hiddenHelpLatest, updateHelpLatestAffordance } from '../helpJumpToLatestModel';
import {HelpMessageArrival,HelpMessageArrivalContext,HelpArrivalGeometryContext,helpArrivalIdentity} from './HelpMessageArrival';
import {HELP_TAIL_MOTION,helpTailDisplacement,helpTailMotionLimit,helpTailHistoryChange,type HelpTailGeometry} from '../helpTailMotion';

function ClippedHelpDate({rowKey,date,retained,onPress}:{rowKey:string;date:string;retained:boolean;onPress:()=>void}){
  // Preserve FlashList's measured row and anchor. Its visible pill has one
  // permanent owner in the date layer, both before and after it sticks.
  return <View testID="help-inline-date-clip" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{opacity:0}}><HelpDateSeparator date={date}/></View>;
}
export type HelpTimelineHandle = {
  save: () => void;
  prepareJump: (sequence?: number) => boolean;
  waitForJumpReady: () => Promise<boolean>;
  cancelJump: () => void;
  jumpToDate: (date?: string) => void;
  scrollTo: (params: {y: number; animated?: boolean}) => void;
  scrollToEnd: (params?: {animated?: boolean}) => void;
};
export type HelpLatestControlState={visible:boolean;count:number;loading:boolean};
type Props = {
  obscuredBottom?:{current:number};
  pendingMessages?:readonly HelpPending[]; renderPending?:(item:HelpPending)=>React.ReactElement;
  messages: HelpMessage[]; nativeID: string; headerHeight: number; dockHeight: number;
  navigationTarget?: HelpNavigationTarget | null; firstUnreadSequence?: number | null;
  hasOlder?: boolean; hasNewer?: boolean; loadingOlder?: boolean; loadingNewer?: boolean;
  loading?: boolean; online: boolean; active: boolean; unreadCount?: number;
  hideLatestButton?: boolean;
  onLatestState?:(state:HelpLatestControlState)=>void;
  hideStickyDate?: boolean;
  /** Defer offscreen work until the parent scene finishes its entrance. */
  entrySettled?: boolean;
  onHistoryScroll?: (towardOlder:boolean) => void;
  onStickyDateChange?: (date: string | null) => void;
  onDatePresentationChange?: (presentation:HelpDatePresentation|null) => void;
  loadOlder: () => Promise<unknown>; loadNewer: () => Promise<unknown>;
  onLatest: () => Promise<unknown>; onSave: (anchor: HelpViewportAnchor, options?: {deferTrim?:boolean}) => unknown;
  onDate: (date: string) => Promise<unknown>;
  onUserScroll?: () => void;
  onRead: (sequence: number) => unknown; onFollow: (following: boolean) => void;
  onHighlight: (id: number) => void; onError: (message: string) => void;
  renderMessage: (message: HelpMessage) => React.ReactElement;
  onReady?: () => void;
  header?: React.ReactElement | null; footer?: React.ReactElement | null;
  bottomAligned?:boolean;
};
type MediaRange = {first: number; last: number};
type OutgoingViewport = {rows: {row: HelpTimelineRow; top: number; height: number}[]; direction: number; latest?: boolean; distance?: number; duration?: number};
const rowKey = (row: HelpTimelineRow) => row.key;
const rowType = helpTimelineRowType;

/** FlashList owns history anchors; native layout owns composer geometry only while following the tail. */
export const HelpTimeline = forwardRef<HelpTimelineHandle, Props>(function HelpTimeline(props, ref) {
  const c = useHelpTheme(), reduced = useHelpReducedMotion();
  const parentImageCache=useContext(HelpImageCacheContext);
  const localImageCache=useMemo(() => createHelpImageCache(), []);
  const imageCache=parentImageCache??localImageCache;
  const list = useRef<FlashListRef<HelpTimelineRow>>(null), live = useRef(props); live.current = props;
  const currentBottomInset=useCallback(()=>live.current.obscuredBottom?.current??live.current.dockHeight,[]);
  const rows = useMemo(() => helpTimelineRows(props.messages, props.firstUnreadSequence,props.pendingMessages), [props.messages, props.firstUnreadSequence,props.pendingMessages]);
  const rowsRef = useRef(rows); rowsRef.current = rows;
  const dateIndices=useMemo(()=>rows.flatMap((row,index)=>row.kind==='date'?[index]:[]),[rows]);
  const dateIndicesRef=useRef(dateIndices);dateIndicesRef.current=dateIndices;
  const dateScrollOffset=useRef(new Animated.Value(0)).current;
  const [dateMarkers,setDateMarkers]=useState<HelpDateMarker[]>([]);
  // Native snapshots match logical identities, never recycled View instances.
  // Preserve FlashList's root layout/ref/onLayout contract and stop native
  // traversal at the cell boundary instead of walking each message's children.
  const TailCell=useMemo(()=>forwardRef<View,ViewProps&{index:number}>(({index,...cellProps},cellRef)=><View {...cellProps} ref={cellRef} collapsable={false} nativeID={`${props.nativeID}:cell:${rowsRef.current[index]?.key??index}`}/>),[props.nativeID]);
  const tailShift=useSharedValue(0);
  const tailStyle=useAnimatedStyle(()=>({transform:[{translateY:tailShift.value}]}));
  const tailGeometry=useRef<HelpTailGeometry|null>(null),tailRevision=useRef({keys:[] as string[],last:'',history:false});
  const resetTailMotion=useCallback(()=>{
    if(hasNativeAtomicTailMotion)return;
    runOnUI(()=>{'worklet';cancelAnimation(tailShift);tailShift.value=0;})();
  },[tailShift]);
  useLayoutEffect(()=>{if(!props.active||reduced)resetTailMotion();},[props.active,reduced,resetTailMotion]);
  const hasImages = useMemo(() => props.messages.some(message => message.attachments?.some(attachment => attachment.kind==='IMAGE') || message.replyTo?.attachments?.some(attachment => attachment.kind==='IMAGE')), [props.messages]);
  const hasImagesRef = useRef(hasImages); hasImagesRef.current = hasImages;
  const [following, setFollowing] = useState(false), [ready, setReady] = useState(false), [loaded, setLoaded] = useState(false), [navigating,setNavigating] = useState(false);
  const [firstContentSettled,setFirstContentSettled]=useState(hasNativeAtomicTailMotion||!props.bottomAligned||rows.length>0);
  useLayoutEffect(()=>{
    if(firstContentSettled||!rows.length)return;
    let frame=0,previous='',stable=0;
    const deadline=Date.now()+600;
    const probe=()=>{
      const view=list.current,last=view?.getLayout(rowsRef.current.length-1);
      const offset=view?.getAbsoluteLastScrollOffset()??geometry.current.offset;
      const first=view?.getFirstItemOffset()??0;
      const expected=geometry.current.height-currentBottomInset()-12;
      const signature=JSON.stringify([last?.y,last?.height,last?.width,first,offset,expected]);
      stable=signature===previous?stable+1:0;previous=signature;
      // An empty FlashList can briefly expose estimated cell geometry on its
      // first insertion. Reveal only the settled tail, then run its arrival.
      // FlashList's cached absolute end may differ from native padding/clamp.
      // Wait for measured, stable geometry rather than an exact cached offset.
      const measured=last&&last.height>0&&(last.width??1)>0&&last.isHeightMeasured!==false;
      if((measured&&stable>=2&&geometry.current.height>0)||Date.now()>=deadline){setFirstContentSettled(true);return;}
      frame=requestAnimationFrame(probe);
    };
    frame=requestAnimationFrame(probe);
    return()=>cancelAnimationFrame(frame);
  },[firstContentSettled,rows.length,currentBottomInset]);
  const initialPosition = useRef<{ key: number; kind: HelpNavigationTarget['kind']; index: number; offset: number } | null>(null);
  if (!initialPosition.current && !loaded && rows.length && props.navigationTarget) {
    const target = props.navigationTarget;
    const index = helpNavigationIndex(rows,target);
    if (index >= 0) initialPosition.current = { key: target.key, kind: target.kind, index, offset: target.offset ?? 0 };
  }
  const itemStartOffset=useCallback(()=>{
    const view=list.current,first=view?.getFirstItemOffset()??0;
    if(!view||!rowsRef.current.length||!view.getLayout(0))return first;
    const window=view.getWindowSize?.(),content=view.getChildContainerDimensions?.();
    if(!window||!content)return first;
    // FlashList applies a separate margin to short bottom-aligned histories;
    // getFirstItemOffset() excludes it. Include the library's same margin in
    // visibility/anchor math, or an on-screen date gets a duplicate sticky pill.
    return first+Math.max(0,window.height-content.height-first);
  },[]);
  const shortCompleteHistory=useCallback(()=>{
    if(live.current.hasOlder||live.current.hasNewer||!rowsRef.current.length)return false;
    try{
      const view=list.current;if(!view?.getLayout(0))return false;
      const window=view.getWindowSize?.(),content=view.getChildContainerDimensions?.();
      return Boolean(window?.height&&content?.height&&content.height+(view.getFirstItemOffset?.()??0)<=window.height+.5);
    }catch{return false;}
  },[]);
  const readyNotified = useRef(false);
  const notifyReady = useCallback(() => {
    if (readyNotified.current) return;
    readyNotified.current = true;
    helpDevEvent('chat.open.readyToAnimate', { ticketId: live.current.messages[0]?.ticketId ?? null, at: Date.now() });
    live.current.onReady?.();
  }, []);
  // Reveal after the positioned list commits, rather than from onLoad itself.
  // The entry owns its reveal state, so this does not rerender the chat's rows.
  useLayoutEffect(() => { if (ready) notifyReady(); }, [ready,notifyReady]);
  const latestAffordance = useRef(hiddenHelpLatest());
  const [latestAvailable, setLatestAvailable] = useState(false);
  const mountedAt = useRef(Date.now()), openingReported = useRef(false);
  useEffect(() => {
    if (ready && rows.length && !openingReported.current) {
      openingReported.current = true;
      helpDevEvent('chat.open.visible', { ticketId: props.messages[0]?.ticketId ?? null, mountedAt: mountedAt.current, elapsedMs: Date.now() - mountedAt.current, rows: rows.length, target: props.navigationTarget?.kind ?? 'none' });
    }
  }, [ready, rows.length]);
  const [initialLoadingVisible,setInitialLoadingVisible]=useState(false);
  useEffect(()=>{
    setInitialLoadingVisible(false);
    if(ready||!props.loading&&!rows.length)return;
    // Local disk hydration should not flash a network loader for a single frame.
    const timer=setTimeout(()=>setInitialLoadingVisible(true),200);
    return()=>clearTimeout(timer);
  },[props.loading,rows.length,ready]);
  const readyRef = useRef(false), followingRef = useRef(false), mounted = useRef(true);
  const inheritedArrivals=useContext(HelpMessageArrivalContext),localArrivals=useRef(new Set<string>());
  const arrivalWater=useRef({initialized:false,sequence:0,hasNewer:false});
  const arrivalBatch=useMemo(()=>{
    const before=arrivalWater.current,sequence=props.messages.reduce((sequence,message)=>Math.max(sequence,message.sequence),before.sequence);
    const animate=before.initialized?!before.hasNewer&&!props.hasNewer&&!props.loadingNewer:Boolean(props.bottomAligned);
    return {keys:new Set(animate?props.messages.filter(message=>message.sequence>before.sequence).map(helpArrivalIdentity):[]),
      initialized:before.initialized||props.messages.length>0||!props.loading&&!props.bottomAligned,sequence,hasNewer:Boolean(props.hasNewer),expiresAt:Date.now()+600};
  },[props.messages,props.loading,props.hasNewer,props.loadingNewer,props.bottomAligned]);
  useLayoutEffect(()=>{arrivalWater.current=arrivalBatch;},[arrivalBatch]);
  const openingLayout = useRef({active:false,key:0,frame:0,passes:0,signature:'',aligned:'',requestedIndex:-1,tailId:null as number|null});
  const geometry = useRef({offset: 0, height: 0, content: 0});
  const [atHistoryStart, setAtHistoryStart] = useState(false);
  const lastAnchor = useRef<HelpViewportAnchor | null>(null), committedTarget = useRef<number | null>(null);
  const inNavigation = useRef(false), navigationGeneration = useRef(0), touched = useRef(false);
  const latestRequest = useRef(false);
  const dragging = useRef(false), momentum = useRef(false), userScrollSession=useRef(false), webIntent = useRef(0);
  const scrollFrames = useRef<{at:number;offset:number;content:number;following:boolean;dragging:boolean;momentum:boolean}[]>([]);
  const olderPending = useRef(false), newerPending = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null), readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transition = useRef(new Animated.Value(1)).current;
  const incomingTransition = useRef(new Animated.Value(1)).current;
  const [outgoing, setOutgoing] = useState<OutgoingViewport | null>(null);
  const [snapshotVisible, setSnapshotVisible] = useState(false);
  const snapshotPending = useRef<{snapshot: OutgoingViewport; promise: Promise<boolean>; resolve: (ready: boolean) => void} | null>(null);
  const outgoingRef = useRef(outgoing); outgoingRef.current = outgoing;
  const dateSnapshot = useRef<{rows:{row:HelpTimelineRow;top:number;height:number}[];loadedIds:Set<number>}|null>(null);
  const lastNavigationMode = useRef('none');
  const [currentDate, setCurrentDate] = useState('');
  const currentDateRef = useRef(currentDate); currentDateRef.current = currentDate;
  const lastDiagnosticAt=useRef(0);
  const [mediaRange,setMediaRange]=useState<MediaRange>({first:0,last:-1});
  const mediaRangeRef=useRef(mediaRange);mediaRangeRef.current=mediaRange;
  const mediaRangeAt=useRef(0);
  const updateMediaRange=useCallback((force=false)=>{
    // Text and voice do not depend on image priority. Avoid invalidating every
    // retained FlashList cell on scroll when the window has no image originals.
    if(!hasImagesRef.current || !list.current || (!force&&Date.now()-mediaRangeAt.current<120))return;
    mediaRangeAt.current=Date.now();
    const {startIndex:first,endIndex:last}=list.current.computeVisibleIndices();
    setMediaRange(previous=>previous.first===first&&previous.last===last?previous:{first,last});
  },[]);
  useEffect(()=>{updateMediaRange(true);},[rows,updateMediaRange]);
  const setFollow = useCallback((value: boolean) => {
    if (value) { latestAffordance.current = hiddenHelpLatest(); setLatestAvailable(false); }
    if(followingRef.current===value)return;
    followingRef.current = value; setFollowing(value); live.current.onFollow(value);
  }, []);
  const viewportRows = useCallback((includeDecor=false) => {
    const view = list.current;
    if (!view || !rowsRef.current.length) return [];
    const {startIndex, endIndex} = view.computeVisibleIndices();
    const first = itemStartOffset(), offset = view.getAbsoluteLastScrollOffset();
    const candidates = [];
    // FlashList may report the first message as its first visible item while
    // the shorter date/unread row immediately before it is still on screen.
    // Inspect adjacent decorations and clip by their actual visual bounds.
    const overscan=includeDecor?2:0;
    for (let index = Math.max(0, startIndex-overscan); index <= Math.min(endIndex+overscan, rowsRef.current.length - 1); index++) {
      const layout = view.getLayout(index);
      if (layout && (includeDecor || rowsRef.current[index].kind==='message')) candidates.push({row: rowsRef.current[index], top: layout.y + first - offset, height: layout.height});
    }
    return candidates;
  }, [itemStartOffset]);
  const visible = useCallback((includeDecor=false) => helpVisibleRows(viewportRows(includeDecor), live.current.headerHeight, geometry.current.height - currentBottomInset()), [viewportRows]);
  const measureDates=useCallback(()=>{
    const view=list.current;if(!view)return;
    try{
      const indices=dateIndicesRef.current,{startIndex,endIndex}=view.computeVisibleIndices();
      let first=0;while(first+1<indices.length&&indices[first+1]<=startIndex)first++;
      let end=first;while(end<indices.length&&indices[end]<=endIndex)end++;
      // Keep the preceding day and one upcoming day mounted across the handoff.
      // Layouts outside this small window are unnecessary even in long histories.
      first=Math.max(0,first-1);end=Math.min(indices.length,end+1);
      const start=itemStartOffset(),offset=view.getAbsoluteLastScrollOffset(),top=helpDatePinTop(live.current.headerHeight);
      const bottom=geometry.current.height-currentBottomInset();
      const pillY=(index:number)=>{const layout=view.getLayout(index);return layout&&layout.height>0?layout.y+start+(layout.height-HELP_DATE_PILL_HEIGHT)/2:undefined;};
      const markers:HelpDateMarker[]=[];
      for(let position=first;position<end;position++){
        const index=indices[position],y=pillY(index);if(y===undefined)continue;
        const nextY=position+1<indices.length?pillY(indices[position+1]):undefined;
        const shown=Math.min(Math.max(top,y-offset),nextY===undefined?Infinity:nextY-offset-HELP_DATE_PILL_HEIGHT);
        markers.push({key:rowsRef.current[index].key,date:rowsRef.current[index].date!,y,nextY,hidden:shown+HELP_DATE_PILL_HEIGHT<=top||shown>=bottom});
      }
      setDateMarkers(previous=>previous.length===markers.length&&previous.every((marker,index)=>{
        const next=markers[index];return marker.key===next.key&&marker.date===next.date&&marker.y===next.y&&marker.nextY===next.nextY&&marker.hidden===next.hidden;
      })?previous:markers);
      const current=markers.filter(marker=>marker.y-offset<=top).at(-1)?.date??'';
      setCurrentDate(previous=>previous===current?previous:current);
    }catch{
      // FlashList can commit before its layout manager/dimensions are ready.
      // Keep the last valid projection until the next measured commit.
    }
  },[itemStartOffset,currentBottomInset]);
  const save = useCallback((leaving=false) => {
    if (lastAnchor.current && readyRef.current && !inNavigation.current && (leaving || (!dragging.current && !momentum.current && Date.now()>=webIntent.current))) {
      // Leaving during a fling must persist its fresh anchor, but trimming the
      // mounted window is reserved for idle and must not create a new jump here.
      if(leaving)void live.current.onSave(lastAnchor.current,{deferTrim:true});
      else void live.current.onSave(lastAnchor.current);
    }
  }, []);
  const stopIdleSave = useCallback(() => {if(saveTimer.current){clearTimeout(saveTimer.current);saveTimer.current=null;}},[]);
  const settleScroll = useCallback(() => {
    stopIdleSave();
    if(dragging.current || momentum.current || Date.now()<webIntent.current || inNavigation.current || !readyRef.current)return;
    const userWasScrolling = userScrollSession.current;
    userScrollSession.current=false;
    const {content,offset,height}=geometry.current;
    // The 64dp affordance threshold must never own native scrolling. Only an
    // actual, settled bottom (or an explicit Latest action) can reacquire it.
    const atEnd=!live.current.hasNewer && content+(hasNativeChatLayout?currentBottomInset()+12:0)-offset-height<=2;
    // Content growth, AI replacement and composer collapse are not user intent
    // to leave the tail. Only a completed gesture may release/reacquire follow.
    if(userWasScrolling) setFollow(atEnd);
    if(lastAnchor.current)lastAnchor.current={...lastAnchor.current,atLatest:followingRef.current && !live.current.hasNewer};
    save();
  },[save,setFollow,stopIdleSave]);
  const scheduleIdleSave = useCallback(() => {
    stopIdleSave();
    if(!dragging.current && !momentum.current)saveTimer.current=setTimeout(settleScroll,Math.max(200,webIntent.current-Date.now()+20));
  },[settleScroll,stopIdleSave]);
  const observe = useCallback(() => {
    if (!readyRef.current || inNavigation.current) return;
    measureDates();
    const items = visible(), first = items[0];
    if (!first) return;
    lastAnchor.current = {messageId:first.row.message.id, sequence:first.row.message.sequence,
      offset:first.top - live.current.headerHeight, atLatest:followingRef.current && !live.current.hasNewer};
    scheduleIdleSave();
    // Debounce visibility, then inspect again: prefetch/rendering below the dock is never a read receipt.
    if (!readTimer.current) readTimer.current = setTimeout(() => {
      readTimer.current = null;
      if (!mounted.current || !live.current.active || inNavigation.current) return;
      const seen = visible();
      if (seen.length) void live.current.onRead(Math.max(...seen.map(item => item.row.message.sequence)));
    }, 350);
    if(Date.now()-lastDiagnosticAt.current>=200){lastDiagnosticAt.current=Date.now();helpDevState({timelineOffset:geometry.current.offset,timelineFirstSequence:first.row.message.sequence,
      timelineAnchorOffset:lastAnchor.current.offset,timelineAtLatest:lastAnchor.current.atLatest,
      timelineVisible:items.length,timelineWindow:rowsRef.current.length});}
  }, [scheduleIdleSave, visible, measureDates]);
  const cancelJump = useCallback(() => {
    if(latestRequest.current){inNavigation.current=false;setNavigating(false);}
    latestRequest.current=false;
    snapshotPending.current?.resolve(false); snapshotPending.current = null;
    transition.stopAnimation(); transition.setValue(1); incomingTransition.stopAnimation(); incomingTransition.setValue(1);
    setOutgoing(null); setSnapshotVisible(false); outgoingRef.current = null; dateSnapshot.current=null;
  }, [transition,incomingTransition]);
  const stageViewport = useCallback((snapshot: OutgoingViewport) => {
    snapshotPending.current?.resolve(false);
    let resolve!: (ready: boolean) => void;
    const promise = new Promise<boolean>(done => { resolve = done; });
    snapshotPending.current = { snapshot, promise, resolve };
    transition.stopAnimation(); transition.setValue(0); incomingTransition.stopAnimation(); incomingTransition.setValue(1);
    outgoingRef.current = snapshot; setSnapshotVisible(false); setOutgoing(snapshot);
  }, [transition,incomingTransition]);
  const waitForJumpReady = useCallback(() => {
    const pending = snapshotPending.current;
    return pending ? pending.promise.then(value => value && mounted.current && outgoingRef.current === pending.snapshot) : Promise.resolve(true);
  }, []);
  useEffect(() => {
    const pending = snapshotPending.current;
    if (!outgoing || pending?.snapshot !== outgoing) return;
    let second = 0, painted = 0;
    // Mount and lay out the outgoing copy while the original stays visible.
    // Only mutate the service window after the copy has reached a native frame.
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        if (snapshotPending.current !== pending || !mounted.current) return;
        setSnapshotVisible(true);
        painted = requestAnimationFrame(() => {
          if (snapshotPending.current === pending && mounted.current) { helpDevEvent('chat.jump.snapshotReady',{at:Date.now(),rows:pending.snapshot.rows.length}); pending.resolve(true); }
        });
      });
    });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); cancelAnimationFrame(painted); };
  }, [outgoing]);
  const takeScrollControl=useCallback(()=>{
    resetTailMotion();
    stopIdleSave();
    userScrollSession.current=true;
    touched.current=true;
    live.current.onUserScroll?.();
    if(inNavigation.current){++navigationGeneration.current;inNavigation.current=false;setNavigating(false);readyRef.current=true;setReady(true);}
    cancelJump();setFollow(false);
  },[cancelJump,setFollow,stopIdleSave,resetTailMotion]);
  const prepareJump = useCallback((sequence?: number) => {
    if(sequence===undefined){
      if(latestRequest.current||inNavigation.current)return false;
      const {content,offset,height}=geometry.current;
      const motion=helpLatestNavigationMotion({gap:content+(hasNativeChatLayout?currentBottomInset()+12:0)-offset-height,viewportHeight:height,hasNewer:Boolean(live.current.hasNewer),reducedMotion:reduced});
      if(readyRef.current&&motion.mode==='none'){latestAffordance.current=hiddenHelpLatest();setLatestAvailable(false);return false;}
      save();latestRequest.current=true;
      if(reduced||!readyRef.current)return true;
      const old=visible(true);
      if(old.length){
        resetTailMotion();inNavigation.current=true;setNavigating(true);setFollow(false);stopIdleSave();
        stageViewport({rows:old,direction:-1,latest:true,distance:motion.distance,duration:motion.duration});
      }
      return true;
    }
    save();
    if (reduced || !readyRef.current) return true;
    const old = visible(true);
    const target = rowsRef.current.findIndex(row => row.kind==='message' && row.message.sequence === sequence);
    const targetLayout = target >= 0 ? list.current?.getLayout(target) : undefined;
    const distance = targetLayout ? Math.abs(targetLayout.y + itemStartOffset() - geometry.current.offset) : Infinity;
    if (distance < geometry.current.height) return true;
    resetTailMotion();
    if (old.length) {
      const snapshot = {rows:old,direction:sequence !== undefined && sequence < old[0].row.message.sequence ? 1 : -1};
      stageViewport(snapshot);
    }
    return true;
  }, [reduced, save, stageViewport, visible,itemStartOffset,resetTailMotion,currentBottomInset,setFollow,stopIdleSave]);
  const jumpDate = useCallback((date = currentDateRef.current) => {
    if (!date) return;
    const day=helpDayKey(date),currentRows=rowsRef.current;
    const first=currentRows.findIndex(row=>row.kind==='message'&&helpDayKey(row.message.createdAt)===day);
    const previous=first>=0?currentRows.slice(0,first).filter(row=>row.kind==='message').at(-1):undefined;
    const boundaryKnown=first>=0&&(currentRows[first].message.sequence===1||Boolean(previous&&helpDayKey(previous.message.createdAt)!==day));
    const layout=boundaryKnown?list.current?.getLayout(first):undefined;
    if(layout&&helpDateJumpMode({targetTop:layout.y+itemStartOffset()-(list.current?.getAbsoluteLastScrollOffset()??geometry.current.offset),targetHeight:layout.height,viewportTop:live.current.headerHeight,viewportBottom:geometry.current.height-currentBottomInset()})==='visible'){
      // No save, snapshot, service lookup or follow change for the already
      // visible beginning of this day: even an immediately cancelled copy flashes.
      if(inNavigation.current||outgoingRef.current){++navigationGeneration.current;inNavigation.current=false;setNavigating(false);stopIdleSave();cancelJump();}
      return;
    }
    resetTailMotion();save();cancelJump();
    // Keep the old viewport while resolving the real first message of the day.
    // Merely tapping a date must not start a transition to a fictitious id 0.
    dateSnapshot.current={rows:visible(true),loadedIds:new Set(rowsRef.current.filter(row=>row.kind==='message').map(row=>row.message.id))};
    if (!reduced && dateSnapshot.current.rows.length) stageViewport({rows:dateSnapshot.current.rows,direction:1});
    void live.current.onDate(date).catch(error => { cancelJump(); live.current.onError(error instanceof Error ? error.message : 'Не удалось открыть сообщения за эту дату'); });
  }, [save,visible,cancelJump,reduced,stageViewport,itemStartOffset,currentBottomInset,resetTailMotion]);
  const renderRow = useCallback((row: HelpTimelineRow,index=rowsRef.current.indexOf(row),range=mediaRangeRef.current,retained=false) => row.kind==='date' ? <ClippedHelpDate rowKey={row.key} date={row.date!} retained={retained} onPress={()=>jumpDate(row.date!)}/> : row.kind==='unread' ? <HelpUnreadSeparator/> : <HelpMediaLoadingContext.Provider value={retained?'retained':index>=range.first&&index<=range.last?'visible':index>=range.first-4&&index<=range.last+4?'near':'deferred'}><HelpMessageArrival key={helpArrivalIdentity(row.message)} identity={helpArrivalIdentity(row.message)} distance={followingRef.current&&(hasNativeAtomicTailMotion||tailGeometry.current)?0:24} deferred={!retained&&!firstContentSettled} animate={!retained&&(row.kind==='pending'||Date.now()<=arrivalBatch.expiresAt&&arrivalBatch.keys.has(helpArrivalIdentity(row.message)))}><HelpArrivalGeometryContext.Provider value={!retained&&followingRef.current&&(hasNativeAtomicTailMotion||Boolean(tailGeometry.current))}>{row.kind==='pending'?props.renderPending?.(row.pending!):props.renderMessage(row.message)}</HelpArrivalGeometryContext.Provider></HelpMessageArrival></HelpMediaLoadingContext.Provider>, [jumpDate,props.renderMessage,props.renderPending,arrivalBatch.keys,firstContentSettled]);
  // Keep the renderer stable through viewport/date updates. Real visual changes
  // from the screen (selection, search, receipts) still replace renderMessage.
  const renderItem = useCallback<ListRenderItem<HelpTimelineRow>>(({item,index,extraData}) => renderRow(item,index,extraData as MediaRange), [renderRow]);
  const scrollEnd = useCallback((animated = false) => {
    const native = list.current?.getNativeScrollRef();
    if (hasNativeChatLayout && native?.scrollToEnd) native.scrollToEnd({animated});
    else list.current?.scrollToEnd({animated});
  }, []);
  const synchronizeTailMotion=useCallback(()=>{
    // v3 observes actual Android cells and pins/compensates before one draw.
    // Do not read estimated JS geometry or enqueue a second presentation clock.
    if(hasNativeAtomicTailMotion)return;
    const view=list.current;
    // The ref can precede FlashList's layout manager on a cold/empty mount.
    // getLayout is safe there; the dimension getters are not.
    const measured=(()=>{try{
      if(!view?.getLayout(0))return null;
      return {window:view.getWindowSize?.(),content:view.getChildContainerDimensions?.(),first:view.getFirstItemOffset?.()??0};
    }catch{return null;}})();
    if(!measured)return;
    const {window,content,first}=measured;
    if(!window||!content||!window.height||!content.height)return;
    const next={content:content.height,margin:Math.max(0,window.height-content.height-first),width:window.width,height:window.height};
    const keys=rowsRef.current.map(row=>row.key),lastKey=keys.at(-1)??'',previous=tailRevision.current;
    const historyChanged=helpTailHistoryChange(previous.keys,keys);
    tailRevision.current={keys,last:lastKey,history:historyChanged||previous.history&&previous.last===lastKey};
    if(tailGeometry.current&&(Math.abs(tailGeometry.current.width-next.width)>.5||Math.abs(tailGeometry.current.height-next.height)>.5))resetTailMotion();
    // Geometry, not text/type or a receipt timer, owns this motion. Late image
    // dimensions, voice controls and streamed text all lift the same viewport.
    const delta=helpTailDisplacement(tailGeometry.current,next,{active:!hasNativeAtomicTailMotion&&HELP_TAIL_MOTION.enabled&&live.current.active&&readyRef.current&&followingRef.current&&!inNavigation.current&&!dragging.current&&!momentum.current&&!live.current.hasNewer&&!live.current.loadingOlder&&!live.current.loadingNewer&&!reduced,liveGrowth:!tailRevision.current.history});
    tailGeometry.current=next;
    if(!delta)return;
    // Position the real scroll range first, then ease only its presentation.
    // Adding to the current UI value also covers a streamed reply growing again
    // before the previous shift finishes; older rows and the arrival share time.
    if(!hasNativeChatLayout)scrollEnd(false);
    runOnUI((distance:number,limit:number)=>{
      'worklet';
      tailShift.value=Math.max(-limit,Math.min(limit,tailShift.value+distance));
      tailShift.value=withTiming(0,{duration:HELP_TAIL_MOTION.durationMs,easing:UiEasing.out(UiEasing.cubic)});
    })(delta,helpTailMotionLimit(next.height));
    helpDevEvent('timeline.tailShift',{delta,native:hasNativeChatLayout,at:Date.now()});
  },[reduced,scrollEnd,tailShift,resetTailMotion]);
  useLayoutEffect(()=>{synchronizeTailMotion();},[rows,synchronizeTailMotion]);
  const pinLatest = useCallback((animated = false) => {
    resetTailMotion();
    const generation = ++navigationGeneration.current;
    const opening = !readyRef.current;
    inNavigation.current = false; setNavigating(false);
    userScrollSession.current = false; dragging.current = false; momentum.current = false; webIntent.current = 0;
    stopIdleSave(); cancelJump();
    if (!opening) { readyRef.current = true; setReady(true); }
    setFollow(!live.current.hasNewer);
    // Keep the native end anchor. scrollToIndex(last, viewPosition=0) would
    // first align the last cell at the top, then scroll a second time to its end.
    scrollEnd(animated);
    let lastHeight = -1, stable = 0, passes = 0;
    const finishLayout = () => {
      if (!mounted.current || generation !== navigationGeneration.current) return;
      const last = list.current?.getLayout(rowsRef.current.length - 1);
      const measuredEnd = last ? last.y + last.height : 0;
      stable = measuredEnd > 0 && Math.abs(measuredEnd - lastHeight) < .5 ? stable + 1 : 0;
      lastHeight = measuredEnd;
      const initiallyMeasured = initialPosition.current?.kind === 'latest' && measuredEnd > 0;
      if (opening && !initiallyMeasured && stable < 2 && ++passes < 8) { scrollEnd(false); requestAnimationFrame(finishLayout); return; }
      if (opening) helpDevEvent('chat.open.positioned', { target: 'latest', passes, elapsedMs: Date.now() - mountedAt.current });
      readyRef.current = true; setReady(true);
      setFollow(!live.current.hasNewer); if(!animated||opening)scrollEnd(false); updateMediaRange(true); observe();
    };
    requestAnimationFrame(finishLayout);
  }, [cancelJump,observe,scrollEnd,setFollow,stopIdleSave,updateMediaRange,resetTailMotion]);
  const animateLatest = useCallback(() => {
    const snapshot=outgoingRef.current;
    if(!snapshot?.latest||reduced||!readyRef.current){pinLatest(false);return;}
    const generation=++navigationGeneration.current;
    resetTailMotion();inNavigation.current=true;setNavigating(true);setFollow(false);
    userScrollSession.current=false;dragging.current=false;momentum.current=false;webIntent.current=0;stopIdleSave();
    const finish=()=>{
      if(!mounted.current||generation!==navigationGeneration.current)return;
      cancelJump();inNavigation.current=false;setNavigating(false);setFollow(!live.current.hasNewer);updateMediaRange(true);observe();
    };
    // Position behind the painted old viewport, then move both fragments with
    // one native-driver progress. Native follow/scroll springs cannot compete.
    void(async()=>{
      let previous=-1,stable=0;
      scrollEnd(false);
      for(let pass=0;pass<8;pass++){
        await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
        if(!mounted.current||generation!==navigationGeneration.current)return;
        const last=list.current?.getLayout(rowsRef.current.length-1),end=last?last.y+last.height:0;
        stable=end>0&&Math.abs(end-previous)<.5?stable+1:0;previous=end;
        scrollEnd(false);
        if(stable>=2)break;
      }
      updateMediaRange(true);
      helpDevEvent('timeline.latestMotion',{distance:snapshot.distance??0,duration:snapshot.duration??400,at:Date.now()});
      Animated.timing(transition,{toValue:1,duration:snapshot.duration??400,easing:Easing.bezier(...HELP_LATEST_SCROLL_BEZIER),useNativeDriver:true,isInteraction:false}).start(({finished})=>{if(finished)finish();});
    })().catch(()=>{finish();live.current.onError('Не удалось открыть последние сообщения');});
  },[reduced,pinLatest,resetTailMotion,setFollow,stopIdleSave,cancelJump,updateMediaRange,observe,scrollEnd,transition]);
  const settleOpening = useCallback(():void => {
    const pending=openingLayout.current;
    if(!pending.active||pending.frame)return;
    const step=()=>{
      pending.frame=0;
      const view=list.current,target=live.current.navigationTarget;
      if(!mounted.current||!pending.active||!view||!target||target.key!==pending.key){pending.active=false;return;}
      const index=helpNavigationIndex(rowsRef.current,target);
      if(index<0){pending.active=false;return;}
      const readLayout=(rowIndex:number)=>{try{return view.getLayout(rowIndex);}catch{return undefined;}};
      const item=readLayout(index),range=view.computeVisibleIndices();
      // Data can arrive after FlashList's empty onLoad. initialScrollIndex is
      // then already consumed: an offscreen saved anchor will never measure
      // until we explicitly bring its cell into the rendered window.
      if((!item||item.isHeightMeasured===false||item.height<=0)&&pending.requestedIndex!==index){
        pending.requestedIndex=index;
        void view.scrollToIndex({index,animated:false,viewOffset:target.kind==='latest'?0:-(live.current.headerHeight+(target.offset??0))})
          .then(()=>{if(mounted.current&&openingLayout.current.key===target.key)settleOpening();})
          .catch(()=>{if(mounted.current)live.current.onError('Не удалось восстановить позицию в истории. Откройте последние сообщения.');});
      }
      const visibleLayouts=[];
      const hasMeasurement=(layout:ReturnType<typeof readLayout>)=>Boolean(layout&&layout.height>=0&&layout.isHeightMeasured!==false&&(layout.height>0||layout.isHeightMeasured===true));
      let measured=hasMeasurement(item);
      for(let i=Math.max(0,range.startIndex);i<=Math.min(range.endIndex,rowsRef.current.length-1);i++){
        const layout=readLayout(i);visibleLayouts.push(layout?`${i}:${layout.y}:${layout.height}`:'pending');
        if(!hasMeasurement(layout))measured=false;
      }
      const {height,content}=geometry.current,inset=hasNativeChatLayout?currentBottomInset()+12:0;
      const end=Math.max(0,content+inset-height);
      const tailTarget=target.kind==='latest'||(target.kind==='anchor'||target.kind==='unread')&&shortCompleteHistory();
      const offset=tailTarget?end:Math.min(end,Math.max(0,(item?.y??0)+itemStartOffset()-live.current.headerHeight-(target.offset??0)));
      const signature=JSON.stringify([offset,item?.y,item?.height,height,content,live.current.headerHeight,currentBottomInset(),visibleLayouts]);
      if(measured&&height>0&&content>0&&pending.aligned!==signature){
        if(tailTarget)scrollEnd(false);
        else view.scrollToOffset({offset,animated:false,skipFirstItemOffset:true});
        pending.aligned=signature;
      }
      const tail=live.current.messages.at(-1);
      const liveTail=target.kind==='latest'&&(tail?.id!==pending.tailId||live.current.messages.some(message=>message.assistantRun&&['thinking','streaming'].includes(message.assistantRun.status)));
      const settled=pending.signature===signature&&Math.abs(view.getAbsoluteLastScrollOffset()-offset)<=1;
      // Native padding/scroll clamping can leave FlashList's offset cache behind
      // the actual viewport. A stable, fully measured and explicitly aligned
      // window must not wait forever for an offset notification that won't come.
      const alignedAndStable=pending.passes>=8&&pending.signature===signature&&pending.aligned===signature;
      // A short list is clamped at native offset zero. FlashList can still
      // report its initial-index offset after native bottom padding changes.
      // Once every visible row is measured, no offscreen anchor remains to resolve.
      const fits=content+inset<=height;
      // An active answer/new socket messages must not make opening wait for
      // the conversation to become idle. Hand its measured tail to native follow.
      if(measured&&height>0&&content>0&&(settled||alignedAndStable||(fits||liveTail||target.kind==='latest'&&hasNativeChatLayout)&&pending.passes>0&&pending.aligned)){
        pending.active=false;readyRef.current=true;setReady(true);inNavigation.current=false;setNavigating(false);
        setFollow(tailTarget&&!live.current.hasNewer);
        if(tailTarget)scrollEnd(false);
        if(target.kind==='message'&&target.messageId)live.current.onHighlight(target.messageId);
        helpDevEvent('chat.open.positioned',{target:target.kind,initialIndex:true,settlePasses:pending.passes,elapsedMs:Date.now()-mountedAt.current});
        updateMediaRange(true);observe();return;
      }
      pending.signature=measured?signature:'';
      if(pending.passes===31)helpDevEvent('chat.open.measurementPending',{target:target.kind,index,measured,itemMeasured:item?.isHeightMeasured!==false,itemHeight:item?.height??0,firstVisible:range.startIndex,lastVisible:range.endIndex,height,content});
      // Native measurement commits restart this bounded pump. Unmeasured
      // estimates never become permission to show an incorrectly placed window.
      if(++pending.passes%32!==0)pending.frame=requestAnimationFrame(step);
    };
    pending.frame=requestAnimationFrame(step);
  },[observe,scrollEnd,setFollow,updateMediaRange,itemStartOffset,currentBottomInset,shortCompleteHistory]);
  useImperativeHandle(ref, () => ({save:()=>save(true),prepareJump,cancelJump,jumpToDate:jumpDate,
    waitForJumpReady,scrollTo: ({y,animated}) => {resetTailMotion();touched.current=true;setFollow(false);list.current?.scrollToOffset({offset:y,animated,skipFirstItemOffset:true});},
    scrollToEnd: ({animated} = {}) => pinLatest(animated),
  }), [save,prepareJump,cancelJump,jumpDate,setFollow,pinLatest,waitForJumpReady,resetTailMotion]);

  const stickyDate = ready && !outgoing && currentDate ? currentDate : null;
  useEffect(() => { props.onStickyDateChange?.(stickyDate); }, [stickyDate, props.onStickyDateChange]);
  const datePresentation=useMemo<HelpDatePresentation|null>(()=>ready&&!outgoing&&dateMarkers.length?{markers:dateMarkers,scrollOffset:dateScrollOffset}:null,[ready,outgoing,dateMarkers,dateScrollOffset]);
  useLayoutEffect(()=>{props.onDatePresentationChange?.(datePresentation);},[props.onDatePresentationChange,datePresentation]);
  useLayoutEffect(()=>{if(ready)measureDates();},[ready,rows,props.headerHeight,props.dockHeight,measureDates]);
  // Seed once after opening. Later scroll positions belong exclusively to the
  // native event; JS measurements must not write stale offsets during a fling.
  useLayoutEffect(()=>{if(ready)dateScrollOffset.setValue(list.current?.getAbsoluteLastScrollOffset()??geometry.current.offset);},[ready,dateScrollOffset]);

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => {if(state !== 'active') save(true);});
    return () => {resetTailMotion();save(true);mounted.current=false;++navigationGeneration.current;subscription.remove();live.current.onStickyDateChange?.(null);live.current.onDatePresentationChange?.(null);
      if(saveTimer.current)clearTimeout(saveTimer.current);if(readTimer.current)clearTimeout(readTimer.current);cancelAnimationFrame(openingLayout.current.frame);openingLayout.current.active=false;transition.stopAnimation();incomingTransition.stopAnimation();snapshotPending.current?.resolve(false);};
  }, [save,transition,incomingTransition,resetTailMotion]);
  useEffect(() => {if(!props.active)save(true);else observe();}, [props.active,save,observe]);

  useLayoutEffect(() => {
    const target = props.navigationTarget;
    if (!loaded || !rows.length || !target || committedTarget.current === target.key) return;
    if(openingLayout.current.active&&openingLayout.current.key===target.key)return;
    const index = helpNavigationIndex(rows,target);
    if(index < 0) return;
    committedTarget.current=target.key;
    if(!readyRef.current&&target.kind!=='date'){
      resetTailMotion();
      inNavigation.current=true;
      Object.assign(openingLayout.current,{active:true,key:target.key,passes:0,signature:'',aligned:'',requestedIndex:-1,tailId:live.current.messages.at(-1)?.id??null});
      settleOpening();return;
    }
    if (target.kind === 'latest') {
      lastNavigationMode.current = 'latest';
      if(outgoingRef.current?.latest&&target.animate&&!reduced){animateLatest();return;}
      // Creation can bind the server ticket while its optimistic row already
      // follows the native tail. Re-pinning races the shrinking composer and
      // ScrollView's range reconciliation; retain the existing native owner.
      if(hasNativeChatLayout&&followingRef.current&&!live.current.hasNewer){cancelJump();observe();return;}
      pinLatest(false);return;
    }
    const targetLayout=list.current?.getLayout(index);
    const targetWasLoaded=!dateSnapshot.current || dateSnapshot.current.loadedIds.has(rows[index].message.id);
    const dateMode=target.kind==='date'?helpDateJumpMode({
      targetTop:targetWasLoaded&&targetLayout?targetLayout.y+itemStartOffset()-geometry.current.offset:undefined,
      targetHeight:targetLayout?.height,viewportTop:props.headerHeight,viewportBottom:geometry.current.height-props.dockHeight,
    }):null;
    lastNavigationMode.current=dateMode??target.kind;
    if(dateMode==='visible') {++navigationGeneration.current;inNavigation.current=false;setNavigating(false);stopIdleSave();cancelJump();observe();return;}
    resetTailMotion();
    if(dateMode==='near') cancelJump();
    if(dateMode==='far' && target.animate && !reduced && readyRef.current){
      const old=dateSnapshot.current?.rows??visible(true);
      if(old.length){const direction=rows[index].message.sequence<old[0].row.message.sequence?1:-1;
        if(outgoingRef.current){outgoingRef.current.direction=direction;setOutgoing({...outgoingRef.current});}
        else stageViewport({rows:old,direction});
      }
    }
    const generation=++navigationGeneration.current;
    inNavigation.current=true;setNavigating(true);setFollow(false);
    userScrollSession.current=false;dragging.current=false;momentum.current=false;
    stopIdleSave();
    // FlashList's animated index endpoint excludes the native composer inset.
    // Let its measurement settle without a competing fling, then pin native end.
    const animated=Boolean(target.animate && !reduced && readyRef.current && !outgoingRef.current);
    // A date row is 44dp with a centered 24dp pill. Leave its pill at the
    // same headerHeight-12 position as the floating date after a real jump.
    const targetOffset=target.offset??(target.kind==='date'?22:0);
    const opening = !readyRef.current, positioningAt = Date.now();
    void (async()=>{
      // FlashList uses positive viewOffset to move farther down. Saved offset is relative to the uncovered top.
      if(dateMode==='near' && targetLayout){
        const offset=Math.max(0,targetLayout.y+itemStartOffset()-props.headerHeight-targetOffset);
        // A measured nearby row needs one scroll, not FlashList's multi-pass
        // preparation for an unmeasured distant index.
        list.current?.scrollToOffset({offset,animated,skipFirstItemOffset:true});
        if(animated)await new Promise<void>(resolve=>setTimeout(resolve,300));
      }else await list.current?.scrollToIndex({index,animated,viewPosition:0,viewOffset:-(props.headerHeight+targetOffset)});
      const indexElapsedMs = Date.now() - positioningAt;
      let settlePasses = 0;
      if(!mounted.current || generation!==navigationGeneration.current)return;
      // Text wrapping and attachment aspect ratios can refine recycled row sizes
      // after scrollToIndex resolves. Hold the target through those layout commits.
      if(dateMode!=='near'){
        let previous=-1,stable=0;
        for(let pass=0;pass<12;pass++){
          settlePasses = pass + 1;
          await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
          if(!mounted.current || generation!==navigationGeneration.current)return;
          const currentIndex=rowsRef.current.findIndex(row=>row.key===rows[index].key);
          const layout=currentIndex>=0?list.current?.getLayout(currentIndex):undefined;
          if(!layout || !list.current)break;
          const offset=Math.max(0,layout.y+itemStartOffset()-live.current.headerHeight-targetOffset);
          if(Math.abs(list.current.getAbsoluteLastScrollOffset()-offset)>.5)list.current.scrollToOffset({offset,skipFirstItemOffset:true,animated:false});
          stable=Math.abs(offset-previous)<.5?stable+1:0;previous=offset;
          if(stable>=3)break;
        }
      }
      if (opening) helpDevEvent('chat.open.positioned', { target: target.kind, indexElapsedMs, settlePasses, elapsedMs: Date.now() - positioningAt });
      readyRef.current=true;setReady(true);
      setFollow(false);
      if(target.kind==='message' && target.messageId)live.current.onHighlight(target.messageId);
      const finish=()=>{if(!mounted.current || generation!==navigationGeneration.current)return;cancelJump();inNavigation.current=false;setNavigating(false);updateMediaRange(true);observe();};
      if (!opening && (target.kind === 'message' || target.kind === 'date') && (live.current.hasNewer || geometry.current.content+(hasNativeChatLayout?currentBottomInset()+12:0)-geometry.current.offset-geometry.current.height>40)) {
        latestAffordance.current={visible:true,up:100,down:0};setLatestAvailable(true);
      }
      if(outgoingRef.current && !reduced) {
        incomingTransition.setValue(0);
        Animated.parallel([
          Animated.timing(transition,{toValue:1,duration:280,easing:Easing.out(Easing.cubic),useNativeDriver:true}),
          Animated.timing(incomingTransition,{toValue:1,duration:280,easing:Easing.out(Easing.cubic),useNativeDriver:true}),
        ]).start(finish);
      }
      else finish();
    })().catch(()=>{if(!mounted.current || generation!==navigationGeneration.current)return;inNavigation.current=false;setNavigating(false);readyRef.current=true;setReady(true);cancelJump();live.current.onError('Не удалось перейти к сообщению. Попробуйте ещё раз.');});
  }, [props.navigationTarget,rows,loaded,props.headerHeight,props.dockHeight,reduced,cancelJump,observe,scrollEnd,setFollow,stopIdleSave,transition,incomingTransition,stageViewport,updateMediaRange,visible,pinLatest,animateLatest,settleOpening,itemStartOffset,currentBottomInset,resetTailMotion]);
  // Empty/new conversations have no anchor to resolve.
  useEffect(()=>{if(!props.loading && !rows.length){readyRef.current=true;setReady(true);setFollow(!props.hasNewer);}},[props.loading,rows.length,props.hasNewer,setFollow]);
  useEffect(()=>{if(!props.navigationTarget && loaded && rows.length && !readyRef.current){readyRef.current=true;setReady(true);setFollow(!props.hasNewer);scrollEnd(false);}},[loaded,rows.length,props.navigationTarget,props.hasNewer,setFollow,scrollEnd]);
  useEffect(()=>{if(props.hasNewer)setFollow(false);},[props.hasNewer,setFollow]);
  useEffect(()=>{if(!hasNativeChatLayout && followingRef.current && readyRef.current && !inNavigation.current)scrollEnd(false);},[props.dockHeight,rows.length,scrollEnd]);
  const onScroll=useCallback((event:NativeSyntheticEvent<NativeScrollEvent>)=>{
    const e=event.nativeEvent;
    const previous=geometry.current;
    const atStart=e.contentOffset.y<=2;
    // Opening/date jumps can emit a temporary zero before positioning finishes.
    // Only a real reading gesture may release the first-row anchor.
    if(!atStart || userScrollSession.current && !inNavigation.current)
      setAtHistoryStart(previous=>previous===atStart?previous:atStart);
    geometry.current={offset:e.contentOffset.y,height:e.layoutMeasurement.height,content:e.contentSize.height};
    settleOpening();
    updateMediaRange();
    if(!readyRef.current || inNavigation.current)return;
    if(userScrollSession.current&&Math.abs(e.contentSize.height-previous.content)<1&&Math.abs(e.layoutMeasurement.height-previous.height)<1&&Math.abs(e.contentOffset.y-previous.offset)>1){
      live.current.onHistoryScroll?.(e.contentOffset.y<previous.offset);
    }
    const latestInput={
      delta:e.contentOffset.y-previous.offset,
      gap:e.contentSize.height+(hasNativeChatLayout?currentBottomInset()+12:0)-e.contentOffset.y-e.layoutMeasurement.height,
      hasNewer:Boolean(live.current.hasNewer),
      manual:userScrollSession.current && Math.abs(e.contentSize.height-previous.content)<1 && Math.abs(e.layoutMeasurement.height-previous.height)<1,
    };
    const policy=updateHelpLatestAffordance(latestAffordance.current,latestInput);
    if(__DEV__&&userScrollSession.current)helpDevEvent('timeline.latestGesture',{...latestInput,visible:policy.visible,up:policy.up,down:policy.down,contentDelta:e.contentSize.height-previous.content,heightDelta:e.layoutMeasurement.height-previous.height});
    if(policy.visible!==latestAffordance.current.visible)setLatestAvailable(policy.visible);
    latestAffordance.current=policy;
    if(dragging.current || momentum.current || Date.now()<webIntent.current)setFollow(false);
    if(__DEV__){scrollFrames.current.push({at:Date.now(),offset:e.contentOffset.y,content:e.contentSize.height,following:followingRef.current,dragging:dragging.current,momentum:momentum.current});if(scrollFrames.current.length>240)scrollFrames.current.shift();}
    observe();
    if(!touched.current)return;
    const preloadDistance=Math.max(800,e.layoutMeasurement.height*1.5);
    if(e.contentOffset.y < live.current.headerHeight+preloadDistance && live.current.hasOlder && !live.current.loadingOlder && !olderPending.current){
      olderPending.current=true;void live.current.loadOlder().catch(()=>live.current.onError('Не удалось загрузить историю')).finally(()=>{olderPending.current=false;});
    }
    if(e.contentSize.height-e.contentOffset.y-e.layoutMeasurement.height < currentBottomInset()+preloadDistance && live.current.hasNewer && !live.current.loadingNewer && !newerPending.current){
      newerPending.current=true;void live.current.loadNewer().catch(()=>live.current.onError('Не удалось загрузить новые сообщения')).finally(()=>{newerPending.current=false;});
    }
  },[observe,setFollow,updateMediaRange,settleOpening]);
  const NativeScroll=useMemo(()=>forwardRef<ScrollView,ScrollViewProps>((scrollProps,scrollRef)=>{
    const onScroll=useMemo(()=>Animated.event([{nativeEvent:{contentOffset:{y:dateScrollOffset}}}],{useNativeDriver:Platform.OS!=='web',listener:scrollProps.onScroll}),[scrollProps.onScroll]);
    return <Animated.ScrollView {...scrollProps} onScroll={onScroll} contentContainerStyle={[scrollProps.contentContainerStyle,{flexGrow:1}]} removeClippedSubviews={false} ref={scrollRef} nativeID={props.nativeID}/>;
  }),[props.nativeID,dateScrollOffset]);
  const webProps = Platform.OS==='web' ? {
    onWheel:()=>{takeScrollControl();webIntent.current=Date.now()+500;},
    onTouchMove:()=>{takeScrollControl();webIntent.current=Date.now()+500;},
    onPointerDown:()=>{takeScrollControl();webIntent.current=Date.now()+2000;},
    onPointerUp:()=>{webIntent.current=Date.now()+500;},
    onKeyDown:(event:any)=>{if(!event.target?.isContentEditable && !/^(INPUT|TEXTAREA)$/.test(event.target?.tagName||'') && ['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)){takeScrollControl();webIntent.current=Date.now()+500;}},
  } : {};
  useEffect(()=>helpDevActions('timeline',{'timeline.latest':()=>live.current.onLatest(),'timeline.save':()=>save(),'timeline.date':value=>jumpDate(typeof value==='string'?value:undefined),'timeline.resetMetrics':()=>{scrollFrames.current=[];}}),[jumpDate,save]);
  useEffect(()=>helpDevProbe('timeline',async()=>({ready:readyRef.current,following:followingRef.current,anchor:lastAnchor.current,
    loadedCount:rowsRef.current.length,geometry:geometry.current,navigating:inNavigation.current,currentDate,scrollFrames:scrollFrames.current,navigationMode:lastNavigationMode.current,tailMotionOwner:hasNativeAtomicTailMotion?'native':'js',
    latestAffordance:latestAffordance.current,latestRequest:latestRequest.current,userScrollSession:userScrollSession.current,dragging:dragging.current,momentum:momentum.current,bottomInset:currentBottomInset(),
    outgoingVisible:snapshotVisible,outgoingRows:outgoingRef.current?.rows.length??0,
    visible:visible().map(item=>({sequence:item.row.message.sequence,top:item.top,height:item.height}))})),[visible,currentDate,snapshotVisible]);
  const distance=outgoing?.distance??Math.min(geometry.current.height || 500,620),direction=outgoing?.direction || 1;
  // At the absolute start there is no preceding viewport to preserve. Release
  // FlashList's native anchor so it cannot keep re-pinning the first row as the
  // user tries to scroll away. Keep anchoring while older pages can prepend.
  const maintainDisabled=!ready || navigating || following || (atHistoryStart && !props.hasOlder);
  // Bottom alignment is a layout property, independent of how the history was
  // opened. A saved anchor must never turn a short conversation into a top list.
  const startFromBottom=true;
  const maintainVisibleContentPosition=useMemo(()=>({disabled:maintainDisabled,startRenderingFromBottom:startFromBottom}),[maintainDisabled,startFromBottom]);
  const listStyle=useMemo(()=>({backgroundColor:c.background}),[c.background]);
  const listContentStyle=useMemo(()=>({paddingTop:props.headerHeight+12,paddingBottom:hasNativeChatLayout?0:props.dockHeight+12}),[props.headerHeight,props.dockHeight]);
  const showLatestButton = Boolean(rows.length > 0 && ready && !props.hideLatestButton && latestAvailable);
  useEffect(()=>{props.onLatestState?.({visible:showLatestButton,count:props.unreadCount??0,loading:Boolean(props.loadingNewer||navigating&&latestRequest.current)});},[props.onLatestState,showLatestButton,props.unreadCount,props.loadingNewer,navigating]);
  useEffect(() => { helpDevState({timelineLatestButtonVisible:showLatestButton}); }, [showLatestButton]);
  const onListLoad = useCallback(() => {
    helpDevEvent('chat.open.listLoaded',{ticketId:live.current.messages[0]?.ticketId??null,mountedAt:mountedAt.current,elapsedMs:Date.now()-mountedAt.current,rows:rowsRef.current.length});
    const target = live.current.navigationTarget, seed = initialPosition.current;
    if (!readyRef.current && target && seed?.key === target.key && target.kind !== 'date') {
      committedTarget.current=target.key;inNavigation.current=true;
      Object.assign(openingLayout.current,{active:true,key:target.key,passes:0,signature:'',aligned:'',requestedIndex:-1,tailId:live.current.messages.at(-1)?.id??null});
      settleOpening();
    }
    setLoaded(true); updateMediaRange(true); observe();
  }, [settleOpening,updateMediaRange,observe]);
  return <HelpMessageArrivalContext.Provider value={inheritedArrivals??localArrivals.current}><HelpImageCacheContext.Provider value={imageCache}><View style={{flex:1}}>
    <Animated.View testID="help-timeline-live-layer" style={{flex:1,opacity:(ready||!rows.length)&&(!rows.length||firstContentSettled)?1:0,transform:[{translateY:outgoing?(outgoing.latest&&snapshotVisible?transition:incomingTransition).interpolate({inputRange:[0,1],outputRange:[-direction*distance,0]}):0}]}}>
      <Reanimated.View testID="help-timeline-tail-motion" style={[{flex:1},tailStyle]}><FlashList ref={list} data={rows} extraData={mediaRange} keyExtractor={rowKey} getItemType={rowType} renderItem={renderItem} CellRendererComponent={hasNativeAtomicTailMotion?TailCell:undefined}
        initialScrollIndex={initialPosition.current?.index}
        initialScrollIndexParams={initialPosition.current ? {viewOffset:initialPosition.current.kind==='latest'?0:-(props.headerHeight+initialPosition.current.offset)} : undefined}
        drawDistance={ready&&props.entrySettled!==false?Math.max(1200,geometry.current.height*2):320}
        renderScrollComponent={NativeScroll} {...webProps} testID="help-chat-scroll" style={listStyle}
        contentContainerStyle={listContentStyle}
        maintainVisibleContentPosition={maintainVisibleContentPosition}
        showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
        scrollEventThrottle={16} onLoad={onListLoad} onScroll={onScroll} onCommitLayoutEffect={()=>{settleOpening();synchronizeTailMotion();if(readyRef.current)measureDates();}}
        onScrollBeginDrag={()=>{dragging.current=true;momentum.current=false;takeScrollControl();}}
        onMomentumScrollBegin={()=>{if(userScrollSession.current&&!inNavigation.current){momentum.current=true;stopIdleSave();setFollow(false);}}}
        onMomentumScrollEnd={()=>{if(userScrollSession.current){dragging.current=false;momentum.current=false;updateMediaRange(true);observe();settleScroll();}}}
        onScrollEndDrag={()=>{dragging.current=false;updateMediaRange(true);observe();scheduleIdleSave();}} onLayout={event=>{if(event)geometry.current.height=event.nativeEvent.layout.height;settleOpening();}}
        onContentSizeChange={(_width,height)=>{geometry.current.content=height;settleOpening();synchronizeTailMotion();if(!hasNativeChatLayout && followingRef.current && readyRef.current && !inNavigation.current)scrollEnd(false);updateMediaRange(true);observe();}}
        ListHeaderComponent={props.header}
        ListFooterComponent={props.footer}
        ListFooterComponentStyle={!rows.length&&props.bottomAligned?{flexGrow:1,justifyContent:'flex-end'}:undefined}
      /></Reanimated.View>
    </Animated.View>
    {props.loadingOlder || initialLoadingVisible&&!ready ? <View pointerEvents="none" style={{position:'absolute',top:props.headerHeight,left:0,right:0}}><HelpHistoryStatus loading/></View> : null}
    {outgoing ? <Animated.View testID={snapshotVisible?'help-timeline-transition':'help-timeline-preparation'} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{position:'absolute',top:0,left:0,right:0,bottom:0,opacity:snapshotVisible?1:0,backgroundColor:c.background,overflow:'hidden',transform:[{translateY:transition.interpolate({inputRange:[0,1],outputRange:[0,direction*distance]})}]}}>{outgoing.rows.map(item=><View key={item.row.key} style={{position:'absolute',left:0,right:0,top:item.top}}>{renderRow(item.row,-1,mediaRangeRef.current,true)}</View>)}</Animated.View> : null}
    {!props.hideStickyDate && !props.onDatePresentationChange && datePresentation ? <HelpTimelineDates presentation={datePresentation} headerHeight={props.headerHeight} bottom={currentBottomInset()} onPress={jumpDate}/> : null}
    {rows.length > 0 && !props.onLatestState ? <HelpJumpToLatest visible={showLatestButton} count={props.unreadCount} loading={props.loadingNewer||navigating&&latestRequest.current} onPress={()=>{if(!prepareJump())return;void props.onLatest().catch(()=>{cancelJump();inNavigation.current=false;setNavigating(false);props.onError('Не удалось открыть последние сообщения');});}} style={{position:'absolute',right:HELP_COMPOSER_ACTION_RIGHT,bottom:props.dockHeight+12}}/> : null}
  </View></HelpImageCacheContext.Provider></HelpMessageArrivalContext.Provider>;
});
