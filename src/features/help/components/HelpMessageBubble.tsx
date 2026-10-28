import React, { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { HelpAttachment, HelpMessage } from '../helpApi';
import { useHelpReducedMotion, useHelpTheme } from '../helpTheme';
import { canEditHelpMessage, helpFileSize, helpTime, helpReplyGesture } from '../helpUiUtils';
import { helpTextStampLayout, type HelpTextLineMeasurement } from '../helpTextStampLayout';
import { HelpAvatar, HelpIcon } from './HelpPrimitives';
import { HelpAudio, HelpImage, type ResolveHelpMedia, type HelpImageOrigin } from './HelpMedia';
import { HelpImageAlbum } from './HelpImageAlbum';
import { helpImageAspectRatio } from '../helpAlbumLayout';
import { HelpSearchText } from './HelpChatSearch';

type Props = { message: HelpMessage; userId: number; open: boolean; canInteract: boolean; selected: boolean; highlighted: boolean; readByOthers?: boolean; groupFirst?: boolean; groupLast?: boolean; searchQuery?: string; solution: boolean; resolve: ResolveHelpMedia; onMenu: () => void; onDismissMenu: () => void; onReply: () => void; onCopy: () => void; onEdit: () => void; onForward: () => void; onReaction: (emoji: string) => void; onQuote: (id: number) => void; onImage: (images: HelpAttachment[], index: number, origin?: HelpImageOrigin) => void; onFile: (file: HelpAttachment) => void; onCloseTicket: () => void; onRequestIt: () => void; onError: (message: string) => void };
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
    onFile: (file: HelpAttachment) => latest.current.onFile(file),
    onCloseTicket: () => latest.current.onCloseTicket(),
    onRequestIt: () => latest.current.onRequestIt(),
    onError: (message: string) => latest.current.onError(message),
  }), []);
  return <MemoHelpMessageBubbleBody {...props} {...actions}/>;
}
const MemoHelpMessageBubbleBody = memo(function HelpMessageBubbleBody(props: Props) {
  const { message: m } = props; const c = useHelpTheme(); const own = m.authorId === props.userId; const [x] = useState(() => new Animated.Value(0)); const blocked = useRef(false); const last = useRef(props); last.current = props;
  const replyOpacity = useMemo(() => x.interpolate({ inputRange: [0, 40, 72], outputRange: [0, .5, 1], extrapolate: 'clamp' }), [x]);
  const groupFirst = props.groupFirst !== false, groupLast = props.groupLast !== false;
  const bottomLeft = !own && !groupLast ? 4 : 16, bottomRight = own && !groupLast ? 4 : 16;
  const bubbleCorners = { borderRadius: 16, borderTopLeftRadius: !own && !groupFirst ? 4 : 16,
    borderTopRightRadius: own && !groupFirst ? 4 : 16, borderBottomLeftRadius: props.solution ? 0 : bottomLeft,
    borderBottomRightRadius: props.solution ? 0 : bottomRight };
  const bubbleRef = useRef<View>(null);
  const window = useWindowDimensions();
  const [menuAnchor, setMenuAnchor] = useState({ x: 8, y: 8, width: 0, height: 0 });
  useLayoutEffect(() => {
    if (!props.selected) return;
    let active = true;
    bubbleRef.current?.measureInWindow((x, y, width, height) => {
      if (active) setMenuAnchor({ x, y, width, height });
    });
    return () => { active = false; };
  }, [props.selected, window.width, window.height]);
  const menuWidth = Math.min(320, window.width - 24);
  const menuHeight = props.canInteract ? 96 : 46;
  const menuLeft = Math.max(12, Math.min(window.width - menuWidth - 12, own ? menuAnchor.x + menuAnchor.width - menuWidth : menuAnchor.x));
  const menuTop = Math.max(12, Math.min(window.height - menuHeight - 24, menuAnchor.y + menuAnchor.height + menuHeight + 24 < window.height ? menuAnchor.y + menuAnchor.height + 6 : menuAnchor.y - menuHeight - 6));
  const mediaTouch = useRef(false);
  const swipePeak = useRef(0);
  const reducedMotion = useHelpReducedMotion();
  const reduced = useRef(reducedMotion); reduced.current = reducedMotion;
  const [textWidth, setTextWidth] = useState(0);
  const [lastLine, setLastLine] = useState<(HelpTextLineMeasurement & {text: string; fontScale: number; windowWidth: number}) | null>(null);
  const [rowWidth, setRowWidth] = useState(0);
  const [stampWidth, setStampWidth] = useState(0);
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
  const audioOnly = !m.text && m.kind !== 'CLOSURE' && !m.reactions.length && m.attachments.length === 1 && m.attachments[0].kind === 'AUDIO';
  const measuredLines = lastLine?.text === m.text && lastLine.fontScale === window.fontScale && lastLine.windowWidth === window.width ? lastLine : null;
  const availableBubbleWidth = own ? (rowWidth || window.width - 24) * .86 : (rowWidth || window.width - 24) - 36;
  const textStampLayout = helpTextStampLayout({ availableWidth: availableBubbleWidth, contentWidth: textWidth, lines: measuredLines, stampWidth, allowExpansion: !m.attachments.length });
  const inlineStamp = Boolean(m.text && !m.reactions.length && textStampLayout.inline);
  const bubbleMinWidth = m.text && !m.reactions.length ? textStampLayout.minWidth : 90;
  const resetSwipe = useCallback(() => { if (reduced.current) x.setValue(0); else Animated.spring(x, { toValue: 0, useNativeDriver: true, damping: 24, stiffness: 260, overshootClamping: true }).start(); }, [x]);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: () => { blocked.current = false; mediaTouch.current = false; swipePeak.current = 0; return false; },
    onMoveShouldSetPanResponderCapture: (_, g) => {
      const result = helpReplyGesture(g.dx, g.dy, blocked.current);
      blocked.current = result.blocked;
      return last.current.open && last.current.canInteract && !mediaTouch.current && g.numberActiveTouches === 1 && result.capture;
    },
    onPanResponderGrant: (_, g) => { swipePeak.current = g.dx; x.stopAnimation(); x.setValue(Math.min(72, Math.max(0, g.dx * .7))); },
    onPanResponderMove: (_, g) => {
      swipePeak.current = Math.max(swipePeak.current, g.dx);
      if (g.numberActiveTouches !== 1 || g.dx < -10 || swipePeak.current - g.dx > 16 || Math.abs(g.dy) > Math.max(32, Math.abs(g.dx))) blocked.current = true;
      x.setValue(blocked.current ? 0 : Math.min(72, Math.max(0, g.dx * .7)));
    },
    onPanResponderRelease: (_, g) => {
      if (last.current.open && last.current.canInteract && !blocked.current && g.dx >= 50 && g.dx > Math.abs(g.dy) * 1.3) last.current.onReply();
      resetSwipe();
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: resetSwipe,
  }), [resetSwipe, x]);
  if (m.kind === 'SYSTEM') return <View style={{ alignItems: 'center', paddingVertical: 10, paddingHorizontal: 30 }}><Text style={{ color: c.muted, fontSize: 12, textAlign: 'center', backgroundColor: c.elevated, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>{props.searchQuery ? <HelpSearchText text={m.text} query={props.searchQuery}/> : m.text}</Text></View>;
  const images = m.attachments.filter(a => a.kind === 'IMAGE'); const other = m.attachments.filter(a => a.kind !== 'IMAGE');
  const albumWidth=Math.min(340,(rowWidth||Math.min(window.width-24,876))*(own ? .86 : 1)-(own?0:36),images.length===1?350*(helpImageAspectRatio(images[0])??1):Infinity);
  const photoOnly = images.length > 0 && !other.length && !m.text && !m.reactions.length && m.kind !== 'CLOSURE';
  const contextProps = Platform.OS === 'web' ? { onContextMenu: (e: any) => { e.preventDefault(); props.onMenu(); }, onKeyDown: (e: any) => { if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') { e.preventDefault(); props.onMenu(); } } } : {};
  const author = m.author?.name || 'Специалист IT';
  const stamp = <View testID="help-message-time" onLayout={e => setStampWidth(e.nativeEvent.layout.width)} style={{ ...(inlineStamp || photoOnly ? { position: 'absolute' as const, right: photoOnly ? 7 : 11, bottom: photoOnly ? 7 : 8 } : { alignSelf: 'flex-end' as const, marginTop: 2 }), flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: photoOnly ? '#00000088' : undefined, borderRadius: photoOnly ? 10 : 0, paddingHorizontal: photoOnly ? 5 : 0, paddingVertical: photoOnly ? 2 : 0 }}><Text style={{ fontSize: 10, lineHeight: 12, color: photoOnly ? '#FFF' : c.muted }}>{m.editedAt ? 'изменено ' : ''}{helpTime(m.createdAt)}</Text>{own ? <Ionicons testID="help-message-receipt" accessibilityLabel={props.readByOthers ? "Прочитано" : "Отправлено"} name={props.readByOthers ? "checkmark-done" : "checkmark"} size={15} color={props.readByOthers ? (photoOnly ? "#8AC1FF" : c.accentText) : (photoOnly ? "#D1D5DB" : c.muted)} /> : null}</View>;
  return <View {...pan.panHandlers} onLayout={e => setRowWidth(e.nativeEvent.layout.width)} testID={`help-message-${m.id}`} style={{ marginTop: groupFirst ? 4 : 1, marginBottom: groupLast ? 4 : 1, marginLeft: 12, marginRight: 12, flexDirection: 'row', alignItems: 'flex-start', justifyContent: own ? 'flex-end' : 'flex-start', gap: 8 }}>
    <Animated.View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={{ position: 'absolute', top: 18, ...(own ? { right: 22 } : { left: 42 }), opacity: replyOpacity }}><Ionicons name="return-up-back" size={20} color={c.accentText} /></Animated.View>
    {!own ? <View testID="help-message-avatar-slot" style={{ width: 28, flexShrink: 0, alignSelf: 'flex-end' }}>{groupLast ? <HelpAvatar id={m.authorId || 0} name={author} uri={m.author?.avatarUrl} size={28} /> : null}</View> : null}
    <Animated.View style={{ maxWidth: own ? '86%' : '100%', width:images.length?albumWidth:undefined, flexShrink: 1, minWidth: images.length?undefined:bubbleMinWidth, transform: [{ translateX: x }] }}>
      {!own && groupFirst ? <Text testID="help-message-author" style={{ color: c.muted, fontSize: 11, lineHeight: 14, marginLeft: 2, marginBottom: 3 }}>{author}</Text> : null}
      <Pressable ref={bubbleRef} testID="help-message-bubble" {...contextProps} accessibilityLabel={`${own ? 'Вы' : author}: ${m.text || (images.length ? 'Изображения' : 'Вложение')}. ${helpTime(m.createdAt)}${own ? props.readByOthers ? '. Прочитано' : '. Отправлено' : ''}`} onLongPress={props.onMenu} delayLongPress={500} style={{ ...bubbleCorners, backgroundColor: own ? c.outgoing : c.surface, overflow: 'hidden' }}>
        {m.forwardedFromId ? <Text style={{ color: c.accentText, fontSize: 11, paddingHorizontal: 11, paddingTop: 8 }}>Пересланное сообщение</Text> : null}
        {m.replyTo ? <Pressable accessibilityRole="button" accessibilityLabel="Перейти к исходному сообщению" onPress={() => props.onQuote(m.replyTo!.id)} style={{ margin: 7, padding: 7, borderLeftWidth: 2, borderLeftColor: c.accent, backgroundColor: c.elevated, borderRadius: 6, flexDirection: 'row', gap: 7 }}>{m.replyTo.attachments?.find(a => a.kind === 'IMAGE') ? <HelpImage attachment={m.replyTo.attachments.find(a => a.kind === 'IMAGE')!} resolve={props.resolve} style={{ width: 34, height: 34, borderRadius: 4 }} /> : null}<View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: c.accentText, fontWeight: '600', fontSize: 12 }}>{m.replyTo.author?.name || 'Сообщение'}</Text><Text numberOfLines={2} style={{ color: c.muted, fontSize: 12 }}>{m.replyTo.text || 'Вложение'}</Text></View></Pressable> : null}
        {images.length ? <HelpImageAlbum attachments={images} resolve={props.resolve} availableWidth={albumWidth} onImage={(index,origin)=>props.onImage(images,index,origin)} onLongPress={props.onMenu}/> : null}
        <View pointerEvents={photoOnly ? "none" : "auto"} style={photoOnly ? { position: 'absolute', left: 0, right: 0, bottom: 0, height: 30 } : { paddingHorizontal: 11, paddingVertical: audioOnly ? 6 : 8 }}>
          {m.kind === 'CLOSURE' ? <View style={{ marginBottom: 5 }}><Text style={{ color: c.text, fontWeight: '600', fontSize: 13 }}>Обращение завершено</Text><View style={{ flexDirection: 'row', gap: 3, marginTop: 5 }}>{[1, 2, 3, 4, 5].map(n => <Ionicons key={n} name={(m.rating ?? 0) >= n ? 'star' : 'star-outline'} size={17} color={(m.rating ?? 0) >= n ? '#DDA944' : c.muted} />)}<Text style={{ color: c.muted, fontSize: 12, marginLeft: 5 }}>{m.rating ?? 0}/5</Text></View></View> : null}
          {other.map(file => file.kind === 'AUDIO' ? <View key={file.id} testID="help-audio-touch" onTouchStart={() => { mediaTouch.current = true; }}><HelpAudio attachment={file} messageId={m.id} author={m.author?.name || (m.authorRole === 'IT' ? 'Поддержка' : 'Пользователь')} createdAt={m.createdAt} ticketId={m.ticketId} resolve={props.resolve} onError={props.onError} captionRight={audioOnly ? stamp : undefined} /></View> : <Pressable key={file.id} onPress={() => props.onFile(file)} accessibilityRole="button" accessibilityLabel={`Скачать ${file.name}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6 }}><Ionicons name="document-outline" size={28} color={c.accentText} /><View style={{ flexShrink: 1 }}><Text numberOfLines={2} style={{ color: c.text, fontSize: 13, fontWeight: '500' }}>{file.name}</Text><Text style={{ color: c.muted, fontSize: 10 }}>{helpFileSize(file.size)} · Скачать</Text></View></Pressable>)}
          {m.text ? <View testID="help-text-layout" onLayout={e => setTextWidth(e.nativeEvent.layout.width)}><Text ref={textRef} selectable={false} testID="help-message-text" onTextLayout={e => { const lines = e.nativeEvent.lines, line = lines.at(-1); const next=line ? {text:m.text,end:line.x+line.width,maxEnd:Math.max(...lines.map(item=>item.x+item.width)),count:lines.length,fontScale:window.fontScale,windowWidth:window.width} : null;setLastLine(previous=>previous?.text===next?.text && previous?.end===next?.end && previous?.maxEnd===next?.maxEnd && previous?.count===next?.count && previous?.fontScale===next?.fontScale && previous?.windowWidth===next?.windowWidth ? previous : next); }} style={{ color: c.text, fontSize: 15, lineHeight: 21 }}>{props.searchQuery ? <HelpSearchText text={m.text} query={props.searchQuery}/> : m.text}</Text></View> : null}
          {m.reactions.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, paddingTop: 6 }}><View style={{ flexDirection: 'row', flexWrap: 'wrap', flexGrow: 1, flexShrink: 1, gap: 4 }}>{m.reactions.map(reaction => <Pressable key={reaction.emoji} accessibilityRole="button" accessibilityLabel={`${reaction.emoji}, ${reaction.count}${reaction.mine ? ', ваша реакция' : ''}`} onPress={() => props.onReaction(reaction.emoji)} style={{ borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: reaction.mine ? c.accent + '44' : c.elevated, borderWidth: 1, borderColor: reaction.mine ? c.accent : 'transparent' }}><Text style={{ color: c.text, fontSize: 12 }}>{reaction.emoji} {reaction.count}</Text></Pressable>)}</View>{stamp}</View> : !audioOnly ? stamp : null}
        </View>
        {props.highlighted || props.selected ? <View testID="help-message-outline" pointerEvents="none" style={[StyleSheet.absoluteFill, { ...bubbleCorners, borderWidth: 2, borderColor: c.accent }]} /> : null}
      </Pressable>
      {props.solution ? <View style={{ flexDirection: 'row', backgroundColor: c.surface, borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.line, borderBottomLeftRadius: bottomLeft, borderBottomRightRadius: bottomRight, overflow: 'hidden' }}><Pressable accessibilityRole="button" onPress={props.onCloseTicket} style={({ pressed }) => ({ flex: 1, minHeight: 33, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, opacity: pressed ? .6 : 1 })}><Ionicons name="checkmark" size={18} color={c.accentText} /><Text style={{ color: c.accentText, fontSize: 12 }}>Помогло</Text></Pressable><Pressable accessibilityRole="button" onPress={props.onRequestIt} style={({ pressed }) => ({ flex: 1, minHeight: 33, borderLeftWidth: StyleSheet.hairlineWidth, borderColor: c.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, opacity: pressed ? .6 : 1 })}><Ionicons name="headset-outline" size={17} color={c.accentText} /><Text style={{ color: c.accentText, fontSize: 12 }}>Подключить IT</Text></Pressable></View> : null}
      {props.selected ? <Modal transparent visible animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={props.onDismissMenu} statusBarTranslucent><View style={{ flex: 1 }}><Pressable testID="help-message-menu-backdrop" accessibilityRole="button" accessibilityLabel="Закрыть меню сообщения" onPress={props.onDismissMenu} style={StyleSheet.absoluteFill} /><View testID="help-message-menu" accessibilityViewIsModal style={{ position: 'absolute', top: menuTop, left: menuLeft, width: menuWidth, elevation: 8, shadowColor: '#000', shadowOpacity: .16, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, backgroundColor: c.elevated, borderRadius: 16, borderWidth: 1, borderColor: c.line, padding: 5, marginTop: 5 }}>{props.canInteract ? <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>{['❤️', '👍', '👎', '🔥', '🥰', '👏'].map(emoji => <Pressable key={emoji} accessibilityRole="button" accessibilityLabel={`Реакция ${emoji}`} onPress={() => props.onReaction(emoji)} style={{ padding: 7 }}><Text style={{ fontSize: 22 }}>{emoji}</Text></Pressable>)}</View> : null}<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }}>{props.open ? <Pressable accessibilityRole="button" onPress={props.onReply} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, padding: 7 }}><Ionicons name="return-up-back" size={18} color={c.accentText} /><Text style={{ color: c.accentText, fontSize: 11 }}>Ответить</Text></Pressable> : null}<HelpIcon name="copy-outline" label="Копировать" onPress={props.onCopy} size={18} style={{ width: 32, height: 34 }} />{canEditHelpMessage(m, props.userId) ? <HelpIcon name="pencil-outline" label="Редактировать" onPress={props.onEdit} size={18} style={{ width: 32, height: 34 }} /> : null}{props.canInteract ? <Pressable accessibilityRole="button" onPress={props.onForward} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, padding: 7 }}><Ionicons name="arrow-redo-outline" size={18} color={c.accentText} /><Text style={{ color: c.accentText, fontSize: 11 }}>Переслать</Text></Pressable> : null}</View></View></View></Modal> : null}
    </Animated.View>
  </View>;
});
