import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, Keyboard, LayoutAnimation, PanResponder, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useHelpTheme, useHelpReducedMotion } from '../helpTheme';
import { helpDuration } from '../helpUiUtils';
import { HelpIcon } from './HelpPrimitives';
import type { HelpAttachment } from '../helpApi';

export type HelpLocalFile = { uri: string; name: string; mimeType?: string; file?: File; size?: number };
export type HelpComposeMode = 'message' | 'close' | 'reopen' | 'edit';
type Props = { value: string; onChange: (text: string) => void; files: HelpLocalFile[]; onFiles: (files: HelpLocalFile[]) => void; onSend: (voice?: HelpLocalFile) => Promise<void>; busy: boolean; mode: HelpComposeMode; rating: number; onRating: (rating: number) => void; onCancelMode: () => void; quote?: { name: string; text: string; onPress: () => void }; onCancelQuote: () => void; error: (message: string) => void; focusKey?: number; onResize: () => void; disabled?: boolean; editClosure?: boolean; existingFiles?: HelpAttachment[]; onRemoveExisting?: (id: string) => void };

export function HelpComposer(props: Props) {
  const c = useHelpTheme(); const reduced=useHelpReducedMotion(); const input = useRef<TextInput>(null); const [height, setHeight] = useState(22); const [scrollY, setScrollY] = useState(0); const [contentHeight, setContentHeight] = useState(22);
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true }); const recordState = useAudioRecorderState(recorder, 80);
  const [recording, setRecording] = useState(false); const [locked, setLocked] = useState(false); const [starting, setStarting] = useState(false); const [meter, setMeter] = useState<number[]>([]);
  const life = useRef({ mounted: true, starting: false, recording: false, locked: false, ending: false, release: null as null | 'send' | 'cancel' | 'stage' });
  const latest = useRef(props); latest.current = props; const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => { if (props.focusKey) input.current?.focus(); }, [props.focusKey]);
  useEffect(() => { if (recordState.isRecording) setMeter(values => [...values.slice(-27), Math.min(1, Math.max(.04, ((recordState.metering ?? -50) + 60) / 60))]); }, [recordState.durationMillis]);
  useEffect(() => { if (recording && recordState.durationMillis >= 60000) void finish('stage'); }, [recordState.durationMillis, recording]);
  useEffect(() => { life.current.mounted = true; const sub = AppState.addEventListener('change', state => { if (state !== 'active') void finish('stage'); }); return () => { sub.remove(); life.current.mounted = false; life.current.release = 'cancel'; if (life.current.recording) void recorder.stop().catch(() => {}); void setAudioModeAsync({ allowsRecording: false }).catch(() => {}); }; }, [recorder]);
  useEffect(() => { if (!recording || reduced) { pulse.stopAnimation(); pulse.setValue(1); return; } const loop = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1.1, duration: 550, useNativeDriver: true }), Animated.timing(pulse, { toValue: 1, duration: 550, useNativeDriver: true })])); loop.start(); return () => loop.stop(); }, [recording,reduced]);
  async function finish(action: 'send' | 'cancel' | 'stage') {
    const state = life.current;
    if (state.starting) { state.release = action; return; }
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
  async function start(lock = false) {
    const state = life.current;
    if (state.starting || state.recording || latest.current.busy || latest.current.disabled) return;
    state.starting = true; state.release = null; state.locked = lock; setStarting(true); Keyboard.dismiss();
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) { if (state.mounted) latest.current.error('Разрешите доступ к микрофону, чтобы записать голосовое сообщение.'); return; }
      if (state.release || !state.mounted) return;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      if (state.release || !state.mounted) return;
      await recorder.prepareToRecordAsync();
      if (state.release || !state.mounted) {
        // Expo's web prepare already owns a live microphone stream. Its inactive
        // MediaRecorder must start before stop can release tracks; discard it.
        if (Platform.OS === 'web') recorder.record();
        await recorder.stop();
        return;
      }
      recorder.record(); state.recording = true; setMeter([]); setRecording(true); setLocked(state.locked);
    } catch { if (state.mounted) latest.current.error(Platform.OS === 'web' ? 'Запись требует HTTPS и разрешения браузера на микрофон.' : 'Не удалось включить микрофон.'); }
    finally { state.starting = false; if (state.mounted) setStarting(false); if (!state.recording) void setAudioModeAsync({ allowsRecording: false }).catch(() => {}); if (state.release && state.recording) void finish(state.release); }
  }
  const gestures = useRef(PanResponder.create({ onStartShouldSetPanResponder: () => !latest.current.busy && !latest.current.disabled, onMoveShouldSetPanResponder: () => true, onPanResponderGrant: () => { void start(); }, onPanResponderMove: (_, g) => { if (g.dy < -65) { life.current.locked = true; setLocked(true); } else if (g.dx < -75 && !life.current.locked) void finish('cancel'); }, onPanResponderRelease: () => { if (!life.current.locked) void finish('send'); }, onPanResponderTerminate: () => { if (!life.current.locked) void finish('cancel'); } })).current;
  async function pick() {
    try { const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true }); if (result.canceled || !life.current.mounted) return;
      const added = result.assets.map(a => ({ uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size, file: a.file }));
      if (latest.current.files.length + added.length + (latest.current.existingFiles?.length ?? 0) > 5) { latest.current.error('В одном сообщении можно прикрепить до 5 файлов.'); return; }
      if (added.some(a => (a.size ?? 0) > 20 * 1024 * 1024)) { latest.current.error('Размер каждого файла должен быть не больше 20 МБ.'); return; }
      latest.current.onFiles([...latest.current.files, ...added]);
    } catch { if (life.current.mounted) latest.current.error('Не удалось выбрать файл.'); }
  }
  const hasText = Boolean(props.value.trim() || props.files.length || props.existingFiles?.length); const canSend = !props.disabled && !props.busy && (props.mode === 'close' || props.editClosure || hasText) && (props.mode !== 'reopen' || Boolean(props.value.trim()));
  return <View style={{ borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, overflow: 'visible' }}>
    {recording || starting ? <View style={{ position: 'absolute', bottom: 125, left: '12%', right: '12%', borderRadius: 24, padding: 22, backgroundColor: c.elevated, alignItems: 'center', gap: 14 }}><Text style={{ color: c.text, fontWeight: '600' }}>{starting ? 'Включение микрофона…' : locked ? 'Запись закреплена' : 'Запись голоса'}</Text><View style={{ height: 48, flexDirection: 'row', alignItems: 'center', gap: 3 }}>{meter.map((value, i) => <View key={i} style={{ height: Math.max(4, value * 44), width: 4, borderRadius: 2, backgroundColor: c.accent }} />)}</View><Text accessibilityLiveRegion="polite" style={{ color: c.text, fontVariant: ['tabular-nums'] }}>{helpDuration(recordState.durationMillis / 1000)}</Text><Text style={{ color: c.muted, fontSize: 12, textAlign: 'center' }}>{locked ? 'До 1 минуты • остановите для прослушивания' : 'Вверх — закрепить · влево — отменить'}</Text>{locked ? <View style={{ flexDirection: 'row', gap: 14 }}><HelpIcon name="trash-outline" label="Отменить запись" onPress={() => void finish('cancel')} /><HelpIcon name="stop" label="Остановить и сохранить запись в черновик" onPress={() => void finish('stage')} /><HelpIcon name="arrow-up" label="Отправить запись" onPress={() => void finish('send')} /></View> : null}</View> : null}
    {recording && !locked ? <View style={{ position: 'absolute', right: 6, bottom: 64, backgroundColor: c.elevated, borderRadius: 22 }}><HelpIcon name="lock-closed-outline" label="Проведите вверх, чтобы закрепить запись" /></View> : null}
    {props.mode !== 'message' ? <View style={{ minHeight: 40, marginHorizontal: 6, borderBottomWidth: 1, borderColor: c.line, flexDirection: 'row', alignItems: 'center', paddingLeft: 40 }}>
      {props.mode === 'close' || props.editClosure ? <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>{[1, 2, 3, 4, 5].map(n => <HelpIcon key={n} name={props.rating >= n ? 'star' : 'star-outline'} label={`${n} из 5 звёзд`} color={props.rating >= n ? '#E2B253' : c.muted} size={21} style={{ width: 29, height: 36 }} onPress={() => props.onRating(props.rating === n ? 0 : n)} />)}<Text style={{ color: c.muted, fontSize: 11, marginLeft: 4 }}>{props.rating}/5</Text></View> : <Text style={{ color: c.accentText, flex: 1, fontSize: 12 }}>{props.mode === 'reopen' ? 'Обращение откроется снова' : 'Редактирование сообщения'}</Text>}
      <HelpIcon name="close-outline" label="Отменить" onPress={props.onCancelMode} size={20} style={{ width: 32 }} />
    </View> : null}
    {props.quote ? <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 48, paddingRight: 5, paddingTop: 8 }}><Pressable accessibilityRole="button" accessibilityLabel={`К сообщению ${props.quote.name}`} onPress={props.quote.onPress} style={{ flex: 1, borderLeftWidth: 2, borderColor: c.accent, paddingLeft: 8 }}><Text numberOfLines={1} style={{ color: c.accentText, fontWeight: '600', fontSize: 12 }}>{props.quote.name}</Text><Text numberOfLines={1} style={{ color: c.muted, fontSize: 12 }}>{props.quote.text}</Text></Pressable><HelpIcon name="close-outline" label="Отменить ответ" onPress={props.onCancelQuote} size={18} /></View> : null}
    {props.files.length || props.existingFiles?.length ? <ScrollView horizontal style={{ marginLeft: 44, marginRight: 44, marginTop: 8 }} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">{props.existingFiles?.map(file => <View key={file.id} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, backgroundColor: c.elevated, paddingLeft: 10 }}><Text numberOfLines={1} style={{ color: c.text, maxWidth: 130, fontSize: 12 }}>{file.name}</Text><HelpIcon name="close" label={`Убрать ${file.name}`} size={14} style={{ width: 28, height: 32 }} disabled={props.busy} onPress={() => props.onRemoveExisting?.(file.id)} /></View>)}{props.files.map((file, index) => <View key={`${file.uri}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, backgroundColor: c.elevated, paddingLeft: 10 }}><Ionicons name={file.mimeType?.startsWith('audio/') ? 'mic-outline' : file.mimeType?.startsWith('image/') ? 'image-outline' : 'document-outline'} color={c.accentText} size={18} /><Text numberOfLines={1} style={{ color: c.text, maxWidth: 130, marginLeft: 6, fontSize: 12 }}>{file.name}</Text><HelpIcon name="close" label={`Убрать ${file.name}`} size={14} style={{ width: 28, height: 32 }} disabled={props.busy} onPress={() => props.onFiles(props.files.filter((_, i) => i !== index))} /></View>)}</ScrollView> : null}
    <View style={{ minHeight: 48, paddingVertical: 11, paddingHorizontal: 48 }}><TextInput ref={input} accessibilityLabel="Сообщение" placeholder={props.mode === 'reopen' ? 'Что случилось снова?' : 'Сообщение…'} placeholderTextColor={c.muted} value={props.value} onChangeText={props.onChange} editable={!props.busy && !props.disabled && !recording} multiline textAlignVertical="top" scrollEnabled={contentHeight > 143} onContentSizeChange={e => { const next = Math.min(143, Math.max(22, e.nativeEvent.contentSize.height)); setContentHeight(e.nativeEvent.contentSize.height); if (next !== height) { if(!reduced && Platform.OS!=='web')LayoutAnimation.configureNext({duration:180,update:{type:'easeInEaseOut'}}); setHeight(next); props.onResize(); } }} onScroll={e => setScrollY(e.nativeEvent.contentOffset.y)} style={{ color: c.text, fontSize: 15, lineHeight: 22, minHeight: 22, height, padding: 0, backgroundColor: 'transparent', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }} onKeyPress={e => { const event = e.nativeEvent as any; if (Platform.OS === 'web' && event.key === 'Enter' && (event.ctrlKey || event.metaKey) && canSend) { e.preventDefault(); void props.onSend(); } }} />
      {contentHeight > 143 && scrollY > 2 ? <LinearGradient pointerEvents="none" colors={[c.surface, c.surface + '00']} style={{ position: 'absolute', left: 48, right: 48, top: 10, height: 12 }} /> : null}
      {contentHeight > 143 && scrollY + 143 < contentHeight - 2 ? <LinearGradient pointerEvents="none" colors={[c.surface + '00', c.surface]} style={{ position: 'absolute', left: 48, right: 48, bottom: 10, height: 12 }} /> : null}
      <HelpIcon name="attach-outline" label="Прикрепить файлы" disabled={props.busy || props.disabled || recording} onPress={() => void pick()} color={c.muted} style={{ position: 'absolute', bottom: 4, left: 3 }} />
      {props.mode === 'message' && !hasText ? <Animated.View {...gestures.panHandlers} accessible accessibilityRole="button" accessibilityLabel="Удерживайте для записи голосового сообщения. Проведите вверх, чтобы закрепить запись" onAccessibilityTap={() => void start(true)} style={{ position: 'absolute', right: 5, bottom: 5, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent, opacity: props.busy || props.disabled ? .4 : 1, transform: [{ scale: pulse }] }}>{starting ? <ActivityIndicator color="#FFF" size="small" /> : <Ionicons name={locked ? 'lock-closed' : 'mic'} size={22} color="#FFF" />}</Animated.View> : <HelpIcon name={props.mode === 'close' || props.mode === 'edit' ? 'checkmark' : 'arrow-up'} label={props.mode === 'close' ? 'Закрыть обращение' : props.mode === 'edit' ? 'Сохранить изменения' : 'Отправить сообщение'} disabled={!canSend} color="#FFF" style={{ position: 'absolute', right: 5, bottom: 5, width: 38, height: 38, backgroundColor: c.accent }} onPress={() => void props.onSend()} />}
    </View>
  </View>;
}
