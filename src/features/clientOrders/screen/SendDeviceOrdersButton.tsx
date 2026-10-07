import React from 'react';
import { AccessibilityInfo, Animated, AppState, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Badge, Icon, Text, TouchableRipple } from 'react-native-paper';

type Props = {
  count: number;
  online: boolean;
  sending: boolean;
  disabled?: boolean;
  compact?: boolean;
  remind?: boolean;
  onPress: () => void;
};

/** One shared presentation for the mobile list and the web orders pane. */
export function SendDeviceOrdersButton({ count, online, sending, disabled = false, compact = false, remind = true, onPress }: Props) {
  const bounce = React.useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = React.useState(true);
  React.useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduceMotion(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  const shouldRemind = compact && remind && count > 0 && online && !sending && !disabled && !reduceMotion;
  React.useEffect(() => {
    if (!shouldRemind) return;
    let animation: Animated.CompositeAnimation | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const stop = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      animation?.stop();
      bounce.setValue(0);
    };
    const play = () => {
      if (stopped || (AppState.currentState && AppState.currentState !== 'active')) return;
      animation = Animated.sequence([
        Animated.timing(bounce, { toValue: -3, duration: 160, useNativeDriver: true, isInteraction: false }),
        Animated.timing(bounce, { toValue: 0, duration: 220, useNativeDriver: true, isInteraction: false }),
      ]);
      animation.start();
      timer = setTimeout(play, 12_000);
    };
    if (!AppState.currentState || AppState.currentState === 'active') timer = setTimeout(play, 1_800);
    const subscription = AppState.addEventListener('change', state => {
      stop();
      if (state === 'active') timer = setTimeout(play, 1_800);
    });
    return () => { stopped = true; stop(); subscription.remove(); };
  }, [bounce, shouldRemind]);
  if (count <= 0) return null;

  const unavailable = disabled || sending || !online;
  const muted = unavailable && !sending;
  const color = muted ? '#64748B' : '#166534';
  const label = sending ? 'Отправка документов…' : 'Отправить документы';
  const hint = !online
    ? 'Подключитесь к интернету, чтобы отправить документы'
    : 'Отправятся только документы из очереди. Черновики останутся на устройстве';

  return (
    <TouchableRipple
      testID="send-device-orders"
      accessibilityRole="button"
      accessibilityLabel={`${label}. В очереди: ${count}`}
      accessibilityHint={hint}
      accessibilityState={{ disabled: unavailable, busy: sending }}
      disabled={unavailable}
      onPress={onPress}
      rippleColor="#BBF7D0"
      style={[styles.button, muted && styles.mutedButton, compact && styles.compactButton]}
    >
      <View style={[styles.row, compact && styles.compactRow]}>
        <Animated.View style={[styles.icon, { transform: [{ translateY: bounce }] }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {sending
            ? <ActivityIndicator testID="send-device-orders-progress" size={22} color={color} />
            : <Icon source={compact || online ? 'cloud-upload-outline' : 'cloud-off-outline'} size={24} color={color} />}
        </Animated.View>
        {!compact ? <Text style={[styles.label, { color }]}>{label}</Text> : null}
        <Badge testID="send-device-orders-count" size={compact ? 20 : 26} style={[styles.count, muted && styles.mutedCount, compact && styles.compactCount]}>
          {count.toLocaleString('ru-RU')}
        </Badge>
      </View>
    </TouchableRipple>
  );
}

const styles = StyleSheet.create({
  button: { alignSelf: 'stretch', marginTop: 6, borderRadius: 10, backgroundColor: '#DCFCE7', overflow: 'hidden' },
  mutedButton: { backgroundColor: '#F1F5F9' },
  row: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  count: { alignSelf: 'center', flexShrink: 0, paddingHorizontal: 8, backgroundColor: '#FFFFFF', color: '#166534', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  mutedCount: { backgroundColor: '#E2E8F0', color: '#64748B' },
  compactButton: { marginTop: 0, borderRadius: 0, backgroundColor: 'transparent', flexShrink: 0 },
  compactRow: { minHeight: 40, paddingVertical: 0, paddingHorizontal: 10, gap: 5 },
  compactCount: { paddingHorizontal: 5, fontSize: 11, backgroundColor: 'transparent' },
});
