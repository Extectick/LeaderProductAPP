// components/qrcodes/web/QRListPanel.tsx
import { useTheme } from '@/context/ThemeContext';
import type { QRCodeItemType } from '@/src/entities/qr/types';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    RefreshControlProps,
    StyleSheet,
    Text,
    TextInput,
    View,
    Platform,
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
  const [filterOpen, setFilterOpen] = useState(false);
  const filterBtnRef = useRef<View>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return (items || []).filter((it) => {
      if (status !== 'ALL' && it.status !== status) return false;
      if (!ql) return true;
      const s = `${it.description || ''} ${typeof it.qrData === 'string' ? it.qrData : JSON.stringify(it.qrData)}`.toLowerCase();
      return s.includes(ql);
    });
  }, [items, q, status]);

  const statusPalette: Record<string, { bg: string; text: string }> = {
    ACTIVE: { bg: '#DCFCE7', text: '#166534' },
    PAUSED: { bg: '#FEF9C3', text: '#854D0E' },
    DELETED: { bg: '#FEE2E2', text: '#991B1B' },
    ALL: { bg: '#E5E7EB', text: '#1F2937' },
  };

  const filterMenu = filterOpen ? (
    <View
      style={[
        styles.filterMenu,
        menuPos
          ? {
              position: 'absolute',
              top: menuPos.top,
              left: menuPos.left,
              minWidth: Math.max(180, menuPos.width),
              zIndex: 9999,
            }
          : { position: 'absolute', zIndex: 9999 },
      ]}
      onLayout={() => {
        if (filterBtnRef.current) {
          filterBtnRef.current.measureInWindow((x, y, width, height) => {
            setMenuPos({ top: y + height + 6, left: x, width });
          });
        }
      }}
    >
      {[
        { value: 'ALL', label: 'Все', tint: '#111827' },
        { value: 'ACTIVE', label: 'Активные', tint: '#16A34A' },
        { value: 'PAUSED', label: 'Пауза', tint: '#F59E0B' },
        { value: 'DELETED', label: 'Удалённые', tint: '#DC2626' },
      ].map((opt) => {
        const active = status === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              setStatus(opt.value as any);
              setFilterOpen(false);
            }}
            style={({ pressed }) => [
              styles.filterItem,
              active && styles.filterItemActive,
              pressed && { opacity: 0.85 },
            ]}
          >
            <View style={[styles.filterDot, { backgroundColor: opt.tint }]} />
            <Text style={[styles.filterText, active && styles.filterTextActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  ) : null;

  const filterOverlay = filterOpen ? (
    <Pressable
      style={styles.filterOverlay}
      onPress={() => setFilterOpen(false)}
    />
  ) : null;

  const renderPortal = (node: React.ReactNode) => {
    if (!node) return null;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      return ReactDOM.createPortal(node as any, document.body);
    }
    return node;
  };

  return (
    <View style={styles.root}>
      {renderPortal(filterOverlay)}
      {/* header */}
      <View style={styles.header}>
        <Text style={styles.title}>Мои QR</Text>
        <Pressable
          onPress={onCreate}
          style={({ pressed }) => [
            styles.createBtn,
            pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
          ]}
        >
          <Ionicons name="qr-code-outline" size={16} color="#fff" />
          <Text style={styles.createText}>Создать</Text>
        </Pressable>
      </View>

      {/* search + simple status chips */}
      <View style={styles.controls}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={colors.placeholder} />
          <TextInput
            placeholder="Поиск по описанию или данным QR"
            placeholderTextColor={colors.placeholder}
            value={q}
            onChangeText={setQ}
            style={styles.search}
            selectionColor={colors.tint}
            underlineColorAndroid="transparent"
          />
        </View>
        <View style={styles.filterWrap}>
          <Pressable
            ref={filterBtnRef}
            onPress={() => {
              if (!filterOpen && filterBtnRef.current) {
                filterBtnRef.current.measureInWindow((x, y, width, height) => {
                  setMenuPos({ top: y + height + 6, left: x, width });
                  setFilterOpen(true);
                });
              } else {
                setFilterOpen((v) => !v);
              }
            }}
            style={({ pressed }) => [
              styles.filterBtn,
              pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
            ]}
          >
            <Ionicons name="funnel" size={16} color="#0B1220" />
            <Text style={styles.filterBtnText}>
              {{
                ALL: 'Все',
                ACTIVE: 'Активные',
                PAUSED: 'Пауза',
                DELETED: 'Удалённые',
              }[status]}
            </Text>
            <Ionicons name={filterOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#4B5563" />
          </Pressable>
          {renderPortal(filterMenu)}
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
        ) : filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="qr-code-outline" size={28} color={colors.secondaryText} />
            <Text style={{ color: colors.text, fontWeight: '700', marginTop: 8 }}>QR-коды ещё не созданы</Text>
            <Text style={{ color: colors.secondaryText, fontSize: 12, textAlign: 'center' }}>
              Создайте первый QR, чтобы увидеть его в списке.
            </Text>
            <Pressable onPress={onCreate} style={[styles.createBtn, { marginTop: 10 }]}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.createText}>Создать</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(it) => it.id}
            refreshControl={refreshControl}
            renderItem={({ item }) => {
              const selected = selectedIds.includes(item.id);
              const palette = statusPalette[item.status] || statusPalette.ALL;
              return (
                <Pressable
                  onPress={() => onToggle(item.id)}
                  onLongPress={() => onEdit(item)}
                  style={[
                    styles.card,
                    selected && styles.cardSelected,
                    { shadowOpacity: selected ? 0.14 : 0.06 },
                  ]}
                >
                  <View style={[styles.badge, { backgroundColor: palette.bg }]}>
                    <Text style={[styles.badgeText, { color: palette.text }]}>{item.status}</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={2} style={styles.cardTitle}>
                      {item.description || (typeof item.qrData === 'string' ? item.qrData : 'QR')}
                    </Text>
                    <Text numberOfLines={2} style={styles.cardSub}>
                      {item.qrType}
                    </Text>
                  </View>

                  <View style={styles.actions}>
                    {selected ? (
                      <View style={styles.selectedMark}>
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      </View>
                    ) : (
                      <Pressable onPress={() => onEdit(item)} style={styles.editBtn}>
                        <Ionicons name="create-outline" size={16} color="#6B7280" />
                      </Pressable>
                    )}
                  </View>
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
    root: { flex: 1, padding: 12, gap: 10, position: 'relative', overflow: 'visible', zIndex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { color: colors.text, fontWeight: '800', fontSize: 18 },
    createBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.tint,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 12,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    },
    createText: { color: '#fff', fontWeight: '800' },

    controls: { flexDirection: 'row', alignItems: 'center', gap: 8, overflow: 'visible' },
    searchWrap: {
      flex: 1,
      height: 40,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      color: colors.text,
      backgroundColor: colors.cardBackground,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    search: {
      flex: 1,
      color: colors.text,
      fontSize: 14,
      backgroundColor: 'transparent',
    },
    filterWrap: { position: 'relative', zIndex: 2000 },
    filterBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardBackground,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      minWidth: 120,
      justifyContent: 'center',
    },
    filterBtnText: { color: colors.text, fontWeight: '800', fontSize: 13 },
    filterMenu: {
      position: 'absolute',
      top: 46,
      right: 0,
      backgroundColor: colors.cardBackground,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 6,
      width: 180,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      zIndex: 2001,
      elevation: 8,
      pointerEvents: 'auto',
    },
    filterItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    filterItemActive: { backgroundColor: colors.tint + '12' },
    filterDot: { width: 10, height: 10, borderRadius: 5 },
    filterText: { color: colors.text, fontWeight: '700', fontSize: 13 },
    filterTextActive: { color: colors.tint },
    filterOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 9998,
    },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cardBackground,
    },
    chipText: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 12,
    },

    errorBox: { backgroundColor: '#fee2e2', borderRadius: 8, padding: 10, marginTop: 8 },
    emptyState: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.cardBackground,
      marginTop: 8,
    },

    card: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: '#eef2ff',
      borderRadius: 12,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.cardBackground,
      shadowColor: '#000',
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.06,
    },
    cardSelected: { borderColor: colors.tint, backgroundColor: colors.cardBackground },
    cardTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
    cardSub: { color: colors.secondaryText, fontSize: 12, marginTop: 2 },
    editBtn: {
      height: 32, width: 32, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB',
      alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
    },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      marginRight: 8,
    },
    badgeText: { fontWeight: '700', fontSize: 11 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    selectedMark: {
      height: 28,
      width: 28,
      borderRadius: 10,
      backgroundColor: colors.tint,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
