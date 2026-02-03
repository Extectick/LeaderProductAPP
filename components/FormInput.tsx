// components/FormInput.tsx
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { forwardRef, useEffect, useMemo, useState } from 'react';
import {
  NativeSyntheticEvent,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputFocusEventData,
  TextInputProps,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';

export type FormInputProps = TextInputProps & {
  label?: string; // оставляем в API
  error?: string | null;
  rightIcon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  onIconPress?: () => void;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  noMargin?: boolean;
};

const SIZES = {
  xs: { h: 40, fs: 14, px: 10, pv: 8, r: 10, mb: 8, lf: 13 },
  sm: { h: 44, fs: 15, px: 12, pv: 10, r: 12, mb: 10, lf: 14 },
  md: { h: 50, fs: 16, px: 14, pv: 12, r: 12, mb: 14, lf: 16 },
  lg: { h: 56, fs: 17, px: 16, pv: 14, r: 14, mb: 16, lf: 16 },
} as const;

// насколько СИЛЬНО поднимать лейбл при активном поле (в пикселях)
const FLOAT_RAISE = { xs: 14, sm: 16, md: 18, lg: 20 } as const;
// целевой масштаб лейбла при активном состоянии
const FLOAT_SCALE = 0.82;

const FormInput = forwardRef<TextInput, FormInputProps>((props, ref) => {
  const {
    label,
    error,
    rightIcon,
    onIconPress,
    containerStyle,
    inputStyle,
    style,
    size = 'sm',
    noMargin,
    onFocus,
    onBlur,
    textAlign = 'left',
    editable = true,
    placeholder,
    value,
    ...inputProps
  } = props;

  const { theme, themes } = useTheme();
  const colors = themes[theme];

  const [focused, setFocused] = useState(false);
  const cfg = SIZES[size];

  const focusSV = useSharedValue(0);

  const textStr = value == null ? '' : String(value);
  const hasText = textStr.length > 0;
  const showError = !!error && hasText; // ошибка только когда есть текст

  const textSV = useSharedValue(hasText ? 1 : 0);
  useEffect(() => {
    textSV.value = hasText ? 1 : 0;
  }, [hasText, textSV]);

  const activeDV = useDerivedValue(() =>
    withTiming(focusSV.value || textSV.value ? 1 : 0, { duration: 180, easing: Easing.out(Easing.cubic) })
  );

  // слот ошибки управляем высотой анимацией
  const errShown = useSharedValue(0);
  const errHeight = useSharedValue(0);
  useEffect(() => {
    errShown.value = withTiming(showError ? 1 : 0, { duration: 180, easing: Easing.out(Easing.cubic) });
  }, [showError, errShown]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          width: '100%',
          alignSelf: 'stretch',
          marginBottom: noMargin ? 0 : cfg.mb,
        },
        // Оставляем «старый» лейбл — по требованию не удаляем
        label: {
          fontSize: cfg.lf,
          marginBottom: 6,
          fontWeight: '600',
          color: colors.text,
        },
        inputWrapper: {
          position: 'relative',
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: cfg.r,
          backgroundColor: 'transparent',
          paddingHorizontal: cfg.px,
          height: cfg.h,
          // важно: позволяем лейблу выходить выше, иначе он обрежется
          overflow: 'visible',
        },
        inputBg: {
          ...StyleSheet.absoluteFillObject,
          borderRadius: cfg.r,
          backgroundColor: colors.inputBackground,
          zIndex: 0,
        },
        borderOverlay: {
          ...StyleSheet.absoluteFillObject,
          borderRadius: cfg.r,
          borderWidth: 1,
          borderStyle: 'solid',
          pointerEvents: 'none',
          zIndex: 4,
        },
        input: {
          flex: 1,
          width: '100%',
          fontSize: cfg.fs,
          color: colors.text,
          textAlign,
          paddingVertical: cfg.pv,
          backgroundColor: 'transparent',
          borderWidth: 0,
          zIndex: 1,
          ...Platform.select({
            web: { outlineWidth: 0, outlineColor: 'transparent' },
          }),
        },
        iconButton: { marginLeft: 8, padding: 6, zIndex: 2 },
        floatingLabel: {
          position: 'absolute',
          left: cfg.px,
          fontWeight: '600',
          zIndex: 3,
        },
        errorUnderline: {
          position: 'absolute',
          left: 4,
          right: 4,
          bottom: 0,
          height: 2,
          borderRadius: 5,
          backgroundColor: colors.error,
          zIndex: 5,
        },
        errorPill: {
          marginTop: 6,
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderRadius: 10,
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: `${colors.error}22`,
          borderWidth: 1,
          borderColor: `${colors.error}55`,
        },
        errorText: { color: colors.error, fontSize: 13, marginLeft: 6, fontWeight: '700' },
      }),
    [colors, cfg, noMargin, textAlign]
  );

  // цвет рамки (обычный → фокус → ошибка)
  const borderAnimStyle = useAnimatedStyle(() => {
    // 0 — обычная, 1 — фокус, 2 — ошибка
    const errVal = errShown.value;
    const state = errVal > 0.5 ? 2 : focusSV.value > 0.5 ? 1 : 0;
    const c = interpolateColor(state, [0, 1, 2], [
      colors.inputBorder as any,
      (colors.border || colors.tint) as any,
      colors.error as any,
    ]);
    return { borderColor: c };
  });

  // вертикальное положение лейбла:
  // restTop — по центру как placeholder, activeTop — заметно выше.
  const restTop = Math.max(4, cfg.h / 2 - cfg.fs * 0.62);
  const activeTop = Math.max(
    -6, // можно чуточку выходить за рамку сверху
    restTop - FLOAT_RAISE[size]
  );

  const labelAnimStyle = useAnimatedStyle(() => {
    const top = interpolate(activeDV.value, [0, 1], [restTop, activeTop], 'clamp');
    const scale = interpolate(activeDV.value, [0, 1], [1, FLOAT_SCALE], 'clamp');
    const col = interpolateColor(
      activeDV.value,
      [0, 1],
      [colors.placeholder as any, (colors.border || colors.tint) as any]
    );
    return { top, transform: [{ scale }], color: col as any, opacity: 1 };
  });

  const underlineAnimStyle = useAnimatedStyle(() => ({
    opacity: errShown.value,
    transform: [{ scaleX: withTiming(showError ? 1 : 0.6, { duration: 200 }) }],
  }));

  const errorPillAnimStyle = useAnimatedStyle(() => ({
    opacity: errShown.value,
    transform: [{ translateY: interpolate(errShown.value, [0, 1], [-4, 0]) }],
  }));

  // высота контейнера ошибки: 0..errHeight
  const errorSlotStyle = useAnimatedStyle(() => ({
    height: interpolate(errShown.value, [0, 1], [0, errHeight.value]),
    opacity: errShown.value,
    overflow: 'hidden',
  }));

  const handleFocus = (e: NativeSyntheticEvent<TextInputFocusEventData>) => {
    setFocused(true);
    focusSV.value = withTiming(1, { duration: 120 });
    onFocus?.(e);
  };
  const handleBlur = (e: NativeSyntheticEvent<TextInputFocusEventData>) => {
    setFocused(false);
    focusSV.value = withTiming(0, { duration: 120 });
    onBlur?.(e);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {/* СТАРЫЙ label — по требованию не удаляем:
          {label ? <Text style={styles.label}>{label}</Text> : null}
      */}

      <Animated.View style={[styles.inputWrapper, { opacity: editable ? 1 : 0.6 }]}>
        <View pointerEvents="none" style={styles.inputBg} />
        {/* Плавающий placeholder/лейбл */}
        {(placeholder || label) ? (
          <Animated.Text
            importantForAccessibility="no"
            accessible={false}
            pointerEvents="none"
            style={[styles.floatingLabel, labelAnimStyle, { fontSize: cfg.fs }]}
            numberOfLines={1}
          >
            {placeholder ?? label}
          </Animated.Text>
        ) : null}

        <TextInput
          ref={ref}
          style={[styles.input, inputStyle as any, style as any]}
          placeholder={undefined} // реальный placeholder скрыт
          selectionColor={colors.tint}
          editable={editable}
          onFocus={handleFocus}
          onBlur={handleBlur}
          value={value}
          {...inputProps}
        />

        {rightIcon && onIconPress && (
          <TouchableOpacity
            onPress={onIconPress}
            style={styles.iconButton}
            activeOpacity={0.7}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <MaterialCommunityIcons name={rightIcon} size={20} color={colors.text} />
          </TouchableOpacity>
        )}

        <Animated.View style={[styles.borderOverlay, borderAnimStyle]} />

        {/* Нижняя линия ошибки */}
        <Animated.View style={[styles.errorUnderline, underlineAnimStyle]} />
      </Animated.View>

      {/* Плашка ошибки (в коллапсируемом слоте, чтобы не держала высоту) */}
      <Animated.View style={errorSlotStyle}>
        <View
          onLayout={(e) => {
            errHeight.value = Math.ceil(e.nativeEvent.layout.height);
          }}
        >
          {showError ? (
            <Animated.View style={[styles.errorPill, errorPillAnimStyle]}>
              <MaterialCommunityIcons name="alert-circle" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error || ''}</Text>
            </Animated.View>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
});

export default FormInput;
