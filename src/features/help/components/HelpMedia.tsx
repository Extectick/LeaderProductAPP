import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type ImageStyle, type StyleProp } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { HelpAttachment } from '../helpApi';
import { useHelpTheme } from '../helpTheme';
import { helpDuration, helpFileSize } from '../helpUiUtils';
import { HelpIcon, HelpPrimaryButton, HelpSheet } from './HelpPrimitives';

export type HelpMediaSource = { uri: string; headers?: Record<string, string> };
export type HelpImageOrigin = { x: number; y: number; width: number; height: number };
export type ResolveHelpMedia = (attachment: HelpAttachment) => Promise<HelpMediaSource>;
export function HelpImage({ attachment, resolve, style, resizeMode = 'cover' }: { attachment: HelpAttachment; resolve: ResolveHelpMedia; style?: StyleProp<ImageStyle>; resizeMode?: 'cover' | 'contain' }) {
  const [source, setSource] = useState<HelpMediaSource>(); const [error, setError] = useState(false); const c = useHelpTheme();
  useEffect(() => { let alive = true; setError(false); void resolve(attachment).then(value => { if (alive) setSource(value); }).catch(() => { if (alive) setError(true); }); return () => { alive = false; }; }, [attachment.id, resolve]);
  return source && !error ? <Image accessibilityLabel={attachment.name} source={source} style={style} resizeMode={resizeMode} onError={() => setError(true)} /> : <View style={[style, { alignItems: 'center', justifyContent: 'center', backgroundColor: c.elevated }]}>{error ? <Text style={{ color: c.muted }}>Не удалось загрузить</Text> : <ActivityIndicator color={c.accent} />}</View>;
}
export async function downloadHelpAttachment(attachment: HelpAttachment, resolve: ResolveHelpMedia) {
  const source = await resolve(attachment);
  if (Platform.OS === 'web') {
    const response = await fetch(source.uri, { headers: source.headers });
    if (!response.ok) throw new Error('Не удалось скачать файл');
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a'); link.href = url; link.download = attachment.name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } else {
    const filename = attachment.name.replace(/[^\p{L}\p{N}._-]/gu, '_');
    const path = `${FileSystem.cacheDirectory}help-${attachment.id}-${filename}`;
    const result = await FileSystem.downloadAsync(source.uri, path, { headers: source.headers });
    if (result.status !== 200) throw new Error('Не удалось скачать файл');
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(result.uri, { mimeType: attachment.mimeType, dialogTitle: 'Сохранить файл' });
  }
}
export function HelpAudio({ attachment, resolve, onError }: { attachment: HelpAttachment; resolve: ResolveHelpMedia; onError: (text: string) => void }) {
  const c = useHelpTheme(); const player = useAudioPlayer(null, { updateInterval: 100 }); const status = useAudioPlayerStatus(player);
  const [ready, setReady] = useState(false); const [progress, setProgress] = useState(0); const [width, setWidth] = useState(180);
  useEffect(() => { let alive = true; void resolve(attachment).then(source => { if (alive) { player.replace(source); setReady(true); } }).catch(() => onError('Не удалось загрузить голосовое сообщение')); return () => { alive = false; }; }, [attachment.id, resolve, player]);
  useEffect(() => { let frame: number; const update = () => { setProgress(status.duration > 0 ? Math.min(1, player.currentTime / status.duration) : 0); if (status.playing) frame = requestAnimationFrame(update); }; update(); return () => cancelAnimationFrame(frame); }, [status.playing, status.currentTime, status.duration, player]);
  const seek = (x: number) => { if (ready && status.duration) void player.seekTo(Math.max(0, Math.min(1, x / width)) * status.duration).catch(() => onError('Не удалось перемотать аудио')); };
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 220, maxWidth: 320, paddingVertical: 4 }}>
    <HelpIcon name={status.playing ? 'pause' : 'play'} label={status.playing ? 'Пауза' : 'Воспроизвести голосовое сообщение'} disabled={!ready} color="#FFF" style={{ backgroundColor: c.accent, width: 38, height: 38 }} onPress={() => { try { if (status.playing) player.pause(); else { if (status.didJustFinish) void player.seekTo(0); player.play(); } } catch { onError('Не удалось воспроизвести аудио'); } }} />
    <View style={{ flex: 1 }}><View accessibilityRole="adjustable" accessibilityLabel="Позиция голосового сообщения" accessibilityValue={{ min: 0, max: Math.floor(status.duration || 0), now: Math.floor(status.currentTime || 0) }} accessibilityActions={[{ name: 'increment', label: 'Вперёд на 5 секунд' }, { name: 'decrement', label: 'Назад на 5 секунд' }]} onAccessibilityAction={e => { void player.seekTo(Math.max(0, Math.min(status.duration, status.currentTime + (e.nativeEvent.actionName === 'increment' ? 5 : -5)))); }} onLayout={e => setWidth(e.nativeEvent.layout.width)} onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true} onResponderGrant={e => seek(e.nativeEvent.locationX)} onResponderMove={e => seek(e.nativeEvent.locationX)} style={{ height: 28, justifyContent: 'center', overflow: 'hidden' }}>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: c.accentText + '44' }} /><View pointerEvents="none" style={{ position: 'absolute', left: 0, height: 4, borderRadius: 2, width: `${progress * 100}%`, backgroundColor: c.accentText }} /><View pointerEvents="none" style={{ position: 'absolute', left: Math.max(0, progress * width - 5), height: 10, width: 10, borderRadius: 5, backgroundColor: c.accentText }} />
    </View><Text style={{ fontSize: 10, color: c.muted }}>{helpDuration(status.currentTime || 0)} / {status.duration ? helpDuration(status.duration) : helpFileSize(attachment.size)}</Text></View>
  </View>;
}
export function HelpGallery({ attachments, initialIndex, resolve, onClose, onError, origin }: { attachments: HelpAttachment[]; initialIndex: number; resolve: ResolveHelpMedia; onClose: () => void; onError: (text: string) => void; origin?: HelpImageOrigin }) {
  const [index, setIndex] = useState(initialIndex); const [downloadMenu, setDownloadMenu] = useState(false); const [busy, setBusy] = useState(false);
  const y = useRef(new Animated.Value(0)).current; const reveal = useRef(new Animated.Value(0)).current; const insets = useSafeAreaInsets(); const size = useWindowDimensions();
  const imageHeight = Math.max(100, size.height - insets.top - insets.bottom - 124);
  useEffect(() => { Animated.spring(reveal, { toValue: 1, useNativeDriver: true, damping: 24 }).start(); }, []);
  const close = () => Animated.timing(reveal, { toValue: 0, duration: 180, useNativeDriver: true }).start(onClose);
  const dismissDown = () => Animated.timing(y, { toValue: size.height, duration: 180, useNativeDriver: true }).start(onClose);
  const pan = useRef(PanResponder.create({ onMoveShouldSetPanResponder: (_, g) => g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx), onPanResponderMove: (_, g) => y.setValue(Math.max(0, g.dy)), onPanResponderRelease: (_, g) => g.dy > 110 || g.vy > 1.1 ? dismissDown() : Animated.spring(y, { toValue: 0, damping: 24, useNativeDriver: true }).start() })).current;
  const download = async (all: boolean) => { setDownloadMenu(false); setBusy(true); try { for (const file of all ? attachments : [attachments[index]]) await downloadHelpAttachment(file, resolve); } catch { onError('Не удалось скачать изображение'); } finally { setBusy(false); } };
  return <Modal transparent animationType="none" onRequestClose={close} statusBarTranslucent><Animated.View style={{ flex: 1, backgroundColor: '#080D12', opacity: Animated.multiply(reveal,y.interpolate({ inputRange: [0, size.height], outputRange: [1, .1] })) }}><View style={{ paddingTop: insets.top + 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', zIndex: 3 }}><Text style={{ flex: 1, color: '#FFF' }}>{index + 1} из {attachments.length}</Text><HelpIcon name="download-outline" label="Скачать" disabled={busy} onPress={() => attachments.length > 1 ? setDownloadMenu(true) : void download(false)} color="#FFF" /><HelpIcon name="close-outline" label="Закрыть изображение" onPress={close} color="#FFF" /></View><Animated.View {...pan.panHandlers} style={{ flex: 1, transform: [{ translateY: Animated.add(y,reveal.interpolate({inputRange:[0,1],outputRange:[origin ? origin.y+origin.height/2-(insets.top+52+imageHeight/2) : 0,0]})) }, { translateX: reveal.interpolate({inputRange:[0,1],outputRange:[origin ? origin.x+origin.width/2-size.width/2 : 0,0]}) }, { scaleX: reveal.interpolate({inputRange:[0,1],outputRange:[origin ? origin.width/size.width : .9,1]}) }, { scaleY: reveal.interpolate({inputRange:[0,1],outputRange:[origin ? origin.height/imageHeight : .9,1]}) }] }}><HelpImage attachment={attachments[index]} resolve={resolve} resizeMode="contain" style={{ width: '100%', height: '100%' }} /></Animated.View><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, paddingBottom: Math.max(insets.bottom, 12) }}><HelpIcon name="chevron-back" label="Предыдущее изображение" disabled={index === 0} onPress={() => setIndex(i => i - 1)} color="#FFF" /><Pressable accessibilityRole="button" disabled={busy} onPress={() => attachments.length > 1 ? setDownloadMenu(true) : void download(false)} style={{ padding: 12 }}><Text style={{ color: '#FFF' }}>{busy ? 'Скачивание…' : 'Скачать изображение'}</Text></Pressable><HelpIcon name="chevron-forward" label="Следующее изображение" disabled={index === attachments.length - 1} onPress={() => setIndex(i => i + 1)} color="#FFF" /></View></Animated.View>{downloadMenu ? <HelpSheet title="Скачать изображения" onClose={() => setDownloadMenu(false)}><HelpPrimaryButton text="Только это изображение" icon="download-outline" onPress={() => void download(false)} /><View style={{ height: 10 }} /><HelpPrimaryButton text={`Все изображения (${attachments.length})`} icon="images-outline" onPress={() => void download(true)} /></HelpSheet> : null}</Modal>;
}
