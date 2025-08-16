import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import type { AnalyticsPayload, QRCodeItemType, ScanRow } from '@/types/qrTypes';
import { getAnalytics, getQRCodesList, getScans } from '@/utils/qrService';

import AnalyticsHeader from '@/components/QRcodes/Analytics/AnalyticsHeader';
import ChartSkeleton from '@/components/QRcodes/Analytics/ChartSkeleton';
import LineChart from '@/components/QRcodes/Analytics/LineChart';
import MetricsRow from '@/components/QRcodes/Analytics/MetricsRow';

import FilterModal from '@/components/QRcodes/Analytics/FilterModal';
import PeriodModal, { PERIODS, PeriodKey } from '@/components/QRcodes/Analytics/PeriodModal';
import PresetsModal from '@/components/QRcodes/Analytics/PresetsModal';

// ——— вспомогательные форматтеры
const fmtDate = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;

export default function QRAnalyticsScreen() {
  const { theme, themes } = useTheme();
  const colors = themes[theme];
  const styles = getStyles(colors);

  // данные
  const [qrCodes, setQrCodes] = useState<QRCodeItemType[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [periodKey, setPeriodKey] = useState<PeriodKey>('30d');
  const [customFrom, setCustomFrom] = useState<Date | null>(null);
  const [customTo, setCustomTo] = useState<Date | null>(null);

  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [scansMeta, setScansMeta] = useState<{ total: number; limit: number; offset: number }>({
    total: 0,
    limit: 50,
    offset: 0,
  });

  // UI
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>('');

  // модалки
  const [filterVisible, setFilterVisible] = useState(false);
  const [periodVisible, setPeriodVisible] = useState(false);
  const [presetsVisible, setPresetsVisible] = useState(false);

  // загрузка справочника QR
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await getQRCodesList(200, 0, 'ACTIVE', true);
        if (!mounted) return;
        setQrCodes(res.data || []);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Ошибка загрузки QR');
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // вычисление from/to/bucket
  const computedRange = useMemo(() => {
    const now = new Date();
    const periodDef = PERIODS.find((p) => p.key === periodKey)!;

    let from: Date | null = null;
    let to: Date = now;

    if (periodKey === 'custom' && customFrom && customTo) {
      from = new Date(customFrom);
      to = new Date(customTo);
    } else {
      from = periodDef.subtract ? periodDef.subtract() : new Date(0);
    }

    // защита
    if (!from) from = new Date(0);
    if (from > to) [from, to] = [to, from];

    // bucket: час/день/месяц в зависимости от длины диапазона
    const diffMs = to.getTime() - from.getTime();
    const days = diffMs / (1000 * 60 * 60 * 24);
    const bucket: 'hour' | 'day' | 'month' =
      days <= 2 ? 'hour' : days <= 92 ? 'day' : 'month';

    return { fromISO: from.toISOString(), toISO: to.toISOString(), bucket, from, to };
  }, [periodKey, customFrom, customTo]);

  const periodLabel = useMemo(() => {
    if (periodKey === 'custom' && computedRange.from && computedRange.to) {
      return `${fmtDate(computedRange.from)} — ${fmtDate(computedRange.to)}`;
    }
    return PERIODS.find((p) => p.key === periodKey)?.label || '';
  }, [periodKey, computedRange]);

  // запрос аналитики
  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await getAnalytics({
        tz: 'Europe/Warsaw',
        bucket: computedRange.bucket,
        include: 'totals,series,breakdown',
        groupBy: 'qrId,device,browser',
        top: 50,
        ids: selectedIds.length ? selectedIds.join(',') : undefined,
        from: computedRange.fromISO,
        to: computedRange.toISO,
      });
      setAnalytics(payload);
    } catch (e: any) {
      setAnalytics(null);
      setError(e?.message || 'Не удалось получить аналитические данные');
    } finally {
      setLoading(false);
    }
  }, [selectedIds, computedRange]);

  // запрос ленты сканов (первая страница)
  const loadScansInitial = useCallback(async () => {
    try {
      const data = await getScans({
        ids: selectedIds.length ? selectedIds.join(',') : undefined,
        from: computedRange.fromISO,
        to: computedRange.toISO,
        limit: 50,
        offset: 0,
      });
      setScans(data.data || []);
      setScansMeta(data.meta || { total: 0, limit: 50, offset: 0 });
    } catch (e) {
      setScans([]);
      setScansMeta({ total: 0, limit: 50, offset: 0 });
    }
  }, [selectedIds, computedRange]);

  // догрузка ленты
  const loadMoreScans = useCallback(async () => {
    if (loadingMore) return;
    if (scans.length >= scansMeta.total) return;
    setLoadingMore(true);
    try {
      const nextOffset = scansMeta.offset + scansMeta.limit;
      const data = await getScans({
        ids: selectedIds.length ? selectedIds.join(',') : undefined,
        from: computedRange.fromISO,
        to: computedRange.toISO,
        limit: scansMeta.limit,
        offset: nextOffset,
      });
      setScans((prev) => [...prev, ...(data.data || [])]);
      setScansMeta(data.meta || scansMeta);
    } catch {}
    setLoadingMore(false);
  }, [loadingMore, scans.length, scansMeta, selectedIds, computedRange]);

  // перезагружать при смене фильтров/периода
  useEffect(() => {
    loadAnalytics();
    loadScansInitial();
  }, [loadAnalytics, loadScansInitial]);

  // обработчики
  const toggleQrSelection = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const applyPeriod = (key: PeriodKey, from?: Date | null, to?: Date | null) => {
    setPeriodKey(key);
    if (key === 'custom') {
      setCustomFrom(from || null);
      setCustomTo(to || null);
    } else {
      setCustomFrom(null);
      setCustomTo(null);
    }
    setPeriodVisible(false);
  };

  return (
    <View style={styles.container}>
      <AnalyticsHeader
        selectedCount={selectedIds.length}
        periodLabel={periodLabel}
        onOpenFilter={() => setFilterVisible(true)}
        onOpenPeriod={() => setPeriodVisible(true)}
        onOpenPresets={() => setPresetsVisible(true)}
      />

      {/* Ошибки */}
      {!!error && (
        <View style={styles.errorBox}>
          <Text style={{ color: '#B91C1C' }}>{error}</Text>
        </View>
      )}

      {/* Метрики + график */}
      {loading ? (
        <ChartSkeleton />
      ) : (
        <>
          <MetricsRow totals={analytics?.totals} colors={colors} />
          <LineChart
            colors={colors}
            range={{ from: computedRange.from, to: computedRange.to, bucket: computedRange.bucket }}
            series={(analytics?.series || []).map((p) => ({ ts: p.ts, value: p.scans }))}
            onPointPress={(pt) => console.log('point', pt)}
          />
        </>
      )}

      {/* Лента сканов */}
      <View style={{ marginTop: 16, flex: 1 }}>
        <Text style={styles.sectionTitle}>Последние сканы</Text>
        {loading ? (
          <View style={{ paddingVertical: 20, alignItems: 'center' }}>
            <ActivityIndicator />
          </View>
        ) : (
          <FlatList
            data={scans}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => {
              const qr = qrCodes.find((q) => q.id === item.qrListId);
              return (
                <View style={styles.scanCard}>
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
            }}
            contentContainerStyle={{ paddingBottom: 16 }}
            onEndReachedThreshold={0.4}
            onEndReached={loadMoreScans}
            ListFooterComponent={
              scans.length < scansMeta.total ? (
                <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={{ color: colors.secondaryText }}>{loadingMore ? 'Загрузка...' : 'Потяни ещё'}</Text>
                </View>
              ) : null
            }
          />
        )}
      </View>

      {/* ———— МОДАЛКИ (в КОНЦЕ JSX, чтобы портал не ломался) ———— */}
      <FilterModal
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        qrCodes={qrCodes}
        selectedIds={selectedIds}
        onToggle={toggleQrSelection}
        onClear={() => setSelectedIds([])}
        onApply={() => setFilterVisible(false)}
      />

      <PeriodModal
        visible={periodVisible}
        onClose={() => setPeriodVisible(false)}
        current={periodKey}
        currentFrom={customFrom}
        currentTo={customTo}
        onApply={applyPeriod}
      />

      <PresetsModal
        visible={presetsVisible}
        onClose={() => setPresetsVisible(false)}
        onApply={(preset) => {
          applyPeriod(preset.period, preset.from ? new Date(preset.from) : null, preset.to ? new Date(preset.to) : null);
          setSelectedIds(preset.ids || []);
        }}
        onDeletePreset={(name) => console.log('delete preset', name)}
      />
    </View>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      padding: 16,
      backgroundColor: colors.background,
      maxWidth: 1000,
      width: '100%',
      alignSelf: 'center',
    },
    sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 8 },
    errorBox: { backgroundColor: '#fee2e2', borderRadius: 8, padding: 10, marginTop: 8 },
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
