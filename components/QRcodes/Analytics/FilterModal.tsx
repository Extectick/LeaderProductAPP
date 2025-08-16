import { useTheme } from '@/context/ThemeContext';
import type { QRCodeItemType } from '@/types/qrTypes';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet, Text,
    TextInput,
    View,
} from 'react-native';

type Props = {
  visible: boolean;
  onClose: () => void;
  qrCodes: QRCodeItemType[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
  onApply: () => void;
};

export default function FilterModal({
  visible, onClose, qrCodes, selectedIds, onToggle, onClear, onApply,
}: Props) {
  const { theme, themes } = useTheme();
  const colors = themes[theme];
  const styles = getStyles(colors);

  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return qrCodes;
    return qrCodes.filter((it) =>
      (it.description || it.qrData || '').toLowerCase().includes(needle) ||
      it.id.toLowerCase().includes(needle)
    );
  }, [q, qrCodes]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Фильтр по QR</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Pressable style={styles.ghostBtn} onPress={onClear}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>Сбросить</Text>
              </Pressable>
              <Pressable style={[styles.ghostIcon, { marginLeft: 8 }]} onPress={onClose}>
                <Ionicons name="close" size={18} color={colors.text} />
              </Pressable>
            </View>
          </View>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={colors.secondaryText} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Поиск по описанию / данным / ID"
              placeholderTextColor={colors.secondaryText}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {list.length === 0 ? (
            <View style={{ padding: 16 }}>
              <Text style={{ color: colors.secondaryText }}>Ничего не найдено…</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
              {list.map((item) => {
                const selected = selectedIds.includes(item.id);
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => onToggle(item.id)}
                    style={styles.itemRow}
                  >
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text style={[styles.itemTitle, selected && { color: '#1D4ED8' }]} numberOfLines={1}>
                        {item.description || item.qrData || item.id}
                      </Text>
                      <Text style={styles.itemMeta} numberOfLines={1}>ID: {item.id}</Text>
                    </View>
                    <View style={[styles.checkbox, selected && { backgroundColor: '#3B82F6', borderColor: '#3B82F6' }]}>
                      {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.footer}>
            <Text style={{ color: colors.secondaryText }}>
              Выбрано: <Text style={{ color: colors.text, fontWeight: '800' }}>{selectedIds.length}</Text>
            </Text>
            <Pressable style={styles.primaryBtn} onPress={onApply}>
              <Ionicons name="checkmark" size={16} color="#0B1220" />
              <Text style={styles.primaryBtnText}>Применить</Text>
            </Pressable>
          </View>
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
      maxWidth: 840,
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
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: '#EFF2F6',
      marginBottom: 10,
    },
    title: { color: colors.text, fontSize: 16, fontWeight: '800' },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#E5E7EB',
      borderRadius: 12,
      paddingHorizontal: 10,
      height: 38,
      backgroundColor: colors.background,
      marginBottom: 10,
    },
    searchInput: { flex: 1, marginLeft: 8, color: colors.text, paddingVertical: 0 },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: '#F3F4F6',
      paddingHorizontal: 4,
      paddingVertical: 10,
    },
    itemTitle: { color: colors.text, fontWeight: '700' },
    itemMeta: { color: colors.secondaryText, fontSize: 12 },
    checkbox: {
      width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: '#E5E7EB',
      alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardBackground,
    },
    footer: {
      marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#EFF2F6',
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    primaryBtn: {
      height: 40, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#fff', flexDirection: 'row', borderWidth: 1, borderColor: '#D1D5DB',
    },
    primaryBtnText: { color: '#0B1220', fontWeight: '800', marginLeft: 6 },
    ghostBtn: {
      height: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB',
      alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardBackground,
    },
    ghostIcon: {
      height: 36, width: 36, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB',
      alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardBackground,
    },
  });
