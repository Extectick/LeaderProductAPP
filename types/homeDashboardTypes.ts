import type { AppealPriority, AppealStatus } from '@/types/appealsTypes';
import type { ServiceAccessItem } from '@/utils/servicesService';

export type HomeMetricId =
  | 'open_appeals'
  | 'my_tasks'
  | 'daily_scans'
  | 'unread_messages'
  | 'urgent_deadlines';

export type HomeMetricState = 'loading' | 'ready' | 'locked' | 'error';

export type HomeMetricTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export type HomeMetricCard = {
  id: HomeMetricId;
  title: string;
  description: string;
  value: number | null;
  state: HomeMetricState;
  tone: HomeMetricTone;
  icon: string;
  hint?: string;
};

export type HomeSeriesPoint = {
  ts: string;
  scans: number;
};

export type HomeActivityItem = {
  id: string;
  appealId: number;
  number: number;
  title: string;
  subtitle: string;
  messagePreview: string;
  lastSenderName: string | null;
  unreadCount: number;
  assigneeCount: number;
  departmentName: string | null;
  deadline: string | null;
  status: AppealStatus;
  priority: AppealPriority;
  updatedAt: string;
  route: string;
};

export type HomeDashboardData = {
  metrics: Record<HomeMetricId, HomeMetricCard>;
  scansSeries: HomeSeriesPoint[];
  scansSeriesState: HomeMetricState;
  scansSeriesMessage?: string;
  activity: HomeActivityItem[];
  activityState: HomeMetricState;
  activityMessage?: string;
  lastUpdatedAt: string | null;
};

export type HomeResolvedMetricState = Exclude<HomeMetricState, 'loading'>;

export type HomeDashboardMetricDto = {
  state: HomeResolvedMetricState;
  value: number | null;
  message?: string;
};

export type HomeDashboardDto = {
  metrics: Partial<Record<HomeMetricId, HomeDashboardMetricDto>>;
  scansSeries?: HomeSeriesPoint[];
  scansSeriesState?: HomeResolvedMetricState;
  scansSeriesMessage?: string;
  activity?: HomeActivityItem[];
  activityState?: HomeResolvedMetricState;
  activityMessage?: string;
  lastUpdatedAt?: string | null;
};

export type HomeDashboardBundleDto = {
  dashboard?: HomeDashboardDto;
  services?: ServiceAccessItem[];
};
