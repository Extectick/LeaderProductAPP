import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, Keyboard, PanResponder, Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { useHelpReducedMotion, useHelpTheme } from '../helpTheme';
import { useHelpAudioCommands } from '../HelpAudioPlayback';
import { helpDuration } from '../helpUiUtils';
import type { HelpLocalFile } from './HelpComposer';
type Snapshot = {
  recording: boolean;
  durationMs: number;
  amplitude: number;
  hasDraft: boolean;
};
type VoiceNative = {
  snapshot: (key: string) => Promise<Snapshot>;
  start: (key: string) => Promise<Snapshot>;
  pause: (key: string) => Promise<Snapshot>;
  discard: (key: string) => Promise<void>;
  exportAudio: (key: string, start: number, end: number) => Promise<{
    uri: string;
    size: number;
    durationMs: number;
  }>;
};
const native = Platform.OS === 'android' ? requireOptionalNativeModule<VoiceNative>('LeaderHelpVoice') : null;
export const hasNativeHelpVoice = Boolean(native);
type Phase = 'idle' | 'preparing' | 'holding' | 'locked' | 'paused';
type Props = {
  draftKey: string;
  visible: boolean;
  disabled: boolean;
  screenActive?: boolean;
  onActive: (active: boolean) => void;
  onSend: (file: HelpLocalFile) => Promise<boolean | void>;
  error: (message: string) => void;
};
const waveDrafts = new Map<string, number[]>();
const editDrafts = new Map<string, {
  duration: number;
  range: [number, number];
}>();
const MIN_RANGE = 250;
const VoiceWaveBars = React.memo(function VoiceWaveBars({samples,width,paused,duration,range,accent,line}:{
  samples:React.MutableRefObject<number[]>;width:number;paused:boolean;duration:number;range:[number,number];accent:string;line:string;
}) {
  const [, repaint] = useState(0);
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => repaint(value => value + 1), 80);
    return () => clearInterval(timer);
  }, [paused]);
  const wave = samples.current, count = Math.max(8, Math.floor(width / 6));
  const bars = Array.from({length:count}, (_, i) => {
    if (!paused) return wave[wave.length - count + i] ?? 0;
    const from = Math.floor(i * wave.length / count), to = Math.max(from + 1, Math.floor((i + 1) * wave.length / count));
    return Math.max(0, ...wave.slice(from, to));
  });
  return <View pointerEvents="none" style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',height:44}}>
    {bars.map((value,i)=><View key={i} style={{width:4,borderRadius:2,height:Math.max(3,value*44),backgroundColor:paused&&(i/count<range[0]/duration||i/count>range[1]/duration)?line:accent}}/>)}
  </View>;
});

/** One composer row for every voice state. Native owns recording across navigation. */
export function HelpVoiceRecorder(props: Props) {
  const c = useHelpTheme(),
    reduced = useHelpReducedMotion(),
    commands = useHelpAudioCommands();
  const [phase, setPhase] = useState<Phase>('idle'),
    [duration, setDuration] = useState(0),
    [range, setRange] = useState<[number, number]>([0, 0]),
    [waveWidth, setWaveWidth] = useState(1),
    [working, setWorking] = useState(false);
  const player = useAudioPlayer(null, {
      updateInterval: 80
    }),
    playback = useAudioPlayerStatus(player);
  const latest = useRef(props);
  latest.current = props;
  const state = useRef({
    phase: 'idle' as Phase,
    duration: 0,
    range: [0, 0] as [number, number],
    waveWidth: 1,
    mounted: true,
    working: false,
    starting: false,
    locked: false,
    background: AppState.currentState === 'background',
    release: null as null | 'send' | 'cancel' | 'stage',
    generation: 0
  });
  const statusRevision=useRef(0);
  const waveSamples = useRef<number[]>([]);
  const haloLevel = useSharedValue(0);
  const dragX = useSharedValue(0), dragY = useSharedValue(0);

  const lastDragFrame = useSharedValue(-1000);
  const dragOriginX = useSharedValue(0), dragOriginY = useSharedValue(0);
  const dragStyle = useAnimatedStyle(() => ({ transform: [{translateX:dragX.value},{translateY:dragY.value}] }));
  const haloStyle = useAnimatedStyle(() => ({transform:[{translateX:dragX.value},{translateY:dragY.value},{scale:reduced?1:1.08+haloLevel.value*.15}]}));
  useEffect(() => {
    if (phase === 'holding' || phase === 'preparing') return;
    cancelAnimation(dragX); cancelAnimation(dragY);
    const duration = phase === 'locked' && !reduced ? 160 : 0;
    dragX.value = withTiming(0, {duration});
    dragY.value = withTiming(0, {duration});
  }, [phase, reduced, dragX, dragY]);
  state.current.range = range;
  state.current.waveWidth = waveWidth;
  const preview = useRef<string | null>(null),
    preparedRange = useRef(''),
    meter = useRef(0),
    hint = useRef(new Animated.Value(0)).current;
  const sendExport = useRef<{
    range: string;
    file: HelpLocalFile;
  } | null>(null);
  function changePhase(next: Phase) {
    if (state.current.phase === next) return;
    state.current.phase = next;
    if (state.current.mounted) {
      setPhase(next);
      latest.current.onActive(next !== 'idle');
    }
  }
  function stopPlayer() {
    try {
      player.pause();
    } catch {}
    preparedRange.current = '';
  }
  async function clearPreview() {
    const uri = preview.current;
    preview.current = null;
    if (uri) await FileSystem.deleteAsync(uri, {
      idempotent: true
    }).catch(() => {});
  }
  function applySnapshot(value: Snapshot) {
    state.current.duration = value.durationMs;
    setDuration(previous => value.recording && Math.floor(previous / 1000) === Math.floor(value.durationMs / 1000) ? previous : value.durationMs);
    if (value.recording && state.current.phase === 'idle') changePhase('locked');else if (!value.recording && value.hasDraft && state.current.phase !== 'paused') {
      setRange([0, value.durationMs]);
      changePhase('paused');
    } else if (!value.hasDraft && state.current.phase !== 'preparing') changePhase('idle');
  }
  useEffect(() => {
    state.current.mounted = true;
    const generation = ++state.current.generation;
    const initialRevision=statusRevision.current;
    waveSamples.current = waveDrafts.get(props.draftKey) ?? [];
    void native!.snapshot(props.draftKey).then(value => {
      if (state.current.mounted && generation === state.current.generation && initialRevision===statusRevision.current) {
        applySnapshot(value);
        const saved = editDrafts.get(props.draftKey);
        if (!value.recording && saved?.duration === value.durationMs) setRange(saved.range);
      }
    }).catch(() => latest.current.error('Не удалось восстановить запись.'));
    let polling = false;
    const timer = setInterval(() => {
      if (polling || state.current.starting || state.current.working || !['holding','locked'].includes(state.current.phase)) return;
      const revision=statusRevision.current;
      polling = true;
      void native!.snapshot(props.draftKey).then(value => {
        if (!state.current.mounted || generation !== state.current.generation || revision!==statusRevision.current) return;
        applySnapshot(value);
        if (value.recording) {
          // Microphone values are linear amplitudes. A dB scale makes ordinary
          // speech visible; fast attack keeps consonants instead of smoothing them away.
          const db = 20 * Math.log10(Math.max(.00001, value.amplitude));
          const amplitude = Math.max(0, Math.min(1, (db + 60) / 54));
          meter.current = Math.max(amplitude, meter.current * .72);
          haloLevel.value = meter.current;
          waveSamples.current.push(Math.max(.06, meter.current));
          if (waveSamples.current.length > 800) waveSamples.current.shift();
          waveDrafts.set(props.draftKey, waveSamples.current);
        } else {
          meter.current = 0;
          haloLevel.value = 0;
        }
      }).catch(() => {}).finally(() => {
        polling = false;
      });
    }, 80);
    const app = AppState.addEventListener('change', next => {
      state.current.background = next !== 'active';
      if (next !== 'active') {
        stopPlayer();
        void pause();
      }
    });
    return () => {
      state.current.mounted = false;
      state.current.generation++;
      clearInterval(timer);
      app.remove();
      stopPlayer();
      void clearPreview();
      void native!.pause(props.draftKey).catch(() => {});
    };
  }, [props.draftKey]);
  useEffect(() => {
    if (phase === 'paused') editDrafts.set(props.draftKey, {
      duration,
      range
    });
  }, [phase, duration, range, props.draftKey]);
  useEffect(() => {
    if (props.screenActive === false) {
      stopPlayer();
      void pause();
    }
  }, [props.screenActive]);
  useEffect(() => {
    if (phase !== 'holding' || reduced) {
      hint.setValue(0);
      return;
    }
    const animation = Animated.loop(Animated.sequence([Animated.timing(hint, {
      toValue: -4,
      duration: 650,
      useNativeDriver: true
    }), Animated.timing(hint, {
      toValue: 0,
      duration: 650,
      useNativeDriver: true
    })]));
    animation.start();
    return () => animation.stop();
  }, [phase, reduced, hint]);
  async function pause() {
    if (state.current.starting || state.current.working || state.current.phase === 'paused') return;
    statusRevision.current++;
    try {
      const value = await native!.pause(props.draftKey);
      if (state.current.mounted) {
        applySnapshot(value);
        setRange([0, value.durationMs]);
        haloLevel.value = 0;
      }
    } catch {
      if (state.current.mounted) latest.current.error('Не удалось приостановить запись.');
    }
  }
  async function start(resuming = false, accessible = false) {
    const life = state.current;
    const screenIsActive = () => latest.current.screenActive !== false;
    if (life.starting || life.working || latest.current.disabled || !screenIsActive()) return;
    statusRevision.current++;
    life.starting = true;
    life.release = null;
    life.locked = resuming || accessible;
    changePhase('preparing');
    const generation = life.generation;
    try {
      Keyboard.dismiss();
      stopPlayer();
      await clearPreview();
      let permission = await getRecordingPermissionsAsync();
      if (!permission.granted) {
        permission = await requestRecordingPermissionsAsync();
        if (permission.granted) {
          // The system permission dialog consumes the original finger-up event.
          // Require a new hold instead of leaving an unattended recording running.
          const saved = await native!.snapshot(props.draftKey);
          applySnapshot(saved);
          changePhase(saved.hasDraft ? 'paused' : 'idle');
          return;
        }
      }
      if (!permission.granted) throw new Error('Разрешите доступ к микрофону для записи.');
      if (!life.mounted || generation !== life.generation) return;
      commands?.stop();
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true
      });
      const value = await native!.start(props.draftKey);
      sendExport.current = null;
      editDrafts.delete(props.draftKey);
      if (!life.mounted || generation !== life.generation) {
        await native!.pause(props.draftKey);
        return;
      }
      if (life.background || !screenIsActive()) {
        const paused = await native!.pause(props.draftKey);
        applySnapshot(paused);
        changePhase(paused.hasDraft ? 'paused' : 'idle');
        return;
      }
      setRange([0, value.durationMs]);
      state.current.duration = value.durationMs;
      setDuration(value.durationMs);
      changePhase(life.locked ? 'locked' : 'holding');
    } catch (error) {
      if (life.mounted) {
        const value = await native!.snapshot(props.draftKey);
        applySnapshot(value);
        changePhase(value.hasDraft ? 'paused' : 'idle');
        latest.current.error(error instanceof Error ? error.message : 'Не удалось начать запись.');
      }
    } finally {
      life.starting = false;
      if (life.release && life.mounted) {
        const action = life.release;
        life.release = null;
        if(action === 'stage') void pause(); else void finish(action);
      }
    }
  }
  async function finish(action: 'send' | 'cancel') {
    const life = state.current;
    if (life.starting) {
      life.release = action;
      return;
    }
    if (life.working) return;
    statusRevision.current++;
    life.working = true;
    setWorking(true);
    stopPlayer();
    try {
      if (action === 'cancel') {
        // discard pauses natively. Publishing a paused snapshot here flashes the
        // trim controls before returning to the text field.
        await native!.discard(props.draftKey);
        waveDrafts.delete(props.draftKey);
        editDrafts.delete(props.draftKey);
        sendExport.current = null;
        waveSamples.current = [];
        changePhase('idle');
        return;
      }
      const wasPaused = life.phase === 'paused';
      const value = await native!.pause(props.draftKey);
      if (life.mounted) applySnapshot(value);
      const bounds = wasPaused && life.range[1] > life.range[0] ? life.range : [0, value.durationMs];
      if (bounds[1] - bounds[0] < MIN_RANGE) {
        setRange([0, value.durationMs]);
        changePhase(value.hasDraft ? 'paused' : 'idle');
        return;
      }
      const exportKey = bounds.join(':');
      if (sendExport.current?.range !== exportKey) {
        const file = await native!.exportAudio(props.draftKey, bounds[0], bounds[1]);
        sendExport.current = {
          range: exportKey,
          file: {
            uri: file.uri,
            name: `voice-${Date.now()}.m4a`,
            mimeType: 'audio/mp4',
            size: file.size
          }
        };
      }
      const sent = await latest.current.onSend(sendExport.current.file);
      if (sent !== false) {
        await native!.discard(props.draftKey);
        waveDrafts.delete(props.draftKey);
        editDrafts.delete(props.draftKey);
        sendExport.current = null;
        waveSamples.current = [];
        changePhase('idle');
      } else changePhase('paused');
    } catch {
      if (life.mounted) {
        changePhase('paused');
        latest.current.error('Не удалось подготовить или отправить запись. Запись сохранена.');
      }
    } finally {
      life.working = false;
      if (life.mounted) {
        setWorking(false);
        haloLevel.value = 0;
      }
      await clearPreview();
    }
  }
  function beginDrag() { void start(); }
  function releaseDrag(intent: number) {
    if (state.current.locked || !['preparing','holding'].includes(state.current.phase)) return;
    if (intent === 2) {
      state.current.locked = true;
      if (state.current.phase === 'holding') changePhase('locked');
    } else void finish(intent === 1 ? 'cancel' : 'send');
  }
  function interruptDrag() {
    if (state.current.starting) {
      if (state.current.release !== 'cancel') state.current.release = 'stage';
    } else void pause();
  }
  const dragEnabled = !props.disabled && ['idle','preparing','holding'].includes(phase);
  // Position and intent stay on the UI thread. JS receives only begin/end,
  // so waveform rendering and recorder polling cannot stall finger tracking.
  const gesture = useMemo(() => Gesture.Pan().withTestId('help-voice-native-drag')
    .enabled(dragEnabled).maxPointers(1).manualActivation(true).shouldCancelWhenOutside(false)
    .onTouchesDown((event, manager) => {
      const touch = event.allTouches[0];
      if (!touch) { manager.fail(); return; }
      dragOriginX.value = touch.absoluteX; dragOriginY.value = touch.absoluteY;
      manager.activate();
    })
    .onStart(() => {
      cancelAnimation(dragX); cancelAnimation(dragY);
      dragX.value = 0; dragY.value = 0; lastDragFrame.value = -1000;
      runOnJS(beginDrag)();
    })
    .onUpdate(event => {
      const left = Math.max(0, dragOriginX.value - event.absoluteX), up = Math.max(0, dragOriginY.value - event.absoluteY);
      const horizontal = left >= up, moving = Math.max(left, up) >= 6;

      // Input can arrive faster than the display refreshes (especially through
      // Android input injection). Do not commit multiple view updates per frame.
      const now = performance.now();
      if (now - lastDragFrame.value < 16) return;
      lastDragFrame.value = now;
      dragX.value = moving && horizontal ? -Math.min(75, left) : 0;
      dragY.value = moving && !horizontal ? -Math.min(65, up) : 0;
    })
    .onEnd((event, success) => {
      if (!success) return;
      const left = Math.max(0, dragOriginX.value - event.absoluteX), up = Math.max(0, dragOriginY.value - event.absoluteY);
      const intent = left >= up && left > 75 ? 1 : up > left && up > 65 ? 2 : 0;
      runOnJS(releaseDrag)(intent);
    })
    .onFinalize((_event, success) => { if (!success) runOnJS(interruptDrag)(); }),
  [props.draftKey, dragEnabled]);
  const trimOrigins = useRef<[number, number]>([0, 0]);
  const handles = useMemo(() => ([0, 1] as const).map(index => PanResponder.create({
    onStartShouldSetPanResponder: () => !state.current.working,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      stopPlayer();
      trimOrigins.current = [...state.current.range];
    },
    onPanResponderMove: (_, g) => {
      const life = state.current,
        delta = g.dx / life.waveWidth * life.duration;
      const next: [number, number] = [...trimOrigins.current];
      next[index] = index === 0 ? Math.max(0, Math.min(next[1] - MIN_RANGE, next[0] + delta)) : Math.min(life.duration, Math.max(next[0] + MIN_RANGE, next[1] + delta));
      life.range = next;
      setRange(next);
    },
    onPanResponderRelease: () => {
      void clearPreview();
    }
  })), [props.draftKey]);
  async function play() {
    if (state.current.working) return;
    if (playback.playing) {
      player.pause();
      return;
    }
    state.current.working = true;
    setWorking(true);
    try {
      commands?.stop();
      const key = range.join(':');
      if (preparedRange.current !== key) {
        await clearPreview();
        const file = await native!.exportAudio(props.draftKey, range[0], range[1]);
        preview.current = file.uri;
        player.replace({
          uri: file.uri
        });
        preparedRange.current = key;
      } else if (playback.didJustFinish) await player.seekTo(0);
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true
      });
      player.play();
    } catch {
      latest.current.error('Не удалось прослушать запись.');
    } finally {
      state.current.working = false;
      setWorking(false);
    }
  }
  const active = phase !== 'idle',
    paused = phase === 'paused',
    locked = phase === 'locked',
    progress = duration ? Math.min(1, range[0] / duration + playback.currentTime * 1000 / duration) : 0;
  const actionStyle = {
    position: 'absolute' as const,
    right: active ? -3 : 4,
    bottom: active ? -3 : 4,
    width: active ? 64 : 38,
    height: active ? 64 : 38,
    borderRadius: 32,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: phase === 'holding' ? '#DB5059' : c.accent
  };
  if (!active && !props.visible) return null;
  return <>
    {active ? <View testID={`help-voice-${phase}`} style={{
      // Keep the floating pause/resume control inside its parent's hit area.
      marginTop: 48,
      height: 64,
      borderRadius: 32,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.surface,
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 12,
      paddingRight: 74,
      gap: 7
    }}>
      {paused ? <Pressable accessibilityRole="button" accessibilityLabel="Удалить запись" disabled={working} onPress={() => void finish('cancel')} style={{
        width: 28,
        height: 44,
        justifyContent: 'center'
      }}><Ionicons name="trash-outline" size={27} color={c.danger} /></Pressable> : <View accessibilityLabel="Идёт запись" style={{
        width: 13,
        height: 13,
        borderRadius: 7,
        backgroundColor: '#E64C59'
      }} />}
      <Text style={{
        fontSize: 14,
        color: c.text,
        fontVariant: ['tabular-nums'],
        minWidth: 35
      }}>{helpDuration((paused ? range[1] - range[0] : duration) / 1000)}</Text>
      <View testID="help-voice-wave" onLayout={e => setWaveWidth(e.nativeEvent.layout.width)} style={{
        flex: 1,
        minWidth: 25,
        height: 44,
        justifyContent: 'center'
      }}>
        <VoiceWaveBars samples={waveSamples} width={waveWidth} paused={paused} duration={duration} range={range} accent={c.accent} line={c.line}/>
        {paused ? <>
          {playback.playing ? <View pointerEvents="none" style={{
            position: 'absolute',
            left: `${progress * 100}%`,
            top: 0,
            bottom: 0,
            width: 1,
            backgroundColor: c.text
          }} /> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={playback.playing ? 'Пауза прослушивания' : 'Прослушать выбранный фрагмент'} disabled={working} onPress={() => void play()} style={{
            position: 'absolute',
            alignSelf: 'center',
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: c.surface,
            alignItems: 'center',
            justifyContent: 'center'
          }}><Ionicons name={playback.playing ? 'pause' : 'play'} size={19} color={c.accent} /></Pressable>
          {([0, 1] as const).map(index => <View key={index} {...handles[index].panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel={index === 0 ? 'Начало обрезки' : 'Конец обрезки'} accessibilityValue={{
            min: 0,
            max: duration,
            now: Math.round(range[index]),
            text: `${(range[index] / 1000).toFixed(1)} с`
          }} accessibilityActions={[{
            name: 'increment'
          }, {
            name: 'decrement'
          }]} onAccessibilityAction={e => {
            stopPlayer();
            const delta = e.nativeEvent.actionName === 'increment' ? 250 : -250;
            setRange(old => index === 0 ? [Math.max(0, Math.min(old[1] - MIN_RANGE, old[0] + delta)), old[1]] : [old[0], Math.min(duration, Math.max(old[0] + MIN_RANGE, old[1] + delta))]);
          }} style={{
            position: 'absolute',
            left: range[index] / Math.max(1, duration) * waveWidth - 12,
            top: 0,
            width: 24,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center'
          }}><View style={{
              width: 5,
              height: 44,
              borderRadius: 3,
              backgroundColor: c.accent
            }} /></View>)}
        </> : null}
      </View>
      {!paused ? <Pressable accessibilityRole="button" accessibilityLabel="Отменить запись" disabled={working} onPress={() => void finish('cancel')} style={{
        height: 44,
        justifyContent: 'center'
      }}><View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 2
        }}>{!locked ? <Animated.View style={{
            transform: [{
              translateX: hint
            }]
          }}><Ionicons name="chevron-back" size={13} color={c.muted} /></Animated.View> : null}<Text style={{
            fontSize: 12,
            fontWeight: '400',
            color: c.muted
          }}>{locked ? 'ОТМЕНА' : 'Отмена'}</Text></View></Pressable> : null}
    </View> : null}
    {active ? <Reanimated.View pointerEvents="none" style={[{
      ...actionStyle,
      backgroundColor: c.accent,
      opacity: phase === 'holding' || locked ? .16 : 0,
    }, haloStyle]}/> : null}
    {active && (locked || paused) ? <Pressable accessibilityRole="button" accessibilityLabel={paused ? 'Продолжить запись' : 'Приостановить запись'} disabled={working || props.disabled || paused && duration >= 60000} onPress={() => void (paused ? start(true) : pause())} style={{
      position: 'absolute',
      right: 13,
      bottom: 78,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.panel,
      alignItems: 'center',
      justifyContent: 'center',
      opacity: paused && duration >= 60000 ? .4 : 1
    }}><Ionicons name={paused ? 'mic' : 'pause'} size={18} color={c.accentText} /></Pressable> : null}
    {phase === 'holding' ? <View pointerEvents="none" style={{
      position: 'absolute',
      right: 13,
      bottom: 78,
      width: 32,
      alignItems: 'center',
      gap: 6
    }}><Ionicons name="lock-closed-outline" size={18} color={c.muted} /><Ionicons name="chevron-up" size={14} color={c.muted} /></View> : null}
    {/* Keep the responder mounted while an upward gesture changes mic into send. */}
    <GestureDetector gesture={gesture}><Reanimated.View collapsable={false} testID="help-voice-drag-button" accessible={!locked && !paused} accessibilityRole="button" accessibilityLabel={locked || paused ? undefined : 'Удерживайте для записи голосового сообщения. Проведите вверх, чтобы закрепить запись'} onAccessibilityTap={() => void start(false, true)} style={[{
      ...actionStyle,
      opacity: props.disabled ? .4 : 1
    },dragStyle]}>{locked || paused ? <Pressable testID="help-voice-send" accessibilityRole="button" accessibilityLabel="Отправить запись" disabled={working || props.disabled} onPress={() => void finish('send')} style={{width:'100%',height:'100%',alignItems:'center',justifyContent:'center'}}>{working ? <ActivityIndicator color="#FFF" /> : <Ionicons name="arrow-up" size={32} color="#FFF" />}</Pressable> : phase === 'preparing' ? <ActivityIndicator color="#FFF" /> : <Ionicons name="mic" size={active ? 32 : 22} color="#FFF" />}</Reanimated.View></GestureDetector>
  </>;
}
