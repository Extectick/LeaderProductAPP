import React, { useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type ImageStyle, type StyleProp } from 'react-native';
import { Image as CachedImage } from 'expo-image';
import { HelpImageCacheContext, HelpMediaLoadingContext } from '../helpMediaLoading';
import { useHelpAudioPlayback, type HelpAudioPlaybackController } from '../HelpAudioPlayback';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { HelpAttachment } from '../helpApi';
import { useHelpTheme, useHelpReducedMotion } from '../helpTheme';
import { helpDuration, helpFileSize } from '../helpUiUtils';
import { HelpIcon } from './HelpPrimitives';

export type HelpMediaSource = { uri: string; headers?: Record<string, string>; cacheKey?:string };
export type HelpImageOrigin = { x: number; y: number; width: number; height: number };
export type ResolveHelpMedia = (attachment: HelpAttachment) => Promise<HelpMediaSource>;
// Fixed decorative player iconography from the approved prototype, not measured
// file amplitude. Only the clipping position represents real playback progress.
const decorativeTrackBars = [9, 15, 11, 23, 30, 18, 12, 26, 34, 21, 15, 10, 19, 29, 24, 13, 8, 17, 31, 26, 16, 22, 32, 19, 11, 16, 25, 13];
export function HelpImage({ attachment, resolve, style, resizeMode = 'cover', onAspectRatio }: { attachment: HelpAttachment; resolve: ResolveHelpMedia; style?: StyleProp<ImageStyle>; resizeMode?: 'cover' | 'contain'; onAspectRatio?: (ratio: number) => void }) {
  const proximity=useContext(HelpMediaLoadingContext),cache=useContext(HelpImageCacheContext),c=useHelpTheme(),reduced=useHelpReducedMotion();
  const allowOriginal=proximity==='visible'||proximity==='near';
  const identity=useRef({id:attachment.id,url:attachment.url,resolve});identity.current={id:attachment.id,url:attachment.url,resolve};
  const [result,setResult]=useState<{id:string;url:string;resolver:ResolveHelpMedia;source?:HelpMediaSource;error?:boolean;loaded?:boolean}>();
  const cached=cache?.read(resolve,attachment);
  const own=result?.id===attachment.id && result.url===attachment.url && result.resolver===resolve?result:undefined;
  const current=own??(cached?{id:attachment.id,url:attachment.url,resolver:resolve,source:cached,loaded:true}:undefined);
  const restored=Boolean(!own&&cached);
  const thumbnail=attachment.thumbnailDataUri && /^data:image\/(jpeg|webp|png);base64,/.test(attachment.thumbnailDataUri) && attachment.thumbnailDataUri.length<=3072 ? attachment.thumbnailDataUri : undefined;
  useEffect(()=>{
    if(!allowOriginal||cached)return;
    let alive=true;
    void resolve(attachment).then(source=>{if(alive)setResult(previous=>previous?.id===attachment.id && previous.url===attachment.url && previous.resolver===resolve && previous.source?.uri===source.uri?previous:{id:attachment.id,url:attachment.url,resolver:resolve,source});})
      .catch(()=>{if(alive)setResult({id:attachment.id,url:attachment.url,resolver:resolve,error:true});});
    return()=>{alive=false;};
  },[attachment.id,attachment.url,resolve,allowOriginal,cached]);
  const loaded=(event:any)=>{
    if(identity.current.id!==attachment.id||identity.current.url!==attachment.url||identity.current.resolve!==resolve)return;
    if(current?.source)cache?.remember(resolve,attachment,current.source);
    setResult(previous=>previous?.id===attachment.id && previous.url===attachment.url && previous.resolver===resolve?{...previous,loaded:true}:previous);
    const native=event.source?undefined:event.nativeEvent;
    const target=native?.target??native?.currentTarget??event.target??event.currentTarget;
    const width=event.source?.width??native?.source?.width??target?.naturalWidth??0;
    const height=event.source?.height??native?.source?.height??target?.naturalHeight??0;
    if(Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0)onAspectRatio?.(width/height);
  };
  const failed=()=>{
    if(identity.current.id!==attachment.id||identity.current.url!==attachment.url||identity.current.resolve!==resolve)return;
    cache?.forget(resolve,attachment);
    // Native cache eviction may require a fresh authorised source. Retry that
    // once for a real cell; transition copies never start their own requests.
    setResult({id:attachment.id,url:attachment.url,resolver:resolve,error:!(restored&&allowOriginal)});
  };
  const original=current?.source && !current.error && (allowOriginal||current.loaded) ? current.source : undefined;
  return <View testID="help-progressive-image" style={[style,{overflow:'hidden',backgroundColor:c.elevated}]}>
    {thumbnail ? <Image testID="help-image-preview" source={{uri:thumbnail}} resizeMode={resizeMode} style={StyleSheet.absoluteFill} blurRadius={2}/> : null}
    {original ? Platform.OS==='web' ? <Image accessibilityLabel={attachment.name} source={original} style={StyleSheet.absoluteFill} resizeMode={resizeMode} onLoad={loaded} onError={failed}/> : <CachedImage testID="help-image-original" accessibilityLabel={attachment.name} source={original} style={StyleSheet.absoluteFill} contentFit={resizeMode} placeholder={thumbnail?{uri:thumbnail}:undefined} placeholderContentFit={resizeMode} cachePolicy="memory-disk" recyclingKey={original.cacheKey??attachment.id} priority={proximity==='visible'?'high':'low'} transition={reduced||restored?0:120} onLoad={loaded} onError={failed}/> : null}
    {!current?.loaded ? <View pointerEvents="none" style={[StyleSheet.absoluteFill,{alignItems:'center',justifyContent:'center'}]}>{current?.error ? <Ionicons name="image-outline" accessibilityLabel="Изображение недоступно" size={24} color={c.muted}/> : allowOriginal ? <View style={{padding:9,borderRadius:22,backgroundColor:'#00000038'}}><ActivityIndicator color="#FFFFFF"/></View> : null}</View> : null}
  </View>;
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
type HelpAudioProps = { attachment: HelpAttachment; resolve: ResolveHelpMedia; onError: (text: string) => void; captionRight?: React.ReactNode; messageId?: number; author?: string; createdAt?: string; ticketId?: number };
export function HelpAudio(props: HelpAudioProps) {
  const playback = useHelpAudioPlayback();
  const identity = `${props.ticketId ?? ''}:${props.messageId ?? ''}:${props.attachment.id}`;
  // Keep native hooks outside the shared path: recycled rows must not allocate
  // players or download audio merely by entering the rendering window.
  return playback && props.messageId !== undefined
    ? <SharedHelpAudio key={identity} {...props} messageId={props.messageId} playback={playback}/>
    : <StandaloneHelpAudio key={identity} {...props}/>;
}
function SharedHelpAudio(props: HelpAudioProps & { messageId: number; playback: HelpAudioPlaybackController }) {
  const { attachment, resolve, messageId, author = '', createdAt = '', ticketId, playback } = props;
  const active = playback.current?.attachment.id === attachment.id && playback.current.messageId === messageId && (ticketId === undefined || playback.current.ticketId === undefined || playback.current.ticketId === ticketId);
  return <HelpAudioView key={active ? 'active' : 'inactive'} {...props}
    ready={active && playback.ready} loading={active && playback.loading} playing={active && playback.playing}
    currentTime={active ? playback.positionSeconds : 0} duration={active ? playback.durationSeconds : 0} rate={playback.speed}
    onPlay={() => active ? playback.toggle() : playback.play({ attachment, messageId, author, createdAt, ticketId }, resolve)}
    onSeek={async seconds => { if (active) await playback.seek(seconds); }}/>
}
function StandaloneHelpAudio(props: HelpAudioProps) {
  const { attachment, resolve } = props;
  const player = useAudioPlayer(null, { updateInterval: 100 }), status = useAudioPlayerStatus(player);
  const [prepared, setPrepared] = useState(false), [loading, setLoading] = useState(false);
  const lifecycle = useRef({ mounted: false, generation: 0, prepared: false, pending: false });
  const resolver = useRef(resolve); resolver.current = resolve;
  const report = useRef(props.onError); report.current = props.onError;
  useEffect(() => {
    const life = lifecycle.current; life.mounted = true; life.prepared = false; life.pending = false;
    setPrepared(false); setLoading(false);
    return () => {
      life.mounted = false; life.generation++; life.pending = false;
      if (life.prepared) {
        try { player.pause(); player.replace(null); } catch { /* Native hook owns final disposal. */ }
      }
      life.prepared = false;
    };
  }, [player, resolve]);
  const play = async () => {
    const life = lifecycle.current, generation = life.generation;
    const current = () => life.mounted && life.generation === generation && resolver.current === resolve;
    if (!current() || life.pending) return;
    try {
      if (!life.prepared) {
        life.pending = true; setLoading(true);
        const source = await resolve(attachment);
        if (!current()) return;
        player.replace(source); life.prepared = true; setPrepared(true); player.play();
      } else if (status.playing) player.pause();
      else {
        if (status.didJustFinish) await player.seekTo(0);
        if (current()) player.play();
      }
    } catch { if (current()) report.current('Не удалось воспроизвести голосовое сообщение'); }
    finally { if (current()) { life.pending = false; setLoading(false); } }
  };
  return <HelpAudioView {...props} ready={prepared && status.isLoaded !== false} loading={loading || (prepared && status.isLoaded === false)}
    playing={prepared && status.playing} currentTime={prepared ? status.currentTime : 0} duration={prepared ? status.duration : 0} rate={status.playbackRate}
    onPlay={play} onSeek={async seconds => { if (lifecycle.current.mounted && lifecycle.current.prepared) await player.seekTo(seconds); }}/>
}
type HelpAudioViewProps = Pick<HelpAudioProps, 'attachment' | 'captionRight' | 'onError'> & { ready: boolean; loading: boolean; playing: boolean; currentTime: number; duration: number; rate: number; onPlay: () => Promise<void>; onSeek: (seconds: number) => Promise<void> };
function HelpAudioView({ attachment, captionRight, onError, ready, loading, playing, currentTime, duration, rate, onPlay, onSeek }: HelpAudioViewProps) {
  const c = useHelpTheme();
  const [progress, setProgress] = useState(0); const [width, setWidth] = useState(180);
  const alive = useRef(true); const latest = useRef({ onError, onPlay, onSeek, ready }); latest.current = { onError, onPlay, onSeek, ready };
  const seekVersion = useRef(0); const seeking = useRef(false);
  const clock = useRef({ time: 0, at: 0, playing: false, duration: 0, rate: 1 });
  useEffect(() => { alive.current = true; return () => { alive.current = false; seekVersion.current++; }; }, []);
  useEffect(() => {
    clock.current = { time: currentTime || 0, at: performance.now(), playing, duration: duration || 0, rate: rate || 1 };
    let frame: number | undefined;
    const update = (now: number) => {
      const value = clock.current;
      // Interpolate real playback position between Expo status samples. This is
      // playback indicator; decorative bars do not encode audio amplitude.
      if (!seeking.current) setProgress(value.duration > 0 ? Math.max(0, Math.min(1, (value.time + (value.playing ? Math.max(0, now - value.at) / 1000 * value.rate : 0)) / value.duration)) : 0);
      if (value.playing) frame = requestAnimationFrame(update);
    };
    update(performance.now());
    return () => { if (frame !== undefined) cancelAnimationFrame(frame); };
  }, [playing, currentTime, duration, rate]);
  const seekTime = async (time: number) => {
    if (!alive.current || !latest.current.ready || !duration || !Number.isFinite(time)) return;
    const target = Math.max(0, Math.min(duration, time)); const version = ++seekVersion.current;
    seeking.current = true; setProgress(target / duration);
    try { await latest.current.onSeek(target); if (alive.current && version === seekVersion.current) clock.current = { ...clock.current, time: target, at: performance.now() }; }
    catch { if (alive.current && version === seekVersion.current) latest.current.onError('Не удалось перемотать аудио'); }
    finally { if (version === seekVersion.current) seeking.current = false; }
  };
  const seek = (x: number) => { if (width > 0) void seekTime(x / width * (duration || 0)); };
  const play = async () => { if (!alive.current) return; try { await latest.current.onPlay(); } catch { if (alive.current) latest.current.onError('Не удалось воспроизвести аудио'); } };
  return <View testID="help-audio" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 218, maxWidth: 320, paddingVertical: 0 }}>
    {loading ? <Pressable accessibilityRole="button" accessibilityLabel="Загрузка голосового сообщения" accessibilityState={{ busy: true }} onPress={() => void play()} style={{ backgroundColor: c.accentText, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator testID="help-audio-loading" size="small" color="#FFF"/></Pressable> : <HelpIcon name={playing ? 'pause' : 'play'} label={playing ? 'Пауза' : 'Воспроизвести голосовое сообщение'} color="#FFF" size={20} style={{ backgroundColor: c.accentText, width: 36, height: 36, borderRadius: 18 }} onPress={() => void play()} />}
    <View style={{ flex: 1, minWidth: 0 }}><View testID="help-audio-seek" accessible accessibilityRole="adjustable" accessibilityLabel="Позиция голосового сообщения" accessibilityState={{ disabled: !ready }} accessibilityValue={{ min: 0, max: Math.floor(duration || 0), now: Math.floor(progress * (duration || 0)) }} accessibilityActions={[{ name: 'increment', label: 'Вперёд на 5 секунд' }, { name: 'decrement', label: 'Назад на 5 секунд' }]} onAccessibilityAction={e => { if (['increment', 'decrement'].includes(e.nativeEvent.actionName)) void seekTime(progress * duration + (e.nativeEvent.actionName === 'increment' ? 5 : -5)); }} onLayout={e => setWidth(e.nativeEvent.layout.width)} onStartShouldSetResponder={() => ready} onMoveShouldSetResponder={() => ready} onResponderGrant={e => seek(e.nativeEvent.locationX)} onResponderMove={e => seek(e.nativeEvent.locationX)} style={{ height: 28, justifyContent: 'center', overflow: 'hidden', borderRadius: 5 }}>
      <View testID="help-audio-decorative-track" pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height: 28, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        {decorativeTrackBars.map((height, i) => <View key={i} style={{ width: 3, height: height * .65, borderRadius: 3, backgroundColor: c.accentText, opacity: .3 }} />)}
      </View>
      <View testID="help-audio-progress" pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: 0, top: 0, height: 28, width: `${progress * 100}%`, overflow: 'hidden' }}>
        <View style={{ width, height: 28, flexDirection: 'row', alignItems: 'center', gap: 3 }}>{decorativeTrackBars.map((height, i) => <View key={i} style={{ width: 3, height: height * .65, borderRadius: 3, backgroundColor: c.accentText }} />)}</View>
      </View>
    </View><View testID="help-audio-caption" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 12 }}><Text numberOfLines={1} style={{ fontSize: 10, lineHeight: 12, color: c.muted, fontVariant: ['tabular-nums'] }}>{helpDuration(progress * (duration || 0))} / {duration ? helpDuration(duration) : helpFileSize(attachment.size)}</Text>{captionRight}</View></View>
  </View>;
}
export function HelpGallery({ attachments, initialIndex, resolve, onClose, onError, origin }: { attachments: HelpAttachment[]; initialIndex: number; resolve: ResolveHelpMedia; onClose: () => void; onError: (text: string) => void; origin?: HelpImageOrigin }) {
  const [index, setIndex] = useState(Math.max(0, Math.min(attachments.length - 1, initialIndex))); const [downloadMenu, setDownloadMenu] = useState(false); const [busy, setBusy] = useState(false);
  const y = useRef(new Animated.Value(0)).current; const reveal = useRef(new Animated.Value(0)).current; const insets = useSafeAreaInsets(); const size = useWindowDimensions();
  const reduced = useHelpReducedMotion(); const life = useRef({ alive: true, closing: false, downloading: false });
  const latest = useRef({ onClose, onError }); latest.current = { onClose, onError };
  const motion = useRef<Animated.CompositeAnimation | undefined>(undefined);
  const imageHeight = Math.max(100, size.height - insets.top - Math.max(insets.bottom, 12) - 140);
  useEffect(() => { life.current.alive = true; return () => { life.current.alive = false; motion.current?.stop(); y.stopAnimation(); reveal.stopAnimation(); }; }, [y, reveal]);
  useEffect(() => { if (life.current.closing) return; motion.current?.stop(); if (reduced) reveal.setValue(1); else { motion.current = Animated.spring(reveal, { toValue: 1, useNativeDriver: true, damping: 24 }); motion.current.start(); } }, [reduced, reveal]);
  const finish = (down: boolean) => {
    if (life.current.closing || !life.current.alive) return;
    life.current.closing = true; motion.current?.stop();
    if (reduced) { latest.current.onClose(); return; }
    motion.current = Animated.timing(down ? y : reveal, { toValue: down ? size.height : 0, duration: 180, useNativeDriver: true });
    motion.current.start(({ finished }) => { if (finished && life.current.alive) latest.current.onClose(); });
  };
  const restore = () => { if (life.current.closing) return; motion.current?.stop(); if (reduced) y.setValue(0); else { motion.current = Animated.spring(y, { toValue: 0, damping: 24, useNativeDriver: true }); motion.current.start(); } };
  const gesture = useRef({ finish, restore }); gesture.current = { finish, restore };
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => !life.current.closing && g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderGrant: () => y.stopAnimation(),
    onPanResponderMove: (_, g) => { if (!life.current.closing) y.setValue(Math.max(0, g.dy)); },
    onPanResponderRelease: (_, g) => g.dy > 110 || (g.dy > 10 && g.vy > 1.1) ? gesture.current.finish(true) : gesture.current.restore(),
    onPanResponderTerminate: () => gesture.current.restore(),
    onPanResponderTerminationRequest: () => true,
  })).current;
  const download = async (all: boolean) => {
    if (life.current.downloading) return;
    life.current.downloading = true; setDownloadMenu(false); setBusy(true);
    try { for (const file of all ? attachments : [attachments[index]]) { if (!life.current.alive) break; await downloadHelpAttachment(file, resolve); } }
    catch { if (life.current.alive) latest.current.onError('Не удалось скачать изображение'); }
    finally { life.current.downloading = false; if (life.current.alive) setBusy(false); }
  };
  const requestDownload = () => attachments.length > 1 ? setDownloadMenu(value => !value) : void download(false);
  const close = () => finish(false);
  const opacity = Animated.multiply(reveal, y.interpolate({ inputRange: [0, size.height], outputRange: [1, .1], extrapolate: 'clamp' }));
  const roundButton = { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF16' };
  return <Modal transparent animationType="none" onRequestClose={() => downloadMenu ? setDownloadMenu(false) : close()} statusBarTranslucent>
    <View style={{ flex: 1, overflow: 'hidden' }}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#090B10', opacity }]} />
      <Animated.View style={{ flex: 1, opacity }}>
        <View style={{ paddingTop: insets.top + 5, paddingBottom: 5, paddingHorizontal: 12, gap: 6, flexDirection: 'row', alignItems: 'center', zIndex: 3 }}>
          <Text style={{ flex: 1, fontSize: 13, color: '#C9D1DD' }}>{index + 1} из {attachments.length}</Text>
          <HelpIcon name="download-outline" label="Скачать" disabled={busy} onPress={requestDownload} color="#FFF" style={roundButton} />
          <HelpIcon name="close-outline" label="Закрыть изображение" onPress={close} color="#FFF" style={roundButton} />
        </View>
        <View testID="help-gallery-stage" {...pan.panHandlers} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <Animated.View style={{ flex: 1, transform: [{ translateY: Animated.add(y, reveal.interpolate({ inputRange: [0, 1], outputRange: [origin ? origin.y + origin.height / 2 - (insets.top + 50 + imageHeight / 2) : 0, 0] })) }, { translateX: reveal.interpolate({ inputRange: [0, 1], outputRange: [origin ? origin.x + origin.width / 2 - size.width / 2 : 0, 0] }) }, { scaleX: reveal.interpolate({ inputRange: [0, 1], outputRange: [origin ? origin.width / size.width : .9, 1] }) }, { scaleY: reveal.interpolate({ inputRange: [0, 1], outputRange: [origin ? origin.height / imageHeight : .9, 1] }) }] }}>
            <HelpImage attachment={attachments[index]} resolve={resolve} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
          </Animated.View>
          {attachments.length > 1 ? <><HelpIcon name="chevron-back" label="Предыдущее изображение" disabled={index === 0} onPress={() => setIndex(i => Math.max(0, i - 1))} color="#FFF" style={{ position: 'absolute', left: 8, top: '50%', marginTop: -20, width: 34, height: 40, borderRadius: 20, backgroundColor: '#00000088' }} /><HelpIcon name="chevron-forward" label="Следующее изображение" disabled={index === attachments.length - 1} onPress={() => setIndex(i => Math.min(attachments.length - 1, i + 1))} color="#FFF" style={{ position: 'absolute', right: 8, top: '50%', marginTop: -20, width: 34, height: 40, borderRadius: 20, backgroundColor: '#00000088' }} /></> : null}
        </View>
        <View testID="help-gallery-footer" style={{ alignItems: 'center', gap: 12, padding: 12, paddingBottom: Math.max(insets.bottom, 12) }}>
          <Text numberOfLines={1} style={{ maxWidth: '100%', fontSize: 12, color: '#C9D1DD' }}>{attachments[index].name}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Скачать изображение" disabled={busy} onPress={requestDownload} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 10, paddingHorizontal: 22, borderRadius: 22, backgroundColor: '#FFFFFF19' }}><Ionicons name="download-outline" size={18} color="#FFF" /><Text style={{ color: '#FFF', fontSize: 14 }}>{busy ? 'Скачивание…' : 'Скачать изображение'}</Text></Pressable>
        </View>
      </Animated.View>
      {downloadMenu ? <><Pressable accessibilityLabel="Закрыть выбор скачивания" onPress={() => setDownloadMenu(false)} style={StyleSheet.absoluteFill} /><View accessibilityRole="menu" style={{ position: 'absolute', bottom: Math.max(insets.bottom, 12) + 103, left: 12, right: 12, padding: 5, borderWidth: 1, borderColor: '#FFFFFF22', borderRadius: 15, backgroundColor: '#242B37' }}><Pressable accessibilityRole="menuitem" onPress={() => void download(false)} style={{ padding: 13 }}><Text style={{ color: '#FFF', fontSize: 14 }}>Только это изображение</Text></Pressable><Pressable accessibilityRole="menuitem" onPress={() => void download(true)} style={{ padding: 13 }}><Text style={{ color: '#FFF', fontSize: 14 }}>Все изображения ({attachments.length})</Text></Pressable></View></> : null}
    </View>
  </Modal>;
}
