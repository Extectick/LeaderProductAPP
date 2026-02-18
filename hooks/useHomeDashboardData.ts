import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import React from 'react';

import type { HomeDashboardData, HomeMetricCard, HomeMetricId } from '@/types/homeDashboardTypes';
import {
  fetchDailyScans24h,
  fetchHomeActivityFeed,
  fetchMyAcceptedTasksCount,
  fetchOpenAppealsCount,
  fetchScans7dSeries,
  fetchSecondaryCounters,
  type ActivityFetchResult,
  type MetricFetchResult,
  type SecondaryCountersFetchResult,
  type SeriesFetchResult,
} from '@/utils/homeDashboardService';

const CACHE_KEY = 'home_dashboard_cache_v1';
const AUTO_REFRESH_MS = 30_000;

type DashboardSnapshot = {
  updatedAt: string;
  data: HomeDashboardData;
};

const METRIC_META: Record<
  HomeMetricId,
  Omit<HomeMetricCard, 'value' | 'state' | 'hint'>
> = {
  open_appeals: {
    id: 'open_appeals',
    title: 'Новые обращения',
    description: 'Открытые обращения в вашем отделе',
    tone: 'info',
    icon: 'mail-unread-outline',
  },
  my_tasks: {
    id: 'my_tasks',
    title: 'Мои задачи',
    description: 'Принятые мной обращения в работе',
    tone: 'success',
    icon: 'checkbox-outline',
  },
  daily_scans: {
    id: 'daily_scans',
    title: 'Сканов за 24 часа',
    description: 'Количество сканов ваших QR-кодов',
    tone: 'warning',
    icon: 'qr-code-outline',
  },
  unread_messages: {
    id: 'unread_messages',
    title: 'Непрочитанные',
    description: 'Новые сообщения по вашим обращениям',
    tone: 'neutral',
    icon: 'chatbubble-ellipses-outline',
  },
  urgent_deadlines: {
    id: 'urgent_deadlines',
    title: 'Срочные дедлайны',
    description: 'Дедлайн в ближайшие 48 часов',
    tone: 'danger',
    icon: 'alarm-outline',
  },
};

function createMetric(id: HomeMetricId): HomeMetricCard {
  return {
    ...METRIC_META[id],
    value: null,
    state: 'loading',
  };
}

function createInitialDashboard(): HomeDashboardData {
  return {
    metrics: {
      open_appeals: createMetric('open_appeals'),
      my_tasks: createMetric('my_tasks'),
      daily_scans: createMetric('daily_scans'),
      unread_messages: createMetric('unread_messages'),
      urgent_deadlines: createMetric('urgent_deadlines'),
    },
    scansSeries: [],
    scansSeriesState: 'loading',
    activity: [],
    activityState: 'loading',
    lastUpdatedAt: null,
  };
}

function buildMetricState(
  previous: HomeMetricCard,
  result: PromiseSettledResult<MetricFetchResult>
): HomeMetricCard {
  if (result.status === 'fulfilled') {
    return {
      ...previous,
      value: result.value.value,
      state: result.value.state,
      hint: result.value.message,
    };
  }
  return {
    ...previous,
    state: 'error',
    hint: result.reason instanceof Error ? result.reason.message : 'Не удалось получить данные',
  };
}

function buildSeriesState(
  previous: HomeDashboardData,
  result: PromiseSettledResult<SeriesFetchResult>
): Pick<HomeDashboardData, 'scansSeries' | 'scansSeriesState' | 'scansSeriesMessage'> {
  if (result.status === 'fulfilled') {
    return {
      scansSeries: result.value.series,
      scansSeriesState: result.value.state,
      scansSeriesMessage: result.value.message,
    };
  }
  return {
    scansSeries: previous.scansSeries,
    scansSeriesState: 'error',
    scansSeriesMessage: result.reason instanceof Error ? result.reason.message : 'Не удалось построить график',
  };
}

function buildActivityState(
  previous: HomeDashboardData,
  result: PromiseSettledResult<ActivityFetchResult>
): Pick<HomeDashboardData, 'activity' | 'activityState' | 'activityMessage'> {
  if (result.status === 'fulfilled') {
    return {
      activity: result.value.items,
      activityState: result.value.state,
      activityMessage: result.value.message,
    };
  }
  return {
    activity: previous.activity,
    activityState: 'error',
    activityMessage: result.reason instanceof Error ? result.reason.message : 'Не удалось загрузить ленту',
  };
}

function buildSecondaryState(
  previous: HomeDashboardData,
  result: PromiseSettledResult<SecondaryCountersFetchResult>
) {
  if (result.status === 'fulfilled') {
    return {
      unread_messages: {
        ...previous.metrics.unread_messages,
        value: result.value.unreadMessages.value,
        state: result.value.unreadMessages.state,
        hint: result.value.unreadMessages.message,
      },
      urgent_deadlines: {
        ...previous.metrics.urgent_deadlines,
        value: result.value.urgentDeadlines.value,
        state: result.value.urgentDeadlines.state,
        hint: result.value.urgentDeadlines.message,
      },
    };
  }

  const fallbackMessage =
    result.reason instanceof Error ? result.reason.message : 'Не удалось загрузить дополнительные метрики';

  return {
    unread_messages: {
      ...previous.metrics.unread_messages,
      state: 'error' as const,
      hint: fallbackMessage,
    },
    urgent_deadlines: {
      ...previous.metrics.urgent_deadlines,
      state: 'error' as const,
      hint: fallbackMessage,
    },
  };
}

function parseSnapshot(raw: string | null): DashboardSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DashboardSnapshot;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.data || typeof parsed.data !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function useHomeDashboardData() {
  const requestIdRef = React.useRef(0);
  const mountedRef = React.useRef(true);
  const inFlightRef = React.useRef(false);

  const [dashboard, setDashboard] = React.useState<HomeDashboardData>(createInitialDashboard);
  const [refreshing, setRefreshing] = React.useState(false);
  const [initialLoading, setInitialLoading] = React.useState(true);
  const [cacheHydrated, setCacheHydrated] = React.useState(false);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (cancelled) return;
      const snapshot = parseSnapshot(raw);
      if (snapshot?.data) {
        setDashboard(snapshot.data);
        setInitialLoading(false);
      }
      setCacheHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = React.useCallback(async (opts?: { silent?: boolean }) => {
    if (inFlightRef.current) return;
    const silent = Boolean(opts?.silent);
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    inFlightRef.current = true;

    if (!silent) setRefreshing(true);
    try {
      const settled = await Promise.allSettled([
        fetchOpenAppealsCount(),
        fetchMyAcceptedTasksCount(),
        fetchDailyScans24h(),
        fetchScans7dSeries(),
        fetchHomeActivityFeed(6),
        fetchSecondaryCounters(),
      ]);

      if (!mountedRef.current || requestId !== requestIdRef.current) return;

      setDashboard((previous) => {
        const next: HomeDashboardData = {
          ...previous,
          metrics: {
            ...previous.metrics,
            open_appeals: buildMetricState(previous.metrics.open_appeals, settled[0] as PromiseSettledResult<MetricFetchResult>),
            my_tasks: buildMetricState(previous.metrics.my_tasks, settled[1] as PromiseSettledResult<MetricFetchResult>),
            daily_scans: buildMetricState(previous.metrics.daily_scans, settled[2] as PromiseSettledResult<MetricFetchResult>),
          },
          ...buildSeriesState(previous, settled[3] as PromiseSettledResult<SeriesFetchResult>),
          ...buildActivityState(previous, settled[4] as PromiseSettledResult<ActivityFetchResult>),
          lastUpdatedAt: new Date().toISOString(),
        };

        const secondary = buildSecondaryState(previous, settled[5] as PromiseSettledResult<SecondaryCountersFetchResult>);
        next.metrics.unread_messages = secondary.unread_messages;
        next.metrics.urgent_deadlines = secondary.urgent_deadlines;

        void AsyncStorage.setItem(
          CACHE_KEY,
          JSON.stringify({
            updatedAt: new Date().toISOString(),
            data: next,
          } as DashboardSnapshot)
        );

        return next;
      });

      setInitialLoading(false);
    } finally {
      inFlightRef.current = false;
      if (!silent && mountedRef.current) setRefreshing(false);
    }
  }, []);

  const onRefresh = React.useCallback(async () => {
    await load({ silent: false });
  }, [load]);

  useFocusEffect(
    React.useCallback(() => {
      void load({ silent: !cacheHydrated });
      const timer = setInterval(() => {
        void load({ silent: true });
      }, AUTO_REFRESH_MS);

      return () => {
        clearInterval(timer);
        requestIdRef.current += 1;
      };
    }, [cacheHydrated, load])
  );

  return {
    dashboard,
    refreshing,
    initialLoading,
    onRefresh,
    reload: load,
  };
}
