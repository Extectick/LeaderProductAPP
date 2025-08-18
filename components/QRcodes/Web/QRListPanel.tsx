// components/qrcodes/web/QRListPanel.tsx
import { useTheme } from '@/context/ThemeContext';
import type { QRCodeItemType } from '@/types/qrTypes';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    RefreshControlProps,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

type Props = {
  items: QRCodeItemType[];
  loading?: boolean;
  error?: string;
  selectedIds: string[];
  onToggle: (id: string) => void;
  onCreate: () => void;
  onEdit: (item: QRCodeItemType) => void;
  onRefresh: () => void;
  refreshControl?: React.ReactElement<RefreshControlProps>;
};

export default function QRListPanel({
  items,
  loading,
  error,
  selectedIds,
  onToggle,
  onCreate,
  onEdit,
  onRefresh,
  refreshControl,
}: Props) {
  const { theme, themes } = useTheme();
  const colors = themes[theme];
  const styles = getStyles(colors);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'PAUSED' | 'DELETED'>('ALL');

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return (items || []).filter((it) => {
      if (status !== 'ALL' && it.status !== status) return false;
      if (!ql) return true;
      const s = `${it.description || ''} ${typeof it.qrData === 'string' ? it.qrData : JSON.stringify(it.qrData)}`.toLowerCase();
      return s.includes(ql);
    });
  }, [items, q, status]);

  return (
    <View style={styles.root}>
      {/* header */}
      <View style={styles.header}>
        <Text style={styles.title}>Мои QR</Text>
        <Pressable onPress={onCreate} style={styles.createBtn}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.createText}>Создать</Text>
        </Pressable>
      </View>

      {/* search + simple status chips */}
      <View style={styles.controls}>
        <TextInput
          placeholder="Поиск…"
          placeholderTextColor={colors.placeholder}
          value={q}
          onChangeText={setQ}
          style={styles.search}
        />
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {(['ALL','ACTIVE','PAUSED','DELETED'] as const).map((s) => (
            <Pressable
              key={s}
              onPress={() => setStatus(s)}
              style={[styles.chip, status === s && styles.chipActive]}
            >
              <Text style={[styles.chipText, status === s && styles.chipTextActive]}>{s}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* list */}
      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={{ paddingVertical: 20, alignItems: 'center' }}>
            <ActivityIndicator />
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={{ color: '#B91C1C' }}>{error}</Text>
            <Pressable style={[styles.chip, { marginTop: 8 }]} onPress={onRefresh}>
              <Text style={styles.chipText}>Повторить</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(it) => it.id}
            refreshControl={refreshControl}
            renderItem={({ item }) => {
              const selected = selectedIds.includes(item.id);
              return (
                <Pressable
                  onPress={() => onToggle(item.id)}
                  onLongPress={() => onEdit(item)}
                  style={[styles.card, selected && styles.cardSelected]}
                >
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={styles.cardTitle}>
                      {item.description || (typeof item.qrData === 'string' ? item.qrData : 'QR')}
                    </Text>
                    <Text numberOfLines={1} style={styles.cardSub}>
                      {item.qrType} • {item.status}
                    </Text>
                  </View>
                  <Pressable onPress={() => onEdit(item)} style={styles.editBtn}>
                    <Ionicons name="create-outline" size={16} color="#6B7280" />
                  </Pressable>
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </View>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    root: { flex: 1, padding: 12, gap: 10 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { color: colors.text, fontWeight: '800', fontSize: 18 },
    createBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.tint,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
    },
    createText: { color: '#fff', fontWeight: '800' },

    controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    search: {
      flex: 1,
      height: 38,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      color: colors.text,
      backgroundColor: colors.cardBackground,
    },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: '#fff',
    },
    chipActive: {
      borderColor: colors.tint,
      backgroundColor: '#fff',
    },
    chipText: { color: colors.secondaryText, fontWeight: '700' },
    chipTextActive: { color: colors.tint },

    errorBox: { backgroundColor: '#fee2e2', borderRadius: 8, padding: 10, marginTop: 8 },

    card: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: '#eef2ff',
      borderRadius: 10,
      marginBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.cardBackground,
    },
    cardSelected: { borderColor: colors.tint },
    cardTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
    cardSub: { color: colors.secondaryText, fontSize: 12, marginTop: 2 },
    editBtn: {
      height: 32, width: 32, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB',
      alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
    },
  });
