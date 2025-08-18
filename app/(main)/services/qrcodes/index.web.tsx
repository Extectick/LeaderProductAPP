// app/(main)/services/qrcodes/index.web.tsx
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/context/ThemeContext';
import { useAnalyticsController } from '@/hooks/useAnalyticsController';
import type { QRCodeItemType } from '@/types/qrTypes';
import { createQRCode, getQRCodesList, updateQRCode } from '@/utils/qrService';

import QRCodeForm from '@/components/QRcodes/QRCodeForm';
import QRListPanel from '@/components/QRcodes/Web/QRListPanel';

import AnalyticsHeader from '@/components/QRcodes/Analytics/AnalyticsHeader';
import ChartSkeleton from '@/components/QRcodes/Analytics/ChartSkeleton';
import FilterModal from '@/components/QRcodes/Analytics/FilterModal';
import LineChart from '@/components/QRcodes/Analytics/LineChart';
import MetricsRow from '@/components/QRcodes/Analytics/MetricsRow';
import MonthHeatmap from '@/components/QRcodes/Analytics/MonthHeatmap';
import PeriodModal from '@/components/QRcodes/Analytics/PeriodModal';
import PresetsModal from '@/components/QRcodes/Analytics/PresetsModal';

export default function QRHubWeb() {
  const { theme, themes } = useTheme();
  const colors = themes[theme];
  const insets = useSafeAreaInsets();
  const styles = getStyles(colors);

  // правая панель — аналитика
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
      return `${fmt(ctrl.computedRange.from)} — ${fmt(ctrl.computedRange.to)}`;
    }
    return ctrl.periodLabel;
  }, [ctrl.periodKey, ctrl.computedRange, ctrl.periodLabel]);

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.splitRow}>
        {/* LEFT: LIST */}
        <View style={styles.leftPane}>
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

          {/* Оверлей-форма (используем QRCodeForm) */}
          {formOpen && (
            <View style={styles.leftOverlay} pointerEvents="box-none">
              {/* кликабельная подложка */}
              <Pressable style={styles.backdrop} onPress={() => setFormOpen(false)} />
              {/* карточка с формой */}
              <View style={styles.formCard}>
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
        </View>

        {/* RIGHT: ANALYTICS */}
        <View style={styles.rightPane}>
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

          <View style={{ padding: 12, paddingTop: 0, flex: 1 }}>
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

                <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Активность (календарь)</Text>
                {ctrl.heatmapLoading ? (
                  <ChartSkeleton />
                ) : (
                  <MonthHeatmap
                    month={ctrl.calendarMonth}
                    data={ctrl.heatmapData}
                    events={(ctrl.scans || []).map(s => ({
                      ts: s.createdAt,
                      city: s.location ?? undefined,
                      title: `${s.device || ''} • ${s.browser || ''}`.trim(),
                    }))}
                    startOfWeek={1}
                    palette="blue"
                    highlightWeekends
                    onChangeMonth={ctrl.setCalendarMonth}
                  />
                )}

                <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Последние сканы</Text>
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
              </>
            )}
          </View>
        </View>
      </View>

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
    </View>
  );
}

const fmt = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1,).padStart(2, '0')}.${d.getFullYear()}`;

const getStyles = (colors: any) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    splitRow: { flex: 1, flexDirection: 'row' },
    leftPane: {
      flex: 1,
      minWidth: 420,
      maxWidth: '50%',
      borderRightWidth: 1,
      borderRightColor: '#eef2ff',
      position: 'relative', // для позиционирования оверлея
    },
    rightPane: { flex: 1, maxWidth: '50%' },
    header: { padding: 12, paddingBottom: 8 },

    // оверлей формы
    leftOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.25)',
    },
    formCard: {
      width: '88%',
      maxWidth: 560,
      borderRadius: 14,
      padding: 14,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.border,
      zIndex: 21,
    },

    sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 8 },
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
