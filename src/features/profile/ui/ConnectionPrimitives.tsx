import React,{useRef} from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useAppSurfaceTheme } from '@/components/ui/appSurfaceTokens';
import {appWebControlProps} from '@/components/ui/appWebInteraction';
import {ConnectionSectionVisibilityContext} from './ConnectionSectionContext';

export function ConnectionSection({ title, subtitle, icon, expanded, disabled, keepMounted=false, onPress, children }: React.PropsWithChildren<{
  title: string; subtitle: string; icon: React.ComponentProps<typeof Ionicons>['name'];
  expanded: boolean; disabled?: boolean; keepMounted?:boolean; onPress: () => void;
}>) {
  const t = useAppSurfaceTheme();
  const visited=useRef(expanded);if(expanded)visited.current=true;
  return <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.line }}>
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      accessibilityLabel={title} accessibilityState={{ expanded, disabled: Boolean(disabled) }}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.panel : 'transparent' }]}>
      <View style={styles.icon}><Ionicons name={icon} size={25} color={t.muted} /></View>
      <View style={styles.identity}>
        <Text style={[styles.title, { color: t.text }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: t.muted }]}>{subtitle}</Text>
      </View>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={t.muted} />
    </Pressable>
    {(expanded||keepMounted&&visited.current) && <ConnectionSectionVisibilityContext.Provider value={expanded}><View style={[styles.body,!expanded&&{display:'none'}]} accessibilityElementsHidden={!expanded} importantForAccessibility={expanded?'auto':'no-hide-descendants'}>{children}</View></ConnectionSectionVisibilityContext.Provider>}
  </View>;
}

export function ConnectionField(props: React.ComponentProps<typeof TextInput>) {
  const t = useAppSurfaceTheme();
  return <TextInput {...props} mode="flat" textColor={t.text} underlineColor={t.line} activeUnderlineColor={t.accent}
    accessibilityLabel={props.accessibilityLabel || (typeof props.label === 'string' ? props.label : undefined)}
    theme={{ colors: { onSurfaceVariant: t.muted, onSurfaceDisabled: t.muted }, roundness: 0 }}
    contentStyle={[{ paddingHorizontal: 0 }, props.contentStyle]}
    style={[{ backgroundColor: 'transparent', paddingHorizontal: 0, fontSize: 15 }, props.style]} />;
}

export function ConnectionAction({ compact = false, ...props }: React.ComponentProps<typeof Button> & { compact?: boolean }) {
  const t = useAppSurfaceTheme();
  const filled = !props.mode || props.mode === 'contained' || props.mode === 'contained-tonal';
  // Paper forwards these props to its outer Surface, while the disabled
  // Pressable is inside it. The outer surface must not keep an active hover.
  return <Button {...(props.disabled?{}:appWebControlProps(filled?'filled':'subtle'))} {...props} aria-disabled={Boolean(props.disabled)} compact={compact} hitSlop={compact ? 6 : undefined} mode={props.mode || 'contained'}
    buttonColor={props.buttonColor ?? (filled ? t.accent : undefined)} textColor={props.textColor ?? (filled ? '#FFFFFF' : t.muted)}
    theme={{ colors: { surfaceDisabled: t.panel, onSurfaceDisabled: t.muted } }}
    style={[{ borderRadius: 8, alignSelf: 'flex-start', maxWidth: '100%' }, props.mode === 'outlined' && { borderColor: t.line },
      compact && { width: 104, height: 32, flexShrink: 0, alignSelf: 'center' }, props.style]}
    labelStyle={[{ fontSize: 14, fontWeight: '600' }, compact && { fontSize: 13, lineHeight: 18, marginVertical: 0, marginHorizontal: 10 }, props.labelStyle]}
    contentStyle={[{ minHeight: 44, paddingHorizontal: 8 }, compact && { minHeight: 32, height: 32, paddingHorizontal: 0 }, props.contentStyle]} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 76, paddingVertical: 14 },
  icon: { width: 32, alignItems: 'center', justifyContent: 'center' },
  identity: { flex: 1, minWidth: 0, gap: 4 }, title: { fontSize: 14, lineHeight: 21, fontWeight: '600' },
  subtitle: { fontSize: 12, lineHeight: 18 }, body: { paddingLeft: 46, paddingTop: 4, paddingBottom: 24, gap: 16 },
});
