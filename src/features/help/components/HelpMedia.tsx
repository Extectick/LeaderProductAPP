import React, { memo, useCallback, useContext, useEffect, useRef, useState } from 'react';
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
  const identity=useRef({id:attachment.id,url:attachment.url,resolve,generation:0});
  if(identity.current.id!==attachment.id||identity.current.url!==attachment.url||identity.current.resolve!==resolve)identity.current={id:attachment.id,url:attachment.url,resolve,generation:identity.current.generation+1};
  const imageGeneration=identity.current.generation;
  const [result,setResult]=useState<{id:string;url:string;resolver:ResolveHelpMedia;source?:HelpMediaSource;error?:boolean;loaded?:boolean}>();
  const [decoded,setDecoded]=useState<{generation:number}>();
  const pixelsReady=decoded?.generation===imageGeneration;
  const cached=cache?.read(resolve,attachment);
  const own=result?.id===attachment.id && result.url===attachment.url && result.resolver===resolve?result:undefined;
  const current=attachment.localUri?{id:attachment.id,url:attachment.url,resolver:resolve,source:{uri:attachment.localUri},loaded:true}:own??(cached?{id:attachment.id,url:attachment.url,resolver:resolve,source:cached,loaded:true}:undefined);
  const restored=Boolean(!own&&cached);
  const thumbnail=attachment.thumbnailDataUri && /^data:image\/(jpeg|webp|png);base64,/.test(attachment.thumbnailDataUri) && attachment.thumbnailDataUri.length<=3072 ? attachment.thumbnailDataUri : undefined;
  useEffect(()=>{
    if(attachment.localUri||!allowOriginal||cached)return;
    let alive=true;
    void resolve(attachment).then(source=>{if(alive)setResult(previous=>previous?.id===attachment.id && previous.url===attachment.url && previous.resolver===resolve && previous.source?.uri===source.uri?previous:{id:attachment.id,url:attachment.url,resolver:resolve,source});})
      .catch(()=>{if(alive)setResult({id:attachment.id,url:attachment.url,resolver:resolve,error:true});});
    return()=>{alive=false;};
  },[attachment.id,attachment.url,resolve,allowOriginal,cached]);
  // RN Web reloads an Image when its event callbacks change. Keep those stable
  // across decode/stream/layout updates, while reading the newest presentation.
  const presentation=useRef({attachment,current,restored,allowOriginal,onAspectRatio});
  presentation.current={attachment,current,restored,allowOriginal,onAspectRatio};
  const loaded=useCallback((event:any)=>{
    if(identity.current.generation!==imageGeneration)return;
    const {attachment:latestAttachment,current,onAspectRatio}=presentation.current;
    setDecoded(previous=>previous?.generation===imageGeneration?previous:{generation:imageGeneration});
    if(current?.source)cache?.remember(resolve,latestAttachment,current.source);
    setResult(previous=>previous?.id===attachment.id && previous.url===attachment.url && previous.resolver===resolve&&!previous.loaded?{...previous,loaded:true}:previous);
    const native=event.source?undefined:event.nativeEvent;
    const target=native?.target??native?.currentTarget??event.target??event.currentTarget;
    const width=event.source?.width??native?.source?.width??target?.naturalWidth??0;
    const height=event.source?.height??native?.source?.height??target?.naturalHeight??0;
    if(Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0)onAspectRatio?.(width/height);
  },[attachment.id,attachment.url,resolve,cache,imageGeneration]);
  const failed=useCallback(()=>{
    if(identity.current.generation!==imageGeneration)return;
    const {attachment:latestAttachment,restored,allowOriginal}=presentation.current;
    cache?.forget(resolve,latestAttachment);
    setDecoded(undefined);
    // Native cache eviction may require a fresh authorised source. Retry that
    // once for a real cell; transition copies never start their own requests.
    const error=!(restored&&allowOriginal);
    setResult(previous=>previous?.id===attachment.id&&previous.url===attachment.url&&previous.resolver===resolve&&!previous.source&&previous.error===error?previous:{id:attachment.id,url:attachment.url,resolver:resolve,error});
  },[attachment.id,attachment.url,resolve,cache,imageGeneration]);
  const original=current?.source && !current.error && (allowOriginal||current.loaded) ? current.source : undefined;
  return <View testID="help-progressive-image" style={[style,{overflow:'hidden',backgroundColor:!pixelsReady?(c.dark?'#343A42':'#E4E7EB'):resizeMode==='contain'?'transparent':c.elevated}]}>
    {thumbnail ? <Image testID="help-image-preview" source={{uri:thumbnail}} resizeMode={resizeMode} style={StyleSheet.absoluteFill} blurRadius={2}/> : null}
    {original ? Platform.OS==='web' ? <Image accessibilityLabel={attachment.name} source={original} style={StyleSheet.absoluteFill} resizeMode={resizeMode} onLoad={loaded} onError={failed}/> : <CachedImage testID="help-image-original" accessibilityLabel={attachment.name} source={original} style={StyleSheet.absoluteFill} contentFit={resizeMode} placeholder={thumbnail?{uri:thumbnail}:undefined} placeholderContentFit={resizeMode} cachePolicy="memory-disk" recyclingKey={original.cacheKey??attachment.id} priority={proximity==='visible'?'high':'low'} transition={resizeMode==='contain'||reduced||restored?0:120} onLoad={loaded} onError={failed}/> : null}
    {!pixelsReady ? <View testID="help-image-placeholder" pointerEvents="none" accessibilityLabel={current?.error?'Изображение недоступно':allowOriginal?'Загрузка изображения':'Изображение'} style={[StyleSheet.absoluteFill,{alignItems:'center',justifyContent:'center'}]}><View style={{alignItems:'center',gap:6,padding:10,borderRadius:12,backgroundColor:c.dark?'#343A42E8':'#E4E7EBE8'}}>
      {current?.error||!allowOriginal||current?.loaded?<Ionicons name="image-outline" size={24} color={c.muted}/>:<ActivityIndicator color={c.muted}/>}
      <Text numberOfLines={1} style={{fontSize:12,color:c.muted}}>{current?.error?'Фото недоступно':allowOriginal?'Загрузка фото…':'Фото'}</Text>
    </View></View> : null}
  </View>;
}
let helpDownloadSequence = 0;
export async function downloadHelpAttachment(attachment: HelpAttachment, resolve: ResolveHelpMedia, signal?: AbortSignal) {
  const checkActive = () => {
    if (signal?.aborted) {
      const error = new Error('Загрузка отменена'); error.name = 'AbortError'; throw error;
    }
  };
  checkActive();
  const source = await resolve(attachment);
  checkActive();
  if (Platform.OS === 'web') {
    const response = await fetch(source.uri, { headers: source.headers, ...(signal ? { signal } : {}) });
    checkActive();
    if (!response.ok) throw new Error('Не удалось скачать файл');
    const blob = await response.blob();
    checkActive();
    const url = URL.createObjectURL(blob);
    try {
      checkActive();
      const link = document.createElement('a'); link.href = url; link.download = attachment.name; link.click();
    } finally { setTimeout(() => URL.revokeObjectURL(url), 60000); }
  } else {
    const filename = attachment.name.replace(/[^\p{L}\p{N}._-]/gu, '_');
    // Cancellable requests own a unique temporary path, so cleanup can never
    // remove another view's download of the same attachment.
    const path = `${FileSystem.cacheDirectory}help-${attachment.id}-${signal ? `${++helpDownloadSequence}-` : ''}${filename}`;
    try {
      const result = await FileSystem.downloadAsync(source.uri, path, { headers: source.headers });
      checkActive();
      if (result.status !== 200) throw new Error('Не удалось скачать файл');
      const canShare = await Sharing.isAvailableAsync();
      checkActive();
      if (canShare) await Sharing.shareAsync(result.uri, { mimeType: attachment.mimeType, dialogTitle: 'Сохранить файл' });
    } finally {
      if (signal?.aborted) await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
    }
  }
}
type HelpAudioProps = { uploading?:boolean; attachment: HelpAttachment; resolve: ResolveHelpMedia; onError: (text: string) => void; captionRight?: React.ReactNode; messageId?: number; author?: string; createdAt?: string; ticketId?: number };
export function HelpAudio(props: HelpAudioProps) {
  const playback = useHelpAudioPlayback();
  if(props.uploading)return <HelpAudioView {...props} ready={false} loading playing={false} currentTime={0} duration={(props.attachment.durationMs??0)/1000} rate={1} onPlay={async()=>{}} onSeek={async()=>{}}/>;
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
  const latest = useRef({ attachment, resolve, messageId, author, createdAt, ticketId, playback, active });
  latest.current = { attachment, resolve, messageId, author, createdAt, ticketId, playback, active };
  const onPlay = useCallback(() => {
    const value = latest.current;
    return value.active ? value.playback.toggle() : value.playback.play({ attachment: value.attachment, messageId: value.messageId, author: value.author, createdAt: value.createdAt, ticketId: value.ticketId }, value.resolve);
  }, []);
  const onSeek = useCallback(async (seconds: number) => {
    const value = latest.current;
    if (value.active) await value.playback.seek(seconds);
  }, []);
  // Only presentation data crosses the memo boundary. The shared controller
  // changes on every position sample, including for all inactive voice rows.
  return <HelpAudioView key={active ? 'active' : 'inactive'} attachment={attachment} captionRight={props.captionRight} onError={props.onError}
    ready={active && playback.ready} loading={active && playback.loading} playing={active && playback.playing}
    currentTime={active ? playback.positionSeconds : 0} duration={active ? playback.durationSeconds : (attachment.durationMs??0)/1000} rate={playback.speed}
    onPlay={onPlay} onSeek={onSeek}/>
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
    playing={prepared && status.playing} currentTime={prepared ? status.currentTime : 0} duration={prepared ? status.duration : (attachment.durationMs??0)/1000} rate={status.playbackRate}
    onPlay={play} onSeek={async seconds => { if (lifecycle.current.mounted && lifecycle.current.prepared) await player.seekTo(seconds); }}/>
}
type HelpAudioViewProps = Pick<HelpAudioProps, 'attachment' | 'captionRight' | 'onError'> & { ready: boolean; loading: boolean; playing: boolean; currentTime: number; duration: number; rate: number; onPlay: () => Promise<void>; onSeek: (seconds: number) => Promise<void> };
const HelpAudioBars = memo(function HelpAudioBars({ color, dimmed = false }: { color: string; dimmed?: boolean }) {
  return <>{decorativeTrackBars.map((height, i) => <View key={i} style={{ width: 3, height: height * .65, borderRadius: 3, backgroundColor: color, ...(dimmed ? { opacity: .3 } : {}) }} />)}</>;
});
const HelpAudioView = memo(function HelpAudioView({ attachment, captionRight, onError, ready, loading, playing, currentTime, duration, rate, onPlay, onSeek }: HelpAudioViewProps) {
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
        <HelpAudioBars color={c.accentText} dimmed/>
      </View>
      <View testID="help-audio-progress" pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: 0, top: 0, height: 28, width: `${progress * 100}%`, overflow: 'hidden' }}>
        <View style={{ width, height: 28, flexDirection: 'row', alignItems: 'center', gap: 3 }}><HelpAudioBars color={c.accentText}/></View>
      </View>
    </View><View testID="help-audio-caption" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 12 }}><Text numberOfLines={1} style={{ fontSize: 10, lineHeight: 12, color: c.muted, fontVariant: ['tabular-nums'] }}>{helpDuration(progress * (duration || 0))} / {duration ? helpDuration(duration) : helpFileSize(attachment.size)}</Text>{captionRight}</View></View>
  </View>;
});
const viewerClamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const viewerIndex=(index:number,length:number)=>viewerClamp(Number.isFinite(index)?Math.floor(index):0,0,Math.max(0,length-1));
const viewerTouchDistance=(event:any)=>{const touches=event?.nativeEvent?.touches??[];return touches.length<2?0:Math.hypot(touches[0].pageX-touches[1].pageX,touches[0].pageY-touches[1].pageY);};
const identityViewerTransform=[{translateX:0},{translateY:0},{scale:1}];

export function HelpGallery({ attachments, initialIndex, resolve, onClose, onError, origin }: { attachments: HelpAttachment[]; initialIndex: number; resolve: ResolveHelpMedia; onClose: () => void; onError: (text: string) => void; origin?: HelpImageOrigin }) {
  const [index,setIndex]=useState(()=>viewerIndex(initialIndex,attachments.length)),[downloadMenu,setDownloadMenu]=useState(false),[busy,setBusy]=useState(false);
  const insets=useSafeAreaInsets(),size=useWindowDimensions(),reduced=useHelpReducedMotion();
  const [stage,setStage]=useState({width:size.width,height:Math.max(100,size.height-insets.top-Math.max(insets.bottom,12)-140),y:insets.top+50});
  const [laidOut,setLaidOut]=useState(false);
  const reveal=useRef(new Animated.Value(0)).current,backdrop=useRef(new Animated.Value(0)).current;
  const dragX=useRef(new Animated.Value(-viewerIndex(initialIndex,attachments.length)*size.width)).current,dragY=useRef(new Animated.Value(0)).current,dismissX=useRef(new Animated.Value(0)).current;
  const zoom=useRef(new Animated.Value(1)).current,panX=useRef(new Animated.Value(0)).current,panY=useRef(new Animated.Value(0)).current;
  const life=useRef({alive:true,closing:false,downloading:false,switching:false});
  const latest=useRef({attachments,resolve,onClose,onError,origin,reduced,size});latest.current={attachments,resolve,onClose,onError,origin,reduced,size};
  const currentIndex=useRef(index);currentIndex.current=index;
  const viewport=useRef(stage);viewport.current=stage;
  const firstId=useRef(attachments[viewerIndex(initialIndex,attachments.length)]?.id);
  const motion=useRef<Animated.CompositeAnimation|undefined>(undefined);
  const pageGeneration=useRef(0),externalPage=useRef({initialIndex,length:attachments.length});
  const lastTap=useRef<{at:number;x:number;y:number}|null>(null);
  const touch=useRef({mode:'' as ''|'horizontal'|'vertical'|'pinch'|'pan',distance:0,scale:1,x:0,y:0,startScale:1,startX:0,startY:0});
  const attachment=attachments[index];
  const tile=attachment?.id===firstId.current&&origin&&origin.width>0&&origin.height>0?origin:undefined;
  useEffect(()=>{life.current.alive=true;return()=>{life.current.alive=false;motion.current?.stop();[reveal,backdrop,dragX,dragY,dismissX,zoom,panX,panY].forEach(value=>value.stopAnimation());};},[reveal,backdrop,dragX,dragY,dismissX,zoom,panX,panY]);
  useEffect(()=>{
    if(!laidOut||life.current.closing)return;
    motion.current?.stop();
    if(reduced){reveal.setValue(1);backdrop.setValue(1);return;}
    motion.current=Animated.parallel([Animated.timing(reveal,{toValue:1,duration:230,useNativeDriver:true}),Animated.timing(backdrop,{toValue:1,duration:230,useNativeDriver:true})]);motion.current.start();
  },[laidOut,reduced,reveal,backdrop]);
  const resetZoom=()=>{touch.current.scale=1;touch.current.x=0;touch.current.y=0;zoom.setValue(1);panX.setValue(0);panY.setValue(0);};
  useEffect(()=>{
    const previous=externalPage.current;externalPage.current={initialIndex,length:attachments.length};
    if(previous.initialIndex===initialIndex&&previous.length===attachments.length)return;
    const next=viewerIndex(previous.initialIndex!==initialIndex?initialIndex:currentIndex.current,attachments.length);
    ++pageGeneration.current;motion.current?.stop();life.current.switching=false;lastTap.current=null;
    currentIndex.current=next;setIndex(next);dragX.setValue(-next*viewport.current.width);dragY.setValue(0);dismissX.setValue(0);reveal.setValue(1);backdrop.setValue(1);resetZoom();
  },[initialIndex,attachments.length,dragX,dragY,dismissX,reveal,backdrop,zoom,panX,panY]);
  const settleZoom=()=>{const scale=viewerClamp(touch.current.scale,1,4);touch.current.scale=scale;zoom.setValue(scale);if(scale<=1.05)resetZoom();};
  const toggleZoom=()=>{
    if(!life.current.alive||life.current.closing||life.current.switching)return;
    const scale=touch.current.scale>1.05?1:2.5;touch.current.scale=scale;touch.current.x=0;touch.current.y=0;motion.current?.stop();
    if(latest.current.reduced){zoom.setValue(scale);panX.setValue(0);panY.setValue(0);return;}
    motion.current=Animated.parallel([Animated.timing(zoom,{toValue:scale,duration:180,useNativeDriver:true}),Animated.timing(panX,{toValue:0,duration:180,useNativeDriver:true}),Animated.timing(panY,{toValue:0,duration:180,useNativeDriver:true})]);motion.current.start();
  };
  const restore=()=>{
    if(!life.current.alive||life.current.closing)return;motion.current?.stop();
    if(latest.current.reduced){dragX.setValue(-currentIndex.current*viewport.current.width);dragY.setValue(0);dismissX.setValue(0);backdrop.setValue(1);return;}
    motion.current=Animated.parallel([Animated.spring(dragX,{toValue:-currentIndex.current*viewport.current.width,damping:24,useNativeDriver:true}),Animated.spring(dragY,{toValue:0,damping:24,useNativeDriver:true}),Animated.spring(dismissX,{toValue:0,damping:24,useNativeDriver:true}),Animated.timing(backdrop,{toValue:1,duration:180,useNativeDriver:true})]);motion.current.start();
  };
  const finish=(down:boolean)=>{
    if(life.current.closing||!life.current.alive)return;life.current.closing=true;lastTap.current=null;motion.current?.stop();
    if(latest.current.reduced){latest.current.onClose();return;}
    const current=latest.current,currentPhoto=current.attachments[currentIndex.current];
    const returnToTile=Boolean(current.origin&&current.origin.width>0&&current.origin.height>0&&currentPhoto?.id===firstId.current);
    const duration=returnToTile?210:190;
    // Backdrop has its own clock: returning dragY to zero must not darken it again.
    motion.current=Animated.parallel([
      Animated.timing(reveal,{toValue:0,duration,useNativeDriver:true}),Animated.timing(backdrop,{toValue:0,duration,useNativeDriver:true}),
      Animated.timing(dragX,{toValue:-currentIndex.current*viewport.current.width,duration,useNativeDriver:true}),
      Animated.timing(dragY,{toValue:returnToTile?0:down?current.size.height:0,duration,useNativeDriver:true}),Animated.timing(dismissX,{toValue:0,duration,useNativeDriver:true}),
      Animated.timing(zoom,{toValue:1,duration,useNativeDriver:true}),Animated.timing(panX,{toValue:0,duration,useNativeDriver:true}),Animated.timing(panY,{toValue:0,duration,useNativeDriver:true}),
    ]);
    motion.current.start(({finished})=>{if(finished&&life.current.alive)latest.current.onClose();});
  };
  // Native paging owns absolute page positions. Committing a new current index
  // only changes the bounded preload window, never resets/rebases the pixels.
  const changePhoto=(delta:number)=>{
    if(!life.current.alive||life.current.closing||life.current.switching)return;
    const next=viewerIndex(currentIndex.current+delta,latest.current.attachments.length);if(next===currentIndex.current){restore();return;}
    life.current.switching=true;lastTap.current=null;motion.current?.stop();
    const generation=++pageGeneration.current;
    const switched=()=>{if(!life.current.alive||life.current.closing||generation!==pageGeneration.current)return;currentIndex.current=next;setIndex(next);setDownloadMenu(false);dragY.setValue(0);dismissX.setValue(0);backdrop.setValue(1);resetZoom();life.current.switching=false;};
    if(latest.current.reduced){dragX.setValue(-next*viewport.current.width);switched();return;}
    motion.current=Animated.timing(dragX,{toValue:-next*viewport.current.width,duration:180,useNativeDriver:true});motion.current.start(({finished})=>{if(finished)switched();else if(generation===pageGeneration.current&&life.current.alive&&!life.current.closing){life.current.switching=false;restore();}});
  };
  const actions=useRef({finish,restore,changePhoto,settleZoom,toggleZoom});actions.current={finish,restore,changePhoto,settleZoom,toggleZoom};
  const pan=useRef(PanResponder.create({
    onStartShouldSetPanResponder:()=>life.current.alive&&!life.current.closing&&!life.current.switching,
    onMoveShouldSetPanResponder:(event,g)=>life.current.alive&&!life.current.closing&&!life.current.switching&&((event?.nativeEvent?.touches?.length??0)>1||Math.abs(g.dx)>9||g.dy>9),
    onPanResponderGrant:event=>{if(!life.current.alive||life.current.closing||life.current.switching)return;motion.current?.stop();reveal.setValue(1);backdrop.setValue(1);[dragX,dragY,dismissX].forEach(value=>value.stopAnimation());const current=touch.current;current.distance=viewerTouchDistance(event);current.startScale=current.scale;current.startX=current.x;current.startY=current.y;current.mode=current.distance?'pinch':current.scale>1.05?'pan':'';},
    onPanResponderMove:(event,g)=>{
      if(!life.current.alive||life.current.closing||life.current.switching)return;
      const current=touch.current,distance=viewerTouchDistance(event);
      if(distance){lastTap.current=null;if(current.mode!=='pinch'||!current.distance){current.distance=distance;current.startScale=current.scale;dragX.setValue(-currentIndex.current*viewport.current.width);dragY.setValue(0);dismissX.setValue(0);backdrop.setValue(1);}current.mode='pinch';current.scale=viewerClamp(current.startScale*distance/current.distance,1,4);zoom.setValue(current.scale);return;}
      if(current.mode==='pinch')return;
      if(current.mode==='pan'){const xBound=viewport.current.width*(current.scale-1)/2,yBound=viewport.current.height*(current.scale-1)/2;current.x=viewerClamp(current.startX+g.dx,-xBound,xBound);current.y=viewerClamp(current.startY+g.dy,-yBound,yBound);panX.setValue(current.x);panY.setValue(current.y);return;}
      // Lock an intentional axis, not the small diagonal jitter at touch-down.
      if(!current.mode){if(g.dy>8&&g.dy>Math.abs(g.dx)*1.15){current.mode='vertical';dragX.setValue(-currentIndex.current*viewport.current.width);}else if(Math.abs(g.dx)>8&&Math.abs(g.dx)>Math.abs(g.dy)*1.15)current.mode='horizontal';else return;}
      if(current.mode==='horizontal'){const edge=g.dx>0&&currentIndex.current===0||g.dx<0&&currentIndex.current>=latest.current.attachments.length-1;dragX.setValue(-currentIndex.current*viewport.current.width+g.dx*(edge?.25:1));}
      else{const y=Math.max(0,g.dy);dragY.setValue(y);dismissX.setValue(g.dx*.6);backdrop.setValue(1-viewerClamp(y/Math.max(160,viewport.current.height*.6),0,1));}
    },
    onPanResponderRelease:(event,g)=>{
      const mode=touch.current.mode;touch.current.mode='';
      if(mode!=='pinch'&&Math.abs(g.dx)<8&&Math.abs(g.dy)<8){const point=event?.nativeEvent?.changedTouches?.[0]??event?.nativeEvent,at=performance.now(),x=point?.pageX??0,y=point?.pageY??0,previous=lastTap.current;if(previous&&at-previous.at<280&&Math.hypot(x-previous.x,y-previous.y)<36){lastTap.current=null;actions.current.toggleZoom();}else{lastTap.current={at,x,y};actions.current.restore();}return;}
      lastTap.current=null;
      if(mode==='pinch'||mode==='pan'){actions.current.settleZoom();return;}
      if(mode==='horizontal'){if(Math.abs(g.dx)>viewport.current.width*.2||Math.abs(g.vx)>.7)actions.current.changePhoto(g.dx<0?1:-1);else actions.current.restore();}
      else if(mode==='vertical'&&(g.dy>Math.min(110,viewport.current.height*.18)||g.dy>25&&g.vy>.8))actions.current.finish(true);else actions.current.restore();
    },
    onPanResponderTerminate:()=>{touch.current.mode='';actions.current.settleZoom();actions.current.restore();},
    onPanResponderTerminationRequest:()=>false,
  })).current;
  const download=async(all:boolean)=>{
    if(!life.current.alive||life.current.downloading||life.current.closing||!latest.current.attachments.length)return;
    life.current.downloading=true;setDownloadMenu(false);setBusy(true);
    const files=all?latest.current.attachments:[latest.current.attachments[currentIndex.current]];
    try{for(const file of files){if(!life.current.alive)break;if(file)await downloadHelpAttachment(file,latest.current.resolve);}}
    catch{if(life.current.alive)latest.current.onError('Не удалось скачать изображение');}
    finally{life.current.downloading=false;if(life.current.alive)setBusy(false);}
  };
  const requestDownload=()=>{if(!life.current.closing){if(attachments.length>1)setDownloadMenu(value=>!value);else void download(false);}};
  const close=()=>finish(false),dismissRange=Math.max(160,stage.height*.6);
  const ratio=attachment?.width&&attachment?.height&&Number.isFinite(attachment.width)&&Number.isFinite(attachment.height)&&attachment.width>0&&attachment.height>0?attachment.width/attachment.height:stage.width/stage.height;
  const imageWidth=Math.min(stage.width,stage.height*ratio),imageHeight=Math.min(stage.height,stage.width/ratio);
  const tileScale=tile?Math.min(tile.width/imageWidth,tile.height/imageHeight):.92;
  const roundButton={width:40,height:40,borderRadius:20,backgroundColor:'#FFFFFF16'};
  return <Modal transparent animationType="none" onRequestClose={()=>downloadMenu?setDownloadMenu(false):close()} statusBarTranslucent navigationBarTranslucent>
    <View style={{flex:1,overflow:'hidden'}}>
      <Animated.View testID="help-gallery-backdrop" pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:'#090B10',opacity:backdrop}]}/>
      <View style={{flex:1}}>
        <Animated.View style={{paddingTop:insets.top+5,paddingBottom:5,paddingHorizontal:12,gap:6,flexDirection:'row',alignItems:'center',zIndex:3,opacity:backdrop}}>
          <Text testID="help-gallery-position" accessibilityLiveRegion="polite" style={{flex:1,fontSize:13,color:'#C9D1DD'}}>{attachment?index+1:0} из {attachments.length}</Text>
          <HelpIcon name="download-outline" label="Скачать" disabled={busy||!attachment} onPress={requestDownload} color="#FFF" style={roundButton}/>
          <HelpIcon name="close-outline" label="Закрыть изображение" onPress={close} color="#FFF" style={roundButton}/>
        </Animated.View>
        <View testID="help-gallery-stage" onLayout={event=>{const layout=event.nativeEvent.layout;if(layout.width>0&&layout.height>0){setStage(previous=>previous.width===layout.width&&previous.height===layout.height&&previous.y===layout.y?previous:{width:layout.width,height:layout.height,y:layout.y});if(Math.abs(viewport.current.width-layout.width)>.5)dragX.setValue(-currentIndex.current*layout.width);setLaidOut(true);}}} style={{flex:1,minHeight:0,position:'relative'}}>
          <Animated.View testID="help-gallery-transition" collapsable={false} style={{flex:1,overflow:'hidden',opacity:laidOut?(tile?1:reveal):0,transform:[{translateY:Animated.add(dragY,reveal.interpolate({inputRange:[0,1],outputRange:[tile?tile.y+tile.height/2-stage.y-stage.height/2:0,0]}))},{translateX:Animated.add(dismissX,reveal.interpolate({inputRange:[0,1],outputRange:[tile?tile.x+tile.width/2-stage.width/2:0,0]}))},{scale:Animated.multiply(reveal.interpolate({inputRange:[0,1],outputRange:[tileScale,1]}),dragY.interpolate({inputRange:[0,dismissRange],outputRange:[1,.56],extrapolate:'clamp'}))}]}}>
            <Animated.View testID="help-gallery-pager" style={{flex:1,transform:[{translateX:dragX}]}}>{attachments.slice(Math.max(0,index-1),index+2).map((file,offset)=>{const cellIndex=Math.max(0,index-1)+offset,current=cellIndex===index;return <Animated.View key={file.id} testID="help-gallery-cell" accessibilityLabel={current?'Текущее изображение':undefined} pointerEvents="none" style={{position:'absolute',left:cellIndex*stage.width,top:0,width:stage.width,height:stage.height,transform:current?[{translateX:panX},{translateY:panY},{scale:zoom}]:identityViewerTransform}}><HelpMediaLoadingContext.Provider value={current?'visible':'near'}><HelpImage attachment={file} resolve={resolve} resizeMode="contain" style={{width:'100%',height:'100%'}}/></HelpMediaLoadingContext.Provider></Animated.View>;})}</Animated.View>
          </Animated.View>
          {/* Own native touch-down above the image, rather than asking its
              parent to steal an already claimed image/scroll responder. */}
          <View testID="help-gallery-gesture" collapsable={false} pointerEvents="box-only" {...pan.panHandlers} style={[StyleSheet.absoluteFill,Platform.OS==='web'?{touchAction:'none',userSelect:'none'} as any:undefined]}/>
          {attachments.length>1?<Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill,{opacity:backdrop}]}><HelpIcon name="chevron-back" label="Предыдущее изображение" disabled={index===0} onPress={()=>changePhoto(-1)} color="#FFF" style={{position:'absolute',left:8,top:'50%',marginTop:-20,width:34,height:40,borderRadius:20,backgroundColor:'#00000088'}}/><HelpIcon name="chevron-forward" label="Следующее изображение" disabled={index===attachments.length-1} onPress={()=>changePhoto(1)} color="#FFF" style={{position:'absolute',right:8,top:'50%',marginTop:-20,width:34,height:40,borderRadius:20,backgroundColor:'#00000088'}}/></Animated.View>:null}
        </View>
        <Animated.View testID="help-gallery-footer" style={{alignItems:'center',gap:12,padding:12,paddingBottom:Math.max(insets.bottom,12),opacity:backdrop}}>
          <Text numberOfLines={1} style={{maxWidth:'100%',fontSize:12,color:'#C9D1DD'}}>{attachment?.name??'Изображение недоступно'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Скачать изображение" disabled={busy||!attachment} onPress={requestDownload} style={{flexDirection:'row',alignItems:'center',gap:7,paddingVertical:10,paddingHorizontal:22,borderRadius:22,backgroundColor:'#FFFFFF19'}}><Ionicons name="download-outline" size={18} color="#FFF"/><Text style={{color:'#FFF',fontSize:14}}>{busy?'Скачивание…':'Скачать изображение'}</Text></Pressable>
        </Animated.View>
      </View>
      {downloadMenu?<><Pressable accessibilityLabel="Закрыть выбор скачивания" onPress={()=>setDownloadMenu(false)} style={StyleSheet.absoluteFill}/><View accessibilityRole="menu" style={{position:'absolute',bottom:Math.max(insets.bottom,12)+103,left:12,right:12,padding:5,borderWidth:1,borderColor:'#FFFFFF22',borderRadius:15,backgroundColor:'#242B37'}}><Pressable accessibilityRole="menuitem" onPress={()=>void download(false)} style={{padding:13}}><Text style={{color:'#FFF',fontSize:14}}>Только это изображение</Text></Pressable><Pressable accessibilityRole="menuitem" onPress={()=>void download(true)} style={{padding:13}}><Text style={{color:'#FFF',fontSize:14}}>Все изображения ({attachments.length})</Text></Pressable></View></>:null}
    </View>
  </Modal>;
}
