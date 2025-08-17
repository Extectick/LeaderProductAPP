// D:\Extectick\LeaderProductAPP\components\QRcodes\Analytics\FilterModal.tsx
import { useTheme } from '@/context/ThemeContext';
import type { QRCodeItemType } from '@/types/qrTypes';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
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

// ——— небольшая «скейл»-кнопка
const PressableScale: React.FC<{
  onPress?: () => void;
  style?: any;
  children: React.ReactNode;
  activeBg?: string;
}> = ({ onPress, style, children, activeBg }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPressIn={() => {
        setPressed(true);
        Animated.timing(scale, { toValue: 0.95, duration: 90, useNativeDriver: true }).start();
      }}
      onPressOut={() => {
        Animated.timing(scale, { toValue: 1, duration: 110, useNativeDriver: true }).start(() => setPressed(false));
      }}
      onPress={onPress}
    >
      <Animated.View style={[style, { transform: [{ scale }] }, pressed && activeBg ? { backgroundColor: activeBg } : null]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

export default function FilterModal({
  visible,
  onClose,
  qrCodes,
  selectedIds,
  onToggle,
  onClear,
  onApply,
}: Props) {
  const { theme, themes } = useTheme();
  const colors = themes[theme];
  const styles = getStyles(colors);

  // ——— анимация модалки
  const [localVisible, setLocalVisible] = useState(visible);
  const overlay = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    if (visible) {
      setLocalVisible(true);
      Animated.parallel([
        Animated.timing(overlay, { toValue: 1, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(cardScale, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(overlay, { toValue: 0, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(cardScale, { toValue: 0.96, duration: 140, useNativeDriver: true }),
      ]).start(({ finished }) => finished && setLocalVisible(false));
    }
  }, [visible, overlay, cardScale]);

  const closeAnimated = () => {
    Animated.parallel([
      Animated.timing(overlay, { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.timing(cardScale, { toValue: 0.96, duration: 140, useNativeDriver: true }),
    ]).start(({ finished }) => finished && onClose());
  };

  // ——— поиск/сортировка/статус
  const [q, setQ] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);     // <— ФОКУС ПОИСКА
  const [sortAsc, setSortAsc] = useState(true);
  const [statusTab, setStatusTab] = useState<'all' | 'active' | 'archived'>('all');

  // плавное затухание верхних контролов при фокусе
  const controlsA = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(controlsA, { toValue: searchFocused ? 0 : 1, duration: 150, useNativeDriver: true }).start();
  }, [searchFocused, controlsA]);

  // список с учётом фильтра
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filterByText = (it: QRCodeItemType) => {
      if (!needle) return true;
      const title = (it.description || it.qrData || it.id || '').toLowerCase();
      return title.includes(needle);
    };
    const filterByStatus = (it: any) => {
      if (statusTab === 'all') return true;
      const st = (it.status || it.state || '').toUpperCase();
      if (statusTab === 'active') return st === 'ACTIVE';
      return st === 'ARCHIVE' || st === 'ARCHIVED';
    };

    return [...qrCodes]
      .filter((it) => filterByText(it) && filterByStatus(it))
      .sort((a, b) => {
        const ta = (a.description || a.qrData || a.id || '').toLowerCase();
        const tb = (b.description || b.qrData || b.id || '').toLowerCase();
        return sortAsc ? ta.localeCompare(tb) : tb.localeCompare(ta);
      });
  }, [qrCodes, q, sortAsc, statusTab]);

  // выбранные
  const selectedCount = selectedIds.length;

  // поведение кнопок
  const handleSelectAll = () => {
    const visibleIds = list.map((x) => x.id);
    const allSelected = visibleIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      visibleIds.forEach((id) => selectedIds.includes(id) && onToggle(id));
    } else {
      visibleIds.forEach((id) => !selectedIds.includes(id) && onToggle(id));
    }
  };
  const toggleSortDir = () => setSortAsc((s) => !s);

  if (!localVisible) return null;

  return (
    <Modal visible transparent onRequestClose={closeAnimated}>
      {/* overlay */}
      <Animated.View style={[styles.overlay, { opacity: overlay, transform: [{ scale: overlay.interpolate({ inputRange: [0, 1], outputRange: [1.02, 1] }) }] }]} />

      <View style={styles.centerBox} pointerEvents="box-none">
        <Animated.View style={[styles.card, { transform: [{ scale: cardScale }] }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Фильтр по QR</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <PressableScale style={styles.ghostBtn} onPress={onClear} activeBg="#F3F4F6">
                <Text style={{ color: colors.text, fontWeight: '700' }}>Сбросить</Text>
              </PressableScale>
              <View style={{ width: 8 }} />
              <PressableScale style={styles.ghostIcon} onPress={closeAnimated} activeBg="#F3F4F6">
                <Ionicons name="close" size={18} color={colors.text} />
              </PressableScale>
            </View>
          </View>

          {/* Поиск */}
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
              onFocus={() => setSearchFocused(true)}   // <— скрываем контролы
              onBlur={() => setSearchFocused(false)}   // <— возвращаем контролы
              returnKeyType="search"
            />
            {q.length > 0 && (
              <Pressable onPress={() => setQ('')} hitSlop={8} style={styles.clearSearch}>
                <Ionicons name="close-circle" size={16} color={colors.secondaryText} />
              </Pressable>
            )}
          </View>

          {/* Верхние действия и табы — скрываются при фокусе поиска */}
          {!searchFocused && (
            <Animated.View style={[styles.actionsRow, { opacity: controlsA, transform: [{ translateY: controlsA.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }]}>
              <PressableScale style={styles.iconPill} onPress={handleSelectAll} activeBg="#F3F4F6">
                <Ionicons name="checkbox-outline" size={18} color={colors.text} />
              </PressableScale>
              <View style={{ width: 8 }} />
              <PressableScale style={styles.iconPill} onPress={toggleSortDir} activeBg="#F3F4F6">
                <Ionicons name="swap-vertical" size={18} color={colors.text} />
              </PressableScale>
              <View style={{ width: 8 }} />
              <View style={styles.segment}>
                {(['all', 'active', 'archived'] as const).map((key, idx) => {
                  const active = statusTab === key;
                  const label = key === 'all' ? 'Все' : key === 'active' ? 'Активные' : 'Архив';
                  return (
                    <PressableScale
                      key={key}
                      onPress={() => setStatusTab(key)}
                      activeBg="#FCD34D"
                      style={[styles.segmentPill, active && styles.segmentPillActive, idx === 2 && { borderRightWidth: 0 }]}
                    >
                      <Text style={[styles.segmentPillText, { color: colors.text }]}>{label}</Text>
                    </PressableScale>
                  );
                })}
              </View>
            </Animated.View>
          )}

          {/* Список + чипы выбранных — сами чипы тоже скрываем при фокусе поиска */}
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: 12 }}>
            {!searchFocused && selectedCount > 0 && (
              <Animated.View style={{ opacity: controlsA, transform: [{ translateY: controlsA.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }}>
                <View style={styles.chipsRow}>
                  {qrCodes
                    .filter((x) => selectedIds.includes(x.id))
                    .slice(0, 10)
                    .map((x) => {
                      const title = x.description || x.qrData || x.id;
                      return (
                        <View key={x.id} style={styles.chip}>
                          <Text style={styles.chipText} numberOfLines={1}>{title}</Text>
                          <Pressable onPress={() => onToggle(x.id)} hitSlop={6} style={styles.chipX}>
                            <Ionicons name="close" size={12} color="#0B1220" />
                          </Pressable>
                        </View>
                      );
                    })}
                  {selectedCount > 10 && (
                    <View style={styles.chip}>
                      <Text style={styles.chipText}>+{selectedCount - 10}</Text>
                    </View>
                  )}
                </View>
              </Animated.View>
            )}

            {list.length === 0 ? (
              <View style={{ padding: 16 }}>
                <Text style={{ color: colors.secondaryText }}>Ничего не найдено…</Text>
              </View>
            ) : (
              list.map((item) => {
                const selected = selectedIds.includes(item.id);
                const pressBg = selected ? '#DBEAFE' : undefined;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => onToggle(item.id)}
                    android_ripple={{ color: '#E5E7EB' }}
                    style={styles.itemRow}
                  >
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text style={[styles.itemTitle, selected && { color: '#1D4ED8' }]} numberOfLines={1}>
                        {item.description || item.qrData || item.id}
                      </Text>
                      <Text style={styles.itemMeta} numberOfLines={1}>ID: {item.id}</Text>
                    </View>

                    <PressableScale onPress={() => onToggle(item.id)} activeBg={pressBg} style={[styles.checkbox, selected && { backgroundColor: '#3B82F6', borderColor: '#3B82F6' }]}>
                      {selected ? <Ionicons name="checkmark" size={14} color="#fff" /> : <Ionicons name="square-outline" size={14} color="#6B7280" />}
                    </PressableScale>
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: colors.secondaryText }}>Выбрано:</Text>
              <Text style={{ color: colors.text, fontWeight: '800', marginLeft: 6 }}>{selectedCount}</Text>
            </View>
            <PressableScale style={styles.primaryBtn} onPress={onApply} activeBg="#F3F4F6">
              <Ionicons name="checkmark" size={16} color="#0B1220" />
              <Text style={styles.primaryBtnText}>Применить</Text>
            </PressableScale>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    centerBox: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    },
    card: {
      width: '96%',
      maxWidth: 840,
      maxHeight: '86%',
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

    // Search
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
    clearSearch: { height: 22, width: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },

    // Top actions
    actionsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    iconPill: {
      height: 36,
      width: 36,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cardBackground,
    },
    segment: {
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: '#E5E7EB',
      borderRadius: 10,
      overflow: 'hidden',
      marginLeft: 10,
      backgroundColor: colors.cardBackground,
    },
    segmentPill: {
      height: 32,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderRightWidth: 1,
      borderRightColor: '#E5E7EB',
    },
    segmentPillActive: { backgroundColor: '#FCD34D' },
    segmentPillText: { color: colors.text, fontWeight: '700', fontSize: 12 },

    // Chips
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      height: 26,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      backgroundColor: '#FFFFFF',
    },
    chipText: { color: '#0B1220', fontSize: 12, fontWeight: '700', maxWidth: 180 },
    chipX: {
      marginLeft: 6,
      height: 18,
      width: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#E5E7EB',
    },

    // List items
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: '#F3F4F6',
      paddingHorizontal: 4,
      paddingVertical: 10,
      backgroundColor: colors.cardBackground,
    },
    itemTitle: { color: colors.text, fontWeight: '700' },
    itemMeta: { color: colors.secondaryText, fontSize: 12 },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cardBackground,
    },

    // Footer
    footer: {
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: '#EFF2F6',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    primaryBtn: {
      height: 40,
      paddingHorizontal: 14,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#fff',
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: '#D1D5DB',
    },
    primaryBtnText: { color: '#0B1220', fontWeight: '800', marginLeft: 6 },

    // header ghost buttons (для типобезопасности)
    ghostBtn: {
      height: 36,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cardBackground,
    },
    ghostIcon: {
      height: 36,
      width: 36,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cardBackground,
    },
  });
