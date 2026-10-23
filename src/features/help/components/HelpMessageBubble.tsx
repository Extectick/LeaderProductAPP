import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { HelpAttachment, HelpMessage } from '../helpApi';
import { useHelpReducedMotion, useHelpTheme } from '../helpTheme';
import { canEditHelpMessage, helpFileSize, helpTime, helpReplyGesture, helpTimestampFits } from '../helpUiUtils';
import { HelpAvatar, HelpIcon } from './HelpPrimitives';
import { HelpAudio, HelpImage, type ResolveHelpMedia, type HelpImageOrigin } from './HelpMedia';

type Props = { message: HelpMessage; userId: number; open: boolean; canInteract: boolean; selected: boolean; highlighted: boolean; solution: boolean; resolve: ResolveHelpMedia; onMenu: () => void; onReply: () => void; onCopy: () => void; onEdit: () => void; onForward: () => void; onReaction: (emoji: string) => void; onQuote: (id: number) => void; onImage: (images: HelpAttachment[], index: number, origin?: HelpImageOrigin) => void; onFile: (file: HelpAttachment) => void; onCloseTicket: () => void; onRequestIt: () => void; onError: (message: string) => void };
export function HelpMessageBubble(props: Props) {
  const { message: m } = props; const c = useHelpTheme(); const own = m.authorId === props.userId; const x = useRef(new Animated.Value(0)).current; const blocked = useRef(false); const last = useRef(props); last.current = props;
  const imageRefs = useRef(new Map<string,View>());
  const mediaTouch = useRef(false);
  const swipePeak = useRef(0);
  const reducedMotion = useHelpReducedMotion();
  const reduced = useRef(reducedMotion); reduced.current = reducedMotion;
  const [textWidth, setTextWidth] = useState(0);
  const [lastLine, setLastLine] = useState<{text: string; end: number; count: number} | null>(null);
  const [rowWidth, setRowWidth] = useState(0);
  const [stampWidth, setStampWidth] = useState(0);
  const [imageRatio, setImageRatio] = useState(1);
  const onImageRatio = useCallback((ratio: number) => setImageRatio(ratio), []);
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
    if (final) setLastLine({ text: m.text, end: final.right - bounds.left, count: new Set(rects.map(rect => Math.round(rect.top))).size });
  }, [m.text, textWidth]);
  const audioOnly = !m.text && m.kind !== 'CLOSURE' && !m.reactions.length && m.attachments.length === 1 && m.attachments[0].kind === 'AUDIO';
  const inlineStamp = Boolean(m.text && !m.reactions.length && lastLine?.text === m.text && helpTimestampFits(textWidth, lastLine.end, stampWidth));
  const bubbleMinWidth = rowWidth > 0 && lastLine?.text === m.text && lastLine.count === 1 && !m.reactions.length ? Math.min(own ? rowWidth * .86 : rowWidth - 36, Math.max(90, lastLine.end + stampWidth + 30)) : 90;
  const resetSwipe = () => { if (reduced.current) x.setValue(0); else Animated.spring(x, { toValue: 0, useNativeDriver: true, damping: 24, stiffness: 260, overshootClamping: true }).start(); };
  const pan = useRef(PanResponder.create({
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
  })).current;
  if (m.kind === 'SYSTEM') return <View style={{ alignItems: 'center', paddingVertical: 10, paddingHorizontal: 30 }}><Text style={{ color: c.muted, fontSize: 12, textAlign: 'center', backgroundColor: c.elevated, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>{m.text}</Text></View>;
  const images = m.attachments.filter(a => a.kind === 'IMAGE'); const other = m.attachments.filter(a => a.kind !== 'IMAGE');
  const photoOnly = images.length > 0 && !other.length && !m.text && !m.reactions.length && m.kind !== 'CLOSURE';
  const contextProps = Platform.OS === 'web' ? { onContextMenu: (e: any) => { e.preventDefault(); props.onMenu(); }, onKeyDown: (e: any) => { if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') { e.preventDefault(); props.onMenu(); } } } : {};
  const author = m.author?.name || 'Специалист IT';
  const stamp = <View testID="help-message-time" onLayout={e => setStampWidth(e.nativeEvent.layout.width)} style={{ ...(inlineStamp || photoOnly ? { position: 'absolute' as const, right: photoOnly ? 7 : 11, bottom: photoOnly ? 7 : 8 } : { alignSelf: 'flex-end' as const, marginTop: 2 }), flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: photoOnly ? '#00000088' : undefined, borderRadius: photoOnly ? 10 : 0, paddingHorizontal: photoOnly ? 5 : 0, paddingVertical: photoOnly ? 2 : 0 }}><Text style={{ fontSize: 10, lineHeight: 12, color: photoOnly ? '#FFF' : c.muted }}>{m.editedAt ? 'изменено ' : ''}{helpTime(m.createdAt)}</Text>{own ? <Ionicons accessibilityLabel="Отправлено" name="checkmark-done" size={15} color={photoOnly ? "#FFF" : c.accentText} /> : null}</View>;
  return <View {...pan.panHandlers} onLayout={e => setRowWidth(e.nativeEvent.layout.width)} testID={`help-message-${m.id}`} style={{ marginVertical: 2, marginLeft: 12, marginRight: 12, flexDirection: 'row', alignItems: 'flex-start', justifyContent: own ? 'flex-end' : 'flex-start', gap: 8 }}>
    <Animated.View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={{ position: 'absolute', top: 18, ...(own ? { right: 22 } : { left: 42 }), opacity: x.interpolate({ inputRange: [0, 40, 72], outputRange: [0, .5, 1], extrapolate: 'clamp' }) }}><Ionicons name="return-up-back" size={20} color={c.accentText} /></Animated.View>
    {!own ? <View style={{ paddingTop: 21 }}><HelpAvatar id={m.authorId || 0} name={author} uri={m.author?.avatarUrl} size={28} /></View> : null}
    <Animated.View style={{ maxWidth: own ? '86%' : '100%', flexShrink: 1, minWidth: bubbleMinWidth, transform: [{ translateX: x }] }}>
      {!own ? <Text style={{ color: c.muted, fontSize: 11, lineHeight: 14, marginLeft: 2, marginBottom: 3 }}>{author}</Text> : null}
      <Pressable {...contextProps} accessibilityLabel={`${own ? 'Вы' : author}: ${m.text || (images.length ? 'Изображения' : 'Вложение')}. ${helpTime(m.createdAt)}`} onLongPress={props.onMenu} delayLongPress={500} style={{ borderRadius: 16, borderBottomLeftRadius: props.solution ? 0 : 16, borderBottomRightRadius: props.solution ? 0 : 16, backgroundColor: own ? c.outgoing : c.surface, overflow: 'hidden', borderWidth: props.highlighted || props.selected ? 2 : 0, borderColor: c.accent }}>
        {m.forwardedFromId ? <Text style={{ color: c.accentText, fontSize: 11, paddingHorizontal: 11, paddingTop: 8 }}>Пересланное сообщение</Text> : null}
        {m.replyTo ? <Pressable accessibilityRole="button" accessibilityLabel="Перейти к исходному сообщению" onPress={() => props.onQuote(m.replyTo!.id)} style={{ margin: 7, padding: 7, borderLeftWidth: 2, borderLeftColor: c.accent, backgroundColor: c.elevated, borderRadius: 6, flexDirection: 'row', gap: 7 }}>{m.replyTo.attachments?.find(a => a.kind === 'IMAGE') ? <HelpImage attachment={m.replyTo.attachments.find(a => a.kind === 'IMAGE')!} resolve={props.resolve} style={{ width: 34, height: 34, borderRadius: 4 }} /> : null}<View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: c.accentText, fontWeight: '600', fontSize: 12 }}>{m.replyTo.author?.name || 'Сообщение'}</Text><Text numberOfLines={2} style={{ color: c.muted, fontSize: 12 }}>{m.replyTo.text || 'Вложение'}</Text></View></Pressable> : null}
        {images.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2, width: 310, maxWidth: '100%' }}>{images.map((image, i) => <Pressable ref={ref=>{if(ref)imageRefs.current.set(image.id,ref);else imageRefs.current.delete(image.id);}} key={image.id} accessibilityRole="button" accessibilityLabel={`Открыть изображение ${i + 1} из ${images.length}`} onPress={() => {const ref=imageRefs.current.get(image.id);if(ref)ref.measureInWindow((x,y,width,height)=>props.onImage(images,i,{x,y,width,height}));else props.onImage(images,i);}} onLongPress={props.onMenu} style={{ width: images.length === 1 || (images.length === 3 && i === 0) ? '100%' : '49.6%', height: images.length === 1 ? Math.min(350, Math.min(310, (rowWidth || 369) * (own ? .86 : 1) - (own ? 0 : 36)) / imageRatio) : images.length === 3 && i === 0 ? 170 : 132 }}><HelpImage attachment={image} resolve={props.resolve} resizeMode={images.length === 1 ? "contain" : "cover"} onAspectRatio={images.length === 1 ? onImageRatio : undefined} style={{ width: '100%', height: '100%' }} /></Pressable>)}</View> : null}
        <View pointerEvents={photoOnly ? "none" : "auto"} style={photoOnly ? { position: 'absolute', left: 0, right: 0, bottom: 0, height: 30 } : { paddingHorizontal: 11, paddingVertical: audioOnly ? 6 : 8 }}>
          {m.kind === 'CLOSURE' ? <View style={{ marginBottom: 5 }}><Text style={{ color: c.text, fontWeight: '600', fontSize: 13 }}>Обращение завершено</Text><View style={{ flexDirection: 'row', gap: 3, marginTop: 5 }}>{[1, 2, 3, 4, 5].map(n => <Ionicons key={n} name={(m.rating ?? 0) >= n ? 'star' : 'star-outline'} size={17} color={(m.rating ?? 0) >= n ? '#DDA944' : c.muted} />)}<Text style={{ color: c.muted, fontSize: 12, marginLeft: 5 }}>{m.rating ?? 0}/5</Text></View></View> : null}
          {other.map(file => file.kind === 'AUDIO' ? <View key={file.id} testID="help-audio-touch" onTouchStart={() => { mediaTouch.current = true; }}><HelpAudio attachment={file} resolve={props.resolve} onError={props.onError} captionRight={audioOnly ? stamp : undefined} /></View> : <Pressable key={file.id} onPress={() => props.onFile(file)} accessibilityRole="button" accessibilityLabel={`Скачать ${file.name}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6 }}><Ionicons name="document-outline" size={28} color={c.accentText} /><View style={{ flexShrink: 1 }}><Text numberOfLines={2} style={{ color: c.text, fontSize: 13, fontWeight: '500' }}>{file.name}</Text><Text style={{ color: c.muted, fontSize: 10 }}>{helpFileSize(file.size)} · Скачать</Text></View></Pressable>)}
          {m.text ? <View testID="help-text-layout" onLayout={e => setTextWidth(e.nativeEvent.layout.width)}><Text ref={textRef} testID="help-message-text" onTextLayout={e => { const line = e.nativeEvent.lines.at(-1); setLastLine(line ? { text: m.text, end: line.x + line.width, count: e.nativeEvent.lines.length } : null); }} style={{ color: c.text, fontSize: 14, lineHeight: 19 }}>{m.text}</Text></View> : null}
          {m.reactions.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, paddingTop: 6 }}><View style={{ flexDirection: 'row', flexWrap: 'wrap', flexGrow: 1, flexShrink: 1, gap: 4 }}>{m.reactions.map(reaction => <Pressable key={reaction.emoji} accessibilityRole="button" accessibilityLabel={`${reaction.emoji}, ${reaction.count}${reaction.mine ? ', ваша реакция' : ''}`} onPress={() => props.onReaction(reaction.emoji)} style={{ borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: reaction.mine ? c.accent + '44' : c.elevated, borderWidth: 1, borderColor: reaction.mine ? c.accent : 'transparent' }}><Text style={{ color: c.text, fontSize: 12 }}>{reaction.emoji} {reaction.count}</Text></Pressable>)}</View>{stamp}</View> : !audioOnly ? stamp : null}
        </View>
      </Pressable>
      {props.solution ? <View style={{ flexDirection: 'row', backgroundColor: c.surface, borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.line, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, overflow: 'hidden' }}><Pressable accessibilityRole="button" onPress={props.onCloseTicket} style={({ pressed }) => ({ flex: 1, minHeight: 33, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, opacity: pressed ? .6 : 1 })}><Ionicons name="checkmark" size={18} color={c.accentText} /><Text style={{ color: c.accentText, fontSize: 12 }}>Помогло</Text></Pressable><Pressable accessibilityRole="button" onPress={props.onRequestIt} style={({ pressed }) => ({ flex: 1, minHeight: 33, borderLeftWidth: StyleSheet.hairlineWidth, borderColor: c.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, opacity: pressed ? .6 : 1 })}><Ionicons name="headset-outline" size={17} color={c.accentText} /><Text style={{ color: c.accentText, fontSize: 12 }}>Подключить IT</Text></Pressable></View> : null}
      {props.selected ? <View style={{ backgroundColor: c.elevated, borderRadius: 16, borderWidth: 1, borderColor: c.line, padding: 5, marginTop: 5 }}>{props.canInteract ? <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>{['❤️', '👍', '👎', '🔥', '🥰', '👏'].map(emoji => <Pressable key={emoji} accessibilityRole="button" accessibilityLabel={`Реакция ${emoji}`} onPress={() => props.onReaction(emoji)} style={{ padding: 7 }}><Text style={{ fontSize: 22 }}>{emoji}</Text></Pressable>)}</View> : null}<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }}>{props.open ? <Pressable accessibilityRole="button" onPress={props.onReply} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, padding: 7 }}><Ionicons name="return-up-back" size={18} color={c.accentText} /><Text style={{ color: c.accentText, fontSize: 11 }}>Ответить</Text></Pressable> : null}<HelpIcon name="copy-outline" label="Копировать" onPress={props.onCopy} size={18} style={{ width: 32, height: 34 }} />{canEditHelpMessage(m, props.userId) ? <HelpIcon name="pencil-outline" label="Редактировать" onPress={props.onEdit} size={18} style={{ width: 32, height: 34 }} /> : null}{props.canInteract ? <Pressable accessibilityRole="button" onPress={props.onForward} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, padding: 7 }}><Ionicons name="arrow-redo-outline" size={18} color={c.accentText} /><Text style={{ color: c.accentText, fontSize: 11 }}>Переслать</Text></Pressable> : null}</View></View> : null}
    </Animated.View>
  </View>;
}
