import { useAppSurfaceTheme } from '@/components/ui/appSurfaceTokens';
import {appWebControlProps,appWebControlContentProps} from '@/components/ui/appWebInteraction';
import {serviceAccent} from '../lib/serviceAccent';
import { servicesTokens, withOpacity } from '@/src/features/services/ui/servicesTokens';
import type { ServiceKind } from '@/utils/servicesService';
import { Ionicons } from '@expo/vector-icons';
import { HelpAiIcon } from '@/src/features/help/components/HelpAiIcon';
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

export default function ServiceRow({ icon, name, size, onPress, description, gradient, backgroundColor, textColor, iconSize = 36, containerStyle, textStyle, disabled = false }: Props) {
  const [hovered, setHovered] = useState(false);
  const {text:themeText,muted:secondary,dark} = useAppSurfaceTheme();
  const accent=useMemo(()=>serviceAccent(gradient,dark),[gradient,dark]);
  return <Pressable
    {...appWebControlProps('row')}
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
      {icon === 'help-ai' ? <HelpAiIcon size={iconSize} color={disabled ? secondary : accent}/> : <Ionicons name={icon as any} size={iconSize} color={disabled ? secondary : accent}/>}
    </View>
    <View style={styles.copy}>
      <Text {...appWebControlContentProps()} numberOfLines={2} style={[styles.title, { color: textColor ?? themeText }, textStyle]}>{name}</Text>
      {description ? <Text numberOfLines={2} style={[styles.description, { color: secondary }]}>{description}</Text> : null}
    </View>
    <View pointerEvents="none" style={styles.trailing}>
      <Ionicons {...appWebControlContentProps()} name={disabled ? 'lock-closed-outline' : 'chevron-forward'} size={disabled ? 17 : 20} color={secondary}/>
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
