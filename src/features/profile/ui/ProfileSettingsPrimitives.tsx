import React from 'react';
import { StyleSheet } from 'react-native';
import { Button, Divider, List, TextInput } from 'react-native-paper';

// The existing "Работа и отделы" row is the shared visual reference.
export function ProfileFact({ title, value, icon, onPress, right }: {
  title: string; value?: string | null; icon: string; onPress?: () => void;
  right?: React.ComponentProps<typeof List.Item>['right'];
}) {
  return <><List.Item title={title} description={value || 'Не указано'} descriptionNumberOfLines={5}
    accessibilityLabel={title} accessibilityRole={onPress ? 'button' : undefined} onPress={onPress}
    left={props => <List.Icon {...props} icon={icon} color="#566982" />}
    right={right || (onPress ? props => <List.Icon {...props} icon="chevron-right" color="#566982" /> : undefined)}
    titleStyle={profileSettingsStyles.label} descriptionStyle={profileSettingsStyles.value}
    style={profileSettingsStyles.row} /><Divider style={profileSettingsStyles.divider} /></>;
}

export function ProfileField(props: React.ComponentProps<typeof TextInput>) {
  return <TextInput {...props} mode="flat" accessibilityLabel={props.accessibilityLabel || (typeof props.label === 'string' ? props.label : undefined)}
    textColor="#0F172A" underlineColor="#DDE5EF" activeUnderlineColor="#2563EB"
    theme={{ colors: { onSurfaceVariant: '#64748B' } }}
    style={[profileSettingsStyles.field, props.style]} contentStyle={[!props.left && { paddingHorizontal: 0 }, props.contentStyle]} />;
}

export function ProfileAction(props: React.ComponentProps<typeof Button>) {
  return <Button {...props} mode={props.mode || 'contained-tonal'} buttonColor={props.mode === 'text' ? undefined : '#E8F1FF'}
    textColor="#2563EB" style={[{ borderRadius: 8, marginVertical: 8 }, props.style]}
    contentStyle={[{ minHeight: 44 }, props.contentStyle]} />;
}

export const profileSettingsStyles = StyleSheet.create({
  row: { paddingHorizontal: 0, paddingVertical: 10 },
  label: { color: '#64748B', fontSize: 13 }, value: { color: '#0F172A', fontSize: 16 },
  divider: { backgroundColor: '#DDE5EF' },
  field: { backgroundColor: 'transparent', paddingHorizontal: 0, fontSize: 16 },
  hint: { color: '#64748B', fontSize: 13, lineHeight: 19, marginVertical: 8 },
});
