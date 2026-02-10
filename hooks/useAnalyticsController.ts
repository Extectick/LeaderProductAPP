// components/analytics/useAnalyticsController.ts
import { PERIODS, type PeriodKey } from '@/components/QRcodes/Analytics/PeriodModal';
import type { AnalyticsPayload, QRCodeItemType, ScanRow } from '@/types/qrTypes';
import { getAnalytics, getQRCodesList, getScans } from '@/utils/qrService';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export function useAnalyticsController() {
  // справочник QR
  const [qrCodes, setQrCodes] = useState<QRCodeItemType[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // период
  const [periodKey, setPeriodKey] = useState<PeriodKey>('30d');
  const [customFrom, setCustomFrom] = useState<Date | null>(null);
  const [customTo, setCustomTo] = useState<Date | null>(null);

  // данные
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [scansMeta, setScansMeta] = useState<{ total: number; limit: number; offset: number }>({
    total: 0,
    limit: 50,
    offset: 0,
  });

  // heatmap
  const [heatmapData, setHeatmapData] = useState<{ date: string | Date; value: number }[]>([]);
  const [heatmapLoading, setHeatmapLoading] = useState(true);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());

  // zoom
  const [chartZoom, setChartZoom] = useState<{ from: Date; to: Date } | null>(null);
  const prevPeriodRef = useRef<{ key: PeriodKey; from: Date | null; to: Date | null } | null>(null);

  // ui flags
  const [loading, setLoading] = useState(true);
  const [scansLoading, setScansLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>('');

  // tz устройства
  const deviceTZ = useMemo(
    () => (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),
    []
  );

  // первый заход — загрузим список QR
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
    return () => { mounted = false; };
  }, []);

  // вычисление интервала
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

    if (!from) from = new Date(0);
    if (from > to) [from, to] = [to, from];

    const diffMs = to.getTime() - from.getTime();
    const days = diffMs / (1000 * 60 * 60 * 24);
    const bucket: 'hour' | 'day' | 'month' = days <= 2 ? 'hour' : days <= 92 ? 'day' : 'month';

    return { fromISO: from.toISOString(), toISO: to.toISOString(), bucket, from, to };
  }, [periodKey, customFrom, customTo]);

  // подпись периода
  const periodLabel = useMemo(() => {
    const fmt = (d: Date) => `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
    if (periodKey === 'custom' && computedRange.from && computedRange.to) {
      return `${fmt(computedRange.from)} — ${fmt(computedRange.to)}`;
    }
    return PERIODS.find((p) => p.key === periodKey)?.label || '';
  }, [periodKey, computedRange]);

  // синхронизируем календарь с правой границей
  useEffect(() => {
    if (computedRange?.to) setCalendarMonth(new Date(computedRange.to));
  }, [computedRange?.to]);

  // загрузка аналитики (линии/метрики)
  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await getAnalytics({
        tz: deviceTZ,
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
  }, [selectedIds, computedRange, deviceTZ]);

  // heatmap — всегда bucket day
  const loadHeatmap = useCallback(async () => {
    setHeatmapLoading(true);
    try {
      const payload = await getAnalytics({
        tz: deviceTZ,
        bucket: 'day',
        include: 'series',
        ids: selectedIds.length ? selectedIds.join(',') : undefined,
        from: computedRange.fromISO,
        to: computedRange.toISO,
      });
      const series = payload?.series || [];
      setHeatmapData(series.map((p) => ({ date: p.ts, value: p.scans })));
    } catch {
      setHeatmapData([]);
    } finally {
      setHeatmapLoading(false);
    }
  }, [selectedIds, computedRange, deviceTZ]);

  // первая страница сканов
  const loadScansInitial = useCallback(async () => {
    setScansLoading(true);
    try {
      const data = await getScans({
        tz: deviceTZ,
        ids: selectedIds.length ? selectedIds.join(',') : undefined,
        from: computedRange.fromISO,
        to: computedRange.toISO,
        limit: 50,
        offset: 0,
      });
      setScans(data.data || []);
      setScansMeta(data.meta || { total: 0, limit: 50, offset: 0 });
    } catch {
      setScans([]);
      setScansMeta({ total: 0, limit: 50, offset: 0 });
    } finally {
      setScansLoading(false);
    }
  }, [selectedIds, computedRange, deviceTZ]);

  // догрузка
  const loadMoreScans = useCallback(async () => {
    if (loadingMore) return;
    if (scans.length >= scansMeta.total) return;
    setLoadingMore(true);
    try {
      const nextOffset = scansMeta.offset + scansMeta.limit;
      const data = await getScans({
        tz: deviceTZ,
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
  }, [loadingMore, scans.length, scansMeta, selectedIds, computedRange, deviceTZ]);

  // реакция на смену фильтров/периода
  useEffect(() => {
    loadAnalytics();
    loadHeatmap();
    loadScansInitial();
  }, [loadAnalytics, loadHeatmap, loadScansInitial]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadAnalytics(), loadHeatmap(), loadScansInitial()]);
    setRefreshing(false);
  }, [loadAnalytics, loadHeatmap, loadScansInitial]);

  // handlers
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
  };

  const requestZoom = ({ from, to }: { from: Date; to: Date }) => {
    prevPeriodRef.current = { key: periodKey, from: customFrom, to: customTo };
    setChartZoom({ from, to });
    setPeriodKey('custom');
    setCustomFrom(from);
    setCustomTo(to);
  };

  const clearZoom = () => {
    const prev = prevPeriodRef.current;
    setChartZoom(null);
    if (prev) {
      setPeriodKey(prev.key);
      setCustomFrom(prev.from);
      setCustomTo(prev.to);
    } else {
      setPeriodKey('30d');
      setCustomFrom(null);
      setCustomTo(null);
    }
  };

  return {
    // data
    qrCodes,
    selectedIds,
    analytics,
    scans,
    scansMeta,
    heatmapData,

    // period & zoom
    periodKey,
    customFrom,
    customTo,
    periodLabel,
    computedRange,
    chartZoom,
    calendarMonth,

    // flags
    loading,
    scansLoading,
    loadingMore,
    refreshing,
    heatmapLoading,
    error,

    // actions
    setCalendarMonth,
    toggleQrSelection,
    applyPeriod,
    requestZoom,
    clearZoom,
    loadMoreScans,
    onRefresh,
  };
}
