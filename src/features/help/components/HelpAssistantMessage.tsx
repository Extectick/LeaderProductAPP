import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { cancelAnimation, Easing as ResizeEasing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { HelpMessage } from '../helpApi';
import { HELP_ASSISTANT_STEPS } from '../helpAssistant';
import type { HelpAssistantPreview, HelpAssistantScenario } from '../helpAssistant';
import { helpTime } from '../helpUiUtils';
import { useHelpReducedMotion, useHelpTheme } from '../helpTheme';
import { helpDevState } from '../helpDiagnostics';
import { HelpAssistantAvatar } from './HelpAssistantAvatar';

export function HelpAssistantPreviewMenu({ preview, ticketId, onClose }: { preview: HelpAssistantPreview; ticketId?: number; onClose: () => void }) {
  const c = useHelpTheme();
  const options: [HelpAssistantScenario, string][] = [['answer', 'Обычный ответ'], ['slow', 'Долгий анализ'], ['question', 'Уточняющий вопрос'], ['error', 'Ошибка обработки']];
  return <View style={{ gap: 3, marginBottom: 12 }}><Text style={{ color: c.muted, fontSize: 12, marginBottom: 6 }}>Режим ответа ИИ · для следующего сообщения</Text>{options.map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: preview.scenario === value }} onPress={() => { preview.setScenario(value); onClose(); }} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}><Ionicons name={preview.scenario === value ? 'radio-button-on' : 'radio-button-off'} size={20} color={preview.scenario === value ? c.accentText : c.muted}/><Text style={{ color: c.text, fontSize: 14 }}>{label}</Text></Pressable>)}{ticketId !== undefined && <Pressable accessibilityRole="button" onPress={() => { preview.replay(ticketId); onClose(); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.accentText, fontSize: 14 }}>Повторить последний сценарий ИИ</Text></Pressable>}</View>;
}

export function HelpAssistantMessage({ message, onRetry }: { message: HelpMessage; onRetry?: () => void }) {
  const c = useHelpTheme(), reduced = useHelpReducedMotion(), run = message.assistantRun!;
  const active = run.status === 'thinking' || run.status === 'streaming';
  const showRetry = Boolean(message.text) && run.status === 'stopped' && run.stopReason !== 'superseded';
  // Historical answers need only natural layout, without a second measure pass.
  // A live answer keeps its motion surface when its status becomes completed.
  const liveResize = useRef(active);
  if (active) liveResize.current = true;
  const height = useSharedValue(0), footerHeight = useSharedValue(showRetry ? 44 : 0);
  const measured = useRef(0), naturalHeight = useRef(0);
  const [targetHeight, setTargetHeight] = useState<number | null>(null);
  const [reservedHeight, setReservedHeight] = useState<number | null>(null);
  const [footerTarget, setFooterTarget] = useState(showRetry ? 44 : 0);
  const hasMeasured = targetHeight !== null;
  const resize = useCallback((natural: number) => {
    // First words replace the taller reasoning panel. Keep that space while
    // streaming instead of shrinking and growing again on the next line.
    const next = active ? Math.max(natural, measured.current) : natural;
    if (next <= 0 || next === measured.current) return;
    measured.current = next;
    // Reserve the destination before starting the presentation animation.
    // Otherwise FlashList's old content bounds crop the growing lower corners.
    setReservedHeight(previous => Math.max(previous ?? next, next));
    setTargetHeight(next);
  }, [active]);
  const measureBody = useCallback((event: LayoutChangeEvent) => {
    naturalHeight.current = Math.ceil(event.nativeEvent.layout.height);
    setFooterTarget(showRetry ? 44 : 0);
    resize(naturalHeight.current);
  }, [resize, showRetry]);
  useLayoutEffect(() => {
    // A retry footer changes the natural layout and will report its own size.
    if (!active && !showRetry && naturalHeight.current) resize(naturalHeight.current);
  }, [active, showRetry, resize]);
  const finishResize = useCallback((next: number) => {
    if (measured.current === next) setReservedHeight(next);
  }, []);
  useLayoutEffect(() => {
    if (targetHeight === null) return;
    const initial = height.value === 0;
    cancelAnimation(height);
    cancelAnimation(footerHeight);
    const config = { duration: 150, easing: ResizeEasing.out(ResizeEasing.quad) };
    footerHeight.value = initial || reduced ? footerTarget : withTiming(footerTarget, config);
    if (initial || reduced) { height.value = targetHeight; finishResize(targetHeight); }
    else height.value = withTiming(targetHeight, config, finished => {
      if (finished) runOnJS(finishResize)(targetHeight);
    });
  }, [targetHeight, footerTarget, height, footerHeight, reduced, finishResize]);
  useEffect(() => () => { cancelAnimation(height); cancelAnimation(footerHeight); }, [height, footerHeight]);
  // The first measured render must never expose the shared value's initial 0.
  const surfaceStyle = useAnimatedStyle(() => hasMeasured ? { height: height.value || targetHeight! } : {});
  const middleStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: Math.max(0, (height.value || targetHeight || 0) - 32) }] }));
  const bottomStyle = useAnimatedStyle(() => ({ transform: [{ translateY: Math.max(0, (height.value || targetHeight || 0) - 16) }] }));
  const stampStyle = useAnimatedStyle(() => hasMeasured ? { transform: [{ translateY: Math.max(12, (height.value || targetHeight || 0) - footerHeight.value - 24) }] } : {});
  useEffect(() => { helpDevState({ assistantStatus: run.status, assistantStep: run.step, assistantCompletedSteps: run.completedSteps, assistantEventId: run.eventId, assistantTicketId: run.ticketId, assistantAnswerLength: message.text.length }); }, [run, message.text.length]);
  return <View testID="help-assistant-message" style={{ height: reservedHeight ?? undefined, marginTop: 8, marginBottom: 10, marginHorizontal: 16, flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
    <View><HelpAssistantAvatar ticketId={message.ticketId}/></View>
    {/* Fixed corners and the middle follow one UI progress value. Resizing a
        rectangular clip around a rounded child would cut off its lower edge. */}
    <Reanimated.View testID="help-assistant-surface" style={[{ flex: 1, minWidth: 0 }, surfaceStyle]}>
      {hasMeasured ? <>
        <View pointerEvents="none" accessible={false} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 16, borderTopLeftRadius: 4, borderTopRightRadius: 16, backgroundColor: c.incoming }}/>
        <Reanimated.View pointerEvents="none" accessible={false} style={[{ position: 'absolute', top: 16, left: 0, right: 0, height: 1, transformOrigin: 'top', backgroundColor: c.incoming }, middleStyle]}/>
        <Reanimated.View testID="help-assistant-bottom-corners" pointerEvents="none" accessible={false} style={[{ position: 'absolute', top: 0, left: 0, right: 0, height: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, backgroundColor: c.incoming }, bottomStyle]}/>
      </> : <View pointerEvents="none" accessible={false} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, borderTopLeftRadius: 4, backgroundColor: c.incoming }}/>}
      <View testID="help-assistant-content-clip" style={hasMeasured ? { position: 'absolute', top: 0, left: 0, right: 0, bottom: message.text && !showRetry ? 28 : 0, overflow: 'hidden' } : undefined}>
      <View testID="help-assistant-body" onLayout={liveResize.current ? measureBody : undefined} style={hasMeasured ? { position: 'absolute', top: 0, left: 0, right: 0 } : undefined}>
      {!message.text && run.status !== 'completed' && <View>
        {active ? <View style={{ padding: 12, gap: 9 }}>{HELP_ASSISTANT_STEPS.map((label, index) => index <= run.step && <View key={label} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 20 }}><View style={{ width: 15, height: 18, alignItems: 'center', justifyContent: 'center' }}>{index < run.completedSteps ? <Ionicons name="checkmark" size={15} color={c.green}/> : reduced ? <Ionicons name="time-outline" size={15} color={c.accentText}/> : <ActivityIndicator testID="help-assistant-step-loader" size={14} color={c.accentText}/>}</View><Text style={{ color: index < run.completedSteps ? c.muted : c.text, fontSize: 13, lineHeight: 18, flex: 1 }}>{index === 0 && (run.contextMessageCount ?? 1) > 1 ? 'Учитываю уточнение к задаче' : label}</Text></View>)}</View> : <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 4, gap: 8 }}>
          <Text style={{ color: run.status === 'error' ? c.danger : c.muted, fontSize: 13, lineHeight: 18, flex: 1 }}>{run.status === 'error' ? 'Не удалось подготовить ответ' : 'Ответ остановлен'}</Text>
          {onRetry && <Pressable accessibilityRole="button" accessibilityLabel="Повторить ответ ИИ" onPress={onRetry} style={{ minHeight: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }}><Ionicons name="refresh-outline" size={17} color={c.accentText}/><Text style={{ color: c.accentText, fontSize: 13 }}>Повторить</Text></Pressable>}
        </View>}
      </View>}
      {Boolean(message.text) && <View style={{ padding: 12, paddingBottom: 28 }}><Text selectable style={{ color: c.text, fontSize: 15, lineHeight: 22 }}>{message.text}</Text></View>}
      {showRetry && <Pressable accessibilityRole="button" accessibilityLabel="Повторить обработку ИИ" onPress={onRetry} style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }}><Text style={{ color: c.accentText, fontSize: 12 }}>Ответ остановлен · Повторить</Text></Pressable>}
      </View>
      </View>
      {Boolean(message.text) && <Reanimated.View testID="help-assistant-time" pointerEvents="none" style={[{ position: 'absolute', right: 12, ...(hasMeasured ? { top: 0 } : { bottom: 12 + (showRetry ? 44 : 0) }) }, stampStyle]}><Text style={{ color: c.muted, fontSize: 10, lineHeight: 12, fontVariant: ['tabular-nums'] }}>{helpTime(message.createdAt)}</Text></Reanimated.View>}
    </Reanimated.View>
  </View>;
}
