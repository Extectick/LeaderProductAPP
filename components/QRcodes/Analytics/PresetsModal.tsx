import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { PeriodKey } from './PeriodModal';

export type Preset = {
  name: string;
  period: PeriodKey;
  from?: string | null;
  to?: string | null;
  ids: string[];
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onApply: (preset: Preset) => void;
  onDeletePreset: (name: string) => void;
};

export default function PresetsModal({ visible, onClose, onApply, onDeletePreset }: Props) {
  const { theme, themes } = useTheme();
  const colors = themes[theme];
  const styles = getStyles(colors);

  // Для примера локальный список/создание
  const [items, setItems] = useState<Preset[]>([]);
  const [newName, setNewName] = useState('');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Пресеты</Text>
            <Pressable style={styles.ghostIcon} onPress={onClose}>
              <Ionicons name="close" size={18} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.createRow}>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="Название пресета"
              placeholderTextColor={colors.secondaryText}
              style={styles.input}
            />
            <Pressable
              style={styles.primaryBtn}
              onPress={() => {
                if (!newName.trim()) return;
                const preset: Preset = { name: newName.trim(), period: '30d', ids: [] };
                setItems((prev) => [preset, ...prev]);
                setNewName('');
              }}
            >
              <Ionicons name="add" size={16} color="#0B1220" />
              <Text style={styles.primaryBtnText}>Сохранить</Text>
            </Pressable>
          </View>

          {items.length === 0 ? (
            <View style={{ padding: 16 }}>
              <Text style={{ color: colors.secondaryText }}>Пока нет сохранённых пресетов</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
              {items.map((p) => (
                <View
                  key={p.name}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6',
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>{p.name}</Text>
                    <Text style={{ color: colors.secondaryText, fontSize: 12 }} numberOfLines={1}>
                      {p.period === 'custom'
                        ? `${p.from || ''} — ${p.to || ''}`
                        : p.period.toUpperCase()}{' '}
                      • QR: {p.ids.length}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row' }}>
                    <Pressable
                      style={styles.iconBtn}
                      onPress={() => onApply(p)}
                    >
                      <Ionicons name="play" size={16} color="#111827" />
                    </Pressable>
                    <Pressable
                      style={[styles.iconBtn, { marginLeft: 8 }]}
                      onPress={() => onDeletePreset(p.name)}
                    >
                      <Ionicons name="trash" size={16} color="#EF4444" />
                    </Pressable>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.35)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    },
    card: {
      width: '96%',
      maxWidth: 720,
      maxHeight: '82%',
      backgroundColor: colors.cardBackground,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      padding: 14,
      ...Platform.select({
        web: { boxShadow: '0px 10px 24px rgba(0,0,0,0.18)' },
        ios: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
        android: { elevation: 10 },
      }),
    },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#EFF2F6', marginBottom: 10,
    },
    title: { color: colors.text, fontSize: 16, fontWeight: '800' },
    createRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    input: {
      flex: 1,
      height: 38,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      borderRadius: 10,
      paddingHorizontal: 10,
      color: colors.text,
      backgroundColor: colors.background,
      marginRight: 8,
    },
    primaryBtn: {
      height: 38, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#fff', flexDirection: 'row', borderWidth: 1, borderColor: '#D1D5DB',
    },
    primaryBtnText: { color: '#0B1220', fontWeight: '800', marginLeft: 6 },
    ghostIcon: {
      height: 36, width: 36, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB',
      alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardBackground,
    },
    iconBtn: {
      height: 36, width: 36, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB',
      alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardBackground,
    },
  });
