import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MaskedTextInput } from 'react-native-mask-text';

import { AdminStyles } from './adminStyles';

export type Tone = 'green' | 'violet' | 'gray' | 'red' | 'blue';

export function SelectableChip({
  styles,
  label,
  icon,
  tone = 'gray',
  onPress,
}: {
  styles: AdminStyles;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone?: Tone;
  onPress?: () => void;
}) {
  const palette = {
    green: { bg: '#DCFCE7', bd: '#86EFAC', text: '#166534' },
    violet: { bg: '#EDE9FE', bd: '#C4B5FD', text: '#4C1D95' },
    gray: { bg: '#F3F4F6', bd: '#E5E7EB', text: '#374151' },
    red: { bg: '#FEE2E2', bd: '#FCA5A5', text: '#991B1B' },
    blue: { bg: '#DBEAFE', bd: '#93C5FD', text: '#1E3A8A' },
  }[tone];

  return (
    <Pressable onPress={onPress} style={[styles.chip, { backgroundColor: palette.bg, borderColor: palette.bd }]}> 
      <Ionicons name={icon} size={14} color={palette.text} />
      <Text style={[styles.chipText, { color: palette.text }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function EditableCard({
  styles,
  icon,
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  secureTextEntry,
  mask,
  onMaskedChange,
}: {
  styles: AdminStyles;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  secureTextEntry?: boolean;
  mask?: string;
  onMaskedChange?: (masked: string, raw: string) => void;
}) {
  return (
    <View style={styles.infoCard}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={18} color="#4F46E5" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        {mask ? (
          <MaskedTextInput
            mask={mask}
            value={value}
            onChangeText={(masked, raw) => {
              if (onMaskedChange) {
                onMaskedChange(masked, raw);
              } else {
                onChangeText(masked);
              }
            }}
            placeholder={placeholder}
            style={styles.infoInput}
            keyboardType={keyboardType}
          />
        ) : (
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            style={styles.infoInput}
            keyboardType={keyboardType}
            secureTextEntry={secureTextEntry}
          />
        )}
      </View>
    </View>
  );
}

export function StaticCard({
  styles,
  icon,
  label,
  value,
}: {
  styles: AdminStyles;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value?: string;
}) {
  return (
    <View style={styles.infoCard}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={18} color="#4F46E5" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value || '-'}</Text>
      </View>
    </View>
  );
}

export function SelectorCard({
  styles,
  icon,
  label,
  options,
  selected,
  onSelect,
}: {
  styles: AdminStyles;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  options: { value: any; label: string }[];
  selected: any;
  onSelect: (val: any) => void;
}) {
  return (
    <View style={styles.infoCard}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={18} color="#4F46E5" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
          {options.map((opt) => {
            const active = opt.value === selected;
            return (
              <Pressable
                key={`${label}-${opt.value}`}
                onPress={() => onSelect(opt.value)}
                style={[styles.optionChip, active && styles.optionChipActive]}
              >
                <Text style={[styles.optionText, active && styles.optionTextActive]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}
