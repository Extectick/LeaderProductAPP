import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, Easing, Image, Keyboard, PanResponder, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { RecordingPresets, getRecordingPermissionsAsync, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useHelpTheme, useHelpReducedMotion } from '../helpTheme';
import { useHelpAudioCommands } from '../HelpAudioPlayback';
import { helpDuration } from '../helpUiUtils';
import { HelpIcon, HelpSheet } from './HelpPrimitives';
import { HelpImage, type ResolveHelpMedia } from './HelpMedia';
import type { HelpAttachment } from '../helpApi';
import {HelpNativeInput, hasNativeHelpInput, type HelpNativeInputHandle} from './HelpNativeInput';
import { helpDevActions, helpDevEvent, helpDevRef, helpDevState } from '../helpDiagnostics';
import { HelpPhotoPicker } from './HelpPhotoPicker';
import {scheduleHelpInputFocus} from '../helpInputFocus';
import {HelpVoiceRecorder,hasNativeHelpVoice} from './HelpVoiceRecorder';
import {HelpExpandedEditor,type HelpTextSelection} from './HelpExpandedEditor';

export type HelpLocalFile = { uri: string; name: string; mimeType?: string; file?: File; size?: number; width?: number; height?: number; assetId?: string };
export type HelpComposeMode = 'message' | 'close' | 'reopen' | 'edit';
type Props = { screenActive?:boolean; voiceDraftKey?:string; value: string; onChange: (text: string) => void; files: HelpLocalFile[]; onFiles: (files: HelpLocalFile[]) => void; onSend: (voice?: HelpLocalFile, selectedFiles?: HelpLocalFile[], retainVoiceDraft?:boolean) => Promise<boolean | void>; busy: boolean; mode: HelpComposeMode; rating: number; onRating: (rating: number) => void; onCancelMode: () => void; quote?: { name: string; text: string; onPress: () => void; thumbnail?: HelpAttachment }; resolve?: ResolveHelpMedia; recordingAreaHeight?: number; onCancelQuote: () => void; error: (message: string) => void; focusKey?: number; onResize: () => void; disabled?: boolean; sendBlocked?:boolean; onStopAssistant?:()=>void; editClosure?: boolean; existingFiles?: HelpAttachment[]; onRemoveExisting?: (id: string) => void };

const COMPOSER_LINE_HEIGHT = 22;
const COMPOSER_MAX_HEIGHT = COMPOSER_LINE_HEIGHT * 6.5 + 2;
const COMPOSER_FONT_SIZE = 18;
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const DRAFT_PHOTO_SIZE = 80;

function HelpDraftPhoto({children,name,disabled,onRemove}:{children:React.ReactNode;name:string;disabled?:boolean;onRemove:()=>void}) {
  return <View testID="help-draft-photo" style={{width:DRAFT_PHOTO_SIZE,height:DRAFT_PHOTO_SIZE,position:'relative'}}>
    {children}
    <Pressable accessibilityRole="button" accessibilityLabel={`Убрать ${name}`} accessibilityState={{disabled:Boolean(disabled)}} disabled={disabled} onPress={onRemove} style={{position:'absolute',top:0,right:0,width:44,height:44,padding:4,alignItems:'flex-end',justifyContent:'flex-start',opacity:disabled?.4:1}}>
      <View pointerEvents="none" style={{width:24,height:24,borderRadius:12,backgroundColor:'#00000080',alignItems:'center',justifyContent:'center'}}><Ionicons name="close" size={16} color="#FFF"/></View>
    </Pressable>
  </View>;
}

export function HelpComposer(props: Props) {
  const [voiceActive,setVoiceActive]=useState(false),[expanded,setExpanded]=useState(false),[visualLines,setVisualLines]=useState(1);
  const selection=useRef<HelpTextSelection>({start:0,end:0});
  const restoreSelection=useRef<HelpTextSelection|null>(null);
  const audioCommands = useHelpAudioCommands();
  const stopPlayback = useRef(audioCommands?.stop); stopPlayback.current = audioCommands?.stop;
  const c = useHelpTheme(); const reduced=useHelpReducedMotion(); const input = useRef<TextInput | HelpNativeInputHandle>(null); const [height, setHeight] = useState(22); const [scrollY, setScrollY] = useState(0); const [contentHeight, setContentHeight] = useState(22);
  const [composerHeight, setComposerHeight] = useState(48); const [recordingCardHeight, setRecordingCardHeight] = useState(180);
  const [attachmentMenu,setAttachmentMenu]=useState(false);const picking=useRef(false);
  const [photoPickerOpen,setPhotoPickerOpen]=useState(false),[photoPickerVisible,setPhotoPickerVisible]=useState(false),[preparingPhotos,setPreparingPhotos]=useState(false);
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true }); const recordState = useAudioRecorderState(recorder, 80);
  const [recording, setRecording] = useState(false); const [locked, setLocked] = useState(false); const [starting, setStarting] = useState(false); const [meter, setMeter] = useState<number[]>([]);
  const life = useRef({ mounted: true, starting: false, recording: false, locked: false, ending: false, permissionPending: false, permissionInterrupted: false, appState: AppState.currentState ?? 'active', resumeActive: null as null | (() => void), release: null as null | 'send' | 'cancel' | 'stage' });
  const latest = useRef(props); latest.current = props; const pulse = useRef(new Animated.Value(1)).current;
  const animatedHeight = useRef(new Animated.Value(COMPOSER_LINE_HEIGHT)).current;
  // The last half-line gradually replaces the bottom inset. Changing that inset
  // at the cap in one frame makes the text jump independently of the border.
  const bottomInset = useMemo(() => animatedHeight.interpolate({ inputRange: [COMPOSER_LINE_HEIGHT, COMPOSER_LINE_HEIGHT * 6, COMPOSER_MAX_HEIGHT], outputRange: [12, 12, 0], extrapolate: 'clamp' }), [animatedHeight]);
  const entryHeight = useMemo(() => Animated.add(animatedHeight, Animated.add(12, bottomInset)), [animatedHeight, bottomInset]);
  // Keep a stable native text viewport: resizing EditText after every line lets
  // Android scroll the caret first, then reset it when the new height arrives.
  // Only the clipping surface grows; native scrolling starts at the same cap.
  const inputHeight = Platform.OS === 'web' ? height : COMPOSER_MAX_HEIGHT;
  useLayoutEffect(() => {
    if (hasNativeHelpInput) return;
    animatedHeight.stopAnimation();
    if (reduced) { animatedHeight.setValue(height); return; }
    const animation = Animated.timing(animatedHeight, { toValue: height, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    const started=Date.now();
    helpDevEvent('composer.animation.start',{target:height,duration:180});
    animation.start(({finished})=>helpDevEvent('composer.animation.end',{target:height,finished,elapsed:Date.now()-started}));
    return () => animation.stop();
  }, [height, reduced, animatedHeight]);
  useLayoutEffect(() => {
    // Native content-size notifications are not guaranteed after a controlled
    // value reset. Always collapse an emptied composer before paint.
    if (!props.value) {
      setHeight(COMPOSER_LINE_HEIGHT); setContentHeight(COMPOSER_LINE_HEIGHT); setScrollY(0);
      if (Platform.OS === 'web' && input.current) (input.current as unknown as HTMLTextAreaElement).scrollTop = 0;
      if (height !== COMPOSER_LINE_HEIGHT || contentHeight !== COMPOSER_LINE_HEIGHT) props.onResize();
      return;
    }
    if (Platform.OS !== 'web') return;
    const node = input.current as unknown as HTMLTextAreaElement | null;
    if (!node?.style || typeof node.scrollHeight !== 'number') return;
    // A textarea's scrollHeight includes its fixed height. Temporarily collapse
    // only the DOM height to measure deletion as well as growth, restoring it
    // synchronously before React commits the new size (no visible flicker).
    const previousHeight = node.style.height; const previousScroll = node.scrollTop;
    let measured: number;
    try { node.style.height = '0px'; measured = Math.max(COMPOSER_LINE_HEIGHT, node.scrollHeight); }
    finally { node.style.height = previousHeight; }
    const next = Math.min(COMPOSER_MAX_HEIGHT, measured);
    const offset = Math.min(Math.max(0, previousScroll), Math.max(0, measured - next));
    node.scrollTop = offset; setScrollY(offset); setContentHeight(measured);
    if (height !== next) { setHeight(next); props.onResize(); }
  }, [props.value]);
  useEffect(() => { if (props.focusKey) return scheduleHelpInputFocus(()=>input.current); }, [props.focusKey]);
  useEffect(() => { if (recordState.isRecording) setMeter(values => [...values.slice(-27), Math.min(1, Math.max(.04, ((recordState.metering ?? -50) + 60) / 60))]); }, [recordState.durationMillis]);
  useEffect(() => { if (recording && recordState.durationMillis >= 60000) void finish('stage'); }, [recordState.durationMillis, recording]);
  useEffect(() => {
    life.current.mounted = true;
    const sub = AppState.addEventListener('change', appState => {
      const state = life.current; state.appState = appState;
      if (appState === 'active') { state.resumeActive?.(); state.resumeActive = null; }
      else if (state.permissionPending) state.permissionInterrupted = true;
      else void finish('stage');
    });
    return () => {
      sub.remove(); const state = life.current; state.mounted = false; state.release = 'cancel';
      state.resumeActive?.(); state.resumeActive = null;
      if (state.recording && !state.ending) void recorder.stop().catch(() => {});
      void setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    };
  }, [recorder]);
  useEffect(() => { if (!recording || reduced) { pulse.stopAnimation(); pulse.setValue(1); return; } const loop = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1.1, duration: 550, useNativeDriver: true }), Animated.timing(pulse, { toValue: 1, duration: 550, useNativeDriver: true })])); loop.start(); return () => loop.stop(); }, [recording,reduced]);
  async function finish(action: 'send' | 'cancel' | 'stage') {
    const state = life.current;
    if (state.starting) { if (state.release !== 'cancel') state.release = action; state.resumeActive?.(); state.resumeActive = null; return; }
    if (!state.recording || state.ending) return;
    state.ending = true;
    try {
      const duration = recorder.getStatus().durationMillis;
      await recorder.stop();
      const uri = recorder.uri;
      if (uri && action !== 'cancel' && duration >= 350 && state.mounted) {
        const web = Platform.OS === 'web'; const file: HelpLocalFile = { uri, name: `Голосовое-${Date.now()}.${web ? 'webm' : 'm4a'}`, mimeType: web ? 'audio/webm' : 'audio/mp4' };
        if (action === 'send') await latest.current.onSend(file);
        else latest.current.onFiles([...latest.current.files, file]);
      }
    } catch { if (state.mounted) latest.current.error('Не удалось сохранить запись. Попробуйте ещё раз.'); }
    finally { state.recording = false; state.ending = false; state.locked = false; state.release = null; if (state.mounted) { setRecording(false); setLocked(false); } void setAudioModeAsync({ allowsRecording: false }).catch(() => {}); }
  }
  async function discardPreparedRecording() {
    if (Platform.OS !== 'web') { await recorder.stop(); return; }
    // expo-audio 57 web prepare acquires tracks while MediaRecorder is inactive.
    // Its stop() throws in that state and its hook cleanup does not release tracks.
    // Release that prepared stream directly; never record after cancel/unmount.
    const prepared = recorder as unknown as { stream?: MediaStream | null; mediaRecorder?: MediaRecorder | null; analyserSource?: AudioNode | null; analyser?: AnalyserNode | null; analyserBuffer?: unknown; handleDeviceChange?: EventListener | null };
    prepared.stream?.getTracks().forEach(track => track.stop());
    prepared.analyserSource?.disconnect(); prepared.analyser?.disconnect();
    if (prepared.handleDeviceChange) globalThis.navigator?.mediaDevices?.removeEventListener('devicechange', prepared.handleDeviceChange);
    prepared.stream = null; prepared.mediaRecorder = null; prepared.analyserSource = null; prepared.analyser = null; prepared.analyserBuffer = null; prepared.handleDeviceChange = null;
  }
  async function start(lock = false) {
    const state = life.current;
    if (!state.mounted || state.starting || state.recording || state.ending || state.appState !== 'active' || latest.current.busy || latest.current.disabled || latest.current.onStopAssistant) return;
    state.starting = true; state.release = null; state.locked = lock; state.permissionInterrupted = false; setStarting(true); Keyboard.dismiss();
    try {
      // On web, even getRecordingPermissionsAsync can display a permission prompt.
      state.permissionPending = Platform.OS === 'web';
      let permission = await getRecordingPermissionsAsync();
      state.permissionPending = false;
      if (state.release || !state.mounted) return;
      let prompted = false;
      if (!permission.granted) {
        state.permissionPending = true; prompted = true;
        permission = await requestRecordingPermissionsAsync();
        state.permissionPending = false;
      }
      if (state.release || !state.mounted) return;
      if (!permission.granted) { if (state.mounted) latest.current.error('Разрешите доступ к микрофону, чтобы записать голосовое сообщение.'); return; }
      if (state.release || !state.mounted) return;
      // The OS dialog consumes the original hold. Continue visibly locked, so a
      // late responder release cannot silently discard or send the new recording.
      if (prompted || state.permissionInterrupted) { state.locked = true; setLocked(true); }
      if (state.appState !== 'active') await new Promise<void>(resolve => { state.resumeActive = resolve; });
      if (state.release || !state.mounted || latest.current.disabled || latest.current.busy) return;
      stopPlayback.current?.();
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      if (state.release || !state.mounted) return;
      await recorder.prepareToRecordAsync();
      if (state.release || !state.mounted) {
        await discardPreparedRecording();
        return;
      }
      recorder.record(); state.recording = true; setMeter([]); setRecording(true); setLocked(state.locked);
    } catch { if (state.mounted) latest.current.error(Platform.OS === 'web' ? 'Запись требует HTTPS и разрешения браузера на микрофон.' : 'Не удалось включить микрофон.'); }
    finally { state.starting = false; state.permissionPending = false; state.resumeActive = null; if (state.mounted) setStarting(false); if (!state.recording) { state.locked = false; if (state.mounted) setLocked(false); void setAudioModeAsync({ allowsRecording: false }).catch(() => {}); } if (state.release && state.recording) void finish(state.release); }
  }
  const gestures = useRef(PanResponder.create({ onStartShouldSetPanResponder: () => life.current.mounted && !latest.current.busy && !latest.current.disabled, onMoveShouldSetPanResponder: () => true, onPanResponderGrant: () => { void start(); }, onPanResponderMove: (_, g) => { if (!life.current.mounted || (!life.current.starting && !life.current.recording)) return; if (g.dy < -65) { life.current.locked = true; setLocked(true); } else if (g.dx < -75 && !life.current.locked) void finish('cancel'); }, onPanResponderRelease: () => { if (life.current.permissionPending) life.current.permissionInterrupted = true; else if (!life.current.locked) void finish('send'); }, onPanResponderTerminate: () => { if (life.current.permissionPending) life.current.permissionInterrupted = true; else if (!life.current.locked) void finish('cancel'); } })).current;
  function appendPicked(added:HelpLocalFile[]) {
    const current=latest.current;
    if(!life.current.mounted||current.busy||current.disabled||!added.length)return;
    if(current.files.length+added.length+(current.existingFiles?.length??0)>MAX_ATTACHMENTS){current.error('В одном сообщении можно прикрепить до 10 файлов.');return;}
    if(added.some(file=>(file.size??file.file?.size??0)>MAX_ATTACHMENT_BYTES)){current.error('Размер каждого файла должен быть не больше 20 МБ.');return;}
    current.onFiles([...current.files,...added]);
  }
  async function pick(kind:'photos'|'files') {
    const current=latest.current;
    if(picking.current||!life.current.mounted||current.busy||current.disabled)return;
    setAttachmentMenu(false);
    const remaining=MAX_ATTACHMENTS-current.files.length-(current.existingFiles?.length??0);
    if(remaining<=0){current.error('В одном сообщении можно прикрепить до 10 файлов.');return;}
    picking.current=true;
    try {
      if(kind==='photos'){
        // The system photo picker grants access to selected assets without broad
        // library permission. Call synchronously from the press on web as well.
        const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsMultipleSelection:true,selectionLimit:remaining,orderedSelection:true,allowsEditing:false,quality:1});
        if(result.canceled)return;
        const formats:Record<string,string>={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',heic:'image/heic',heif:'image/heif',avif:'image/avif',bmp:'image/bmp'};
        appendPicked(result.assets.map((asset,index)=>{
          const originalName=asset.fileName||asset.file?.name;
          const extension=(originalName||asset.uri).split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase();
          const mimeType=asset.mimeType||asset.file?.type||(extension?formats[extension]:undefined)||'image/jpeg';
          const suffix=extension||Object.keys(formats).find(key=>formats[key]===mimeType)||'jpg';
          return {uri:asset.uri,name:originalName||`Фото-${Date.now()}-${index+1}.${suffix}`,mimeType,size:asset.fileSize??asset.file?.size,file:asset.file,width:asset.width,height:asset.height};
        }));
      }else{
        const result=await DocumentPicker.getDocumentAsync({type:'*/*',multiple:true,copyToCacheDirectory:true});
        if(result.canceled)return;
        appendPicked(result.assets.map(asset=>({uri:asset.uri,name:asset.name,mimeType:asset.mimeType,size:asset.size??asset.file?.size,file:asset.file})));
      }
    } catch(error) {
      if(life.current.mounted){
        const code=typeof error==='object'&&error!==null&&'code' in error?String(error.code):'';
        latest.current.error(kind==='photos' ? /permission|denied/i.test(code) ? 'Разрешите доступ к выбранным фотографиям в настройках устройства.' : 'Не удалось выбрать фотографии. Попробуйте ещё раз.' : 'Не удалось выбрать файл.');
      }
    } finally {picking.current=false;}
  }
  useEffect(() => helpDevActions('composer', { 'composer.focus': () => input.current?.focus(), 'composer.text': value => { if(typeof value==='string')props.onChange(value); }, 'composer.photos':()=>{Keyboard.dismiss();setPhotoPickerOpen(true);} }));
  useEffect(() => {const timer=setTimeout(()=>helpDevState({composerHeight,inputTargetHeight:height,inputContentHeight:contentHeight,inputScrollY:scrollY,draftLength:props.value.length,fontSize:COMPOSER_FONT_SIZE,animationDuration:reduced ? 0 : 180}),100);return()=>clearTimeout(timer);},[composerHeight,height,contentHeight,scrollY,props.value.length,reduced]);
  const hasText = Boolean(props.value.trim() || props.files.length || props.existingFiles?.length); const canSend = !props.sendBlocked && !props.disabled && !props.busy && !preparingPhotos && (props.mode === 'close' || props.editClosure || hasText) && (props.mode !== 'reopen' || Boolean(props.value.trim()));
  function measureContent(rawHeight: number) {
    const measured = Math.max(COMPOSER_LINE_HEIGHT, rawHeight);
    const next = Math.min(COMPOSER_MAX_HEIGHT, measured);
    setContentHeight(measured);
    setScrollY(y => Math.min(Math.max(0, y), Math.max(0, measured - next)));
    if (next !== height) { setHeight(next); props.onResize(); }
  }
  const overflowing = contentHeight > height + 1;
  const multiline=(hasNativeHelpInput?visualLines>1:contentHeight>COMPOSER_LINE_HEIGHT+1)||props.value.includes('\n');
  useEffect(()=>{if(expanded||!restoreSelection.current)return;const range=restoreSelection.current;restoreSelection.current=null;const timer=setTimeout(()=>{if(hasNativeHelpInput)void(input.current as HelpNativeInputHandle)?.restore(props.value,range);else{(input.current as TextInput)?.setNativeProps({selection:range});input.current?.focus();}},60);return()=>clearTimeout(timer);},[expanded]);
  function closeEditor(range:HelpTextSelection){selection.current=range;restoreSelection.current=range;setExpanded(false);}
  const placeholder = props.mode === 'reopen' ? 'Что случилось снова?' : 'Сообщение…';
  const recordingBottom = props.recordingAreaHeight == null ? 125 : Math.max(composerHeight + 8, composerHeight + props.recordingAreaHeight / 2 - recordingCardHeight / 2);
  return <View>{!photoPickerOpen&&!photoPickerVisible?<View ref={node=>helpDevRef('composer.surface',node)} testID="help-composer-surface" onLayout={e => setComposerHeight(e.nativeEvent.layout.height)} style={{ borderRadius: 24, backgroundColor: voiceActive ? 'transparent' : c.surface, borderWidth: voiceActive ? 0 : 1, borderColor: c.line, overflow: 'visible' }}>
    {attachmentMenu ? <HelpSheet title="Прикрепить" onClose={()=>setAttachmentMenu(false)}><View style={{gap:4}}>{([{kind:'photos',label:'Фотографии',icon:'images-outline'},{kind:'files',label:'Файлы',icon:'document-outline'}] as const).map(item=><Pressable key={item.kind} accessibilityRole="button" accessibilityLabel={`Выбрать ${item.label.toLocaleLowerCase('ru-RU')}`} onPress={()=>void pick(item.kind)} style={({pressed})=>({minHeight:52,flexDirection:'row',alignItems:'center',gap:14,paddingHorizontal:12,borderRadius:12,backgroundColor:pressed?c.soft:'transparent'})}><Ionicons name={item.icon} size={24} color={c.accentText}/><Text style={{fontSize:16,color:c.text}}>{item.label}</Text></Pressable>)}</View></HelpSheet> : null}
    {recording || starting ? <View testID="help-recording-card" onLayout={e => setRecordingCardHeight(e.nativeEvent.layout.height)} style={{ position: 'absolute', bottom: recordingBottom, left: '12%', right: '12%', borderRadius: 24, paddingTop: 26, paddingHorizontal: 24, paddingBottom: 20, borderWidth: 1, borderColor: c.line, backgroundColor: c.elevated, alignItems: 'center', gap: 14 }}><Text style={{ color: c.text, fontWeight: '600' }}>{starting ? 'Включение микрофона…' : locked ? 'Запись закреплена' : 'Запись голоса'}</Text><View style={{ height: 64, flexDirection: 'row', alignItems: 'center', gap: 3 }}>{meter.map((value, i) => <View key={i} style={{ height: Math.max(4, value * 60), width: 4, borderRadius: 2, backgroundColor: c.accent }} />)}</View><Text accessibilityLiveRegion="polite" style={{ color: c.text, fontSize: 18, letterSpacing: .6, fontVariant: ['tabular-nums'] }}>{helpDuration(recordState.durationMillis / 1000)}</Text><Text style={{ color: c.muted, fontSize: 12, textAlign: 'center' }}>{locked ? 'До 1 минуты • остановите для прослушивания' : 'Вверх — закрепить · влево — отменить'}</Text>{locked ? <View style={{ flexDirection: 'row', gap: 14 }}><HelpIcon name="trash-outline" label="Отменить запись" onPress={() => void finish('cancel')} /><HelpIcon name="stop" label="Остановить и сохранить запись в черновик" onPress={() => void finish('stage')} /><HelpIcon name="arrow-up" label="Отправить запись" onPress={() => void finish('send')} /></View> : null}</View> : null}
    {recording && !locked ? <View style={{ position: 'absolute', right: 4, bottom: 66, width: 40, height: 64, backgroundColor: c.elevated, borderWidth: 1, borderColor: c.line, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="chevron-up" size={14} color={c.accentText} /><HelpIcon name="lock-closed-outline" label="Проведите вверх, чтобы закрепить запись" size={19} style={{ width: 38, height: 32 }} /></View> : null}
    {props.mode !== 'message' ? <View style={{ minHeight: 38, marginHorizontal: 4, paddingTop: 2, paddingBottom: 5, borderBottomWidth: 1, borderColor: c.line, flexDirection: 'row', alignItems: 'center', paddingLeft: 41 }}>
      {props.mode === 'close' || props.editClosure ? <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 }}>{[1, 2, 3, 4, 5].map(n => <HelpIcon key={n} name={props.rating >= n ? 'star' : 'star-outline'} label={`${n} из 5 звёзд`} color={props.rating >= n ? '#E5A52A' : c.muted} size={23} style={{ width: 30, height: 30 }} onPress={() => props.onRating(props.rating === n ? 0 : n)} />)}<Text style={{ color: c.muted, fontSize: 11, marginLeft: 4 }}>{props.rating}/5</Text></View> : <Text style={{ color: c.accentText, flex: 1, fontSize: 12 }}>{props.mode === 'reopen' ? 'Обращение откроется снова' : 'Редактирование сообщения'}</Text>}
      <HelpIcon name="close-outline" label="Отменить" onPress={props.onCancelMode} size={18} style={{ width: 30, height: 30 }} />
    </View> : null}
    {!voiceActive && props.quote ? <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 4, paddingHorizontal: 4, paddingTop: 4, paddingBottom: 7, borderBottomWidth: 1, borderColor: c.line, gap: 8 }}><Pressable accessibilityRole="button" accessibilityLabel={`К сообщению ${props.quote.name}`} onPress={props.quote.onPress} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons name="arrow-undo" size={22} color={c.accentText} />{props.quote.thumbnail && props.resolve ? <HelpImage attachment={props.quote.thumbnail} resolve={props.resolve} style={{ width: 40, height: 40, borderRadius: 5 }} /> : null}<View style={{ flex: 1, borderLeftWidth: 2, borderColor: c.accent, paddingLeft: 8 }}><Text numberOfLines={1} style={{ color: c.accentText, fontWeight: '600', fontSize: 12 }}>{props.quote.name}</Text><Text numberOfLines={1} style={{ color: c.muted, fontSize: 12 }}>{props.quote.text}</Text></View></Pressable><HelpIcon name="close-outline" label="Отменить ответ" onPress={props.onCancelQuote} size={18} style={{ width: 30, height: 30 }} /></View> : null}
    {!voiceActive && !photoPickerOpen && (props.files.length || props.existingFiles?.length) ? <ScrollView horizontal testID="help-attachment-drafts" style={{ marginLeft: 44, marginRight: 44, marginTop: 8 }} contentContainerStyle={{ gap: 8, alignItems:'center' }} keyboardShouldPersistTaps="handled">
      {props.existingFiles?.map(file => file.kind==='IMAGE' ? <HelpDraftPhoto key={file.id} name={file.name} disabled={props.busy||props.disabled} onRemove={()=>props.onRemoveExisting?.(file.id)}>
        {props.resolve?<HelpImage attachment={file} resolve={props.resolve} style={{width:DRAFT_PHOTO_SIZE,height:DRAFT_PHOTO_SIZE,borderRadius:10}}/>:<View style={{width:DRAFT_PHOTO_SIZE,height:DRAFT_PHOTO_SIZE,borderRadius:10,backgroundColor:c.elevated,alignItems:'center',justifyContent:'center'}}><Ionicons name="image-outline" size={28} color={c.muted}/></View>}
      </HelpDraftPhoto> : <View key={file.id} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, backgroundColor: c.elevated, overflow:'hidden', minHeight:52, paddingLeft:10 }}><Text numberOfLines={1} style={{ color: c.text, maxWidth: 130, fontSize: 12 }}>{file.name}</Text><HelpIcon name="close" label={`Убрать ${file.name}`} size={16} style={{ width: 44, height: 52 }} disabled={props.busy||props.disabled} onPress={() => props.onRemoveExisting?.(file.id)} /></View>)}
      {props.files.map((file, index) => file.mimeType?.startsWith('image/') ? <HelpDraftPhoto key={`${file.uri}-${index}`} name={file.name} disabled={props.busy||props.disabled} onRemove={()=>props.onFiles(props.files.filter((_,i)=>i!==index))}>
        <Image accessibilityLabel={`Фото ${index+1}: ${file.name}`} source={{uri:file.uri}} resizeMode="cover" style={{width:DRAFT_PHOTO_SIZE,height:DRAFT_PHOTO_SIZE,borderRadius:10}}/>
      </HelpDraftPhoto> : <View key={`${file.uri}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, backgroundColor: c.elevated, overflow:'hidden', minHeight:52, paddingLeft:10 }}><Ionicons name={file.mimeType?.startsWith('audio/') ? 'mic-outline' : 'document-outline'} color={c.accentText} size={18} /><Text numberOfLines={1} style={{ color: c.text, maxWidth: 130, marginLeft: 6, fontSize: 12 }}>{file.name}</Text><HelpIcon name="close" label={`Убрать ${file.name}`} size={16} style={{ width: 44, height: 52 }} disabled={props.busy||props.disabled} onPress={() => props.onFiles(props.files.filter((_, i) => i !== index))} /></View>)}
    </ScrollView> : null}
    {/* Android EditText reports viewport size while its text Layout is invalid.
        Measure a noninteractive Text with identical font/width instead, so resize
        does not depend on (or feed back into) the animated parent's layout. */}
    {Platform.OS === 'android' && !hasNativeHelpInput ? <Text testID="help-composer-measure" textBreakStrategy="simple" pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" onTextLayout={event => { const last=event.nativeEvent.lines.at(-1); if(last)measureContent(props.value ? last.y+last.height : COMPOSER_LINE_HEIGHT); }} style={{position:'absolute',top:12,left:45,right:47,opacity:0,fontSize:COMPOSER_FONT_SIZE,lineHeight:COMPOSER_LINE_HEIGHT,includeFontPadding:false,padding:0}}>{props.value || '\u200b'}{props.value.endsWith('\n') ? '\u200b' : ''}</Text> : null}
    {voiceActive ? null : hasNativeHelpInput ? <View testID="help-composer-entry"><HelpNativeInput ref={input as React.Ref<HelpNativeInputHandle>} value={props.value} onChange={props.onChange} onSelection={range=>{selection.current=range;}} onLines={setVisualLines} placeholder={placeholder} color={c.text} hintColor={c.muted} accentColor={c.accent} editable={!props.busy && !props.disabled && !recording && !starting} reducedMotion={reduced} onGeometry={(_,content)=>{setContentHeight(content);setHeight(Math.min(COMPOSER_MAX_HEIGHT,content));props.onResize();}}/></View> : <Animated.View testID="help-composer-entry" style={{ height: entryHeight, minHeight: 46, paddingTop: 12, paddingBottom: bottomInset, paddingLeft: 45, paddingRight: 47, overflow: 'hidden', borderBottomLeftRadius: 23, borderBottomRightRadius: 23 }}><TextInput ref={node=>{input.current=node;helpDevRef('composer.input',node);}} accessibilityLabel="Сообщение" placeholder={Platform.OS === 'android' ? undefined : placeholder} placeholderTextColor={c.muted} value={props.value} onChangeText={props.onChange} onSelectionChange={e=>{selection.current=e.nativeEvent.selection;}} editable={!props.busy && !props.disabled && !recording && !starting} multiline textBreakStrategy="simple" textAlignVertical="top" underlineColorAndroid="transparent" scrollEnabled={overflowing} onContentSizeChange={e => { if (Platform.OS !== 'android') measureContent(e.nativeEvent.contentSize.height); }} onScroll={e => setScrollY(Math.max(0, e.nativeEvent.contentOffset.y))} style={{ color: c.text, fontSize: COMPOSER_FONT_SIZE, lineHeight: COMPOSER_LINE_HEIGHT, minHeight: COMPOSER_LINE_HEIGHT, height: inputHeight, padding: 0, borderWidth: 0, includeFontPadding: false, backgroundColor: 'transparent', ...(Platform.OS === 'web' ? { outlineStyle: 'none', outlineWidth: 0, boxShadow: 'none', scrollbarWidth: 'none' } as any : {}) }} onKeyPress={e => { const event = e.nativeEvent as any; if (Platform.OS === 'web' && event.key === 'Enter' && (event.ctrlKey || event.metaKey) && canSend) { e.preventDefault(); void props.onSend(); } }} />
      {/* Android's native hint ignores the line-height span used for entered text. */}
      {Platform.OS === 'android' && !props.value ? <Text testID="help-composer-placeholder" pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" numberOfLines={1} style={{ position: 'absolute', left: 45, right: 47, top: 12, color: c.muted, fontSize: COMPOSER_FONT_SIZE, lineHeight: COMPOSER_LINE_HEIGHT, includeFontPadding: false }}>{placeholder}</Text> : null}
      {overflowing && scrollY > 1 ? <LinearGradient testID="help-composer-fade-top" pointerEvents="none" colors={[c.surface + '80', c.surface + '00']} style={{ position: 'absolute', left: 45, right: 47, top: 12, height: 12 }} /> : null}
      {overflowing && scrollY + height < contentHeight - 1 ? <LinearGradient testID="help-composer-fade-bottom" pointerEvents="none" colors={[c.surface + '00', c.surface + '80']} style={{ position: 'absolute', left: 45, right: 47, bottom: 0, height: 12 }} /> : null}
    </Animated.View>}
      {!voiceActive&&multiline?<HelpIcon name="expand-outline" label="Развернуть редактор сообщения" size={16} onPress={()=>{Keyboard.dismiss();setExpanded(true);}} style={{position:'absolute',top:2,right:8,width:28,height:20}}/>:null}
      {!voiceActive?<HelpIcon name="attach-outline" label="Прикрепить файлы" disabled={props.busy || props.disabled || recording || starting} onPress={() => {if(Platform.OS==='web')setAttachmentMenu(true);else{Keyboard.dismiss();setPhotoPickerOpen(value=>!value);}}} color={c.muted} size={24} rotation={40} style={{ position: 'absolute', bottom: 4, left: 4, width: 36, height: 38 }} />:null}
      {hasNativeHelpVoice&&props.mode==='message'&&!props.onStopAssistant?<HelpVoiceRecorder screenActive={props.screenActive} draftKey={props.voiceDraftKey??'composer'} visible={!hasText&&!photoPickerOpen} disabled={props.busy||Boolean(props.disabled)} onActive={setVoiceActive} onSend={voice=>props.onSend(voice,undefined,true)} error={props.error}/>:null}
      {!voiceActive&&!(hasNativeHelpVoice&&props.mode==='message'&&!hasText&&!photoPickerOpen&&!props.onStopAssistant)? props.onStopAssistant && !hasText ? <HelpIcon name="stop" label="Остановить ответ ИИ" color="#FFF" size={20} style={{ position: 'absolute', right: 4, bottom: 4, width: 38, height: 38, borderRadius: 19, backgroundColor: c.accent }} onPress={props.onStopAssistant}/> : props.mode === 'message' && !hasText && !photoPickerOpen ? <Animated.View {...gestures.panHandlers} accessible accessibilityRole="button" accessibilityLabel="Удерживайте для записи голосового сообщения. Проведите вверх, чтобы закрепить запись" onAccessibilityTap={() => void start(true)} style={{ position: 'absolute', right: 4, bottom: 4, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: recording && !locked ? '#DB5059' : c.accent, opacity: props.busy || props.disabled ? .4 : 1, transform: [{ scale: pulse }] }}>{starting ? <ActivityIndicator color="#FFF" size="small" /> : <Ionicons name={locked ? 'lock-closed' : 'mic'} size={22} color="#FFF" />}</Animated.View> : <HelpIcon name={props.mode === 'close' || props.mode === 'edit' ? 'checkmark' : 'arrow-up'} label={props.mode === 'close' ? 'Закрыть обращение' : props.mode === 'edit' ? 'Сохранить изменения' : 'Отправить сообщение'} disabled={!canSend} color="#FFF" size={22} style={{ position: 'absolute', right: 4, bottom: 4, width: 38, height: 38, borderRadius: 19, backgroundColor: c.accent }} onPress={() => void props.onSend().then(result=>{if(result!==false)setPhotoPickerOpen(false);})} />:null}
  </View>:null}
    {expanded?<HelpExpandedEditor value={props.value} onChange={props.onChange} selection={selection.current} onDone={closeEditor}/>:null}
    {Platform.OS !== 'web' ? <HelpPhotoPicker open={photoPickerOpen} onVisibility={setPhotoPickerVisible} onClose={()=>setPhotoPickerOpen(false)} files={props.files} onFiles={props.onFiles} caption={props.value} onCaption={props.onChange} onSend={files=>props.onSend(undefined,files)} onPreparing={setPreparingPhotos} onError={props.error} onDocuments={()=>{setPhotoPickerOpen(false);void pick('files');}} busy={props.busy||Boolean(props.disabled)} existingCount={props.existingFiles?.length??0}/> : null}
  </View>;
}
