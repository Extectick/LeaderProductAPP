import { AuthContext } from '@/context/AuthContext';
import { useUnsavedChanges } from '@/src/features/navigation/UnsavedChangesContext';
import {
  getOnecLpAppDeparturePointSettings,
  getOnecLpAppTransportTask,
  listOnecLpAppTransportTasks,
  saveOnecLpAppDeparturePointSettings,
  saveOnecLpAppRouteOrder,
  submitOnecLpAppTransportTaskToLoading,
  type OnecLpAppDeparturePointPresetKey,
  type OnecLpAppDeparturePointSettingsPayload,
  type OnecLpAppRoutePoint,
  type OnecLpAppTransportTask,
} from '@/utils/onecLpAppService';
import { getProfile } from '@/utils/userService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from 'expo-router';
import * as Location from 'expo-location';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  isTransportTaskActual,
  isTransportTaskRouteEditable,
  sortTransportTasksForList,
  TRANSPORT_TASK_STATUS_FORMING,
  TRANSPORT_TASK_STATUS_ROUTE_ORDERING,
  TRANSPORT_TASK_STATUS_TO_LOADING,
} from '../lib/formatters';
import { moveArrayItem, optimizeRouteNearestNeighbor, resolveDraftMapPoint, routeOrderKey } from '../lib/routeOrder';
import {
  toTransportTaskDeparturePoint,
  type TransportTaskCoordinatePoint,
  type TransportTaskDeparturePoint,
  type TransportTaskDeparturePreset,
} from '../types';

const TRANSPORT_TASK_STATUS_FILTER_STORAGE_KEY = 'transport_tasks_status_filter_v1';
const TRANSPORT_TASK_ALLOWED_STATUS_FILTERS = new Set([
  TRANSPORT_TASK_STATUS_FORMING,
  TRANSPORT_TASK_STATUS_ROUTE_ORDERING,
  TRANSPORT_TASK_STATUS_TO_LOADING,
]);

function normalizeTaskStatusFilter(value: string | null | undefined): string | null {
  const normalized = String(value || '').trim();
  if (!normalized || normalized === 'all') return null;
  return TRANSPORT_TASK_ALLOWED_STATUS_FILTERS.has(normalized) ? normalized : null;
}

function taskMatchesStatusFilter(task: OnecLpAppTransportTask, statusFilter: string | null) {
  return !statusFilter || String(task.status || '').trim() === statusFilter;
}

function canRestoreTransportTask(task: OnecLpAppTransportTask, statusFilter: string | null) {
  return isTransportTaskActual(task) && taskMatchesStatusFilter(task, statusFilter);
}

export default function useTransportTasksScreen() {
  const auth = useContext(AuthContext);
  const navigation = useNavigation<any>();
  const { confirmNavigation, registerUnsavedChanges } = useUnsavedChanges();
  const profile = auth?.profile ?? null;
  const employeeProfile = profile?.employeeProfile ?? null;
  const onecUserGuid = employeeProfile?.onecUserGuid?.trim() || '';
  const onecPhysicalPersonGuid = employeeProfile?.onecPhysicalPersonGuid?.trim() || '';
  const isLinked = Boolean(onecUserGuid || onecPhysicalPersonGuid);
  const pageSize = 50;

  const [profileLoading, setProfileLoading] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksLoadingMore, setTasksLoadingMore] = useState(false);
  const [taskDetailLoading, setTaskDetailLoading] = useState(false);
  const [tasks, setTasks] = useState<OnecLpAppTransportTask[]>([]);
  const [tasksHasMore, setTasksHasMore] = useState(false);
  const [tasksOffset, setTasksOffset] = useState(0);
  const [taskStatusFilter, setTaskStatusFilterState] = useState<string | null>(null);
  const [taskStatusFilterReady, setTaskStatusFilterReady] = useState(false);
  const [selectedTaskGuid, setSelectedTaskGuidState] = useState<string | null>(null);
  const [selectedRoutePointIndex, setSelectedRoutePointIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [routeOrderEditing, setRouteOrderEditing] = useState(false);
  const [routeOrderSaving, setRouteOrderSaving] = useState(false);
  const [toLoadingConfirmVisible, setToLoadingConfirmVisible] = useState(false);
  const [toLoadingSaving, setToLoadingSaving] = useState(false);
  const [routeDraft, setRouteDraft] = useState<OnecLpAppRoutePoint[] | null>(null);
  const [focusDepartureCounter, setFocusDepartureCounter] = useState(0);
  const [departureSettingsLoading, setDepartureSettingsLoading] = useState(false);
  const [departureSettingsSaving, setDepartureSettingsSaving] = useState(false);
  const [departurePresets, setDeparturePresets] = useState<TransportTaskDeparturePreset[]>([]);
  const [departurePoint, setDeparturePoint] = useState<TransportTaskDeparturePoint | null>(null);
  const [requiresInitialDepartureSelection, setRequiresInitialDepartureSelection] = useState(false);
  const [departureModalVisible, setDepartureModalVisible] = useState(false);
  const [departureMapSelectionMode, setDepartureMapSelectionMode] = useState(false);
  const [draftDepartureMapPoint, setDraftDepartureMapPoint] = useState<TransportTaskCoordinatePoint | null>(null);
  const restoringTaskDetailGuidRef = useRef<string | null>(null);
  const selectedRoutePointIndexRef = useRef<number | null>(null);
  const routeForViewRef = useRef<OnecLpAppRoutePoint[]>([]);
  const hasRouteOrderChangesRef = useRef(false);
  const taskStatusFilterStorageKey = profile?.id
    ? `${TRANSPORT_TASK_STATUS_FILTER_STORAGE_KEY}:${profile.id}`
    : TRANSPORT_TASK_STATUS_FILTER_STORAGE_KEY;

  const selectedTask = useMemo(
    () => tasks.find((task) => task.guid === selectedTaskGuid) ?? null,
    [selectedTaskGuid, tasks]
  );
  const routeForView = useMemo(
    () => routeDraft ?? selectedTask?.route ?? [],
    [routeDraft, selectedTask?.route]
  );
  const routeOrderEditable = isTransportTaskRouteEditable(selectedTask?.status);
  const hasRouteOrderChanges = useMemo(
    () =>
      routeOrderEditable &&
      routeDraft !== null &&
      selectedTask?.route !== undefined &&
      routeOrderKey(routeDraft) !== routeOrderKey(selectedTask.route),
    [routeDraft, routeOrderEditable, selectedTask?.route]
  );
  const canDismissDepartureModal =
    !requiresInitialDepartureSelection || Boolean(departurePoint) || departureSettingsSaving;

  useEffect(() => {
    selectedRoutePointIndexRef.current = selectedRoutePointIndex;
  }, [selectedRoutePointIndex]);

  useEffect(() => {
    routeForViewRef.current = routeForView;
  }, [routeForView]);

  useEffect(() => {
    hasRouteOrderChangesRef.current = hasRouteOrderChanges;
  }, [hasRouteOrderChanges]);

  const discardRouteOrderChanges = useCallback(() => {
    setRouteDraft(selectedTask?.route ? [...selectedTask.route] : null);
  }, [selectedTask?.route]);

  const showSnackbarError = useCallback((message: string) => {
    setSnackbarMessage(null);
    setError(message);
    setSnackbarVisible(true);
  }, []);

  const focusDepartureOnMap = useCallback(() => {
    setSelectedRoutePointIndex(null);
    setFocusDepartureCounter((current) => current + 1);
  }, []);

  const setSelectedTaskGuid = useCallback(
    (guid: string | null) => {
      const normalized = String(guid || '').trim() || null;
      setSelectedTaskGuidState(normalized);
    },
    []
  );

  const applyTaskDetail = useCallback(
    (detail: OnecLpAppTransportTask, options?: { syncRouteDraft?: boolean }) => {
      const syncRouteDraft = options?.syncRouteDraft ?? false;
      const nextRoute = detail.route ?? [];
      const selectedLinkKey =
        selectedRoutePointIndexRef.current === null
          ? null
          : routeForViewRef.current[selectedRoutePointIndexRef.current]?.linkKey ?? null;

      setTasks((current) => {
        const exists = current.some((task) => task.guid === detail.guid);
        const next = exists
          ? current.map((task) => (task.guid === detail.guid ? { ...task, ...detail } : task))
          : [detail, ...current];
        return sortTransportTasksForList(next);
      });

      if (syncRouteDraft) {
        setRouteDraft([...nextRoute]);
        if (selectedLinkKey) {
          const nextSelectedIndex = nextRoute.findIndex((point) => point.linkKey === selectedLinkKey);
          setSelectedRoutePointIndex(nextSelectedIndex >= 0 ? nextSelectedIndex : null);
        }
      }
    },
    []
  );

  const refreshSelectedTaskDetail = useCallback(
    async (taskGuid: string, options?: { syncRouteDraft?: boolean }) => {
      const detail = await getOnecLpAppTransportTask(taskGuid);
      if (!canRestoreTransportTask(detail, taskStatusFilter)) {
        setSelectedTaskGuid(null);
        return null;
      }
      applyTaskDetail(detail, options);
      return detail;
    },
    [applyTaskDetail, setSelectedTaskGuid, taskStatusFilter]
  );

  const applyDepartureSettingsResult = useCallback((result: {
    presets: TransportTaskDeparturePreset[];
    departurePoint: any;
    requiresInitialSelection: boolean;
  }) => {
    setDeparturePresets(result.presets ?? []);
    setDeparturePoint(toTransportTaskDeparturePoint(result.departurePoint));
    setRequiresInitialDepartureSelection(Boolean(result.requiresInitialSelection));
  }, []);

  const refreshProfile = useCallback(async () => {
    setProfileLoading(true);
    setError(null);
    try {
      const fresh = await getProfile();
      if (fresh) await auth?.setProfile(fresh);
    } catch (err: any) {
      const message = err?.message || 'Не удалось обновить профиль пользователя';
      showSnackbarError(message);
    } finally {
      setProfileLoading(false);
    }
  }, [auth, showSnackbarError]);

  const loadDepartureSettings = useCallback(async () => {
    if (!isLinked) return;
    setDepartureSettingsLoading(true);
    try {
      const result = await getOnecLpAppDeparturePointSettings();
      applyDepartureSettingsResult(result);
    } catch (err: any) {
      const message = err?.message || 'Не удалось загрузить точку отправления';
      setSnackbarMessage(message);
      setSnackbarVisible(true);
    } finally {
      setDepartureSettingsLoading(false);
    }
  }, [applyDepartureSettingsResult, isLinked]);

  const persistDeparturePoint = useCallback(
    async (payload: OnecLpAppDeparturePointSettingsPayload) => {
      setDepartureSettingsSaving(true);
      setError(null);
      setSnackbarMessage(null);
      try {
        const result = await saveOnecLpAppDeparturePointSettings(payload);
        applyDepartureSettingsResult(result);
        setDepartureModalVisible(false);
        setDepartureMapSelectionMode(false);
        setDraftDepartureMapPoint(null);
        focusDepartureOnMap();
        setSnackbarMessage('Точка отправления сохранена');
        setSnackbarVisible(true);
      } catch (err: any) {
        const message = err?.message || 'Не удалось сохранить точку отправления';
        showSnackbarError(message);
      } finally {
        setDepartureSettingsSaving(false);
      }
    },
    [applyDepartureSettingsResult, focusDepartureOnMap, showSnackbarError]
  );

  const loadTasks = useCallback(async () => {
    if (!isLinked || !taskStatusFilterReady) return;
    setTasksLoading(true);
    setError(null);
    try {
      const result = await listOnecLpAppTransportTasks({
        limit: pageSize,
        offset: 0,
        status: taskStatusFilter ?? undefined,
      });
      const list = sortTransportTasksForList(result.tasks ?? []);
      setTasks((current) =>
        sortTransportTasksForList(list.map((task) => {
          const existing = current.find((item) => item.guid === task.guid);
          if (!existing?.route || task.route) return task;
          return { ...existing, ...task, route: existing.route };
        }))
      );
      setTasksOffset(list.length);
      setTasksHasMore(Boolean(result.hasMore));
      setSelectedTaskGuidState((current) => {
        if (current && list.some((task) => task.guid === current)) return current;
        return current;
      });
      if (selectedTaskGuid && list.some((task) => task.guid === selectedTaskGuid)) {
        try {
          await refreshSelectedTaskDetail(selectedTaskGuid, {
            syncRouteDraft: !hasRouteOrderChangesRef.current,
          });
        } catch (detailError: any) {
          const message =
            detailError?.message || 'Не удалось обновить открытый документ задания на перевозку';
          showSnackbarError(message);
        }
      }
    } catch (err: any) {
      const message = err?.message || 'Не удалось загрузить задания на перевозку';
      showSnackbarError(message);
    } finally {
      setTasksLoading(false);
    }
  }, [
    isLinked,
    pageSize,
    refreshSelectedTaskDetail,
    selectedTaskGuid,
    showSnackbarError,
    taskStatusFilter,
    taskStatusFilterReady,
  ]);

  const loadMoreTasks = useCallback(async () => {
    if (!isLinked || !taskStatusFilterReady || tasksLoadingMore || tasksLoading || !tasksHasMore) return;
    setTasksLoadingMore(true);
    setError(null);
    try {
      const result = await listOnecLpAppTransportTasks({
        limit: pageSize,
        offset: tasksOffset,
        status: taskStatusFilter ?? undefined,
      });
      const next = sortTransportTasksForList(result.tasks ?? []);
      setTasks((current) => {
        const known = new Set(current.map((task) => task.guid));
        const merged = sortTransportTasksForList([...current, ...next.filter((task) => !known.has(task.guid))]);
        setTasksOffset(merged.length);
        return merged;
      });
      setTasksHasMore(Boolean(result.hasMore));
    } catch (err: any) {
      const message = err?.message || 'Не удалось загрузить следующую страницу заданий';
      showSnackbarError(message);
    } finally {
      setTasksLoadingMore(false);
    }
  }, [
    isLinked,
    pageSize,
    showSnackbarError,
    taskStatusFilter,
    taskStatusFilterReady,
    tasksHasMore,
    tasksLoading,
    tasksLoadingMore,
    tasksOffset,
  ]);

  const setTaskStatusFilter = useCallback((status: string | null) => {
    const normalized = normalizeTaskStatusFilter(status);
    if (normalized === taskStatusFilter) return;
    setTaskStatusFilterState(normalized);
    setTasks([]);
    setTasksOffset(0);
    setTasksHasMore(false);
    void (normalized
      ? AsyncStorage.setItem(taskStatusFilterStorageKey, normalized)
      : AsyncStorage.removeItem(taskStatusFilterStorageKey));
  }, [taskStatusFilter, taskStatusFilterStorageKey]);

  const openTask = useCallback(async (task: OnecLpAppTransportTask) => {
    const open = async () => {
    if (!isTransportTaskActual(task)) {
      setSelectedTaskGuid(null);
      setSnackbarMessage('Документ закрыт или удален. Открыт список актуальных заданий.');
      setSnackbarVisible(true);
      return;
    }
    setSelectedTaskGuid(task.guid);
    setSelectedRoutePointIndex(null);
    setRouteDraft(null);
    if (task.route) return;

    setTaskDetailLoading(true);
    setError(null);
    try {
      const detail = await getOnecLpAppTransportTask(task.guid);
      if (!isTransportTaskActual(detail)) {
        setSelectedTaskGuid(null);
        setSnackbarMessage('Документ закрыт или удален. Открыт список актуальных заданий.');
        setSnackbarVisible(true);
        return;
      }
      applyTaskDetail(detail, { syncRouteDraft: true });
    } catch (err: any) {
      setSelectedTaskGuid(null);
      setSelectedRoutePointIndex(null);
      setRouteDraft(null);
      setSnackbarMessage(err?.message || 'Документ недоступен. Открыт список актуальных заданий.');
      setSnackbarVisible(true);
      void loadTasks();
    } finally {
      setTaskDetailLoading(false);
    }
    };

    if (hasRouteOrderChanges && selectedTaskGuid !== task.guid) {
      confirmNavigation(() => {
        void open();
      });
      return;
    }

    await open();
  }, [applyTaskDetail, confirmNavigation, hasRouteOrderChanges, loadTasks, selectedTaskGuid, setSelectedTaskGuid]);

  const updateRouteDraft = useCallback(
    (next: OnecLpAppRoutePoint[]) => {
      const selectedLinkKey =
        selectedRoutePointIndex === null ? null : routeForView[selectedRoutePointIndex]?.linkKey ?? null;
      setRouteDraft(next);
      if (selectedLinkKey) {
        const nextSelectedIndex = next.findIndex((point) => point.linkKey === selectedLinkKey);
        setSelectedRoutePointIndex(nextSelectedIndex >= 0 ? nextSelectedIndex : null);
      }
    },
    [routeForView, selectedRoutePointIndex]
  );

  const moveRoutePoint = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (!routeOrderEditable) return;
      updateRouteDraft(moveArrayItem(routeForView, fromIndex, toIndex));
    },
    [routeForView, routeOrderEditable, updateRouteDraft]
  );

  const moveRoutePointToPosition = useCallback(
    (fromIndex: number, position: number) => {
      if (!routeOrderEditable || !routeForView.length) return;
      const toIndex = Math.max(0, Math.min(routeForView.length - 1, position - 1));
      moveRoutePoint(fromIndex, toIndex);
    },
    [moveRoutePoint, routeForView.length, routeOrderEditable]
  );

  const optimizeRouteOrder = useCallback(() => {
    if (!routeOrderEditable) return;
    updateRouteDraft(optimizeRouteNearestNeighbor(routeForView, departurePoint));
  }, [departurePoint, routeForView, routeOrderEditable, updateRouteDraft]);

  const saveRouteOrder = useCallback(async () => {
    if (!selectedTask || !routeOrderEditable || !routeDraft || !hasRouteOrderChanges || routeOrderSaving) return;
    setRouteOrderSaving(true);
    setError(null);
    setSnackbarMessage(null);
    try {
      const result = await saveOnecLpAppRouteOrder(selectedTask.guid, {
        route: routeDraft.map((point, index) => ({
          linkKey: point.linkKey,
          order: index + 1,
        })),
      });
      const savedRoute = result.route?.length ? result.route : routeDraft;
      setTasks((current) =>
        current.map((task) =>
          task.guid === selectedTask.guid
            ? { ...task, route: savedRoute, routePointsCount: savedRoute.length }
            : task
        )
      );
      setRouteDraft([...savedRoute]);
      setRouteOrderEditing(true);
      setSnackbarMessage('Порядок маршрута сохранен');
      setSnackbarVisible(true);
    } catch (err: any) {
      const message = err?.message || 'Не удалось сохранить порядок маршрута';
      showSnackbarError(message);
    } finally {
      setRouteOrderSaving(false);
    }
  }, [hasRouteOrderChanges, routeDraft, routeOrderEditable, routeOrderSaving, selectedTask, showSnackbarError]);

  const openToLoadingConfirm = useCallback(() => {
    if (!selectedTask || !routeOrderEditable || !routeForView.length) return;
    setToLoadingConfirmVisible(true);
  }, [routeForView.length, routeOrderEditable, selectedTask]);

  const closeToLoadingConfirm = useCallback(() => {
    if (toLoadingSaving) return;
    setToLoadingConfirmVisible(false);
  }, [toLoadingSaving]);

  const submitToLoading = useCallback(async () => {
    if (!selectedTask || !routeOrderEditable || !routeForView.length || toLoadingSaving) return;

    const routeToSubmit = routeDraft ?? selectedTask.route ?? [];
    if (!routeToSubmit.length) return;

    setToLoadingSaving(true);
    setError(null);
    setSnackbarMessage(null);
    try {
      const result = await submitOnecLpAppTransportTaskToLoading(selectedTask.guid, {
        route: routeToSubmit.map((point, index) => ({
          linkKey: point.linkKey,
          order: index + 1,
        })),
      });
      const savedRoute = result.task?.route?.length ? result.task.route : result.route?.length ? result.route : routeToSubmit;
      const nextStatus = result.task?.status ?? result.taskStatus ?? TRANSPORT_TASK_STATUS_TO_LOADING;

      setTasks((current) =>
        current.map((task) =>
          task.guid === selectedTask.guid
            ? {
                ...task,
                ...(result.task ?? {}),
                status: nextStatus,
                route: savedRoute,
                routePointsCount: savedRoute.length,
              }
            : task
        )
      );
      setRouteDraft([...savedRoute]);
      setRouteOrderEditing(false);
      setToLoadingConfirmVisible(false);
      setSnackbarMessage('Задание передано к погрузке');
      setSnackbarVisible(true);
    } catch (err: any) {
      const message = err?.message || 'Не удалось передать задание к погрузке';
      showSnackbarError(message);
    } finally {
      setToLoadingSaving(false);
    }
  }, [routeDraft, routeForView.length, routeOrderEditable, selectedTask, showSnackbarError, toLoadingSaving]);

  const openDepartureSelection = useCallback(() => {
    setDraftDepartureMapPoint(resolveDraftMapPoint(departurePoint));
    setDepartureModalVisible(true);
  }, [departurePoint]);

  const closeDepartureSelection = useCallback(() => {
    if (!canDismissDepartureModal || departureSettingsSaving) return;
    setDepartureModalVisible(false);
    setDraftDepartureMapPoint(null);
  }, [canDismissDepartureModal, departureSettingsSaving]);

  const beginDepartureMapSelection = useCallback(() => {
    setDraftDepartureMapPoint(resolveDraftMapPoint(departurePoint));
    setDepartureModalVisible(false);
    setDepartureMapSelectionMode(true);
  }, [departurePoint]);

  const cancelDepartureMapSelection = useCallback(() => {
    if (departureSettingsSaving) return;
    setDepartureMapSelectionMode(false);
    setDraftDepartureMapPoint(null);
    if (requiresInitialDepartureSelection && !departurePoint) {
      setDepartureModalVisible(true);
    }
  }, [departurePoint, departureSettingsSaving, requiresInitialDepartureSelection]);

  const handleDepartureMapPick = useCallback((point: TransportTaskCoordinatePoint) => {
    setDraftDepartureMapPoint(point);
  }, []);

  const usePresetDeparturePoint = useCallback(
    async (presetKey: OnecLpAppDeparturePointPresetKey) => {
      await persistDeparturePoint({
        source: 'PRESET',
        presetKey,
      });
    },
    [persistDeparturePoint]
  );

  const useCurrentDeviceLocation = useCallback(async () => {
    setDepartureSettingsSaving(true);
    setError(null);
    setSnackbarMessage(null);

    try {
      let point: TransportTaskCoordinatePoint;

      if (Platform.OS === 'web') {
        point = await new Promise<TransportTaskCoordinatePoint>((resolve, reject) => {
          if (typeof navigator === 'undefined' || !navigator.geolocation) {
            reject(new Error('Геолокация недоступна в этом браузере'));
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (position) =>
              resolve({
                latitude: Number(position.coords.latitude.toFixed(6)),
                longitude: Number(position.coords.longitude.toFixed(6)),
              }),
            (geoError) => reject(new Error(geoError.message || 'Не удалось получить геолокацию')),
            {
              enableHighAccuracy: true,
              timeout: 15000,
              maximumAge: 0,
            }
          );
        });
      } else {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          throw new Error('Нет разрешения на использование геолокации');
        }
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        point = {
          latitude: Number(location.coords.latitude.toFixed(6)),
          longitude: Number(location.coords.longitude.toFixed(6)),
        };
      }

      const result = await saveOnecLpAppDeparturePointSettings({
        source: 'DEVICE_LOCATION',
        latitude: point.latitude,
        longitude: point.longitude,
      });

      applyDepartureSettingsResult(result);
      setDepartureModalVisible(false);
      setDepartureMapSelectionMode(false);
      setDraftDepartureMapPoint(null);
      focusDepartureOnMap();
      setSnackbarMessage('Точка отправления обновлена по геолокации');
      setSnackbarVisible(true);
    } catch (err: any) {
      const message = err?.message || 'Не удалось получить геолокацию';
      showSnackbarError(message);
    } finally {
      setDepartureSettingsSaving(false);
    }
  }, [applyDepartureSettingsResult, focusDepartureOnMap, showSnackbarError]);

  const saveManualMapDeparturePoint = useCallback(async () => {
    if (!draftDepartureMapPoint) {
      showSnackbarError('Сначала выберите точку на карте');
      return;
    }
    await persistDeparturePoint({
      source: 'CUSTOM_MAP',
      latitude: draftDepartureMapPoint.latitude,
      longitude: draftDepartureMapPoint.longitude,
      address: draftDepartureMapPoint.address,
    });
  }, [draftDepartureMapPoint, persistDeparturePoint, showSnackbarError]);

  const closeSelectedTask = useCallback(() => {
    const close = () => {
      setSelectedTaskGuid(null);
      setSelectedRoutePointIndex(null);
      setRouteDraft(null);
    };

    if (hasRouteOrderChanges) {
      confirmNavigation(close);
      return;
    }

    close();
  }, [confirmNavigation, hasRouteOrderChanges, setSelectedTaskGuid]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    registerUnsavedChanges(
      hasRouteOrderChanges
        ? {
            active: true,
            title: 'Выйти без сохранения?',
            message: 'В документе есть несохраненные изменения порядка маршрута.',
            warning: 'Если продолжить, изменения будут сброшены.',
            confirmText: 'Выйти',
            cancelText: 'Остаться',
            icon: 'alert-outline',
            onDiscard: discardRouteOrderChanges,
          }
        : null
    );

    return () => registerUnsavedChanges(null);
  }, [discardRouteOrderChanges, hasRouteOrderChanges, registerUnsavedChanges]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasRouteOrderChanges) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [hasRouteOrderChanges]);

  useEffect(() => {
    const unsubscribe = navigation.addListener?.('beforeRemove', (event: any) => {
      if (!hasRouteOrderChanges) return;
      event.preventDefault();
      confirmNavigation(() => {
        navigation.dispatch(event.data.action);
      });
    });
    return unsubscribe;
  }, [confirmNavigation, hasRouteOrderChanges, navigation]);

  useEffect(() => {
    let mounted = true;
    setTaskStatusFilterReady(false);

    AsyncStorage.getItem(taskStatusFilterStorageKey)
      .then((value) => {
        if (!mounted) return;
        setTaskStatusFilterState(normalizeTaskStatusFilter(value));
      })
      .catch(() => {
        if (!mounted) return;
        setTaskStatusFilterState(null);
      })
      .finally(() => {
        if (mounted) setTaskStatusFilterReady(true);
      });

    return () => {
      mounted = false;
    };
  }, [taskStatusFilterStorageKey]);

  useEffect(() => {
    if (isLinked && taskStatusFilterReady) {
      void loadTasks();
    }
  }, [isLinked, loadTasks, taskStatusFilterReady]);

  useEffect(() => {
    if (isLinked) {
      void loadDepartureSettings();
    }
  }, [isLinked, loadDepartureSettings]);

  useEffect(() => {
    if (!isLinked) {
      setTasks([]);
      setSelectedTaskGuid(null);
      setSelectedRoutePointIndex(null);
      setDeparturePoint(null);
      setDeparturePresets([]);
      setRequiresInitialDepartureSelection(false);
    }
  }, [isLinked, setSelectedTaskGuid]);

  useEffect(() => {
    if (!isLinked || !selectedTaskGuid || selectedTask) return;
    if (restoringTaskDetailGuidRef.current === selectedTaskGuid) return;

    restoringTaskDetailGuidRef.current = selectedTaskGuid;
    setTaskDetailLoading(true);
    getOnecLpAppTransportTask(selectedTaskGuid)
      .then((detail) => {
        if (!canRestoreTransportTask(detail, taskStatusFilter)) {
          setSelectedTaskGuid(null);
          return;
        }
        applyTaskDetail(detail, { syncRouteDraft: true });
      })
      .catch(() => {
        setSelectedTaskGuid(null);
      })
      .finally(() => {
        if (restoringTaskDetailGuidRef.current === selectedTaskGuid) {
          restoringTaskDetailGuidRef.current = null;
        }
        setTaskDetailLoading(false);
      });
  }, [applyTaskDetail, isLinked, selectedTask, selectedTaskGuid, setSelectedTaskGuid, taskStatusFilter]);

  useEffect(() => {
    setRouteOrderEditing(false);
    setRouteDraft(null);
  }, [selectedTaskGuid]);

  useEffect(() => {
    if (!selectedTask) return;
    if (canRestoreTransportTask(selectedTask, taskStatusFilter)) return;
    setSelectedTaskGuid(null);
  }, [selectedTask, setSelectedTaskGuid, taskStatusFilter]);

  useEffect(() => {
    if (!selectedTask?.route) return;
    setRouteDraft((current) => current ?? [...selectedTask.route!]);
    setRouteOrderEditing(isTransportTaskRouteEditable(selectedTask.status));
  }, [selectedTask?.guid, selectedTask?.route, selectedTask?.status]);

  useEffect(() => {
    const routeLength = routeForView.length;
    if (selectedRoutePointIndex !== null && selectedRoutePointIndex >= routeLength) {
      setSelectedRoutePointIndex(null);
    }
  }, [routeForView.length, selectedRoutePointIndex]);

  useEffect(() => {
    if (requiresInitialDepartureSelection && !departurePoint) {
      setDraftDepartureMapPoint(resolveDraftMapPoint(departurePoint));
      setDepartureMapSelectionMode(false);
      setDepartureModalVisible(true);
    }
  }, [departurePoint, requiresInitialDepartureSelection]);

  return {
    auth,
    profile,
    employeeProfile,
    isLinked,
    profileLoading,
    tasksLoading,
    tasksLoadingMore,
    taskDetailLoading,
    tasks,
    tasksHasMore,
    taskStatusFilter,
    selectedTaskGuid,
    selectedTask,
    selectedRoutePointIndex,
    error,
    snackbarMessage,
    snackbarVisible,
    routeOrderEditing,
    routeOrderEditable,
    routeOrderSaving,
    toLoadingConfirmVisible,
    toLoadingSaving,
    routeDraft,
    routeForView,
    hasRouteOrderChanges,
    canSubmitToLoading: routeOrderEditable && routeForView.length > 0,
    focusDepartureCounter,
    departureSettingsLoading,
    departureSettingsSaving,
    departurePresets,
    departurePoint,
    requiresInitialDepartureSelection,
    departureModalVisible,
    departureMapSelectionMode,
    draftDepartureMapPoint,
    canDismissDepartureModal,
    setSelectedTaskGuid,
    setSelectedRoutePointIndex,
    setTaskStatusFilter,
    setSnackbarVisible,
    closeSelectedTask,
    refreshProfile,
    loadTasks,
    loadMoreTasks,
    openTask,
    moveRoutePoint,
    moveRoutePointToPosition,
    optimizeRouteOrder,
    saveRouteOrder,
    openToLoadingConfirm,
    closeToLoadingConfirm,
    submitToLoading,
    openDepartureSelection,
    closeDepartureSelection,
    focusDepartureOnMap,
    beginDepartureMapSelection,
    cancelDepartureMapSelection,
    handleDepartureMapPick,
    usePresetDeparturePoint,
    useCurrentDeviceLocation,
    saveManualMapDeparturePoint,
  };
}
