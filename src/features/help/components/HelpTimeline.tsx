import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Easing, Platform, ScrollView, type ScrollViewProps, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { FlashList, type FlashListRef, type ListRenderItem } from '@shopify/flash-list';
import type { HelpMessage } from '../helpApi';
import type { HelpNavigationTarget, HelpViewportAnchor } from '../helpHistoryTypes';
import { helpTimelineRows, helpVisibleRows, type HelpTimelineRow } from '../helpTimelineModel';
import { helpDateJumpMode } from '../helpDateNavigation';
import { helpDevActions, helpDevEvent, helpDevProbe, helpDevState } from '../helpDiagnostics';
import { helpDayKey } from '../helpUiUtils';
import { createHelpImageCache, HelpImageCacheContext, HelpMediaLoadingContext } from '../helpMediaLoading';
import { useHelpReducedMotion, useHelpTheme } from '../helpTheme';
import { HelpDateSeparator, HelpUnreadSeparator, HelpHistoryStatus, HelpJumpToLatest } from './HelpTimelineIndicators';
import { hasNativeChatLayout } from './HelpNativeChatLayout';
import { HELP_COMPOSER_ACTION_RIGHT } from '../helpLayout';
import { hiddenHelpLatest, updateHelpLatestAffordance } from '../helpJumpToLatestModel';

export type HelpTimelineHandle = {
  save: () => void;
  prepareJump: (sequence?: number) => void;
  waitForJumpReady: () => Promise<boolean>;
  cancelJump: () => void;
  jumpToDate: (date?: string) => void;
  scrollTo: (params: {y: number; animated?: boolean}) => void;
  scrollToEnd: (params?: {animated?: boolean}) => void;
};
type Props = {
  messages: HelpMessage[]; nativeID: string; headerHeight: number; dockHeight: number;
  navigationTarget?: HelpNavigationTarget | null; firstUnreadSequence?: number | null;
  hasOlder?: boolean; hasNewer?: boolean; loadingOlder?: boolean; loadingNewer?: boolean;
  loading?: boolean; online: boolean; active: boolean; unreadCount?: number;
  hideLatestButton?: boolean;
  hideStickyDate?: boolean;
  onStickyDateChange?: (date: string | null) => void;
  loadOlder: () => Promise<unknown>; loadNewer: () => Promise<unknown>;
  onLatest: () => Promise<unknown>; onSave: (anchor: HelpViewportAnchor, options?: {deferTrim?:boolean}) => unknown;
  onDate: (date: string) => Promise<unknown>;
  onUserScroll?: () => void;
  onRead: (sequence: number) => unknown; onFollow: (following: boolean) => void;
  onHighlight: (id: number) => void; onError: (message: string) => void;
  renderMessage: (message: HelpMessage) => React.ReactElement;
  onReady?: () => void;
  header?: React.ReactElement | null; footer?: React.ReactElement | null;
};
type MediaRange = {first: number; last: number};
type OutgoingViewport = {rows: {row: HelpTimelineRow; top: number; height: number}[]; direction: number};
const rowKey = (row: HelpTimelineRow) => row.key;
const rowType = (row: HelpTimelineRow) => row.kind;

/** FlashList owns history anchors; native layout owns composer geometry only while following the tail. */
export const HelpTimeline = forwardRef<HelpTimelineHandle, Props>(function HelpTimeline(props, ref) {
  const c = useHelpTheme(), reduced = useHelpReducedMotion();
  const imageCache = useMemo(() => createHelpImageCache(), []);
  const list = useRef<FlashListRef<HelpTimelineRow>>(null), live = useRef(props); live.current = props;
  const rows = useMemo(() => helpTimelineRows(props.messages, props.firstUnreadSequence), [props.messages, props.firstUnreadSequence]);
  const rowsRef = useRef(rows); rowsRef.current = rows;
  const hasImages = useMemo(() => props.messages.some(message => message.attachments?.some(attachment => attachment.kind==='IMAGE') || message.replyTo?.attachments?.some(attachment => attachment.kind==='IMAGE')), [props.messages]);
  const hasImagesRef = useRef(hasImages); hasImagesRef.current = hasImages;
  const [following, setFollowing] = useState(false), [ready, setReady] = useState(false), [loaded, setLoaded] = useState(false), [navigating,setNavigating] = useState(false);
  const initialPosition = useRef<{ key: number; kind: HelpNavigationTarget['kind']; index: number; offset: number } | null>(null);
  if (!initialPosition.current && !loaded && rows.length && props.navigationTarget) {
    const target = props.navigationTarget;
    const index = target.kind === 'latest' ? rows.length - 1 : rows.findIndex(row => (target.kind === 'unread' ? row.kind === 'unread' : row.kind === 'message') && (row.message.id === target.messageId || row.message.sequence === target.sequence));
    if (index >= 0) initialPosition.current = { key: target.key, kind: target.kind, index, offset: target.offset ?? 0 };
  }
  const readyNotified = useRef(false);
  const notifyReady = useCallback(() => {
    if (readyNotified.current) return;
    readyNotified.current = true;
    helpDevEvent('chat.open.readyToAnimate', { ticketId: live.current.messages[0]?.ticketId ?? null, at: Date.now() });
    live.current.onReady?.();
  }, []);
  // Reveal after the positioned list commits, rather than from onLoad itself.
  // The entry owns its reveal state, so this does not rerender the chat's rows.
  useEffect(() => { if (ready) notifyReady(); }, [ready,notifyReady]);
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
    if(!props.loading||rows.length)return;
    // Local disk hydration should not flash a network loader for a single frame.
    const timer=setTimeout(()=>setInitialLoadingVisible(true),200);
    return()=>clearTimeout(timer);
  },[props.loading,rows.length]);
  const readyRef = useRef(false), followingRef = useRef(false), mounted = useRef(true);
  const geometry = useRef({offset: 0, height: 0, content: 0});
  const lastAnchor = useRef<HelpViewportAnchor | null>(null), committedTarget = useRef<number | null>(null);
  const inNavigation = useRef(false), navigationGeneration = useRef(0), touched = useRef(false);
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
    if (!view) return [];
    const {startIndex, endIndex} = view.computeVisibleIndices();
    const first = view.getFirstItemOffset(), offset = view.getAbsoluteLastScrollOffset();
    const candidates = [];
    for (let index = Math.max(0, startIndex); index <= Math.min(endIndex, rowsRef.current.length - 1); index++) {
      const layout = view.getLayout(index);
      if (layout && (includeDecor || rowsRef.current[index].kind==='message')) candidates.push({row: rowsRef.current[index], top: layout.y + first - offset, height: layout.height});
    }
    return candidates;
  }, []);
  const visible = useCallback((includeDecor=false) => helpVisibleRows(viewportRows(includeDecor), live.current.headerHeight, geometry.current.height - live.current.dockHeight), [viewportRows]);
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
    const atEnd=!live.current.hasNewer && content+(hasNativeChatLayout?live.current.dockHeight+12:0)-offset-height<=2;
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
    const items = visible(), first = items[0];
    if (!first) return;
    lastAnchor.current = {messageId:first.row.message.id, sequence:first.row.message.sequence,
      offset:first.top - live.current.headerHeight, atLatest:followingRef.current && !live.current.hasNewer};
    const currentDay=helpDayKey(first.row.message.createdAt);
    const capsuleBottom=Math.max(0,live.current.headerHeight-16);
    const visibleBottom=geometry.current.height-live.current.dockHeight;
    // Read receipts need at least 32 visible pixels. Date pills are only 24 high,
    // centered inside a 44px touch row, so inspect their actual visual bounds.
    // Keep one date until the inline pill fully passes behind the header.
    const dateVisible=viewportRows(true).some(item=>{
      if(item.row.kind!=='date'||item.height<=0||helpDayKey(item.row.date!)!==currentDay)return false;
      const pillTop=item.top+(item.height-24)/2;
      return pillTop+24>capsuleBottom&&pillTop<visibleBottom;
    });
    const nextDate=dateVisible?'':first.row.message.createdAt;
    setCurrentDate(previous=>previous && nextDate && helpDayKey(previous)===helpDayKey(nextDate)?previous:nextDate);
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
  }, [scheduleIdleSave, visible, viewportRows]);
  const cancelJump = useCallback(() => {
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
    stopIdleSave();
    userScrollSession.current=true;
    touched.current=true;
    live.current.onUserScroll?.();
    if(inNavigation.current){++navigationGeneration.current;inNavigation.current=false;setNavigating(false);readyRef.current=true;setReady(true);}
    cancelJump();setFollow(false);
  },[cancelJump,setFollow,stopIdleSave]);
  const prepareJump = useCallback((sequence?: number) => {
    save();
    if (reduced || !readyRef.current) return;
    const old = visible(true);
    const target = rowsRef.current.findIndex(row => row.kind==='message' && row.message.sequence === sequence);
    const targetLayout = target >= 0 ? list.current?.getLayout(target) : undefined;
    const distance = targetLayout ? Math.abs(targetLayout.y + (list.current?.getFirstItemOffset() || 0) - geometry.current.offset) : Infinity;
    if (distance < geometry.current.height) return;
    if (old.length) {
      const snapshot = {rows:old,direction:sequence !== undefined && sequence < old[0].row.message.sequence ? 1 : -1};
      stageViewport(snapshot);
    }
  }, [reduced, save, stageViewport, visible]);
  const jumpDate = useCallback((date = currentDateRef.current) => {
    if (!date) return;
    save();cancelJump();
    // Keep the old viewport while resolving the real first message of the day.
    // Merely tapping a date must not start a transition to a fictitious id 0.
    dateSnapshot.current={rows:visible(true),loadedIds:new Set(rowsRef.current.filter(row=>row.kind==='message').map(row=>row.message.id))};
    if (!reduced && dateSnapshot.current.rows.length) stageViewport({rows:dateSnapshot.current.rows,direction:1});
    void live.current.onDate(date).catch(error => { cancelJump(); live.current.onError(error instanceof Error ? error.message : 'Не удалось открыть сообщения за эту дату'); });
  }, [save,visible,cancelJump,reduced,stageViewport]);
  const renderRow = useCallback((row: HelpTimelineRow,index=rowsRef.current.indexOf(row),range=mediaRangeRef.current,retained=false) => row.kind==='date' ? <HelpDateSeparator date={row.date!} onPress={()=>jumpDate(row.date!)}/> : row.kind==='unread' ? <HelpUnreadSeparator/> : <HelpMediaLoadingContext.Provider value={retained?'retained':index>=range.first&&index<=range.last?'visible':index>=range.first-4&&index<=range.last+4?'near':'deferred'}>{props.renderMessage(row.message)}</HelpMediaLoadingContext.Provider>, [jumpDate,props.renderMessage]);
  // Keep the renderer stable through viewport/date updates. Real visual changes
  // from the screen (selection, search, receipts) still replace renderMessage.
  const renderItem = useCallback<ListRenderItem<HelpTimelineRow>>(({item,index,extraData}) => renderRow(item,index,extraData as MediaRange), [renderRow]);
  const scrollEnd = useCallback((animated = false) => {
    const native = list.current?.getNativeScrollRef();
    if (hasNativeChatLayout && native?.scrollToEnd) native.scrollToEnd({animated});
    else list.current?.scrollToEnd({animated});
  }, []);
  const pinLatest = useCallback((animated = false) => {
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
      setFollow(!live.current.hasNewer); scrollEnd(false); updateMediaRange(true); observe();
    };
    requestAnimationFrame(finishLayout);
  }, [cancelJump,observe,scrollEnd,setFollow,stopIdleSave,updateMediaRange]);
  useImperativeHandle(ref, () => ({save:()=>save(true),prepareJump,cancelJump,jumpToDate:jumpDate,
    waitForJumpReady,scrollTo: ({y,animated}) => {touched.current=true;setFollow(false);list.current?.scrollToOffset({offset:y,animated,skipFirstItemOffset:true});},
    scrollToEnd: ({animated} = {}) => pinLatest(animated),
  }), [save,prepareJump,cancelJump,jumpDate,setFollow,pinLatest,waitForJumpReady]);

  const stickyDate = ready && !outgoing && currentDate ? currentDate : null;
  useEffect(() => { props.onStickyDateChange?.(stickyDate); }, [stickyDate, props.onStickyDateChange]);

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => {if(state !== 'active') save(true);});
    return () => {save(true);mounted.current=false;++navigationGeneration.current;subscription.remove();live.current.onStickyDateChange?.(null);
      if(saveTimer.current)clearTimeout(saveTimer.current);if(readTimer.current)clearTimeout(readTimer.current);transition.stopAnimation();incomingTransition.stopAnimation();snapshotPending.current?.resolve(false);};
  }, [save,transition,incomingTransition]);
  useEffect(() => {if(!props.active)save(true);else observe();}, [props.active,save,observe]);

  useLayoutEffect(() => {
    const target = props.navigationTarget;
    if (!loaded || !rows.length || !target || committedTarget.current === target.key) return;
    const index = target.kind === 'latest' ? rows.length - 1 : rows.findIndex(row => (target.kind==='unread' ? row.kind==='unread' : row.kind==='message') && (row.message.id === target.messageId || row.message.sequence === target.sequence));
    if(index < 0) return;
    committedTarget.current=target.key;
    if (target.kind === 'latest') { lastNavigationMode.current = 'latest'; pinLatest(false); return; }
    const targetLayout=list.current?.getLayout(index);
    const targetWasLoaded=!dateSnapshot.current || dateSnapshot.current.loadedIds.has(rows[index].message.id);
    const dateMode=target.kind==='date'?helpDateJumpMode({
      targetTop:targetWasLoaded&&targetLayout?targetLayout.y+(list.current?.getFirstItemOffset()||0)-geometry.current.offset:undefined,
      targetHeight:targetLayout?.height,viewportTop:props.headerHeight,viewportBottom:geometry.current.height-props.dockHeight,
    }):null;
    lastNavigationMode.current=dateMode??target.kind;
    if(dateMode==='visible') {++navigationGeneration.current;inNavigation.current=false;setNavigating(false);stopIdleSave();cancelJump();observe();return;}
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
    // onLoad follows FlashList's native measurement. When the initial index
    // already rendered the target, align it once instead of running another
    // scrollToIndex preparation and 4-12 double-RAF stability passes.
    if (opening && initialPosition.current?.key === target.key && targetLayout && targetLayout.height > 0 && target.kind !== 'date') {
      const align = () => {
        const layout = list.current?.getLayout(index);
        if (layout && list.current) list.current.scrollToOffset({ offset: Math.max(0, layout.y + list.current.getFirstItemOffset() - live.current.headerHeight - targetOffset), skipFirstItemOffset: true, animated: false });
      };
      align();
      requestAnimationFrame(() => {
        if (!mounted.current || generation !== navigationGeneration.current) return;
        align(); readyRef.current = true; setReady(true); inNavigation.current = false; setNavigating(false); setFollow(false);
        if (target.kind === 'message' && target.messageId) live.current.onHighlight(target.messageId);
        helpDevEvent('chat.open.positioned', { target: target.kind, initialIndex: true, settlePasses: 1, elapsedMs: Date.now() - positioningAt });
        updateMediaRange(true); observe();
      });
      return;
    }
    void (async()=>{
      // FlashList uses positive viewOffset to move farther down. Saved offset is relative to the uncovered top.
      if(dateMode==='near' && targetLayout){
        const offset=Math.max(0,targetLayout.y+(list.current?.getFirstItemOffset()||0)-props.headerHeight-targetOffset);
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
          const offset=Math.max(0,layout.y+list.current.getFirstItemOffset()-live.current.headerHeight-targetOffset);
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
      if (!opening && (target.kind === 'message' || target.kind === 'date') && (live.current.hasNewer || geometry.current.content+(hasNativeChatLayout?live.current.dockHeight+12:0)-geometry.current.offset-geometry.current.height>40)) {
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
  }, [props.navigationTarget,rows,loaded,props.headerHeight,props.dockHeight,reduced,cancelJump,observe,scrollEnd,setFollow,stopIdleSave,transition,incomingTransition,stageViewport,updateMediaRange,visible,pinLatest]);
  // Empty/new conversations have no anchor to resolve.
  useEffect(()=>{if(!props.loading && !rows.length){readyRef.current=true;setReady(true);setFollow(!props.hasNewer);}},[props.loading,rows.length,props.hasNewer,setFollow]);
  useEffect(()=>{if(!props.navigationTarget && loaded && rows.length && !readyRef.current){readyRef.current=true;setReady(true);setFollow(!props.hasNewer);scrollEnd(false);}},[loaded,rows.length,props.navigationTarget,props.hasNewer,setFollow,scrollEnd]);
  useEffect(()=>{if(props.hasNewer)setFollow(false);},[props.hasNewer,setFollow]);
  useEffect(()=>{if(!hasNativeChatLayout && followingRef.current && readyRef.current && !inNavigation.current)scrollEnd(false);},[props.dockHeight,rows.length,scrollEnd]);
  const onScroll=useCallback((event:NativeSyntheticEvent<NativeScrollEvent>)=>{
    const e=event.nativeEvent;
    const previous=geometry.current;
    geometry.current={offset:e.contentOffset.y,height:e.layoutMeasurement.height,content:e.contentSize.height};
    updateMediaRange();
    if(!readyRef.current || inNavigation.current)return;
    const policy=updateHelpLatestAffordance(latestAffordance.current,{
      delta:e.contentOffset.y-previous.offset,
      gap:e.contentSize.height+(hasNativeChatLayout?live.current.dockHeight+12:0)-e.contentOffset.y-e.layoutMeasurement.height,
      hasNewer:Boolean(live.current.hasNewer),
      manual:userScrollSession.current && Math.abs(e.contentSize.height-previous.content)<1 && Math.abs(e.layoutMeasurement.height-previous.height)<1,
    });
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
    if(e.contentSize.height-e.contentOffset.y-e.layoutMeasurement.height < live.current.dockHeight+preloadDistance && live.current.hasNewer && !live.current.loadingNewer && !newerPending.current){
      newerPending.current=true;void live.current.loadNewer().catch(()=>live.current.onError('Не удалось загрузить новые сообщения')).finally(()=>{newerPending.current=false;});
    }
  },[observe,setFollow,updateMediaRange]);
  const NativeScroll=useMemo(()=>forwardRef<ScrollView,ScrollViewProps>((scrollProps,scrollRef)=><ScrollView {...scrollProps} ref={scrollRef} nativeID={props.nativeID}/>),[props.nativeID]);
  const webProps = Platform.OS==='web' ? {
    onWheel:()=>{takeScrollControl();webIntent.current=Date.now()+500;},
    onTouchMove:()=>{takeScrollControl();webIntent.current=Date.now()+500;},
    onPointerDown:()=>{takeScrollControl();webIntent.current=Date.now()+2000;},
    onPointerUp:()=>{webIntent.current=Date.now()+500;},
    onKeyDown:(event:any)=>{if(!event.target?.isContentEditable && !/^(INPUT|TEXTAREA)$/.test(event.target?.tagName||'') && ['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)){takeScrollControl();webIntent.current=Date.now()+500;}},
  } : {};
  useEffect(()=>helpDevActions('timeline',{'timeline.latest':()=>live.current.onLatest(),'timeline.save':()=>save(),'timeline.date':value=>jumpDate(typeof value==='string'?value:undefined),'timeline.resetMetrics':()=>{scrollFrames.current=[];}}),[jumpDate,save]);
  useEffect(()=>helpDevProbe('timeline',async()=>({ready:readyRef.current,following:followingRef.current,anchor:lastAnchor.current,
    loadedCount:rowsRef.current.length,geometry:geometry.current,navigating:inNavigation.current,currentDate,scrollFrames:scrollFrames.current,navigationMode:lastNavigationMode.current,
    outgoingVisible:snapshotVisible,outgoingRows:outgoingRef.current?.rows.length??0,
    visible:visible().map(item=>({sequence:item.row.message.sequence,top:item.top,height:item.height}))})),[visible,currentDate,snapshotVisible]);
  const distance=Math.min(geometry.current.height || 500,620),direction=outgoing?.direction || 1;
  const maintainDisabled=navigating || following;
  const startFromBottom=initialPosition.current?.kind==='latest';
  const maintainVisibleContentPosition=useMemo(()=>({disabled:maintainDisabled,startRenderingFromBottom:startFromBottom}),[maintainDisabled,startFromBottom]);
  const listStyle=useMemo(()=>({backgroundColor:c.background}),[c.background]);
  const listContentStyle=useMemo(()=>({paddingTop:props.headerHeight+12,paddingBottom:hasNativeChatLayout?0:props.dockHeight+12}),[props.headerHeight,props.dockHeight]);
  const showLatestButton = Boolean(rows.length > 0 && ready && !props.hideLatestButton && latestAvailable);
  useEffect(() => { helpDevState({timelineLatestButtonVisible:showLatestButton}); }, [showLatestButton]);
  const onListLoad = useCallback(() => {
    helpDevEvent('chat.open.listLoaded',{ticketId:live.current.messages[0]?.ticketId??null,mountedAt:mountedAt.current,elapsedMs:Date.now()-mountedAt.current,rows:rowsRef.current.length});
    const target = live.current.navigationTarget, seed = initialPosition.current;
    if (!readyRef.current && target && seed?.key === target.key && (target.kind === 'anchor' || target.kind === 'latest')) {
      const layout = list.current?.getLayout(seed.index);
      if (layout && layout.height > 0 && list.current) {
        committedTarget.current = target.key;
        setFollow(target.kind === 'latest' && !live.current.hasNewer);
        if (target.kind === 'latest') scrollEnd(false);
        else list.current.scrollToOffset({ offset: Math.max(0, layout.y + list.current.getFirstItemOffset() - live.current.headerHeight - (target.offset ?? 0)), animated: false, skipFirstItemOffset: true });
        readyRef.current = true; setReady(true);
        helpDevEvent('chat.open.positioned',{target:target.kind,initialIndex:true,settlePasses:0,elapsedMs:Date.now()-mountedAt.current});
      }
    }
    setLoaded(true); updateMediaRange(true); observe();
  }, [setFollow,scrollEnd,updateMediaRange,observe]);
  return <HelpImageCacheContext.Provider value={imageCache}><View style={{flex:1}}>
    <Animated.View testID="help-timeline-live-layer" style={{flex:1,opacity:ready||!rows.length?1:0,transform:[{translateY:outgoing?incomingTransition.interpolate({inputRange:[0,1],outputRange:[-direction*distance,0]}):0}]}}>
      <FlashList ref={list} data={rows} extraData={mediaRange} keyExtractor={rowKey} getItemType={rowType} renderItem={renderItem}
        initialScrollIndex={initialPosition.current?.index}
        initialScrollIndexParams={initialPosition.current ? {viewOffset:initialPosition.current.kind==='latest'?0:-(props.headerHeight+initialPosition.current.offset)} : undefined}
        drawDistance={Math.max(1200,geometry.current.height*2)}
        renderScrollComponent={NativeScroll} {...webProps} testID="help-chat-scroll" style={listStyle}
        contentContainerStyle={listContentStyle}
        maintainVisibleContentPosition={maintainVisibleContentPosition}
        showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
        scrollEventThrottle={16} onLoad={onListLoad} onScroll={onScroll}
        onScrollBeginDrag={()=>{dragging.current=true;momentum.current=false;takeScrollControl();}}
        onMomentumScrollBegin={()=>{if(userScrollSession.current&&!inNavigation.current){momentum.current=true;stopIdleSave();setFollow(false);}}}
        onMomentumScrollEnd={()=>{if(userScrollSession.current){dragging.current=false;momentum.current=false;updateMediaRange(true);observe();settleScroll();}}}
        onScrollEndDrag={()=>{dragging.current=false;updateMediaRange(true);observe();scheduleIdleSave();}} onLayout={event=>{if(event)geometry.current.height=event.nativeEvent.layout.height;}}
        onContentSizeChange={()=>{if(!hasNativeChatLayout && followingRef.current && readyRef.current && !inNavigation.current)scrollEnd(false);updateMediaRange(true);observe();}}
        ListHeaderComponent={props.header}
        ListFooterComponent={props.footer}
      />
    </Animated.View>
    {props.loadingOlder || (props.loading && !rows.length && initialLoadingVisible) ? <View pointerEvents="none" style={{position:'absolute',top:props.headerHeight,left:0,right:0}}><HelpHistoryStatus loading/></View> : null}
    {outgoing ? <Animated.View testID={snapshotVisible?'help-timeline-transition':'help-timeline-preparation'} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{position:'absolute',top:0,left:0,right:0,bottom:0,opacity:snapshotVisible?1:0,backgroundColor:c.background,overflow:'hidden',transform:[{translateY:transition.interpolate({inputRange:[0,1],outputRange:[0,direction*distance]})}]}}>{outgoing.rows.map(item=><View key={item.row.key} style={{position:'absolute',left:0,right:0,top:item.top}}>{renderRow(item.row,-1,mediaRangeRef.current,true)}</View>)}</Animated.View> : null}
    {!props.hideStickyDate && stickyDate ? <View style={{position:'absolute',top:Math.max(0,props.headerHeight-12),alignSelf:'center'}}><HelpDateSeparator compact date={stickyDate} onPress={()=>jumpDate(stickyDate)}/></View> : null}
    {rows.length > 0 ? <HelpJumpToLatest visible={showLatestButton} count={props.unreadCount} loading={props.loadingNewer} onPress={()=>{prepareJump();void props.onLatest().catch(()=>{cancelJump();props.onError('Не удалось открыть последние сообщения');});}} style={{position:'absolute',right:HELP_COMPOSER_ACTION_RIGHT,bottom:props.dockHeight+12}}/> : null}
  </View></HelpImageCacheContext.Provider>;
});
