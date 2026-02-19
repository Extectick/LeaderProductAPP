import type { AppealCounters, AppealListItem, AppealStatus, Scope } from '@/src/entities/appeal/types';
import type {
  HomeActivityItem,
  HomeDashboardBundleDto,
  HomeDashboardData,
  HomeMetricCard,
  HomeMetricId,
  HomeMetricState,
  HomeSeriesPoint,
} from '@/src/entities/home/types';
import { apiClient } from '@/utils/apiClient';
import { API_ENDPOINTS } from '@/utils/apiEndpoints';
import type { ServiceAccessItem } from '@/utils/servicesService';

type ResolvedMetricState = Exclude<HomeMetricState, 'loading'>;

export type MetricFetchResult = {
  state: ResolvedMetricState;
  value: number | null;
  message?: string;
};

export type SeriesFetchResult = {
  state: ResolvedMetricState;
  series: HomeSeriesPoint[];
  message?: string;
};

export type ActivityFetchResult = {
  state: ResolvedMetricState;
  items: HomeActivityItem[];
  message?: string;
};

export type SecondaryCountersFetchResult = {
  unreadMessages: MetricFetchResult;
  urgentDeadlines: MetricFetchResult;
};

const HOME_METRIC_META: Record<HomeMetricId, Omit<HomeMetricCard, 'value' | 'state' | 'hint'>> = {
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

function createMetricCard(id: HomeMetricId): HomeMetricCard {
  return {
    ...HOME_METRIC_META[id],
    value: null,
    state: 'loading',
  };
}

export function createInitialHomeDashboard(): HomeDashboardData {
  return {
    metrics: {
      open_appeals: createMetricCard('open_appeals'),
      my_tasks: createMetricCard('my_tasks'),
      daily_scans: createMetricCard('daily_scans'),
      unread_messages: createMetricCard('unread_messages'),
      urgent_deadlines: createMetricCard('urgent_deadlines'),
    },
    scansSeries: [],
    scansSeriesState: 'loading',
    activity: [],
    activityState: 'loading',
    lastUpdatedAt: null,
  };
}

export type HomeDashboardBundleResult = {
  dashboard: HomeDashboardData;
  services: ServiceAccessItem[];
};

type AppealListEnvelope = {
  data: AppealListItem[];
  meta: { total: number; limit: number; offset: number };
};

type QRAnalyticsEnvelope = {
  totals?: {
    scans?: number;
  };
  series?: Array<{ ts: string; scans: number }>;
};

const ACTIVE_APPEAL_STATUSES: AppealStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED'];
const DEADLINE_URGENCY_HOURS = 48;
const ASSIGNED_DEADLINE_PAGE_LIMIT = 80;
const ASSIGNED_DEADLINE_MAX_PAGES = 1;

function getLocalTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function toIso(value: Date): string {
  return value.toISOString();
}

function metricError(message?: string): MetricFetchResult {
  return {
    state: 'error',
    value: null,
    message: message || 'Не удалось получить данные',
  };
}

function metricLocked(message?: string): MetricFetchResult {
  return {
    state: 'locked',
    value: null,
    message: message || 'Недостаточно прав доступа',
  };
}

function resolveApiMessage(status: number, message?: string): string {
  if (status === 0) return 'Ошибка сети. Проверьте соединение';
  return message || 'Не удалось получить данные';
}

function normalizeResolvedState(state: unknown, fallback: ResolvedMetricState = 'error'): ResolvedMetricState {
  return state === 'ready' || state === 'locked' || state === 'error' ? state : fallback;
}

function normalizeServiceItem(raw: Partial<ServiceAccessItem>): ServiceAccessItem {
  return {
    id: Number(raw.id || 0),
    key: String(raw.key || ''),
    name: String(raw.name || ''),
    kind: raw.kind === 'LOCAL' ? 'LOCAL' : 'CLOUD',
    route: raw.route ?? null,
    icon: raw.icon ?? null,
    description: raw.description ?? null,
    gradientStart: raw.gradientStart ?? null,
    gradientEnd: raw.gradientEnd ?? null,
    visible: raw.visible !== false,
    enabled: raw.enabled !== false,
  };
}

function mapDashboardBundle(dto?: HomeDashboardBundleDto): HomeDashboardBundleResult {
  const dashboardDto = dto?.dashboard || null;
  const base = createInitialHomeDashboard();
  const metricIds: HomeMetricId[] = ['open_appeals', 'my_tasks', 'daily_scans', 'unread_messages', 'urgent_deadlines'];
  const nextMetrics: HomeDashboardData['metrics'] = { ...base.metrics };

  metricIds.forEach((metricId) => {
    const rawMetric = dashboardDto?.metrics?.[metricId];
    if (!rawMetric) return;
    nextMetrics[metricId] = {
      ...nextMetrics[metricId],
      state: normalizeResolvedState(rawMetric.state, 'error'),
      value: rawMetric.value ?? null,
      hint: rawMetric.message,
    };
  });

  const servicesRaw = Array.isArray(dto?.services) ? dto?.services : [];

  return {
    dashboard: {
      ...base,
      metrics: nextMetrics,
      scansSeries: Array.isArray(dashboardDto?.scansSeries) ? dashboardDto!.scansSeries : [],
      scansSeriesState: normalizeResolvedState(dashboardDto?.scansSeriesState, 'error'),
      scansSeriesMessage: dashboardDto?.scansSeriesMessage,
      activity: Array.isArray(dashboardDto?.activity) ? dashboardDto!.activity : [],
      activityState: normalizeResolvedState(dashboardDto?.activityState, 'error'),
      activityMessage: dashboardDto?.activityMessage,
      lastUpdatedAt: dashboardDto?.lastUpdatedAt || new Date().toISOString(),
    },
    services: servicesRaw.map((item) => normalizeServiceItem(item)),
  };
}

export async function fetchHomeDashboardBundle(): Promise<HomeDashboardBundleResult> {
  const response = await apiClient<void, HomeDashboardBundleDto>(API_ENDPOINTS.HOME.DASHBOARD, {
    method: 'GET',
  });
  if (!response.ok) {
    throw new Error(resolveApiMessage(response.status, response.message));
  }
  return mapDashboardBundle(response.data);
}

function buildAppealsListPath(
  scope: Scope,
  status: AppealStatus,
  limit: number,
  offset: number
): string {
  const params = new URLSearchParams({
    scope,
    status,
    limit: String(limit),
    offset: String(offset),
  });
  return `/appeals?${params.toString()}`;
}

async function requestAppealsList(
  scope: Scope,
  status: AppealStatus,
  limit: number,
  offset: number
) {
  return apiClient<void, AppealListEnvelope>(buildAppealsListPath(scope, status, limit, offset), {
    method: 'GET',
  });
}

async function requestAppealsTotal(scope: Scope, status: AppealStatus) {
  const response = await requestAppealsList(scope, status, 1, 0);
  const total = response.ok ? Number(response.data?.meta?.total || 0) : 0;
  return { response, total };
}

function mapActivityItem(item: AppealListItem): HomeActivityItem {
  const lastMessageText = String(item.lastMessage?.text || '')
    .replace(/\s+/g, ' ')
    .trim();
  const sender = item.lastMessage?.sender;
  const senderNameRaw = [sender?.firstName, sender?.lastName].filter(Boolean).join(' ').trim();
  const senderName = senderNameRaw || sender?.email || null;
  const messagePreview = lastMessageText || (item.lastMessage?.attachments?.length ? 'Добавлено вложение' : 'Без комментариев');
  const subtitle = lastMessageText
    ? lastMessageText
    : `Приоритет: ${item.priority.toLowerCase()}`;

  return {
    id: `appeal-${item.id}`,
    appealId: item.id,
    number: item.number,
    title: item.title?.trim() || `Обращение #${item.number}`,
    subtitle,
    messagePreview,
    lastSenderName: senderName,
    unreadCount: Math.max(0, Number(item.unreadCount || 0)),
    assigneeCount: Array.isArray(item.assignees) ? item.assignees.length : 0,
    departmentName: item.toDepartment?.name || null,
    deadline: item.deadline || null,
    status: item.status,
    priority: item.priority,
    updatedAt: item.lastMessage?.createdAt || item.createdAt,
    route: `/services/appeals/${item.id}`,
  };
}

async function fetchAssignedAppealsChunk(status: AppealStatus, limit: number, offset: number) {
  return apiClient<void, AppealListEnvelope>(
    `/appeals?${new URLSearchParams({
      scope: 'assigned',
      status,
      limit: String(limit),
      offset: String(offset),
    }).toString()}`,
    { method: 'GET' }
  );
}

async function fetchAssignedAppealsForUrgency(): Promise<
  { state: 'ready'; items: AppealListItem[] } | { state: 'locked'; message?: string } | { state: 'error'; message?: string }
> {
  const out: AppealListItem[] = [];

  for (const status of ACTIVE_APPEAL_STATUSES) {
    let offset = 0;
    for (let page = 0; page < ASSIGNED_DEADLINE_MAX_PAGES; page += 1) {
      const response = await fetchAssignedAppealsChunk(status, ASSIGNED_DEADLINE_PAGE_LIMIT, offset);
      if (!response.ok) {
        if (response.status === 403) {
          return { state: 'locked', message: resolveApiMessage(403, response.message) };
        }
        return { state: 'error', message: resolveApiMessage(response.status, response.message) };
      }

      const chunk = response.data?.data || [];
      const total = Number(response.data?.meta?.total || 0);
      out.push(...chunk);

      offset += ASSIGNED_DEADLINE_PAGE_LIMIT;
      if (!chunk.length || offset >= total) {
        break;
      }
    }
  }

  return { state: 'ready', items: out };
}

export async function fetchOpenAppealsCount(): Promise<MetricFetchResult> {
  const department = await requestAppealsTotal('department', 'OPEN');
  if (department.response.ok) {
    return { state: 'ready', value: department.total };
  }
  if (department.response.status === 403) {
    return metricLocked(resolveApiMessage(403, department.response.message));
  }
  if (department.response.status !== 400) {
    return metricError(resolveApiMessage(department.response.status, department.response.message));
  }

  const mine = await requestAppealsTotal('my', 'OPEN');
  if (mine.response.ok) {
    return { state: 'ready', value: mine.total };
  }
  if (mine.response.status === 403) {
    return metricLocked(resolveApiMessage(403, mine.response.message));
  }
  return metricError(resolveApiMessage(mine.response.status, mine.response.message));
}

export async function fetchMyAcceptedTasksCount(): Promise<MetricFetchResult> {
  const [inProgress, resolved] = await Promise.all([
    requestAppealsTotal('assigned', 'IN_PROGRESS'),
    requestAppealsTotal('assigned', 'RESOLVED'),
  ]);

  const responses = [inProgress.response, resolved.response];
  if (responses.some((res) => res.status === 403)) {
    return metricLocked(resolveApiMessage(403, responses.find((res) => res.status === 403)?.message));
  }
  const failed = responses.find((res) => !res.ok);
  if (failed) {
    return metricError(resolveApiMessage(failed.status, failed.message));
  }

  return { state: 'ready', value: inProgress.total + resolved.total };
}

export async function fetchDailyScans24h(): Promise<MetricFetchResult> {
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    from: toIso(from),
    to: toIso(now),
    tz: getLocalTimeZone(),
    include: 'totals',
  });

  const response = await apiClient<void, QRAnalyticsEnvelope>(`/qr/analytics?${params.toString()}`, {
    method: 'GET',
  });
  if (!response.ok) {
    if (response.status === 403) return metricLocked(resolveApiMessage(403, response.message));
    return metricError(resolveApiMessage(response.status, response.message));
  }

  return {
    state: 'ready',
    value: Number(response.data?.totals?.scans || 0),
  };
}

export async function fetchScans7dSeries(): Promise<SeriesFetchResult> {
  const now = new Date();
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    from: toIso(from),
    to: toIso(now),
    tz: getLocalTimeZone(),
    bucket: 'day',
    include: 'series',
  });

  const response = await apiClient<void, QRAnalyticsEnvelope>(`/qr/analytics?${params.toString()}`, {
    method: 'GET',
  });
  if (!response.ok) {
    if (response.status === 403) {
      return { state: 'locked', series: [], message: resolveApiMessage(403, response.message) };
    }
    return { state: 'error', series: [], message: resolveApiMessage(response.status, response.message) };
  }

  const series = (response.data?.series || [])
    .filter((point) => point && point.ts)
    .map((point) => ({
      ts: point.ts,
      scans: Number(point.scans || 0),
    }))
    .sort((a, b) => +new Date(a.ts) - +new Date(b.ts))
    .slice(-7);

  return { state: 'ready', series };
}

export async function fetchHomeActivityFeed(limit = 6): Promise<ActivityFetchResult> {
  const departmentResponse = await apiClient<void, AppealListEnvelope>(
    `/appeals?${new URLSearchParams({
      scope: 'department',
      limit: String(limit),
      offset: '0',
    }).toString()}`,
    { method: 'GET' }
  );

  if (departmentResponse.ok) {
    return {
      state: 'ready',
      items: (departmentResponse.data?.data || []).map(mapActivityItem),
    };
  }
  if (departmentResponse.status === 403) {
    return { state: 'locked', items: [], message: resolveApiMessage(403, departmentResponse.message) };
  }
  if (departmentResponse.status !== 400) {
    return {
      state: 'error',
      items: [],
      message: resolveApiMessage(departmentResponse.status, departmentResponse.message),
    };
  }

  const myResponse = await apiClient<void, AppealListEnvelope>(
    `/appeals?${new URLSearchParams({
      scope: 'my',
      limit: String(limit),
      offset: '0',
    }).toString()}`,
    { method: 'GET' }
  );
  if (myResponse.ok) {
    return {
      state: 'ready',
      items: (myResponse.data?.data || []).map(mapActivityItem),
    };
  }
  if (myResponse.status === 403) {
    return { state: 'locked', items: [], message: resolveApiMessage(403, myResponse.message) };
  }
  return { state: 'error', items: [], message: resolveApiMessage(myResponse.status, myResponse.message) };
}

export async function fetchSecondaryCounters(): Promise<SecondaryCountersFetchResult> {
  const countersPromise = apiClient<void, AppealCounters>('/appeals/counters', { method: 'GET' });
  const urgencyPromise = fetchAssignedAppealsForUrgency();

  const [countersResponse, urgencyResponse] = await Promise.all([countersPromise, urgencyPromise]);

  let unreadMessages: MetricFetchResult;
  if (!countersResponse.ok) {
    unreadMessages =
      countersResponse.status === 403
        ? metricLocked(resolveApiMessage(403, countersResponse.message))
        : metricError(resolveApiMessage(countersResponse.status, countersResponse.message));
  } else {
    unreadMessages = {
      state: 'ready',
      value: Number(countersResponse.data?.my?.unreadMessagesCount || 0),
    };
  }

  let urgentDeadlines: MetricFetchResult;
  if (urgencyResponse.state === 'locked') {
    urgentDeadlines = metricLocked(urgencyResponse.message);
  } else if (urgencyResponse.state === 'error') {
    urgentDeadlines = metricError(urgencyResponse.message);
  } else {
    const now = Date.now();
    const threshold = now + DEADLINE_URGENCY_HOURS * 60 * 60 * 1000;
    const ids = new Set<number>();

    urgencyResponse.items.forEach((appeal) => {
      if (!appeal.deadline) return;
      const ts = +new Date(appeal.deadline);
      if (!Number.isFinite(ts)) return;
      if (ts <= threshold) {
        ids.add(appeal.id);
      }
    });

    urgentDeadlines = { state: 'ready', value: ids.size };
  }

  return {
    unreadMessages,
    urgentDeadlines,
  };
}

