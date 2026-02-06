// app/(main)/services/qrcodes/index.web.tsx
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useTheme } from '@/context/ThemeContext';
import { useAnalyticsController } from '@/hooks/useAnalyticsController';
import type { QRCodeItemType } from '@/types/qrTypes';
import { createQRCode, getQRCodesList, updateQRCode } from '@/utils/qrService';

import QRCodeForm from '@/components/QRcodes/QRCodeForm';
import QRListPanel from '@/components/QRcodes/Web/QRListPanel';
import TabBarSpacer from '@/components/Navigation/TabBarSpacer';

import AnalyticsHeader from '@/components/QRcodes/Analytics/AnalyticsHeader';
import ChartSkeleton from '@/components/QRcodes/Analytics/ChartSkeleton';
import FilterModal from '@/components/QRcodes/Analytics/FilterModal';
import LineChart from '@/components/QRcodes/Analytics/LineChart';
import MetricsRow from '@/components/QRcodes/Analytics/MetricsRow';
import PeriodModal from '@/components/QRcodes/Analytics/PeriodModal';
import PresetsModal from '@/components/QRcodes/Analytics/PresetsModal';

// helpers
const buildMonthGrid = (month: Date, startOfWeek: 0 | 1 = 1) => {
  const d0 = new Date(month.getFullYear(), month.getMonth(), 1);
  const shift = (d0.getDay() - startOfWeek + 7) % 7;
  const start = new Date(d0);
  start.setDate(d0.getDate() - shift);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
};

export default function QRHubWeb() {
  const { theme, themes } = useTheme();
  const colors = themes[theme];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = getStyles(colors);
  const { width } = useWindowDimensions();
  const isMobileLike = width <= 820;
  const isStack = width < 1200;

  // правая панель - аналитика
  const ctrl = useAnalyticsController();

  // левая панель — список QR
  const [qrList, setQrList] = useState<QRCodeItemType[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError('');
    try {
      const res = await getQRCodesList(200, 0, 'ACTIVE', true);
      setQrList(res.data || []);
    } catch (e: any) {
      setListError(e?.message || 'Не удалось загрузить список QR');
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadList(), ctrl.onRefresh()]);
    setRefreshing(false);
  }, [loadList, ctrl]);

  // модалки аналитики
  const [filterVisible, setFilterVisible] = useState(false);
  const [periodVisible, setPeriodVisible] = useState(false);
  const [presetsVisible, setPresetsVisible] = useState(false);

  // форма создания/редактирования (поверх левой панели)
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<QRCodeItemType | null>(null);

  const openCreate = () => { setEditingItem(null); setFormOpen(true); };
  const openEdit = (item: QRCodeItemType) => { setEditingItem(item); setFormOpen(true); };
  const handleAnalytics = useCallback(() => {
    router.push('/(main)/services/qrcodes/analytics' as any);
  }, [router]);

  const onSaved = (saved: QRCodeItemType) => {
    setQrList(prev => {
      const idx = prev.findIndex(i => i.id === saved.id);
      if (idx === -1) return [saved, ...prev];
      const next = prev.slice();
      next[idx] = saved;
      return next;
    });
  };

  // подпись периода (для хедера аналитики)
  const periodLabel = useMemo(() => {
    const fmt = (d: Date) => `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
    if (ctrl.periodKey === 'custom' && ctrl.computedRange.from && ctrl.computedRange.to) {
      return `${fmt(ctrl.computedRange.from)} - ${fmt(ctrl.computedRange.to)}`;
    }
    return ctrl.periodLabel;
  }, [ctrl.periodKey, ctrl.computedRange, ctrl.periodLabel]);

  // компактный календарь (только веб)
  const calendarMonth = ctrl.calendarMonth || new Date();
  const calendarMonthLabel = useMemo(
    () => calendarMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
    [calendarMonth]
  );
  const calendarGrid = useMemo(() => buildMonthGrid(calendarMonth, 1), [calendarMonth]);
  const calendarWeeks = useMemo(
    () => Array.from({ length: 6 }, (_, i) => calendarGrid.slice(i * 7, i * 7 + 7)),
    [calendarGrid]
  );
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null);
  const [hoverDay, setHoverDay] = useState<Date | null>(null);
  const lastAppliedRange = React.useRef<string | null>(null);

  useEffect(() => {
    if (rangeStart && rangeEnd) {
      const from = new Date(rangeStart);
      const to = new Date(rangeEnd);
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
      const key = `${from.toISOString()}_${to.toISOString()}`;
      if (lastAppliedRange.current !== key) {
        lastAppliedRange.current = key;
        ctrl.applyPeriod('custom', from, to);
      }
    }
  }, [rangeStart, rangeEnd, ctrl]);

  const handleDaySelect = (date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    if (!rangeStart || (rangeStart && rangeEnd)) {
      setRangeStart(d);
      setRangeEnd(null);
      setHoverDay(null);
      lastAppliedRange.current = null;
      return;
    }
    // есть начало, ставим конец
    if (d.getTime() < rangeStart.getTime()) {
      setRangeEnd(rangeStart);
      setRangeStart(d);
    } else {
      setRangeEnd(d);
    }
    setHoverDay(null);
  };

  const renderSkeletonPage = () => (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={[styles.splitRow, styles.splitColumn, { gap: 16, paddingVertical: 12 }]}>
        <View style={[styles.leftPane, styles.fullPane, { gap: 12 }]}>
          <View style={[styles.skeletonBox, { height: 46 }]} />
          <View style={[styles.skeletonBox, { height: 48 }]} />
          <View style={[styles.skeletonBox, { height: 180 }]} />
        </View>
        <View style={[styles.rightPane, styles.fullPane, { gap: 12 }]}>
          <View style={[styles.skeletonBox, { height: 90 }]} />
          <View style={[styles.skeletonBox, { height: 80 }]} />
          <ChartSkeleton />
          <View style={[styles.skeletonBox, { height: 180 }]} />
          <View style={[styles.skeletonBox, { height: 120 }]} />
        </View>
      </View>
    </View>
  );
  const scansPerDay = useMemo(() => {
    const map = new Map<string, number>();
    (ctrl.scans || []).forEach((s) => {
      const d = new Date(s.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [ctrl.scans]);
  const shiftMonth = (delta: number) => {
    const d = new Date(calendarMonth);
    d.setMonth(d.getMonth() + delta);
    ctrl.setCalendarMonth(d);
  };

  if ((listLoading && qrList.length === 0) || (ctrl.loading && !ctrl.analytics)) {
    return isMobileLike ? (
      <View style={[stylesMobile.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ActivityIndicator color={colors.text} />
      </View>
    ) : (
      renderSkeletonPage()
    );
  }

  if (isMobileLike) {
    return (
      <View style={[stylesMobile.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={stylesMobile.header}>
          <Text style={[stylesMobile.title, { color: colors.text }]}>QR-коды</Text>
          <View style={stylesMobile.headerButtonsRow}>
            <Pressable onPress={openCreate} style={[stylesMobile.primaryBtn]} accessibilityRole="button">
              <Ionicons name="add" size={18} color="#0B1220" />
              <Text style={stylesMobile.primaryBtnText}>Создать</Text>
            </Pressable>
            <Pressable onPress={handleAnalytics} style={[stylesMobile.secondaryBtn]} accessibilityRole="button">
              <Ionicons name="analytics" size={18} color={colors.text} />
              <Text style={[stylesMobile.secondaryBtnText, { color: colors.text }]}>Аналитика</Text>
            </Pressable>
          </View>
        </View>

        {listError ? (
          <View style={stylesMobile.errorBox}>
            <Text style={{ color: '#B91C1C' }}>{listError}</Text>
            <Pressable onPress={loadList} style={stylesMobile.retryBtn}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Повторить</Text>
            </Pressable>
          </View>
        ) : null}

        <FlatList
          data={qrList}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                setEditingItem(item);
                setFormOpen(true);
              }}
              style={({ pressed }) => [
                stylesMobile.card,
                { backgroundColor: colors.cardBackground, borderColor: '#E5E7EB' },
                pressed && { opacity: 0.94 },
              ]}
            >
              <Text style={[stylesMobile.cardTitle, { color: colors.text }]} numberOfLines={2}>
                {item.description || item.qrData || 'QR'}
              </Text>
              <Text style={{ color: colors.secondaryText, fontSize: 12 }} numberOfLines={2}>
                {item.qrData}
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={[stylesMobile.emptyCard, { backgroundColor: colors.cardBackground }]}>
              <Ionicons name="qr-code-outline" size={36} color="#9CA3AF" />
              <Text style={{ color: colors.text, fontWeight: '700', marginTop: 8 }}>Пока нет QR-кодов</Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.text}
              colors={[colors.text]}
            />
          }
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12, gap: 10 }}
          ListFooterComponent={<TabBarSpacer />}
          showsVerticalScrollIndicator={false}
        />

        {/* форма поверх списка */}
        {formOpen && (
          <View style={stylesMobile.overlay}>
            <Pressable style={stylesMobile.backdrop} onPress={() => setFormOpen(false)} />
            <View style={[stylesMobile.formCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <QRCodeForm
                mode={editingItem ? 'edit' : 'create'}
                initialItem={editingItem ?? undefined}
                onCreate={async (payload) => {
                  const item = await createQRCode(payload.qrType, payload.qrData, payload.description);
                  onSaved(item);
                  setFormOpen(false);
                }}
                onUpdate={async (id, patch) => {
                  const item = await updateQRCode(id, patch);
                  onSaved(item);
                  setFormOpen(false);
                }}
                onSuccess={() => setFormOpen(false)}
              />
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.root]}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom, minHeight: '100%' }}
    >
      <View style={[styles.splitRow, isStack && styles.splitColumn]}>
        {/* LEFT: LIST */}
        <View style={[styles.leftPane, isStack && styles.fullPane]}>
          <QRListPanel
            items={qrList}
            loading={listLoading}
            error={listError}
            selectedIds={ctrl.selectedIds}
            onToggle={ctrl.toggleQrSelection}
            onCreate={openCreate}
            onEdit={openEdit}
            onRefresh={loadList}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.text}
                colors={[colors.text]}
              />
            }
          />
        </View>

        {/* RIGHT: ANALYTICS */}
        <View style={[styles.rightPane, isStack && styles.fullPane]}>
          <View style={styles.header}>
            <AnalyticsHeader
              selectedCount={ctrl.selectedIds.length}
              periodLabel={periodLabel}
              onOpenFilter={() => setFilterVisible(true)}
              onOpenPeriod={() => setPeriodVisible(true)}
              onOpenPresets={() => setPresetsVisible(true)}
            />
          </View>

          {!!ctrl.error && (
            <View style={styles.errorBox}>
              <Text style={{ color: '#B91C1C' }}>{ctrl.error}</Text>
            </View>
          )}

          <View style={styles.analyticsCard}>
            {ctrl.loading ? (
              <ChartSkeleton />
            ) : (
              <>
                <MetricsRow
                  colors={colors}
                  totals={ctrl.analytics?.totals}
                  mini={{ scans: (ctrl.analytics?.series || []).map(s => s.scans).slice(-14) }}
                />

                {/* Zoom chip */}
                {ctrl.chartZoom && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <View style={{
                      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
                      borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF'
                    }}>
                      <Text style={{ color: colors.text, fontWeight: '700' }}>
                        Период: {fmt(ctrl.chartZoom.from)} — {fmt(ctrl.chartZoom.to)}
                      </Text>
                    </View>
                    <View style={{ width: 8 }} />
                    <View
                      style={{
                        height: 32, width: 32, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB',
                        alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
                      }}
                    >
                      <Ionicons name="close" size={16} color={colors.text} onPress={ctrl.clearZoom} />
                    </View>
                  </View>
                )}

                <LineChart
                  colors={colors}
                  range={{ from: ctrl.computedRange.from, to: ctrl.computedRange.to, bucket: ctrl.computedRange.bucket }}
                  series={(ctrl.analytics?.series || []).map(p => ({ ts: p.ts, value: p.scans }))}
                  onZoomRequest={ctrl.requestZoom}
                />

                <View style={styles.cardSection}>
                  <View style={styles.calendarHeader}>
                    <Pressable onPress={() => shiftMonth(-1)} style={styles.navBtn}>
                      <Ionicons name="chevron-back" size={16} color={colors.text} />
                    </Pressable>
                    <Text style={styles.sectionTitle}>{calendarMonthLabel}</Text>
                    <Pressable onPress={() => shiftMonth(1)} style={styles.navBtn}>
                      <Ionicons name="chevron-forward" size={16} color={colors.text} />
                    </Pressable>
                  </View>
                  <View style={styles.weekdaysRow}>
                    {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((w) => (
                      <Text key={w} style={styles.weekdayLabel}>{w}</Text>
                    ))}
                  </View>
                  <View style={styles.weeksContainer}>
                    {calendarWeeks.map((week, wi) => (
                      <View key={wi} style={styles.weekRow}>
                        {week.map((d, di) => {
                          const dayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                          const key = `${dayKey}-${wi}-${di}`;
                          const inMonth = d.getMonth() === calendarMonth.getMonth();
                          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                          const scans = scansPerDay.get(dayKey) || 0;
                          const ts = d.getTime();
                          const startTs = rangeStart?.getTime();
                          const endTs = rangeEnd?.getTime();
                          const hoverTs = hoverDay?.getTime();
                          const rangeHi = endTs ?? (startTs && hoverTs ? Math.max(startTs, hoverTs) : undefined);
                          const rangeLo = startTs && hoverTs && !endTs ? Math.min(startTs, hoverTs) : startTs;
                          const inRange = startTs != null && rangeLo != null && rangeHi != null && ts >= rangeLo && ts <= rangeHi;
                          const isStart = startTs != null && ts === startTs;
                          const isEnd = (endTs != null && ts === endTs) || (endTs == null && hoverTs != null && ts === hoverTs && startTs !== hoverTs);

                          return (
                            <Pressable
                              key={key}
                              onPress={() => handleDaySelect(d)}
                              onHoverIn={() => setHoverDay(d)}
                              onHoverOut={() => setHoverDay(null)}
                              style={({ pressed }) => [
                                styles.dayCell,
                                !inMonth && styles.dayCellMuted,
                                scans > 0 && styles.dayCellActive,
                                inRange && styles.dayCellRange,
                                isStart && styles.dayCellStart,
                                isEnd && styles.dayCellEnd,
                                pressed && styles.dayCellPressed,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.dayNum,
                                  isWeekend && inMonth ? styles.dayWeekend : null,
                                  !inMonth ? styles.dayMutedText : null,
                                ]}
                              >
                                {d.getDate()}
                              </Text>
                              {scans > 0 && <View style={styles.dot} />}
                            </Pressable>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                </View>

                <View style={styles.cardSection}>
                  <Text style={styles.sectionTitle}>Последние сканы</Text>
                  <View style={{ flex: 1 }}>
                  {ctrl.scansLoading ? (
                    <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                      <ActivityIndicator />
                    </View>
                  ) : ctrl.scans.length === 0 ? (
                    <View style={{ paddingVertical: 16 }}>
                      <Text style={{ color: colors.secondaryText }}>Нет сканов за выбранный период</Text>
                    </View>
                  ) : (
                    <View>
                      {ctrl.scans.map(item => {
                        const qr = qrList.find(q => q.id === item.qrListId);
                        return (
                          <View key={String(item.id)} style={styles.scanCard}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.scanTitle}>{qr?.description || qr?.qrData || item.qrListId}</Text>
                              <Text style={styles.scanSub}>
                                {new Date(item.createdAt).toLocaleString()} • {item.device || 'unknown'} • {item.browser || 'unknown'}
                              </Text>
                              <Text style={styles.scanSub}>{item.location || 'Unknown'}</Text>
                            </View>
                            <Ionicons name="navigate" size={18} color="#9CA3AF" />
                          </View>
                        );
                      })}
                      <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                        {ctrl.scans.length < ctrl.scansMeta.total ? (
                          <Text style={{ color: colors.secondaryText }}>
                            {ctrl.loadingMore ? 'Загрузка...' : 'Прокрутите ниже для загрузки'}
                          </Text>
                        ) : (
                          <View style={{ height: 4 }} />
                        )}
                      </View>
                    </View>
                  )}
                  </View>
                </View>
              </>
            )}
          </View>
        </View>
      </View>

      {/* Глобальный оверлей формы (поверх всей страницы) */}
      {formOpen && (
        <View style={styles.leftOverlay} pointerEvents="box-none">
          <Pressable style={styles.backdrop} onPress={() => setFormOpen(false)} />
          <View style={styles.formModalWrap}>
            <QRCodeForm
              mode={editingItem ? 'edit' : 'create'}
              initialItem={editingItem ?? undefined}
              onCreate={async (payload) => {
                const item = await createQRCode(payload.qrType, payload.qrData, payload.description);
                onSaved(item);
              }}
              onUpdate={async (id, patch) => {
                const item = await updateQRCode(id, patch);
                onSaved(item);
              }}
              onSuccess={() => setFormOpen(false)}
            />
          </View>
        </View>
      )}

      {/* модалки правой панели */}
      <FilterModal
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        qrCodes={qrList}
        selectedIds={ctrl.selectedIds}
        onToggle={ctrl.toggleQrSelection}
        onClear={() => {
          ctrl.selectedIds.forEach(id => ctrl.toggleQrSelection(id));
        }}
        onApply={() => setFilterVisible(false)}
      />

      <PeriodModal
        visible={periodVisible}
        onClose={() => setPeriodVisible(false)}
        current={ctrl.periodKey}
        currentFrom={ctrl.customFrom}
        currentTo={ctrl.customTo}
        onApply={(key, from, to) => {
          ctrl.applyPeriod(key, from, to);
          if (key === 'custom') {
            setRangeStart(from ? new Date(from) : null);
            setRangeEnd(to ? new Date(to) : null);
            if (from) ctrl.setCalendarMonth(new Date(from));
          } else {
            setRangeStart(null);
            setRangeEnd(null);
          }
          setPeriodVisible(false);
        }}
      />

      <PresetsModal
        visible={presetsVisible}
        onClose={() => setPresetsVisible(false)}
        onApply={(preset) => {
          ctrl.applyPeriod(
            preset.period,
            preset.from ? new Date(preset.from) : null,
            preset.to ? new Date(preset.to) : null
          );
          // заменим выбранные id
          ctrl.selectedIds.forEach(id => ctrl.toggleQrSelection(id));
          (preset.ids || []).forEach(id => {
            if (!ctrl.selectedIds.includes(id)) ctrl.toggleQrSelection(id);
          });
          setPresetsVisible(false);
        }}
        onDeletePreset={(name) => console.log('delete preset', name)}
      />
    </ScrollView>
  );
}

const fmt = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1,).padStart(2, '0')}.${d.getFullYear()}`;

const getStyles = (colors: any) =>
  StyleSheet.create({
    // десктоп
    root: { flex: 1, backgroundColor: colors.background },
    splitRow: { flex: 1, flexDirection: 'row', gap: 12, paddingHorizontal: 12, alignItems: 'flex-start' },
    splitColumn: { flexDirection: 'column' },
    leftPane: {
      flex: 1,
      minWidth: 320,
      maxWidth: '45%',
      borderRightWidth: 1,
      borderRightColor: '#eef2ff',
      position: 'relative', // для позиционирования оверлея
      maxHeight: '100%',
    },
    rightPane: { flex: 1, maxWidth: '55%', maxHeight: '100%' },
    fullPane: { maxWidth: '100%', minWidth: '100%', borderRightWidth: 0, maxHeight: undefined },
    header: { padding: 12, paddingBottom: 8 },
    analyticsCard: {
      padding: 12,
      paddingTop: 4,
      flex: 1,
      backgroundColor: colors.cardBackground,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      maxHeight: '100%',
      overflow: 'hidden',
    },

    // оверлей формы
    leftOverlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 120,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 16,
      pointerEvents: 'box-none',
    } as any,
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.45)',
      transitionDuration: '200ms',
      opacity: 1,
    } as any,
    formModalWrap: {
      width: '90%',
      maxWidth: 640,
      borderRadius: 16,
      padding: 14,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.border,
      zIndex: 31,
      boxShadow: '0 18px 40px rgba(0,0,0,0.18)',
    } as any,

    sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 8 },
    cardSection: {
      marginTop: 16,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      backgroundColor: colors.cardBackground,
      gap: 8,
    },
    calendarHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    navBtn: {
      height: 30, width: 30, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB',
      alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
    },
    weeksContainer: {
      gap: 4,
      marginTop: 4,
      width: 7 * 40 + 6 * 6, // ширина по количеству клеток
      alignSelf: 'center',
    },
    weekRow: { flexDirection: 'row', gap: 6 },
    weekdaysRow: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 4,
      marginBottom: 2,
      width: 7 * 40 + 6 * 6,
      alignSelf: 'center',
    },
    weekdayLabel: { width: 40, textAlign: 'center', color: colors.secondaryText, fontWeight: '700', fontSize: 11 },
    dayCell: {
      width: 40,
      height: 40,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cardBackground,
    },
    dayCellMuted: { opacity: 0.45 },
    dayCellActive: { borderColor: colors.tint },
    dayCellRange: { backgroundColor: colors.tint + '12' },
    dayCellStart: { borderColor: colors.tint, backgroundColor: colors.tint + '22' },
    dayCellEnd: { borderColor: colors.tint, backgroundColor: colors.tint + '22' },
    dayCellPressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
    dayNum: { fontSize: 11, fontWeight: '800', color: colors.text },
    dayWeekend: { color: '#DC2626' },
    dayMutedText: { color: colors.secondaryText },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#3B82F6',
      marginTop: 2,
    },
    skeletonBox: {
      backgroundColor: '#F3F4F6',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#E5E7EB',
    },
    errorBox: { backgroundColor: '#fee2e2', borderRadius: 8, padding: 10, marginHorizontal: 12 },

    scanCard: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: '#eef2ff',
      borderRadius: 10,
      marginBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardBackground,
    },
    scanTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
    scanSub: { color: colors.secondaryText, fontSize: 12, marginTop: 2 },
  });

const stylesMobile = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, gap: 8 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: 0.2 },
  headerButtonsRow: { flexDirection: 'row', gap: 8 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  primaryBtnText: { color: '#0B1220', fontWeight: '800', marginLeft: 6 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  secondaryBtnText: { fontWeight: '700', marginLeft: 6 },
  errorBox: {
    marginHorizontal: 12,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fee2e2',
    backgroundColor: '#fff1f2',
  },
  retryBtn: {
    marginTop: 8,
    backgroundColor: '#0EA5E9',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  emptyCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 16,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 14,
  },
  backdrop: { ...StyleSheet.absoluteFillObject },
  formCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
});
