import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ActionSheetProps } from './types';

const isWeb = Platform.OS === 'web';

const SPRING = { mass: 0.5, damping: 18, stiffness: 220 };
const BACKDROP_IN = 220;
const BACKDROP_OUT = 160;

const ActionSheet: React.FC<ActionSheetProps> = ({ visible, buttons, onClose }) => {
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);
  const translateY = useSharedValue(0);
  const sheetHeight = useSharedValue(420);

  useEffect(() => {
    if (visible) {
      translateY.value = sheetHeight.value;
      progress.value = withTiming(1, { duration: BACKDROP_IN });
      translateY.value = withSpring(0, SPRING);
    } else {
      progress.value = withTiming(0, { duration: BACKDROP_OUT });
      translateY.value = withTiming(sheetHeight.value, { duration: 220 });
    }
  }, [visible, progress, sheetHeight, translateY]);

  const closeSheet = useCallback(() => onClose?.(), [onClose]);

  // Пан-жест только на native
  const pan = !isWeb
    ? Gesture.Pan()
        .onUpdate((e: any) => {
          'worklet';
          translateY.value = Math.max(0, e.translationY);
        })
        .onEnd((e: any) => {
          'worklet';
          const shouldClose =
            e.velocityY > 900 || translateY.value > sheetHeight.value * 0.25;
          if (shouldClose) {
            translateY.value = withTiming(
              sheetHeight.value,
              { duration: 200 },
              (finished) => {
                if (finished) {
                  runOnJS(closeSheet)();
                }
              }
            );
            progress.value = withTiming(0, { duration: BACKDROP_OUT });
          } else {
            translateY.value = withSpring(0, SPRING);
          }
        })
    : undefined;

  useEffect(() => {
    if (!visible || isWeb) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeSheet();
      return true;
    });
    return () => sub.remove();
  }, [visible, closeSheet]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: withTiming(progress.value, { duration: visible ? BACKDROP_IN : BACKDROP_OUT }),
  }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  const ButtonItem = ({
    title, icon, destructive, cancel, onPress,
  }: { title: string; icon?: string; destructive?: boolean; cancel?: boolean; onPress?: () => void }) => {
    const s = useSharedValue(1);
    const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
    const onIn = () => { s.value = withTiming(0.97, { duration: 80 }); };
    const onOut = () => { s.value = withTiming(1, { duration: 120 }); };
    const press = () => { onPress?.(); closeSheet(); };

    return (
      <Animated.View style={[st, { marginTop: cancel ? 8 : 0 }]}>
        <Pressable
          onPressIn={onIn}
          onPressOut={onOut}
          onPress={press}
          android_ripple={{ color: '#e5e5e5' }}
          style={[
            styles.button,
            cancel && styles.cancelButton,
            destructive && styles.destructiveButton,
          ]}
        >
          {!!icon && !cancel && (
            <Ionicons name={icon as any} size={20} color={destructive ? '#FF3B30' : '#007AFF'} style={styles.icon} />
          )}
          <Text
            style={[
              styles.buttonText,
              cancel && styles.cancelText,
              destructive && styles.destructiveText,
            ]}
            ellipsizeMode="clip"
            allowFontScaling={false}
            {...(Platform.OS === 'android'
              ? { includeFontPadding: true as any, textBreakStrategy: 'simple' as any }
              : {})}
          >
            {title}<Text style={{ opacity: 0 }}> </Text>
          </Text>
        </Pressable>
      </Animated.View>
    );
  };

  if (!visible) return null;

  const SheetBody = ({ children }: any) =>
    isWeb ? <View>{children}</View> : <GestureDetector gesture={pan!}>{children}</GestureDetector>;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={styles.overlay} onPress={closeSheet}>
        <Animated.View style={[styles.backdrop, backdropStyle]} />
      </Pressable>

      <SheetBody>
        <Animated.View
          style={[
            styles.sheetWrap,
            { paddingBottom: Math.max(insets.bottom, 12) },
            sheetStyle,
          ]}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            sheetHeight.value = h + 24;
            if (progress.value === 0) {
              translateY.value = h + 24;
              progress.value = withTiming(1, { duration: BACKDROP_IN });
              translateY.value = withSpring(0, SPRING);
            }
          }}
        >
          <View style={styles.grabberWrap}><View style={styles.grabber} /></View>

          {buttons.map((b, i) => (
            <Animated.View key={`${b.title}-${i}`} entering={FadeInDown.delay(40 + i * 30)}>
              <ButtonItem title={b.title} icon={b.icon} destructive={b.destructive} onPress={b.onPress} />
            </Animated.View>
          ))}

          <Animated.View entering={FadeInDown.delay(40 + buttons.length * 30)}>
            <ButtonItem title="Отмена" cancel onPress={closeSheet} />
          </Animated.View>
        </Animated.View>
      </SheetBody>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },

  sheetWrap: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
  },
  grabberWrap: { alignItems: 'center', marginBottom: 10 },
  grabber: { width: 40, height: 5, borderRadius: 999, backgroundColor: '#E5E7EB' },

  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#fff',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 3,
  },
  icon: { marginRight: 10 },
  cancelButton: { backgroundColor: '#F3F4F6' },
  destructiveButton: { backgroundColor: '#FFF5F5' },
  buttonText: { fontSize: 16, color: '#111827', fontWeight: '600', flex: 1 },
  cancelText: { color: '#007AFF' },
  destructiveText: { color: '#FF3B30' },
});

export default ActionSheet;
