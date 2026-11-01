import { useThemeColor } from '@/hooks/useThemeColor';
import { servicesTokens, withOpacity } from '@/src/features/services/ui/servicesTokens';
import type { ServiceKind } from '@/utils/servicesService';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, type TextStyle, View, type ViewStyle } from 'react-native';

interface Props {
  icon: string;
  name: string;
  size: number;
  onPress: () => void;
  description?: string;
  gradient?: [string, string];
  backgroundColor?: string;
  textColor?: string;
  iconSize?: number;
  disableShadow?: boolean;
  disableScaleOnPress?: boolean;
  containerStyle?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
  kind?: ServiceKind;
  enterIndex?: number;
}

function luminance(color: string) {
  if (!/^#[\da-f]{6}$/i.test(color)) return 1;
  const value = Number.parseInt(color.slice(1), 16);
  return (0.2126 * ((value >> 16) & 255) + 0.7152 * ((value >> 8) & 255) + 0.0722 * (value & 255)) / 255;
}

export default function ServiceRow({ icon, name, size, onPress, description, gradient, backgroundColor, textColor, iconSize = 36, containerStyle, textStyle, disabled = false }: Props) {
  const [hovered, setHovered] = useState(false);
  const themeText = useThemeColor({}, 'text');
  const secondary = useThemeColor({}, 'secondaryText');
  const dark = luminance(themeText) > 0.5;
  const accent = useMemo(() => {
    const colors = gradient?.length ? gradient : ['#2563EB'];
    const selected = colors.reduce((best, color) => (dark ? luminance(color) > luminance(best) : luminance(color) < luminance(best)) ? color : best);
    if (!dark || luminance(selected) >= 0.45 || !/^#[\da-f]{6}$/i.test(selected)) return selected;
    const value = Number.parseInt(selected.slice(1), 16);
    const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map(channel => Math.round(channel + (255 - channel) * 0.28));
    return `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
  }, [gradient, dark]);
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={name}
    accessibilityHint={description}
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    onHoverIn={() => setHovered(true)}
    onHoverOut={() => setHovered(false)}
    style={({ pressed }) => [styles.row, { width: '100%', paddingHorizontal: servicesTokens.row.paddingHorizontal + Math.max(0, (size - servicesTokens.row.maxContentWidth) / 2), backgroundColor: pressed || hovered ? withOpacity(accent, 0.07) : backgroundColor ?? 'transparent', opacity: disabled ? 0.55 : 1 }, containerStyle]}
  >
    <View style={[styles.icon, { backgroundColor: withOpacity(accent, 0.1) }]}>
      <Ionicons name={icon as any} size={iconSize} color={disabled ? secondary : accent}/>
    </View>
    <View style={styles.copy}>
      <Text numberOfLines={2} style={[styles.title, { color: textColor ?? themeText }, textStyle]}>{name}</Text>
      {description ? <Text numberOfLines={2} style={[styles.description, { color: secondary }]}>{description}</Text> : null}
    </View>
    <View pointerEvents="none" style={styles.trailing}>
      <Ionicons name={disabled ? 'lock-closed-outline' : 'chevron-forward'} size={disabled ? 17 : 20} color={secondary}/>
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  row: { minHeight: servicesTokens.row.minHeight, flexDirection: 'row', alignItems: 'center', gap: servicesTokens.row.gap, paddingVertical: servicesTokens.row.paddingVertical, borderRadius: 0 },
  icon: { width: servicesTokens.row.iconContainerSize, height: servicesTokens.row.iconContainerSize, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  trailing: {width: servicesTokens.row.iconContainerSize, height: servicesTokens.row.iconContainerSize, alignItems: 'center', justifyContent: 'center'},
  copy: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  description: { fontSize: 13, lineHeight: 19, fontWeight: '400' },
});
