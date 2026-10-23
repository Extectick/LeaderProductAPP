import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, Keyboard, LayoutAnimation, PanResponder, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import { RecordingPresets, getRecordingPermissionsAsync, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useHelpTheme, useHelpReducedMotion } from '../helpTheme';
import { helpDuration } from '../helpUiUtils';
import { HelpIcon } from './HelpPrimitives';
import { HelpImage, type ResolveHelpMedia } from './HelpMedia';
import type { HelpAttachment } from '../helpApi';

export type HelpLocalFile = { uri: string; name: string; mimeType?: string; file?: File; size?: number };
export type HelpComposeMode = 'message' | 'close' | 'reopen' | 'edit';
type Props = { value: string; onChange: (text: string) => void; files: HelpLocalFile[]; onFiles: (files: HelpLocalFile[]) => void; onSend: (voice?: HelpLocalFile) => Promise<void>; busy: boolean; mode: HelpComposeMode; rating: number; onRating: (rating: number) => void; onCancelMode: () => void; quote?: { name: string; text: string; onPress: () => void; thumbnail?: HelpAttachment }; resolve?: ResolveHelpMedia; recordingAreaHeight?: number; onCancelQuote: () => void; error: (message: string) => void; focusKey?: number; onResize: () => void; disabled?: boolean; editClosure?: boolean; existingFiles?: HelpAttachment[]; onRemoveExisting?: (id: string) => void };

const COMPOSER_LINE_HEIGHT = 22;
const COMPOSER_MAX_HEIGHT = COMPOSER_LINE_HEIGHT * 6.5 + 2;

export function HelpComposer(props: Props) {
  const c = useHelpTheme(); const reduced=useHelpReducedMotion(); const input = useRef<TextInput>(null); const [height, setHeight] = useState(22); const [scrollY, setScrollY] = useState(0); const [contentHeight, setContentHeight] = useState(22);
  const [composerHeight, setComposerHeight] = useState(48); const [recordingCardHeight, setRecordingCardHeight] = useState(180);
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true }); const recordState = useAudioRecorderState(recorder, 80);
  const [recording, setRecording] = useState(false); const [locked, setLocked] = useState(false); const [starting, setStarting] = useState(false); const [meter, setMeter] = useState<number[]>([]);
  const life = useRef({ mounted: true, starting: false, recording: false, locked: false, ending: false, permissionPending: false, permissionInterrupted: false, appState: AppState.currentState ?? 'active', resumeActive: null as null | (() => void), release: null as null | 'send' | 'cancel' | 'stage' });
  const latest = useRef(props); latest.current = props; const pulse = useRef(new Animated.Value(1)).current;
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
  useEffect(() => { if (props.focusKey) input.current?.focus(); }, [props.focusKey]);
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
    if (!state.mounted || state.starting || state.recording || state.ending || state.appState !== 'active' || latest.current.busy || latest.current.disabled) return;
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
  async function pick() {
    try { const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true }); if (result.canceled || !life.current.mounted) return;
      const added = result.assets.map(a => ({ uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size, file: a.file }));
      if (latest.current.files.length + added.length + (latest.current.existingFiles?.length ?? 0) > 5) { latest.current.error('В одном сообщении можно прикрепить до 5 файлов.'); return; }
      if (added.some(a => (a.size ?? 0) > 20 * 1024 * 1024)) { latest.current.error('Размер каждого файла должен быть не больше 20 МБ.'); return; }
      latest.current.onFiles([...latest.current.files, ...added]);
    } catch { if (life.current.mounted) latest.current.error('Не удалось выбрать файл.'); }
  }
  const hasText = Boolean(props.value.trim() || props.files.length || props.existingFiles?.length); const canSend = !props.disabled && !props.busy && (props.mode === 'close' || props.editClosure || hasText) && (props.mode !== 'reopen' || Boolean(props.value.trim()));
  const capped = contentHeight >= COMPOSER_MAX_HEIGHT;
  const overflowing = contentHeight > height + 1;
  const recordingBottom = props.recordingAreaHeight == null ? 125 : Math.max(composerHeight + 8, composerHeight + props.recordingAreaHeight / 2 - recordingCardHeight / 2);
  return <View testID="help-composer-surface" onLayout={e => setComposerHeight(e.nativeEvent.layout.height)} style={{ borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, overflow: 'visible' }}>
    {recording || starting ? <View testID="help-recording-card" onLayout={e => setRecordingCardHeight(e.nativeEvent.layout.height)} style={{ position: 'absolute', bottom: recordingBottom, left: '12%', right: '12%', borderRadius: 24, paddingTop: 26, paddingHorizontal: 24, paddingBottom: 20, borderWidth: 1, borderColor: c.line, backgroundColor: c.elevated, alignItems: 'center', gap: 14 }}><Text style={{ color: c.text, fontWeight: '600' }}>{starting ? 'Включение микрофона…' : locked ? 'Запись закреплена' : 'Запись голоса'}</Text><View style={{ height: 64, flexDirection: 'row', alignItems: 'center', gap: 3 }}>{meter.map((value, i) => <View key={i} style={{ height: Math.max(4, value * 60), width: 4, borderRadius: 2, backgroundColor: c.accent }} />)}</View><Text accessibilityLiveRegion="polite" style={{ color: c.text, fontSize: 18, letterSpacing: .6, fontVariant: ['tabular-nums'] }}>{helpDuration(recordState.durationMillis / 1000)}</Text><Text style={{ color: c.muted, fontSize: 12, textAlign: 'center' }}>{locked ? 'До 1 минуты • остановите для прослушивания' : 'Вверх — закрепить · влево — отменить'}</Text>{locked ? <View style={{ flexDirection: 'row', gap: 14 }}><HelpIcon name="trash-outline" label="Отменить запись" onPress={() => void finish('cancel')} /><HelpIcon name="stop" label="Остановить и сохранить запись в черновик" onPress={() => void finish('stage')} /><HelpIcon name="arrow-up" label="Отправить запись" onPress={() => void finish('send')} /></View> : null}</View> : null}
    {recording && !locked ? <View style={{ position: 'absolute', right: 4, bottom: 66, width: 40, height: 64, backgroundColor: c.elevated, borderWidth: 1, borderColor: c.line, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="chevron-up" size={14} color={c.accentText} /><HelpIcon name="lock-closed-outline" label="Проведите вверх, чтобы закрепить запись" size={19} style={{ width: 38, height: 32 }} /></View> : null}
    {props.mode !== 'message' ? <View style={{ minHeight: 38, marginHorizontal: 4, paddingTop: 2, paddingBottom: 5, borderBottomWidth: 1, borderColor: c.line, flexDirection: 'row', alignItems: 'center', paddingLeft: 41 }}>
      {props.mode === 'close' || props.editClosure ? <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 }}>{[1, 2, 3, 4, 5].map(n => <HelpIcon key={n} name={props.rating >= n ? 'star' : 'star-outline'} label={`${n} из 5 звёзд`} color={props.rating >= n ? '#E5A52A' : c.muted} size={23} style={{ width: 30, height: 30 }} onPress={() => props.onRating(props.rating === n ? 0 : n)} />)}<Text style={{ color: c.muted, fontSize: 11, marginLeft: 4 }}>{props.rating}/5</Text></View> : <Text style={{ color: c.accentText, flex: 1, fontSize: 12 }}>{props.mode === 'reopen' ? 'Обращение откроется снова' : 'Редактирование сообщения'}</Text>}
      <HelpIcon name="close-outline" label="Отменить" onPress={props.onCancelMode} size={18} style={{ width: 30, height: 30 }} />
    </View> : null}
    {props.quote ? <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 4, paddingHorizontal: 4, paddingTop: 4, paddingBottom: 7, borderBottomWidth: 1, borderColor: c.line, gap: 8 }}><Pressable accessibilityRole="button" accessibilityLabel={`К сообщению ${props.quote.name}`} onPress={props.quote.onPress} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons name="return-up-back" size={22} color={c.accentText} />{props.quote.thumbnail && props.resolve ? <HelpImage attachment={props.quote.thumbnail} resolve={props.resolve} style={{ width: 40, height: 40, borderRadius: 5 }} /> : null}<View style={{ flex: 1, borderLeftWidth: 2, borderColor: c.accent, paddingLeft: 8 }}><Text numberOfLines={1} style={{ color: c.accentText, fontWeight: '600', fontSize: 12 }}>{props.quote.name}</Text><Text numberOfLines={1} style={{ color: c.muted, fontSize: 12 }}>{props.quote.text}</Text></View></Pressable><HelpIcon name="close-outline" label="Отменить ответ" onPress={props.onCancelQuote} size={18} style={{ width: 30, height: 30 }} /></View> : null}
    {props.files.length || props.existingFiles?.length ? <ScrollView horizontal style={{ marginLeft: 44, marginRight: 44, marginTop: 8 }} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">{props.existingFiles?.map(file => <View key={file.id} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, backgroundColor: c.elevated, paddingLeft: 10 }}><Text numberOfLines={1} style={{ color: c.text, maxWidth: 130, fontSize: 12 }}>{file.name}</Text><HelpIcon name="close" label={`Убрать ${file.name}`} size={14} style={{ width: 28, height: 32 }} disabled={props.busy} onPress={() => props.onRemoveExisting?.(file.id)} /></View>)}{props.files.map((file, index) => <View key={`${file.uri}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, backgroundColor: c.elevated, paddingLeft: 10 }}><Ionicons name={file.mimeType?.startsWith('audio/') ? 'mic-outline' : file.mimeType?.startsWith('image/') ? 'image-outline' : 'document-outline'} color={c.accentText} size={18} /><Text numberOfLines={1} style={{ color: c.text, maxWidth: 130, marginLeft: 6, fontSize: 12 }}>{file.name}</Text><HelpIcon name="close" label={`Убрать ${file.name}`} size={14} style={{ width: 28, height: 32 }} disabled={props.busy} onPress={() => props.onFiles(props.files.filter((_, i) => i !== index))} /></View>)}</ScrollView> : null}
    <View testID="help-composer-entry" style={{ minHeight: 46, paddingTop: 12, paddingBottom: capped ? 0 : 12, paddingLeft: 45, paddingRight: 47, overflow: 'hidden', borderBottomLeftRadius: 19, borderBottomRightRadius: 19 }}><TextInput ref={input} accessibilityLabel="Сообщение" placeholder={props.mode === 'reopen' ? 'Что случилось снова?' : 'Сообщение…'} placeholderTextColor={c.muted} value={props.value} onChangeText={props.onChange} editable={!props.busy && !props.disabled && !recording && !starting} multiline textAlignVertical="top" underlineColorAndroid="transparent" scrollEnabled={overflowing} onContentSizeChange={e => { const measured = Math.max(COMPOSER_LINE_HEIGHT, e.nativeEvent.contentSize.height); const next = Math.min(COMPOSER_MAX_HEIGHT, measured); setContentHeight(measured); setScrollY(y => Math.min(Math.max(0, y), Math.max(0, measured - next))); if (next !== height) { if(!reduced && Platform.OS!=='web')LayoutAnimation.configureNext({duration:180,update:{type:'easeInEaseOut'}}); setHeight(next); props.onResize(); } }} onScroll={e => setScrollY(Math.max(0, e.nativeEvent.contentOffset.y))} style={{ color: c.text, fontSize: 14, lineHeight: COMPOSER_LINE_HEIGHT, minHeight: COMPOSER_LINE_HEIGHT, height, padding: 0, borderWidth: 0, includeFontPadding: false, backgroundColor: 'transparent', ...(Platform.OS === 'web' ? { outlineStyle: 'none', outlineWidth: 0, boxShadow: 'none', scrollbarWidth: 'none' } as any : {}) }} onKeyPress={e => { const event = e.nativeEvent as any; if (Platform.OS === 'web' && event.key === 'Enter' && (event.ctrlKey || event.metaKey) && canSend) { e.preventDefault(); void props.onSend(); } }} />
      {overflowing && scrollY > 1 ? <LinearGradient testID="help-composer-fade-top" pointerEvents="none" colors={[c.surface + '80', c.surface + '00']} style={{ position: 'absolute', left: 45, right: 47, top: 12, height: 12 }} /> : null}
      {overflowing && scrollY + height < contentHeight - 1 ? <LinearGradient testID="help-composer-fade-bottom" pointerEvents="none" colors={[c.surface + '00', c.surface + '80']} style={{ position: 'absolute', left: 45, right: 47, bottom: capped ? 0 : 12, height: 12 }} /> : null}
      <HelpIcon name="attach-outline" label="Прикрепить файлы" disabled={props.busy || props.disabled || recording || starting} onPress={() => void pick()} color={c.muted} size={22} style={{ position: 'absolute', bottom: 4, left: 4, width: 36, height: 38 }} />
      {props.mode === 'message' && !hasText ? <Animated.View {...gestures.panHandlers} accessible accessibilityRole="button" accessibilityLabel="Удерживайте для записи голосового сообщения. Проведите вверх, чтобы закрепить запись" onAccessibilityTap={() => void start(true)} style={{ position: 'absolute', right: 4, bottom: 4, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: recording && !locked ? '#DB5059' : c.accent, opacity: props.busy || props.disabled ? .4 : 1, transform: [{ scale: pulse }] }}>{starting ? <ActivityIndicator color="#FFF" size="small" /> : <Ionicons name={locked ? 'lock-closed' : 'mic'} size={22} color="#FFF" />}</Animated.View> : <HelpIcon name={props.mode === 'close' || props.mode === 'edit' ? 'checkmark' : 'arrow-up'} label={props.mode === 'close' ? 'Закрыть обращение' : props.mode === 'edit' ? 'Сохранить изменения' : 'Отправить сообщение'} disabled={!canSend} color="#FFF" size={22} style={{ position: 'absolute', right: 4, bottom: 4, width: 38, height: 38, borderRadius: 19, backgroundColor: c.accent }} onPress={() => void props.onSend()} />}
    </View>
  </View>;
}
