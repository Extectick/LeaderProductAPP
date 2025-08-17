// components/FormInput.tsx
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { forwardRef, useMemo, useState } from 'react';
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
import { useTheme } from '../context/ThemeContext';

export type FormInputProps = TextInputProps & {
  label?: string;
  error?: string | null;
  rightIcon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  onIconPress?: () => void;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  /** Управляет высотой/отступами */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Убрать внешний нижний отступ контейнера */
  noMargin?: boolean;
};

const SIZES = {
  xs: { h: 40, fs: 14, px: 10, pv: 8, r: 10, mb: 8, lf: 13 },
  sm: { h: 44, fs: 15, px: 12, pv: 10, r: 12, mb: 10, lf: 14 },
  md: { h: 50, fs: 16, px: 14, pv: 12, r: 12, mb: 14, lf: 16 },
  lg: { h: 56, fs: 17, px: 16, pv: 14, r: 14, mb: 16, lf: 16 },
} as const;

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
    ...inputProps
  } = props;

  const { theme, themes } = useTheme();
  const colors = themes[theme];

  const [focused, setFocused] = useState(false);
  const cfg = SIZES[size];

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          width: '100%',
          alignSelf: 'stretch',
          marginBottom: noMargin ? 0 : cfg.mb,
        },
        label: {
          fontSize: cfg.lf,
          marginBottom: 6,
          fontWeight: '600',
          color: colors.text,
        },
        inputWrapper: {
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          borderRadius: cfg.r,
          backgroundColor: colors.inputBackground,
          paddingHorizontal: cfg.px,
          height: cfg.h,
        },
        input: {
          flex: 1,
          width: '100%',
          fontSize: cfg.fs,
          color: colors.text,
          textAlign,
          paddingVertical: cfg.pv,
          ...Platform.select({
            web: { outlineWidth: 0, outlineColor: 'transparent' },
          }),
        },
        iconButton: { marginLeft: 8, padding: 6 },
        errorText: { marginTop: 6, color: colors.error, fontSize: 13 },
      }),
    [colors, cfg, noMargin, textAlign]
  );

  const borderColor = error
    ? colors.error
    : focused
    ? colors.border || colors.tint
    : colors.inputBorder;

  const handleFocus = (e: NativeSyntheticEvent<TextInputFocusEventData>) => {
    setFocused(true);
    onFocus?.(e);
  };
  const handleBlur = (e: NativeSyntheticEvent<TextInputFocusEventData>) => {
    setFocused(false);
    onBlur?.(e);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={[styles.inputWrapper, { borderColor, opacity: editable ? 1 : 0.6 }]}>
        <TextInput
          ref={ref}
          style={[styles.input, inputStyle as any, style as any]}
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.tint}
          editable={editable}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...inputProps}
        />

        {rightIcon && onIconPress && (
          <TouchableOpacity onPress={onIconPress} style={styles.iconButton} activeOpacity={0.7} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <MaterialCommunityIcons name={rightIcon} size={20} color={colors.text} />
          </TouchableOpacity>
        )}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
});

export default FormInput;
