import { AuthContext } from '@/context/AuthContext';
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
import * as Location from 'expo-location';
import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import {
  isTransportTaskRouteEditable,
  TRANSPORT_TASK_STATUS_TO_LOADING,
} from '../lib/formatters';
import { moveArrayItem, optimizeRouteNearestNeighbor, resolveDraftMapPoint, routeOrderKey } from '../lib/routeOrder';
import {
  toTransportTaskDeparturePoint,
  type TransportTaskCoordinatePoint,
  type TransportTaskDeparturePoint,
  type TransportTaskDeparturePreset,
} from '../types';

export default function useTransportTasksScreen() {
  const auth = useContext(AuthContext);
  const profile = auth?.profile ?? null;
  const employeeProfile = profile?.employeeProfile ?? null;
  const onecUserGuid = employeeProfile?.onecUserGuid?.trim() || '';
  const isLinked = Boolean(onecUserGuid);
  const pageSize = 50;

  const [profileLoading, setProfileLoading] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksLoadingMore, setTasksLoadingMore] = useState(false);
  const [taskDetailLoading, setTaskDetailLoading] = useState(false);
  const [tasks, setTasks] = useState<OnecLpAppTransportTask[]>([]);
  const [tasksHasMore, setTasksHasMore] = useState(false);
  const [tasksOffset, setTasksOffset] = useState(0);
  const [taskStatusFilter, setTaskStatusFilterState] = useState<string | null>(null);
  const [selectedTaskGuid, setSelectedTaskGuid] = useState<string | null>(null);
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

  const selectedTask = useMemo(
    () => tasks.find((task) => task.guid === selectedTaskGuid) ?? null,
    [selectedTaskGuid, tasks]
  );
  const routeForView = routeDraft ?? selectedTask?.route ?? [];
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

  const showSnackbarError = useCallback((message: string) => {
    setSnackbarMessage(null);
    setError(message);
    setSnackbarVisible(true);
  }, []);

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
        setSnackbarMessage('Точка отправления сохранена');
        setSnackbarVisible(true);
      } catch (err: any) {
        const message = err?.message || 'Не удалось сохранить точку отправления';
        showSnackbarError(message);
      } finally {
        setDepartureSettingsSaving(false);
      }
    },
    [applyDepartureSettingsResult, showSnackbarError]
  );

  const loadTasks = useCallback(async () => {
    if (!isLinked) return;
    setTasksLoading(true);
    setError(null);
    try {
      const result = await listOnecLpAppTransportTasks({
        limit: pageSize,
        offset: 0,
        status: taskStatusFilter ?? undefined,
      });
      const list = result.tasks ?? [];
      setTasks((current) =>
        list.map((task) => {
          const existing = current.find((item) => item.guid === task.guid);
          if (!existing?.route || task.route) return task;
          return { ...existing, ...task, route: existing.route };
        })
      );
      setTasksOffset(list.length);
      setTasksHasMore(Boolean(result.hasMore));
      setSelectedTaskGuid((current) => {
        if (current && list.some((task) => task.guid === current)) return current;
        return null;
      });
    } catch (err: any) {
      const message = err?.message || 'Не удалось загрузить задания на перевозку';
      showSnackbarError(message);
    } finally {
      setTasksLoading(false);
    }
  }, [isLinked, pageSize, showSnackbarError, taskStatusFilter]);

  const loadMoreTasks = useCallback(async () => {
    if (!isLinked || tasksLoadingMore || tasksLoading || !tasksHasMore) return;
    setTasksLoadingMore(true);
    setError(null);
    try {
      const result = await listOnecLpAppTransportTasks({
        limit: pageSize,
        offset: tasksOffset,
        status: taskStatusFilter ?? undefined,
      });
      const next = result.tasks ?? [];
      setTasks((current) => {
        const known = new Set(current.map((task) => task.guid));
        const merged = [...current, ...next.filter((task) => !known.has(task.guid))];
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
    tasksHasMore,
    tasksLoading,
    tasksLoadingMore,
    tasksOffset,
  ]);

  const setTaskStatusFilter = useCallback((status: string | null) => {
    setTaskStatusFilterState(status);
    setTasks([]);
    setTasksOffset(0);
    setTasksHasMore(false);
  }, []);

  const openTask = useCallback(async (task: OnecLpAppTransportTask) => {
    setSelectedTaskGuid(task.guid);
    setSelectedRoutePointIndex(null);
    setRouteDraft(null);
    if (task.route) return;

    setTaskDetailLoading(true);
    setError(null);
    try {
      const detail = await getOnecLpAppTransportTask(task.guid);
      setTasks((current) => current.map((item) => (item.guid === task.guid ? { ...item, ...detail } : item)));
    } catch (err: any) {
      const message = err?.message || 'Не удалось загрузить маршрут задания';
      showSnackbarError(message);
    } finally {
      setTaskDetailLoading(false);
    }
  }, [showSnackbarError]);

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

  const focusDepartureOnMap = useCallback(() => {
    setSelectedRoutePointIndex(null);
    setFocusDepartureCounter((current) => current + 1);
  }, []);

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
      setSnackbarMessage('Точка отправления обновлена по геолокации');
      setSnackbarVisible(true);
    } catch (err: any) {
      const message = err?.message || 'Не удалось получить геолокацию';
      showSnackbarError(message);
    } finally {
      setDepartureSettingsSaving(false);
    }
  }, [applyDepartureSettingsResult, showSnackbarError]);

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

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    if (isLinked) {
      void loadTasks();
    }
  }, [isLinked, loadTasks]);

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
  }, [isLinked]);

  useEffect(() => {
    setRouteOrderEditing(false);
    setRouteDraft(null);
  }, [selectedTaskGuid]);

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
