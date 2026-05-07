import { apiClient } from './apiClient';
import { API_ENDPOINTS } from './apiEndpoints';

export type OnecLpAppDebugKey = 'ping' | 'users' | 'transport-tasks' | 'route-order' | 'to-loading';
export type OnecLpAppHttpMethod = 'GET' | 'POST';

export type OnecLpAppUser = {
  guid: string;
  name: string;
  physicalPersonGuid?: string | null;
  physicalPersonName?: string | null;
  inactive?: boolean;
};

export type OnecLpAppUsersResponse = {
  users?: OnecLpAppUser[];
  body?: {
    users?: OnecLpAppUser[];
  };
};

export type OnecLpAppRouteOrder = {
  orderGuid?: string | null;
  orderPresentation?: string | null;
  recipient?: string | null;
};

export type OnecLpAppDeparturePointSource = 'PRESET' | 'CUSTOM_MAP' | 'DEVICE_LOCATION';

export type OnecLpAppDeparturePointPresetKey = 'omsk' | 'novosibirsk';

export type OnecLpAppDeparturePointPreset = {
  key: OnecLpAppDeparturePointPresetKey;
  label: string;
  latitude: number;
  longitude: number;
  address?: string | null;
};

export type OnecLpAppDeparturePoint = {
  source: OnecLpAppDeparturePointSource;
  presetKey?: OnecLpAppDeparturePointPresetKey | null;
  latitude: number;
  longitude: number;
  address?: string | null;
  updatedAt?: string | null;
};

export type OnecLpAppRoutePoint = {
  routeLineNumber?: number | null;
  linkKey: string;
  address?: string | null;
  zone?: string | null;
  deliveryTimeFrom?: string | null;
  deliveryTimeTo?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  weight?: number | null;
  volume?: number | null;
  additionalInfo?: string | null;
  orders?: OnecLpAppRouteOrder[];
};

export type OnecLpAppTransportTask = {
  guid: string;
  number?: string | null;
  date?: string | null;
  status?: string | null;
  driverGuid?: string | null;
  driverUserGuid?: string | null;
  driverPhysicalPersonGuid?: string | null;
  driverPhysicalPersonName?: string | null;
  authorGuid?: string | null;
  authorName?: string | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  routePointsCount?: number | null;
  route?: OnecLpAppRoutePoint[];
};

export type OnecLpAppTransportTasksResponse = {
  tasks?: OnecLpAppTransportTask[];
  limit?: number;
  offset?: number;
  hasMore?: boolean;
  body?: {
    tasks?: OnecLpAppTransportTask[];
    limit?: number;
    offset?: number;
    hasMore?: boolean;
  };
};

export type OnecLpAppTransportTaskResponse = {
  task?: OnecLpAppTransportTask;
  body?: {
    task?: OnecLpAppTransportTask;
  };
};

export type OnecLpAppDeparturePointSettingsResponse = {
  presets?: OnecLpAppDeparturePointPreset[];
  departurePoint?: OnecLpAppDeparturePoint | null;
  requiresInitialSelection?: boolean;
  body?: {
    presets?: OnecLpAppDeparturePointPreset[];
    departurePoint?: OnecLpAppDeparturePoint | null;
    requiresInitialSelection?: boolean;
  };
};

export type OnecLpAppTransportTasksQuery = {
  driverGuid?: string;
  driverUserGuid?: string;
  driverPhysicalPersonGuid?: string;
  authorGuid?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
};

export type OnecLpAppRouteOrderPayload = {
  driverGuid?: string;
  driverUserGuid?: string;
  driverPhysicalPersonGuid?: string;
  route: Array<{
    linkKey: string;
    order: number;
  }>;
};

export type OnecLpAppRouteOrderResponse = {
  status?: string;
  taskGuid?: string;
  taskStatus?: string;
  route?: OnecLpAppRoutePoint[];
  task?: OnecLpAppTransportTask;
  body?: {
    status?: string;
    taskGuid?: string;
    taskStatus?: string;
    route?: OnecLpAppRoutePoint[];
    task?: OnecLpAppTransportTask;
  };
};

export type OnecLpAppToLoadingResponse = OnecLpAppRouteOrderResponse;

export type OnecLpAppDeparturePointSettingsPayload =
  | {
      source: 'PRESET';
      presetKey: OnecLpAppDeparturePointPresetKey;
    }
  | {
      source: 'CUSTOM_MAP' | 'DEVICE_LOCATION';
      latitude: number;
      longitude: number;
      address?: string | null;
    };

export type OnecLpAppDeparturePointSettingsResult = {
  presets: OnecLpAppDeparturePointPreset[];
  departurePoint: OnecLpAppDeparturePoint | null;
  requiresInitialSelection: boolean;
};

export type OnecLpAppDebugResult<T = unknown> = {
  key: OnecLpAppDebugKey;
  label: string;
  method: OnecLpAppHttpMethod;
  path: string;
  status: number;
  ok: boolean;
  durationMs: number;
  requestedAt: string;
  request?: {
    query?: OnecLpAppTransportTasksQuery;
    body?: unknown;
  };
  data?: T;
  message?: string;
  errorCode?: string;
};

function compactQuery(query: OnecLpAppTransportTasksQuery): OnecLpAppTransportTasksQuery {
  const result: OnecLpAppTransportTasksQuery = {};
  for (const [key, value] of Object.entries(query) as Array<[
    keyof OnecLpAppTransportTasksQuery,
    string | number | undefined,
  ]>) {
    if (value === undefined || value === null || value === '') continue;
    result[key] = value as never;
  }
  return result;
}

function withQuery(path: string, query: OnecLpAppTransportTasksQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(compactQuery(query))) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function runDebugRequest<Req, Res>(config: {
  key: OnecLpAppDebugKey;
  label: string;
  method: OnecLpAppHttpMethod;
  path: string;
  body?: Req;
  query?: OnecLpAppTransportTasksQuery;
}): Promise<OnecLpAppDebugResult<Res>> {
  const startedAt = Date.now();
  const requestedAt = new Date(startedAt).toISOString();

  try {
    const response = await apiClient<Req, Res>(config.path, {
      method: config.method,
      body: config.body,
    });
    const durationMs = Date.now() - startedAt;

    return {
      key: config.key,
      label: config.label,
      method: config.method,
      path: config.path,
      status: response.status,
      ok: response.ok,
      durationMs,
      requestedAt,
      request:
        config.query || config.body !== undefined
          ? {
              query: config.query,
              body: config.body,
            }
          : undefined,
      data: response.data,
      message: response.message,
      errorCode: response.errorCode,
    };
  } catch (error) {
    return {
      key: config.key,
      label: config.label,
      method: config.method,
      path: config.path,
      status: 0,
      ok: false,
      durationMs: Date.now() - startedAt,
      requestedAt,
      request:
        config.query || config.body !== undefined
          ? {
              query: config.query,
              body: config.body,
            }
          : undefined,
      message: error instanceof Error ? error.message : 'Unexpected request error',
      errorCode: 'UNKNOWN',
    };
  }
}

export function pingOnecLpApp() {
  return runDebugRequest<void, unknown>({
    key: 'ping',
    label: 'GET /ping',
    method: 'GET',
    path: API_ENDPOINTS.ONEC_LP_APP.PING,
  });
}

export function getOnecLpAppUsers() {
  return runDebugRequest<void, OnecLpAppUsersResponse>({
    key: 'users',
    label: 'GET /users',
    method: 'GET',
    path: API_ENDPOINTS.ONEC_LP_APP.USERS,
  });
}

export async function listOnecLpAppUsers(): Promise<OnecLpAppUser[]> {
  const response = await apiClient<void, OnecLpAppUsersResponse>(API_ENDPOINTS.ONEC_LP_APP.USERS);
  if (!response.ok) {
    const message = response.status === 403 ? 'Нет прав на получение пользователей 1С' : response.message;
    throw new Error(message || 'Не удалось получить пользователей 1С');
  }

  return response.data?.users ?? response.data?.body?.users ?? [];
}

export function getOnecLpAppTransportTasks(query: OnecLpAppTransportTasksQuery) {
  const compact = compactQuery(query);
  return runDebugRequest<void, OnecLpAppTransportTasksResponse>({
    key: 'transport-tasks',
    label: 'GET /transport-tasks',
    method: 'GET',
    path: withQuery(API_ENDPOINTS.ONEC_LP_APP.TRANSPORT_TASKS, compact),
    query: compact,
  });
}

export async function listOnecLpAppTransportTasks(
  query: OnecLpAppTransportTasksQuery = {}
): Promise<OnecLpAppTransportTasksResponse> {
  const path = withQuery(API_ENDPOINTS.ONEC_LP_APP.TRANSPORT_TASKS, compactQuery(query));
  const response = await apiClient<void, OnecLpAppTransportTasksResponse>(path);
  if (!response.ok) {
    throw new Error(response.message || 'Не удалось получить задания на перевозку');
  }

  const data = response.data ?? {};
  const body = data.body ?? {};
  return {
    tasks: data.tasks ?? body.tasks ?? [],
    limit: data.limit ?? body.limit,
    offset: data.offset ?? body.offset,
    hasMore: data.hasMore ?? body.hasMore ?? false,
  };
}

export async function getOnecLpAppTransportTask(taskGuid: string): Promise<OnecLpAppTransportTask> {
  const response = await apiClient<void, OnecLpAppTransportTaskResponse>(
    API_ENDPOINTS.ONEC_LP_APP.TRANSPORT_TASK(taskGuid)
  );
  if (!response.ok) {
    throw new Error(response.message || 'Не удалось получить задание на перевозку');
  }

  const task = response.data?.task ?? response.data?.body?.task;
  if (!task) {
    throw new Error('1С не вернула задание на перевозку');
  }
  return task;
}

function normalizeDeparturePointSettings(
  response: OnecLpAppDeparturePointSettingsResponse | undefined | null
): OnecLpAppDeparturePointSettingsResult {
  const data = response ?? {};
  const body = data.body ?? {};
  return {
    presets: data.presets ?? body.presets ?? [],
    departurePoint: data.departurePoint ?? body.departurePoint ?? null,
    requiresInitialSelection: data.requiresInitialSelection ?? body.requiresInitialSelection ?? false,
  };
}

export async function getOnecLpAppDeparturePointSettings(): Promise<OnecLpAppDeparturePointSettingsResult> {
  const response = await apiClient<void, OnecLpAppDeparturePointSettingsResponse>(
    API_ENDPOINTS.ONEC_LP_APP.DEPARTURE_POINT_SETTINGS
  );
  if (!response.ok) {
    throw new Error(response.message || 'Не удалось получить настройки точки отправления');
  }

  return normalizeDeparturePointSettings(response.data);
}

export async function saveOnecLpAppDeparturePointSettings(
  body: OnecLpAppDeparturePointSettingsPayload
): Promise<OnecLpAppDeparturePointSettingsResult> {
  const response = await apiClient<
    OnecLpAppDeparturePointSettingsPayload,
    OnecLpAppDeparturePointSettingsResponse
  >(API_ENDPOINTS.ONEC_LP_APP.DEPARTURE_POINT_SETTINGS, {
    method: 'PUT',
    body,
  });
  if (!response.ok) {
    throw new Error(response.message || 'Не удалось сохранить точку отправления');
  }

  return normalizeDeparturePointSettings(response.data);
}

export async function saveOnecLpAppRouteOrder(
  taskGuid: string,
  body: OnecLpAppRouteOrderPayload
): Promise<OnecLpAppRouteOrderResponse> {
  const response = await apiClient<OnecLpAppRouteOrderPayload, OnecLpAppRouteOrderResponse>(
    API_ENDPOINTS.ONEC_LP_APP.ROUTE_ORDER(taskGuid),
    {
      method: 'POST',
      body,
    }
  );
  if (!response.ok) {
    throw new Error(response.message || 'Failed to save route order');
  }
  const data = response.data ?? {};
  return data.body ?? data;
}

export async function submitOnecLpAppTransportTaskToLoading(
  taskGuid: string,
  body: OnecLpAppRouteOrderPayload
): Promise<OnecLpAppToLoadingResponse> {
  const response = await apiClient<OnecLpAppRouteOrderPayload, OnecLpAppToLoadingResponse>(
    API_ENDPOINTS.ONEC_LP_APP.TO_LOADING(taskGuid),
    {
      method: 'POST',
      body,
    }
  );
  if (!response.ok) {
    throw new Error(response.message || 'Не удалось передать задание к погрузке');
  }
  const data = response.data ?? {};
  return data.body ?? data;
}

export function postOnecLpAppRouteOrder(taskGuid: string, body: OnecLpAppRouteOrderPayload) {
  return runDebugRequest<OnecLpAppRouteOrderPayload, OnecLpAppRouteOrderResponse>({
    key: 'route-order',
    label: 'POST /transport-tasks/:taskGuid/route-order',
    method: 'POST',
    path: API_ENDPOINTS.ONEC_LP_APP.ROUTE_ORDER(taskGuid),
    body,
  });
}

export function postOnecLpAppTransportTaskToLoading(taskGuid: string, body: OnecLpAppRouteOrderPayload) {
  return runDebugRequest<OnecLpAppRouteOrderPayload, OnecLpAppToLoadingResponse>({
    key: 'to-loading',
    label: 'POST /transport-tasks/:taskGuid/to-loading',
    method: 'POST',
    path: API_ENDPOINTS.ONEC_LP_APP.TO_LOADING(taskGuid),
    body,
  });
}
