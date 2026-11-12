import {HelpItStatus} from './HelpItStatus';
import {HelpMessageQuote} from './HelpMessageQuote';
import {HelpFileAttachment} from './HelpFileAttachment';
import {appWebControlProps,appWebControlContentProps} from '@/components/ui/appWebInteraction';
import {helpTicketMenuAnchor} from '../helpTicketMenu';
import type {HelpDownloadProgress} from '../helpAttachmentDownload';
import React, { memo, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { HelpAttachment, HelpMessage } from '../helpApi';
import type {HelpQuestionExchange} from '../helpQuestionHistory';
import { useHelpReducedMotion, useHelpTheme } from '../helpTheme';
import { canEditHelpMessage, helpTime } from '../helpUiUtils';
import { helpTextStampLayout, type HelpTextLineMeasurement } from '../helpTextStampLayout';
import { HelpAvatar, HelpIcon } from './HelpPrimitives';
import { HelpAudio, HelpImage, type ResolveHelpMedia, type HelpImageOrigin } from './HelpMedia';
import { HelpImageAlbum } from './HelpImageAlbum';
import { helpAlbumLayout, helpMediaPreviewBounds } from '../helpAlbumLayout';
import { HelpSearchText } from './HelpChatSearch';

import { HELP_MESSAGE_TEXT_STYLE, HelpInlineMessageStamp, HelpMessageStampReserve } from './HelpInlineMessageStamp';
import { HelpMessageLayoutCacheContext } from '../helpMessageLayoutCache';
import {appLayoutMode} from '@/src/shared/layout/appLayout';

const HELP_REACTIONS:readonly string[]=['❤️','👍','👎','🤝','🔥'];
const REPLY_SWIPE_DISTANCE = 80;
const REPLY_TRIGGER_DISTANCE = 40;

type Props = { questionExchange?:HelpQuestionExchange; canRequestIt?: boolean; delivery?: 'queued'|'sending'|'failed'; onRetry?:()=>void; message: HelpMessage; userId: number; open: boolean; canInteract: boolean; selected: boolean; highlighted: boolean; readByOthers?: boolean; groupFirst?: boolean; groupLast?: boolean; searchQuery?: string; solution: boolean; resolve: ResolveHelpMedia; onMenu: () => void; onDismissMenu: () => void; onReply: () => void; onCopy: () => void; onEdit: () => void; onForward: () => void; onReaction: (emoji: string) => void; onQuote: (id: number) => void; onImage: (images: HelpAttachment[], index: number, origin?: HelpImageOrigin) => void; onFile: (file: HelpAttachment,signal?:AbortSignal,onProgress?:(value:HelpDownloadProgress)=>void) => Promise<unknown>|void; onCloseTicket: () => void; onRequestIt: () => void; onError: (message: string) => void };
export function HelpMessageBubble(props: Props) {
  const latest = useRef(props); latest.current = props;
  // Screen callbacks capture composer/menu state and change frequently. Keep
  // those actions fresh without rebuilding the measured bubble on every scroll.
  // Visual data and resolve retain their identity checks in the memoized body.
  const actions = useMemo(() => ({
    onMenu: () => latest.current.onMenu(),
    onDismissMenu: () => latest.current.onDismissMenu(),
    onReply: () => latest.current.onReply(),
    onCopy: () => latest.current.onCopy(),
    onEdit: () => latest.current.onEdit(),
    onForward: () => latest.current.onForward(),
    onReaction: (emoji: string) => latest.current.onReaction(emoji),
    onQuote: (id: number) => latest.current.onQuote(id),
    onImage: (images: HelpAttachment[], index: number, origin?: HelpImageOrigin) => latest.current.onImage(images, index, origin),
    onFile: (file: HelpAttachment,signal?:AbortSignal,onProgress?:(value:HelpDownloadProgress)=>void) => latest.current.onFile(file,signal,onProgress),
    onCloseTicket: () => latest.current.onCloseTicket(),
    onRequestIt: () => latest.current.onRequestIt(),
    onError: (message: string) => latest.current.onError(message),
  }), []);
  return <MemoHelpMessageBubbleBody {...props} {...actions}/>;
}
const MemoHelpMessageBubbleBody = memo(function HelpMessageBubbleBody(props: Props) {
  const { message: m, questionExchange } = props;
  const groupedQuestion=Boolean(questionExchange);
  const reactions=useMemo(()=>m.reactions.filter(reaction=>HELP_REACTIONS.includes(reaction.emoji)),[m.reactions]); const c = useHelpTheme(); const own = m.authorId === props.userId; const [x] = useState(() => new Animated.Value(0)); const blocked = useRef(false); const last = useRef(props); last.current = props;
  const [replyPulse] = useState(() => new Animated.Value(1));
  const replyArmed = useRef(false);
  const [replyProgress] = useState(() => new Animated.Value(0));
  const replyTouch = useRef({x:0,dragging:false,menuPending:false});
  // Fill at the short reply threshold, independently of the touch's screen position.
  const replyMotion = useMemo(() => ({
    opacity:replyProgress.interpolate({inputRange:[0,12,20,REPLY_SWIPE_DISTANCE],outputRange:[0,0,.3,1],extrapolate:'clamp'}),
    reveal:replyProgress.interpolate({inputRange:[0,20,REPLY_SWIPE_DISTANCE],outputRange:[.4,.55,1],extrapolate:'clamp'}),
    fill:replyProgress.interpolate({inputRange:[0,REPLY_SWIPE_DISTANCE],outputRange:[0,1],extrapolate:'clamp'}),
    offset:replyProgress.interpolate({inputRange:[0,REPLY_SWIPE_DISTANCE],outputRange:[16,16]}),
  }), [replyProgress]);
  const groupFirst = props.groupFirst !== false, groupLast = props.groupLast !== false;
  const bottomLeft = !own && !groupLast ? 8 : 20, bottomRight = own && !groupLast ? 8 : 20;
  const bubbleCorners = { borderRadius: 20, borderTopLeftRadius: !own && !groupFirst ? 8 : 20,
    borderTopRightRadius: own && !groupFirst ? 8 : 20, borderBottomLeftRadius: props.solution ? 0 : bottomLeft,
    borderBottomRightRadius: props.solution ? 0 : bottomRight };
  const bubbleRef = useRef<View>(null);
  const window = useWindowDimensions();
  // Text follows the quieter desktop chat column. Media keeps its existing
  // responsive bounds so a portrait preview cannot narrow its caption again.
  const ownWidthRatio=Platform.OS==='web'&&appLayoutMode(window.width)!=='compact'&&!m.attachments.length ? .80 : .86;
  const layoutCache=useContext(HelpMessageLayoutCacheContext);
  const nativeTextStamp = !groupedQuestion && Platform.OS !== 'web' && own && m.kind === 'TEXT' && Boolean(m.text) && !m.ticketStatusChange && !m.attachments.length && !reactions.length;
  const layoutKey=!groupedQuestion&&!nativeTextStamp&&m.kind==='TEXT'&&m.text&&!m.attachments.length&&!reactions.length
    ? JSON.stringify([m.ticketId,m.id,m.text,m.editedAt,props.userId,window.width,window.fontScale]) : null;
  const cachedLayout=layoutKey?layoutCache?.read(layoutKey):undefined;
  const [menuAnchor, setMenuAnchor] = useState({ x: 8, y: 8, width: 0, height: 0 });
  const pointerMenu=useRef(false);
  const [measuredMenuHeight,setMeasuredMenuHeight]=useState(0);
  useLayoutEffect(() => {
    if (!props.selected || Platform.OS==='web'&&pointerMenu.current) return;
    let active = true;
    bubbleRef.current?.measureInWindow((x, y, width, height) => {
      if (active) setMenuAnchor({ x, y, width, height });
    });
    return () => { active = false; };
  }, [props.selected, window.width, window.height]);
  const menuWidth = Math.min(320, window.width - 24);
  const menuHeight = Platform.OS==='web'&&measuredMenuHeight>0?measuredMenuHeight:props.canInteract ? 96 : 46;
  const atPointer=Platform.OS==='web'&&pointerMenu.current;
  const menuLeft = Math.max(12, Math.min(window.width - menuWidth - 12, atPointer?menuAnchor.x:own ? menuAnchor.x + menuAnchor.width - menuWidth : menuAnchor.x));
  const menuTop = atPointer?Math.max(12,Math.min(window.height-menuHeight-12,menuAnchor.y)):Math.max(12, Math.min(window.height - menuHeight - 24, menuAnchor.y + menuAnchor.height + menuHeight + 24 < window.height ? menuAnchor.y + menuAnchor.height + 6 : menuAnchor.y - menuHeight - 6));
  const mediaTouch = useRef(false);
  const reducedMotion = useHelpReducedMotion();
  const reduced = useRef(reducedMotion); reduced.current = reducedMotion;
  const [textWidth, setTextWidth] = useState(cachedLayout?.textWidth??0);
  const [lastLine, setLastLine] = useState<(HelpTextLineMeasurement & {text: string; fontScale: number; windowWidth: number}) | null>(cachedLayout?.lastLine??null);
  const [rowWidth, setRowWidth] = useState(cachedLayout?.rowWidth??0);
  const [stampWidth, setStampWidth] = useState(cachedLayout?.stampWidth??0);
  const textRef = useRef<Text>(null);
  // RN web does not emit onTextLayout. Measure the real rendered line boxes,
  // including fallback fonts, instead of estimating a timestamp-sized spacer.
  useLayoutEffect(() => {
    if (Platform.OS !== 'web' || !m.text || !textWidth) return;
    const node = textRef.current as unknown as HTMLElement | null;
    if (node?.nodeType !== 1 || !node.ownerDocument?.createRange) return;
    const range = node.ownerDocument.createRange(); range.selectNodeContents(node);
    const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0);
    const final = rects.at(-1), bounds = node.getBoundingClientRect();
    if (final) setLastLine({ text: m.text, end: final.right - bounds.left, maxEnd: Math.max(...rects.map(rect => rect.right - bounds.left)), count: new Set(rects.map(rect => Math.round(rect.top))).size, fontScale: window.fontScale, windowWidth: window.width });
  }, [m.text, textWidth, window.fontScale, window.width]);
  const audioOnly = !m.text && m.kind !== 'CLOSURE' && !reactions.length && m.attachments.length === 1 && m.attachments[0].kind === 'AUDIO';
  const compactClosure = m.kind === 'CLOSURE' && !m.text && !m.attachments.length && !reactions.length;
  const measuredLines = lastLine?.text === m.text && lastLine.fontScale === window.fontScale && lastLine.windowWidth === window.width ? lastLine : null;
  useLayoutEffect(()=>{if(layoutKey&&layoutCache&&measuredLines&&rowWidth>0&&textWidth>0&&stampWidth>0)layoutCache.remember(layoutKey,{rowWidth,textWidth,stampWidth,lastLine:measuredLines});},[layoutKey,layoutCache,measuredLines,rowWidth,textWidth,stampWidth]);
  const availableBubbleWidth = own ? (rowWidth || window.width - 24) * ownWidthRatio : (rowWidth || window.width - 24) - 36;
  const textStampLayout = helpTextStampLayout({ availableWidth: availableBubbleWidth, contentWidth: textWidth, lines: measuredLines, stampWidth, allowExpansion: !m.attachments.length });
  const inlineStamp = !groupedQuestion && (nativeTextStamp || Boolean(m.text && !reactions.length && textStampLayout.inline));
  // Five 17dp stars, their gaps, timestamp and bubble padding share one row.
  const bubbleMinWidth = nativeTextStamp ? 90 : compactClosure ? Math.min(availableBubbleWidth, 133 + Math.max(44, stampWidth)) : m.text && !reactions.length ? textStampLayout.minWidth : 90;
  const resetSwipe = useCallback(() => {
    replyArmed.current=false;replyProgress.setValue(0);replyPulse.stopAnimation();replyPulse.setValue(1);x.stopAnimation();
    if (reduced.current) x.setValue(0);
    else Animated.spring(x, { toValue: 0, useNativeDriver: true, damping: 24, stiffness: 260, overshootClamping: true, isInteraction:false }).start();
  }, [x,replyPulse,replyProgress]);
  const moveSwipe = useCallback((pageX:number) => {
    const travelled=Math.max(0,replyTouch.current.x-pageX);
    x.setValue(-Math.min(REPLY_SWIPE_DISTANCE,travelled));
    replyProgress.setValue(Math.min(REPLY_SWIPE_DISTANCE,travelled/REPLY_TRIGGER_DISTANCE*REPLY_SWIPE_DISTANCE));
    const armed=travelled>=REPLY_TRIGGER_DISTANCE;
    if(armed&&!replyArmed.current&&!reduced.current){
      replyPulse.stopAnimation();replyPulse.setValue(1.14);
      Animated.spring(replyPulse,{toValue:1,useNativeDriver:true,damping:18,stiffness:380,mass:.5,isInteraction:false}).start();
    }
    replyArmed.current=armed;
  }, [x,replyPulse,replyProgress]);
  useLayoutEffect(()=>{
    blocked.current=true;replyTouch.current.dragging=false;replyTouch.current.menuPending=false;replyArmed.current=false;replyProgress.setValue(0);x.stopAnimation();x.setValue(0);replyPulse.stopAnimation();replyPulse.setValue(1);
    return()=>{x.stopAnimation();replyPulse.stopAnimation();};
  },[m.id,x,replyPulse,replyProgress]);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: event => {
      const pageX=event?.nativeEvent.touches?.[0]?.pageX??event?.nativeEvent.pageX;
      replyTouch.current={x:Number.isFinite(pageX)?pageX:0,dragging:false,menuPending:false};
      blocked.current=false;mediaTouch.current=false;return false;
    },
    onMoveShouldSetPanResponderCapture: (_, g) => {
      if(g.numberActiveTouches!==1||g.dx>12||Math.abs(g.dy)>Math.max(12,Math.abs(g.dx)))blocked.current=true;
      const capture=last.current.open&&last.current.canInteract&&!blocked.current&&!mediaTouch.current&&g.dx< -12&&-g.dx>Math.abs(g.dy)*1.7;
      if(capture){replyTouch.current.dragging=true;replyTouch.current.menuPending=false;}
      return capture;
    },
    onPanResponderGrant: event => { replyTouch.current.dragging=true;replyTouch.current.menuPending=false;x.stopAnimation();moveSwipe(event.nativeEvent.pageX); },
    onPanResponderMove: (event, g) => {
      const wasBlocked=blocked.current;
      if (g.numberActiveTouches !== 1 || g.dx > 12 || Math.abs(g.dy) > Math.max(32, Math.abs(g.dx))) blocked.current = true;
      if(blocked.current){if(!wasBlocked)resetSwipe();return;}
      moveSwipe(event.nativeEvent.pageX);
    },
    onPanResponderRelease: (event, g) => {
      if (last.current.open && last.current.canInteract && replyTouch.current.dragging && !blocked.current && !mediaTouch.current && g.numberActiveTouches<=1 && replyTouch.current.x-event.nativeEvent.pageX>=REPLY_TRIGGER_DISTANCE && Math.abs(g.dy)<Math.max(32,replyTouch.current.x-event.nativeEvent.pageX)) last.current.onReply();
      blocked.current=true;
      resetSwipe();
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => {blocked.current=true;resetSwipe();},
  }), [resetSwipe, moveSwipe, x]);
  const holdMessage=()=>{if(!blocked.current)replyTouch.current.menuPending=true;};
  const finishMessageTouch=()=>{if(replyTouch.current.menuPending&&!replyTouch.current.dragging&&!blocked.current)last.current.onMenu();replyTouch.current.menuPending=false;};
  if (m.kind === 'SYSTEM' && m.itStatusChange) return <HelpItStatus status={m.itStatusChange} user={m.author} text={m.text}/>;
  if (m.kind === 'SYSTEM') return <View style={{ alignItems: 'center', paddingVertical: 10, paddingHorizontal: 30 }}><Text style={{ color: c.muted, fontSize: 12, textAlign: 'center', backgroundColor: c.elevated, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>{props.searchQuery ? <HelpSearchText text={m.text} query={props.searchQuery}/> : m.text}</Text></View>;
  const images = m.attachments.filter(a => a.kind === 'IMAGE'); const other = m.attachments.filter(a => a.kind !== 'IMAGE');
  // The text/body uses the chat column, independently of a portrait photo's
  // natural width. Image geometry remains metadata-based before decode.
  const mediaRowWidth=rowWidth||Math.min(window.width-24,876);
  const mediaBubbleWidth=Math.max(1,groupedQuestion?mediaRowWidth:own?mediaRowWidth*.86:mediaRowWidth-36);
  const mediaBounds=helpMediaPreviewBounds(mediaBubbleWidth);
  const albumWidth=images.length?helpAlbumLayout(images,mediaBounds.width,2,mediaBounds.maxHeight).width:0;
  const mediaHasBody=Boolean(m.text)||other.length>0||m.kind==='CLOSURE';
  // Match landscape photos/albums edge-to-edge; tall photos retain a wider
  // caption, with transparent space beside the individually rounded image.
  const mediaFrameWidth=mediaHasBody?mediaBounds.width:albumWidth;
  const detachedPhoto=images.length>0&&albumWidth<mediaFrameWidth-1;
  const bubbleBackground=groupedQuestion?'transparent':own?c.elevated:c.surface;
  // Pending/failed delivery stamps contain their own retry button; keep those
  // outside the file's download button, including on react-native-web.
  const fileStampInline = !props.delivery&&!m.text&&!images.length&&other.length>0&&other.every(file=>file.kind==='FILE')&&!reactions.length&&m.kind!=='CLOSURE';
  const photoOnly = images.length > 0 && !other.length && !m.text && !reactions.length && m.kind !== 'CLOSURE';
  const openWebMenu=(event:any,keyboard=false)=>{event.preventDefault();event.stopPropagation?.();pointerMenu.current=true;setMenuAnchor({...helpTicketMenuAnchor(event,keyboard),width:0,height:0});props.onMenu();};
  const contextProps = Platform.OS === 'web' ? {tabIndex:0 as const,onContextMenu: (e: any) => { if(globalThis.window?.getSelection?.()?.toString())return;openWebMenu(e);}, onKeyDown: (e: any) => { if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') openWebMenu(e,true); } } : {};
  const author = m.author?.name || 'Специалист IT';
  const stamp = nativeTextStamp ? <HelpInlineMessageStamp time={helpTime(m.createdAt)} edited={Boolean(m.editedAt)} status={props.delivery??(props.readByOthers ? 'read' : 'sent')} onRetry={props.onRetry} reduced={reducedMotion} muted={c.muted} receiptColor={props.readByOthers ? c.accentText : c.muted} danger={c.danger}/> : <View testID="help-message-time" onLayout={e => setStampWidth(e.nativeEvent.layout.width)} style={{ ...(inlineStamp || photoOnly ? { position: 'absolute' as const, right: photoOnly ? 7 : 11, bottom: photoOnly ? 7 : 5 } : { alignSelf: compactClosure ? 'center' as const : 'flex-end' as const, marginTop: compactClosure ? 0 : 2 }), flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: photoOnly ? '#00000088' : undefined, borderRadius: photoOnly ? 10 : 0, paddingHorizontal: photoOnly ? 5 : 0, paddingVertical: photoOnly ? 2 : 0 }}><Text style={{ fontSize: 10, lineHeight: 14, includeFontPadding:false, color: photoOnly ? '#FFF' : c.muted }}>{m.editedAt ? 'изменено ' : ''}{helpTime(m.createdAt)}</Text>{own && props.delivery ? <Pressable accessibilityRole="button" accessibilityLabel={props.delivery==='failed'?'Не удалось отправить. Отправить снова':'Сообщение ещё не доставлено'} disabled={props.delivery!=='failed'} onPress={props.onRetry} hitSlop={10}><Ionicons testID="help-message-pending-clock" name={props.delivery==='failed'?'alert-circle-outline':'time-outline'} size={14} color={props.delivery==='failed'?c.danger:c.muted}/></Pressable> : own ? <Ionicons testID="help-message-receipt" accessibilityLabel={props.readByOthers ? "Прочитано" : "Отправлено"} name={props.readByOthers ? "checkmark-done" : "checkmark"} size={14} allowFontScaling={false} style={{lineHeight:14,includeFontPadding:false}} color={props.readByOthers ? (photoOnly ? "#8AC1FF" : c.accentText) : (photoOnly ? "#D1D5DB" : c.muted)} /> : null}</View>;
  const statusChange = m.ticketStatusChange ?? (m.kind === 'CLOSURE' ? 'CLOSED' : null);
  const statusText = statusChange === 'CLOSED' ? (own ? 'Вы закрыли обращение' : `${author}: обращение закрыто`) : (own ? 'Вы открыли обращение повторно' : `${author}: обращение открыто повторно`);
  return <>
    {statusChange ? <View testID={`help-ticket-status-${m.id}`} style={{ alignItems: 'center', paddingVertical: 10, paddingHorizontal: 30 }}><Text style={{ color: c.muted, fontSize: 12, textAlign: 'center', backgroundColor: c.elevated, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>{statusText}</Text></View> : null}
    <View {...(Platform.OS==='web'?{}:pan.panHandlers)} onTouchEnd={Platform.OS==='web'?undefined:finishMessageTouch} onTouchCancel={()=>{replyTouch.current.menuPending=false;}} onLayout={e => {if(!nativeTextStamp)setRowWidth(e.nativeEvent.layout.width);}} testID={`help-message-${m.id}`} style={{ marginTop: groupedQuestion?0:groupFirst ? 12 : 2, marginBottom: groupedQuestion?0:groupLast ? 8 : 2, marginLeft: groupedQuestion?0:12, marginRight: groupedQuestion?0:12, flexDirection: 'row', alignItems: 'flex-start', justifyContent: own&&!groupedQuestion ? 'flex-end' : 'flex-start', gap: 8 }}>
    {props.open&&props.canInteract ? <Animated.View testID="help-reply-swipe-indicator" pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={{position:'absolute',top:'50%',right:16,marginTop:-16,width:32,height:32,opacity:replyMotion.opacity,transform:[{translateX:replyMotion.offset},{scale:reducedMotion?1:replyMotion.reveal}]}}>
      <Animated.View style={{width:32,height:32,borderRadius:16,overflow:'hidden',alignItems:'center',justifyContent:'center',backgroundColor:c.elevated,borderWidth:1,borderColor:c.accentText+'66',transform:[{scale:replyPulse}]}}>
        <Animated.View testID="help-reply-swipe-fill" style={[StyleSheet.absoluteFill,{borderRadius:16,backgroundColor:c.accent,opacity:.3,transform:[{scale:replyMotion.fill}]}]}/>
        <Ionicons testID="help-reply-swipe-icon" name="arrow-undo" size={20} color={c.accentText}/>
      </Animated.View>
    </Animated.View> : null}
    <Animated.View testID="help-message-swipe-content" style={{flex:1,flexDirection:'row',alignItems:'flex-start',justifyContent:own&&!groupedQuestion?'flex-end':'flex-start',gap:8,transform:[{translateX:x}]}}>
    {!own&&!groupedQuestion ? <View testID="help-message-avatar-slot" style={{ width: 28, flexShrink: 0, alignSelf: 'flex-end' }}>{groupLast ? <HelpAvatar id={m.authorId || 0} name={author} uri={m.author?.avatarUrl} size={28} /> : null}</View> : null}
    <View testID="help-message-frame" style={{ maxWidth: groupedQuestion?'100%':own ? ownWidthRatio===.80?'80%':'86%' : '100%', width:groupedQuestion?'100%':images.length?mediaFrameWidth:undefined, flexShrink: 1, minWidth: groupedQuestion?0:images.length?undefined:bubbleMinWidth }}>
      {!own && !groupedQuestion && groupFirst ? <Text testID="help-message-author" style={{ color: c.muted, fontSize: 11, lineHeight: 14, marginLeft: 2, marginBottom: 3 }}>{author}</Text> : null}
      <Pressable ref={bubbleRef} testID="help-message-bubble" {...contextProps} accessibilityLabel={`${own ? 'Вы' : author}: ${m.text || (images.length ? 'Изображения' : 'Вложение')}. ${helpTime(m.createdAt)}${own ? props.readByOthers ? '. Прочитано' : props.delivery ? '. Отправляется' : '. Отправлено' : ''}`} onLongPress={Platform.OS==='web'?undefined:holdMessage} delayLongPress={500} style={{ ...(groupedQuestion?{borderRadius:8}:bubbleCorners), backgroundColor: images.length?'transparent':bubbleBackground, overflow: 'hidden' }}>
        {!groupedQuestion&&(m.forwardedFromId||m.replyTo)?<View style={{backgroundColor:bubbleBackground}}>
        {m.forwardedFromId ? <Text style={{ color: c.accentText, fontSize: 11, paddingHorizontal: 11, paddingTop: 8 }}>Пересланное сообщение</Text> : null}
        {m.replyTo?<HelpMessageQuote quote={m.replyTo} onQuote={props.onQuote} resolve={props.resolve}/>:null}
        </View>:null}
        {questionExchange?<View testID="help-question-exchange" style={{flexDirection:'row',alignItems:'flex-start',gap:8,paddingVertical:4,minHeight:48}}>
          <Ionicons name="chatbubble-outline" size={18} color={c.muted} style={{marginTop:3}}/>
          <View style={{flex:1,minWidth:0,gap:10}}>{questionExchange.answers.map(answer=><View key={answer.questionId} testID={`help-question-exchange-${answer.questionId}`} style={{gap:2}}>
            <Text selectable style={{color:c.muted,fontSize:14,lineHeight:21,fontWeight:'500'}}>{props.searchQuery?<HelpSearchText text={answer.question} query={props.searchQuery}/>:answer.question}</Text>
            <Text selectable testID={`help-question-answer-${answer.questionId}`} accessibilityLabel={`${own?'Ваш ответ':`Ответ ${m.author?.name||'пользователя'}`}: ${answer.skipped?'Вопрос пропущен':answer.answer}`} style={{color:answer.skipped?c.muted:c.text,fontSize:14,lineHeight:21,fontWeight:'500'}}>{answer.skipped?'Вопрос пропущен':props.searchQuery?<HelpSearchText text={answer.answer} query={props.searchQuery}/>:answer.answer}</Text>
          </View>)}</View>
          <View style={{paddingTop:2}}>{stamp}</View>

        </View>:null}
        {images.length ? <View testID="help-message-media" style={{alignItems:own&&!groupedQuestion?'flex-end':'flex-start'}}><View testID="help-message-image-clip" style={{width:albumWidth,overflow:'hidden',...bubbleCorners,borderBottomLeftRadius:(mediaHasBody||reactions.length>0)&&!detachedPhoto?0:bubbleCorners.borderBottomLeftRadius,borderBottomRightRadius:(mediaHasBody||reactions.length>0)&&!detachedPhoto?0:bubbleCorners.borderBottomRightRadius}}><HelpImageAlbum attachments={images} resolve={props.resolve} availableWidth={mediaBounds.width} maxHeight={mediaBounds.maxHeight} onImage={(index,origin)=>props.onImage(images,index,origin)} onLongPress={()=>{if(Platform.OS!=='web')holdMessage();}}/></View></View> : null}
        {images.length>0 && props.delivery && props.delivery!=='failed'?<View testID="help-attachment-uploading" pointerEvents="none" style={{position:'absolute',top:12,right:12,padding:8,borderRadius:20,backgroundColor:'#00000066'}}><ActivityIndicator color="#FFF"/></View>:null}
        <View testID="help-message-content" pointerEvents={photoOnly && props.delivery!=='failed' ? "none" : "auto"} style={photoOnly ? { position: 'absolute', left: 0, right: 0, bottom: 0, height: 30 } : { paddingHorizontal: groupedQuestion?0:11, paddingVertical: groupedQuestion?0:6, ...(images.length?{backgroundColor:bubbleBackground,...(detachedPhoto?bubbleCorners:{})}:{}) }}>
          {m.kind === 'CLOSURE' ? <View style={{ marginBottom: compactClosure ? 0 : 5 }}><Text style={{ color: c.text, fontWeight: '600', fontSize: 13 }}>Обращение завершено</Text><View testID="help-closure-meta" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginTop: 5 }}><View testID="help-closure-rating" accessible accessibilityLabel={`Оценка: ${m.rating ?? 0} из 5`} style={{ flexDirection: 'row', gap: 3 }}>{[1, 2, 3, 4, 5].map(n => <Ionicons key={n} name={(m.rating ?? 0) >= n ? 'star' : 'star-outline'} size={17} color={(m.rating ?? 0) >= n ? '#DDA944' : c.muted} />)}</View>{compactClosure ? stamp : null}</View></View> : null}
          {other.map((file,index) => file.kind === 'AUDIO' ? <View key={file.id} testID="help-audio-touch" onTouchStart={() => { mediaTouch.current = true; }}><HelpAudio uploading={Boolean(props.delivery&&props.delivery!=='failed')} attachment={file} messageId={props.delivery?undefined:m.id} author={m.author?.name || (m.authorRole === 'IT' ? 'Поддержка' : 'Пользователь')} createdAt={m.createdAt} ticketId={m.ticketId} resolve={props.resolve} onError={props.onError} captionRight={audioOnly ? stamp : undefined} /></View> : <HelpFileAttachment key={file.id} file={file} scope={props.resolve} uploading={Boolean(props.delivery&&props.delivery!=='failed')} onPress={props.onFile} onError={props.onError} trailing={fileStampInline&&index===other.length-1?stamp:undefined}/>)}
          {m.text&&!groupedQuestion ? <View testID="help-text-layout" onLayout={nativeTextStamp ? undefined : e => setTextWidth(e.nativeEvent.layout.width)}><Text ref={textRef} selectable={Platform.OS==='web'} testID="help-message-text" accessibilityLabel={nativeTextStamp ? m.text : undefined} onTextLayout={nativeTextStamp ? undefined : e => { const lines = e.nativeEvent.lines, line = lines.at(-1); const next=line ? {text:m.text,end:line.x+line.width,maxEnd:Math.max(...lines.map(item=>item.x+item.width)),count:lines.length,fontScale:window.fontScale,windowWidth:window.width} : null;setLastLine(previous=>previous?.text===next?.text && previous?.end===next?.end && previous?.maxEnd===next?.maxEnd && previous?.count===next?.count && previous?.fontScale===next?.fontScale && previous?.windowWidth===next?.windowWidth ? previous : next); }} style={[HELP_MESSAGE_TEXT_STYLE, { color: c.text }]}>{nativeTextStamp ? <>{props.searchQuery ? <HelpSearchText text={m.text} query={props.searchQuery}/> : m.text}<HelpMessageStampReserve time={helpTime(m.createdAt)} edited={Boolean(m.editedAt)}/></> : props.searchQuery ? <HelpSearchText text={m.text} query={props.searchQuery}/> : m.text}</Text></View> : null}
          {reactions.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, paddingTop: 6 }}><View style={{ flexDirection: 'row', flexWrap: 'wrap', flexGrow: 1, flexShrink: 1, gap: 4 }}>{reactions.map(reaction => <Pressable key={reaction.emoji} accessibilityRole="button" accessibilityLabel={`${reaction.emoji}, ${reaction.count}${reaction.mine ? ', ваша реакция' : ''}`} onPress={() => props.onReaction(reaction.emoji)} style={{ borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: reaction.mine ? c.accent + '44' : c.elevated, borderWidth: 1, borderColor: reaction.mine ? c.accent : 'transparent' }}><Text style={{ color: c.text, fontSize: 12 }}>{reaction.emoji} {reaction.count}</Text></Pressable>)}</View>{groupedQuestion?null:stamp}</View> : !groupedQuestion && !audioOnly && !compactClosure && !fileStampInline ? stamp : null}
        </View>
        {props.highlighted || props.selected ? <View testID="help-message-outline" pointerEvents="none" style={[StyleSheet.absoluteFill, { ...bubbleCorners, borderWidth: 2, borderColor: c.accent }]} /> : null}
      </Pressable>

      {props.selected ? <Modal transparent visible animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={props.onDismissMenu} statusBarTranslucent><View style={{ flex: 1 }}><Pressable testID="help-message-menu-backdrop" accessibilityRole="button" accessibilityLabel="Закрыть меню сообщения" onPress={props.onDismissMenu} style={StyleSheet.absoluteFill} /><View testID="help-message-menu" accessibilityViewIsModal onLayout={Platform.OS==='web'?event=>setMeasuredMenuHeight(event.nativeEvent.layout.height):undefined} style={{ position: 'absolute', top: menuTop, left: menuLeft, width: menuWidth, elevation: 8, shadowColor: '#000', shadowOpacity: .16, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, backgroundColor: c.elevated, borderRadius: 16, borderWidth: 1, borderColor: c.line, padding: 5, marginTop: Platform.OS==='web'?0:5 }}>{props.canInteract ? <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>{HELP_REACTIONS.map(emoji => <Pressable {...appWebControlProps()} key={emoji} accessibilityRole="button" accessibilityLabel={`Реакция ${emoji}`} onPress={() => props.onReaction(emoji)} style={{ padding: 7 }}><Text style={{ fontSize: 22 }}>{emoji}</Text></Pressable>)}</View> : null}<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }}>{props.open ? <Pressable {...appWebControlProps()} accessibilityRole="button" accessibilityLabel="Ответить" onPress={props.onReply} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, padding: 7 }}><Ionicons {...appWebControlContentProps()} name="arrow-undo" size={18} color={c.accentText} /><Text {...appWebControlContentProps()} style={{ color: c.accentText, fontSize: 11 }}>Ответить</Text></Pressable> : null}<HelpIcon name="copy-outline" label="Копировать" onPress={props.onCopy} size={18} style={{ width: 32, height: 34 }} />{canEditHelpMessage(m, props.userId) ? <HelpIcon name="pencil-outline" label="Редактировать" onPress={props.onEdit} size={18} style={{ width: 32, height: 34 }} /> : null}{props.canInteract ? <Pressable {...appWebControlProps()} accessibilityRole="button" accessibilityLabel="Переслать" onPress={props.onForward} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, padding: 7 }}><Ionicons {...appWebControlContentProps()} name="arrow-redo-outline" size={18} color={c.accentText} /><Text {...appWebControlContentProps()} style={{ color: c.accentText, fontSize: 11 }}>Переслать</Text></Pressable> : null}</View></View></View></Modal> : null}
    </View></Animated.View>
  </View></>;
});
