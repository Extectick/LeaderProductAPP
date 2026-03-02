import { AuthContext } from '@/context/AuthContext';
import { useNotificationViewport } from '@/context/NotificationViewportContext';
import {
  DEFAULT_MAX_ACCURACY,
  DEFAULT_POINTS_LIMIT,
  filterNearbyPoints,
  formatDateTime,
  humanName,
  parseLimitValue,
} from './helpers';
import type { Filters, PointLabel, UserOption } from './types';
import { getUsers } from '@/utils/userService';
import { fetchUserRoutesWithPoints, type RouteWithPoints } from '@/utils/trackingService';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import LeafletMap from './LeafletMap';
import { trackingStyles as styles } from './styles';
import TrackingPeriodRangeModal from './components/TrackingPeriodRangeModal';
import TrackingUserPickerModal from './components/TrackingUserPickerModal';
import TrackingPointsIsland, { type TrackingPointRow } from './components/TrackingPointsIsland';
import { useServicesHeaderSlot } from '../headerSlotContext';

const defaultFilters: Filters = {
  from: '',
  to: '',
  maxAccuracy: DEFAULT_MAX_ACCURACY.toString(),
  maxPoints: DEFAULT_POINTS_LIMIT.toString(),
};

const POINTS_BATCH_SIZE_DESKTOP = 12;
const POINTS_BATCH_SIZE_MOBILE = 8;

export default function TrackingServiceScreen() {
  const { width, height } = useWindowDimensions();
  const { headerBottomOffset } = useNotificationViewport();
  const { setHeaderBottomSlot, setHeaderRightSlot } = useServicesHeaderSlot();
  const auth = useContext(AuthContext);
  const profile = auth?.profile;

  const canViewOthers = useMemo(() => {
    const role = (profile?.role?.name || '').toLowerCase();
    return role.includes('admin') || role.includes('manager');
  }, [profile]);

  const isWeb = Platform.OS === 'web';
  const isMobileWeb = isWeb && width < 920;
  const isCompactWeb = isWeb && width < 720;
  const headerFilterSizing = useMemo(() => {
    if (isMobileWeb) {
      return {
        wrapMaxWidth: 0,
        gap: 8,
        metricWidth: 0,
        periodWidth: 0,
        iconButtonWidth: 52,
        userMinWidth: 72,
        userMaxWidth: 0,
        periodClearWidth: 40,
        periodFontSize: 14,
        showLastSeen: true,
        showMetricLabels: true,
      };
    }
    const slotSpace = Math.max(520, Math.min(1280, width - 500));
    const t = Math.max(0, Math.min(1, (slotSpace - 520) / 760));
    return {
      wrapMaxWidth: slotSpace,
      gap: Math.round(4 + t * 4),
      metricWidth: Math.round(104 + t * 72),
      periodWidth: Math.round(150 + t * 138),
      iconButtonWidth: Math.round(40 + t * 12),
      userMinWidth: Math.round(48 + t * 24),
      periodClearWidth: Math.round(30 + t * 10),
      periodFontSize: t > 0.35 ? 13 : 12,
      showLastSeen: t > 0.55,
      showMetricLabels: t > 0.28,
    };
  }, [isMobileWeb, width]);

  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [userQuery, setUserQuery] = useState('');
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [userPickerVisible, setUserPickerVisible] = useState(false);
  const userSearchRequestIdRef = useRef(0);
  const lastLoadedUserQueryRef = useRef<string>('');

  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const filtersRef = useRef<Filters>(defaultFilters);

  const [routes, setRoutes] = useState<RouteWithPoints[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [periodCalendarVisible, setPeriodCalendarVisible] = useState(false);
  const [mobileFiltersExpanded, setMobileFiltersExpanded] = useState(false);
  const [mobilePointsExpanded, setMobilePointsExpanded] = useState(false);
  const [mobilePointsCollapseRequestId, setMobilePointsCollapseRequestId] = useState(0);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const [visiblePointsCount, setVisiblePointsCount] = useState(POINTS_BATCH_SIZE_DESKTOP);
  const mobileFiltersAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!profile) return;
    const profileAny = profile as any;
    setSelectedUser({
      id: profile.id,
      email: profile.email || '',
      firstName: profile.firstName ?? null,
      lastName: profile.lastName ?? null,
      middleName: profile.middleName ?? null,
      phone: profile.phone ?? null,
      avatarUrl: profileAny?.avatarUrl ?? null,
      departmentName: profileAny?.department?.name ?? null,
      isOnline: profileAny?.isOnline ?? false,
      lastSeenAt: profileAny?.lastSeenAt ?? null,
      role: profileAny?.role ?? null,
    });
  }, [profile]);

  const searchUsers = useCallback(async () => {
    if (!canViewOthers) return;
    const requestId = ++userSearchRequestIdRef.current;
    const query = userQuery.trim();
    setUserSearchLoading(true);
    try {
      const list = await getUsers(query);
      if (requestId !== userSearchRequestIdRef.current) return;
      setUserOptions(list);
      lastLoadedUserQueryRef.current = query;
    } catch (e: any) {
      console.error('Не удалось получить список пользователей', e);
    } finally {
      if (requestId === userSearchRequestIdRef.current) {
        setUserSearchLoading(false);
      }
    }
  }, [canViewOthers, userQuery]);

  useEffect(() => {
    if (!userPickerVisible || !canViewOthers) return;
    const query = userQuery.trim();
    const hasSameLoadedQuery =
      lastLoadedUserQueryRef.current === query && userOptions.length > 0;
    if (hasSameLoadedQuery) return;
    const timer = setTimeout(() => {
      void searchUsers();
    }, 280);
    return () => clearTimeout(timer);
  }, [canViewOthers, searchUsers, userOptions.length, userPickerVisible, userQuery]);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const loadRoutes = useCallback(
    async (params?: Filters) => {
      if (!selectedUser) {
        setError('Выберите пользователя');
        return;
      }
      setLoadingRoutes(true);
      setError(null);
      try {
        const current = params ?? filtersRef.current;
        const data = await fetchUserRoutesWithPoints(selectedUser.id, {
          from: current.from || undefined,
          to: current.to || undefined,
          maxAccuracy: current.maxAccuracy || undefined,
          maxPoints: current.maxPoints || undefined,
        });
        setRoutes(data.routes || []);
        setSelectedPointIndex(null);
      } catch (e: any) {
        setError(e?.message || 'Не удалось загрузить маршруты');
      } finally {
        setLoadingRoutes(false);
      }
    },
    [selectedUser]
  );

  useEffect(() => {
    if (selectedUser) {
      loadRoutes();
    }
  }, [selectedUser, loadRoutes]);

  const activeRoute = useMemo(() => routes[0] || null, [routes]);

  const points = useMemo(() => {
    const pts = activeRoute?.points ?? [];
    return [...pts].sort((a, b) => {
      const ta = new Date(a.recordedAt || 0).getTime();
      const tb = new Date(b.recordedAt || 0).getTime();
      return tb - ta;
    });
  }, [activeRoute]);

  const spacedPoints = useMemo(() => filterNearbyPoints(points), [points]);

  const displayLimit = useMemo(
    () => parseLimitValue(filters.maxPoints, DEFAULT_POINTS_LIMIT),
    [filters.maxPoints]
  );

  const limitedPoints = useMemo(
    () => spacedPoints.slice(0, displayLimit),
    [spacedPoints, displayLimit]
  );

  const pointLabels = useMemo<PointLabel[]>(
    () =>
      limitedPoints.map((point, idx) => ({
        latitude: point.latitude,
        longitude: point.longitude,
        label: `${idx + 1}. ${formatDateTime(point.recordedAt)}`,
      })),
    [limitedPoints]
  );

  const pointDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }),
    []
  );
  const pointTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    []
  );
  const filteredPointRows = useMemo<TrackingPointRow[]>(
    () =>
      limitedPoints.map((point, globalIdx) => {
        const dt = new Date(point.recordedAt || 0);
        const dateLabel = Number.isNaN(dt.getTime()) ? '-' : pointDateFormatter.format(dt);
        const timeLabel = Number.isNaN(dt.getTime()) ? '-' : pointTimeFormatter.format(dt);
        return { point, globalIdx, dateLabel, timeLabel };
      }),
    [limitedPoints, pointDateFormatter, pointTimeFormatter]
  );

  const pointsBatchSize = isMobileWeb ? POINTS_BATCH_SIZE_MOBILE : POINTS_BATCH_SIZE_DESKTOP;
  const visiblePoints = useMemo(
    () => filteredPointRows.slice(0, visiblePointsCount),
    [filteredPointRows, visiblePointsCount]
  );
  const hasMoreVisiblePoints = visiblePoints.length < filteredPointRows.length;
  const selectedPointPosition = useMemo(() => {
    if (filteredPointRows.length === 0) return -1;
    if (selectedPointIndex == null) return 0;
    return filteredPointRows.findIndex((row) => row.globalIdx === selectedPointIndex);
  }, [filteredPointRows, selectedPointIndex]);
  const hasPrevPoint = selectedPointPosition > 0;
  const hasNextPoint =
    selectedPointPosition >= 0 && selectedPointPosition < filteredPointRows.length - 1;

  useEffect(() => {
    setVisiblePointsCount(pointsBatchSize);
  }, [filteredPointRows.length, pointsBatchSize]);

  const mapHeight = useMemo(() => Math.max(height, 360), [height]);
  const desktopPointPanelTop = useMemo(
    () => Math.max(headerBottomOffset + 4, 92),
    [headerBottomOffset]
  );
  const selectedUserInitials = useMemo(() => {
    const first = String(selectedUser?.firstName || '').trim();
    const last = String(selectedUser?.lastName || '').trim();
    if (first || last) {
      return `${first[0] || ''}${last[0] || first[1] || ''}`.toUpperCase();
    }
    const local = String(selectedUser?.email || '').split('@')[0];
    if (local.length >= 2) return local.slice(0, 2).toUpperCase();
    if (local.length === 1) return `${local}${local}`.toUpperCase();
    return 'U';
  }, [selectedUser?.email, selectedUser?.firstName, selectedUser?.lastName]);
  const selectedUserLastSeenLabel = useMemo(() => {
    if (selectedUser?.isOnline) return 'В сети сейчас';
    if (!selectedUser?.lastSeenAt) return 'Последний визит: нет данных';
    const parsed = new Date(selectedUser.lastSeenAt);
    if (Number.isNaN(parsed.getTime())) return 'Последний визит: нет данных';
    return `Был(а) в сети: ${parsed.toLocaleString('ru-RU')}`;
  }, [selectedUser?.isOnline, selectedUser?.lastSeenAt]);
  const rangeLabel = useMemo(() => {
    const formatRangeDate = (iso?: string) => {
      if (!iso) return '—';
      const parsed = new Date(iso);
      if (Number.isNaN(parsed.getTime())) return '—';
      return parsed.toLocaleDateString('ru-RU');
    };
    return `${formatRangeDate(filters.from)} - ${formatRangeDate(filters.to)}`;
  }, [filters.from, filters.to]);

  const focusPoint = useCallback(
    (idx: number) => {
      if (!limitedPoints[idx]) return;
      setSelectedPointIndex(idx);
    },
    [limitedPoints]
  );

  const clearPeriod = useCallback(() => {
    const next = {
      ...filtersRef.current,
      from: '',
      to: '',
    };
    setFilters(next);
    filtersRef.current = next;
  }, []);

  const primaryBtnStyle = useCallback(
    (state: any) => [
      styles.primaryBtn,
      state?.hovered && styles.primaryBtnHover,
      state?.pressed && styles.primaryBtnPressed,
    ],
    []
  );
  const secondaryBtnStyle = useCallback(
    (state: any) => [
      styles.secondaryBtn,
      state?.hovered && styles.secondaryBtnHover,
      state?.pressed && styles.secondaryBtnPressed,
    ],
    []
  );

  const loadMoreVisiblePoints = useCallback(() => {
    if (!hasMoreVisiblePoints) return;
    setVisiblePointsCount((prev) => Math.min(prev + pointsBatchSize, filteredPointRows.length));
  }, [filteredPointRows.length, hasMoreVisiblePoints, pointsBatchSize]);
  const focusPrevMobilePoint = useCallback(() => {
    if (!hasPrevPoint || selectedPointPosition < 1) return;
    const prevRow = filteredPointRows[selectedPointPosition - 1];
    if (!prevRow) return;
    focusPoint(prevRow.globalIdx);
  }, [filteredPointRows, focusPoint, hasPrevPoint, selectedPointPosition]);
  const focusNextMobilePoint = useCallback(() => {
    if (!hasNextPoint || selectedPointPosition < 0) return;
    const nextRow = filteredPointRows[selectedPointPosition + 1];
    if (!nextRow) return;
    focusPoint(nextRow.globalIdx);
  }, [filteredPointRows, focusPoint, hasNextPoint, selectedPointPosition]);

  useEffect(() => {
    if (!isMobileWeb && mobileFiltersExpanded) {
      setMobileFiltersExpanded(false);
    }
  }, [isMobileWeb, mobileFiltersExpanded]);
  useEffect(() => {
    if (!isMobileWeb && mobilePointsExpanded) {
      setMobilePointsExpanded(false);
    }
  }, [isMobileWeb, mobilePointsExpanded]);
  useEffect(() => {
    if (!isMobileWeb || !mobilePointsExpanded) return;
    if (selectedPointIndex != null) return;
    const first = filteredPointRows[0];
    if (!first) return;
    setSelectedPointIndex(first.globalIdx);
  }, [filteredPointRows, isMobileWeb, mobilePointsExpanded, selectedPointIndex]);

  useEffect(() => {
    if (!isMobileWeb) {
      mobileFiltersAnim.setValue(0);
      return;
    }
    Animated.timing(mobileFiltersAnim, {
      toValue: mobileFiltersExpanded ? 1 : 0,
      duration: mobileFiltersExpanded ? 220 : 180,
      easing: mobileFiltersExpanded ? Easing.out(Easing.cubic) : Easing.inOut(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [isMobileWeb, mobileFiltersAnim, mobileFiltersExpanded]);
  const headerFiltersSlot = useMemo(
    () => (
      <View
        style={[
          styles.headerFiltersWrap,
          !isMobileWeb && styles.headerFiltersWrapDesktop,
          !isMobileWeb && { maxWidth: headerFilterSizing.wrapMaxWidth },
        ]}
      >
        {isMobileWeb ? (
          <Animated.View
            pointerEvents={mobileFiltersExpanded ? 'auto' : 'none'}
            style={[
              styles.mobileFiltersAnimatedWrap,
              {
                opacity: mobileFiltersAnim,
                maxHeight: mobileFiltersAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 240],
                }),
                transform: [
                  {
                    translateY: mobileFiltersAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-8, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.mobileFiltersStack}>
            <Pressable
              onPress={() => canViewOthers && setUserPickerVisible(true)}
              disabled={!canViewOthers}
              style={(state: any) => [
                styles.topOverlayField,
                styles.topOverlayUserField,
                styles.mobileUserField,
                !canViewOthers && { opacity: 0.65 },
                state?.hovered && canViewOthers && { borderColor: '#93C5FD' },
                state?.pressed && { opacity: 0.95, transform: [{ scale: 0.99 }] },
              ]}
            >
              <View style={styles.topOverlayUserInfo}>
                <View style={styles.topOverlayUserAvatarWrap}>
                  {selectedUser?.avatarUrl ? (
                    <Image source={{ uri: selectedUser.avatarUrl }} style={styles.topOverlayUserAvatar} />
                  ) : (
                    <View style={styles.topOverlayUserAvatarFallback}>
                      <Text style={styles.topOverlayUserAvatarFallbackText}>{selectedUserInitials}</Text>
                    </View>
                  )}
                  <View
                    style={[
                      styles.topOverlayUserPresenceDot,
                      { backgroundColor: selectedUser?.isOnline ? '#22C55E' : '#94A3B8' },
                    ]}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.inputValue} numberOfLines={1}>
                    {humanName(selectedUser)}
                  </Text>
                  <Text style={styles.topOverlayUserLastSeen} numberOfLines={1}>
                    {selectedUserLastSeenLabel}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-down" size={16} color="#64748B" />
            </Pressable>

            <View style={[styles.topOverlayPeriodControl, styles.topOverlayPeriodControlMobile]}>
              <Pressable
                onPress={() => setPeriodCalendarVisible(true)}
                style={(state: any) => [
                  styles.topOverlayPeriodMainBtn,
                  state?.hovered && { backgroundColor: '#DBEAFE' },
                  state?.pressed && { opacity: 0.95 },
                ]}
              >
                <Ionicons name="calendar-clear-outline" size={16} color="#1D4ED8" />
                <Text style={styles.secondaryBtnText} numberOfLines={1}>
                  {rangeLabel}
                </Text>
              </Pressable>
              <Pressable
                onPress={clearPeriod}
                accessibilityLabel="Очистить период"
                disabled={!filters.from && !filters.to}
                style={(state: any) => [
                  styles.topOverlayPeriodClearBtn,
                  (!filters.from && !filters.to) && { opacity: 0.45 },
                  state?.hovered && (filters.from || filters.to) && { backgroundColor: '#DBEAFE' },
                  state?.pressed && (filters.from || filters.to) && { opacity: 0.9 },
                ]}
              >
                <Ionicons name="close-outline" size={16} color="#1D4ED8" />
              </Pressable>
            </View>

            <View style={styles.mobileMetricsRow}>
              <View style={[styles.topOverlayField, styles.topOverlayLabeledField, styles.mobileMetricField]}>
                <Text style={styles.topOverlayFieldLabel}>Точность, м</Text>
                <View style={styles.topOverlayInputRow}>
                  <Ionicons name="locate-outline" size={16} color="#64748B" />
                  <TextInput
                    value={filters.maxAccuracy}
                    onChangeText={(value) => setFilters((prev) => ({ ...prev, maxAccuracy: value }))}
                    keyboardType="numeric"
                    placeholder="Напр. 20"
                    placeholderTextColor="#94A3B8"
                    style={styles.textInput}
                  />
                </View>
              </View>

              <View style={[styles.topOverlayField, styles.topOverlayLabeledField, styles.mobileMetricField]}>
                <Text style={styles.topOverlayFieldLabel}>Количество точек</Text>
                <View style={styles.topOverlayInputRow}>
                  <Ionicons name="list-outline" size={16} color="#64748B" />
                  <TextInput
                    value={filters.maxPoints}
                    onChangeText={(value) => setFilters((prev) => ({ ...prev, maxPoints: value }))}
                    keyboardType="numeric"
                    placeholder="Напр. 100"
                    placeholderTextColor="#94A3B8"
                    style={styles.textInput}
                  />
                </View>
              </View>
            </View>
            </View>
          </Animated.View>
        ) : (
          <View style={[styles.topOverlayGrid, { gap: headerFilterSizing.gap }]}>
            <Pressable
              onPress={() => canViewOthers && setUserPickerVisible(true)}
              disabled={!canViewOthers}
              style={(state: any) => [
                styles.topOverlayField,
                styles.topOverlayUserField,
                { minWidth: headerFilterSizing.userMinWidth },
                !canViewOthers && { opacity: 0.65 },
                state?.hovered && canViewOthers && { borderColor: '#93C5FD' },
                state?.pressed && { opacity: 0.95, transform: [{ scale: 0.99 }] },
              ]}
            >
              <View style={styles.topOverlayUserInfo}>
                <View style={styles.topOverlayUserAvatarWrap}>
                  {selectedUser?.avatarUrl ? (
                    <Image source={{ uri: selectedUser.avatarUrl }} style={styles.topOverlayUserAvatar} />
                  ) : (
                    <View style={styles.topOverlayUserAvatarFallback}>
                      <Text style={styles.topOverlayUserAvatarFallbackText}>{selectedUserInitials}</Text>
                    </View>
                  )}
                  <View
                    style={[
                      styles.topOverlayUserPresenceDot,
                      { backgroundColor: selectedUser?.isOnline ? '#22C55E' : '#94A3B8' },
                    ]}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.inputValue} numberOfLines={1}>
                    {humanName(selectedUser)}
                  </Text>
                  {headerFilterSizing.showLastSeen ? (
                    <Text style={styles.topOverlayUserLastSeen} numberOfLines={1}>
                      {selectedUserLastSeenLabel}
                    </Text>
                  ) : null}
                </View>
              </View>
              <Ionicons name="chevron-down" size={16} color="#64748B" />
            </Pressable>

            <View
              style={[
                styles.topOverlayField,
                styles.topOverlayLabeledField,
                styles.topOverlayAccuracyField,
                {
                  width: headerFilterSizing.metricWidth,
                  minWidth: headerFilterSizing.metricWidth,
                },
                !headerFilterSizing.showMetricLabels && styles.topOverlayFieldCompact,
              ]}
            >
              {headerFilterSizing.showMetricLabels ? (
                <Text style={styles.topOverlayFieldLabel}>Точность, м</Text>
              ) : null}
              <View
                style={[
                  styles.topOverlayInputRow,
                  !headerFilterSizing.showMetricLabels && styles.topOverlayInputRowCompact,
                ]}
              >
                <Ionicons name="locate-outline" size={16} color="#64748B" />
                <TextInput
                  value={filters.maxAccuracy}
                  onChangeText={(value) => setFilters((prev) => ({ ...prev, maxAccuracy: value }))}
                  keyboardType="numeric"
                  placeholder="Напр. 20"
                  placeholderTextColor="#94A3B8"
                  style={styles.textInput}
                />
              </View>
            </View>

            <View
              style={[
                styles.topOverlayField,
                styles.topOverlayLabeledField,
                styles.topOverlayPointsField,
                {
                  width: headerFilterSizing.metricWidth,
                  minWidth: headerFilterSizing.metricWidth,
                },
                !headerFilterSizing.showMetricLabels && styles.topOverlayFieldCompact,
              ]}
            >
              {headerFilterSizing.showMetricLabels ? (
                <Text style={styles.topOverlayFieldLabel}>Количество точек</Text>
              ) : null}
              <View
                style={[
                  styles.topOverlayInputRow,
                  !headerFilterSizing.showMetricLabels && styles.topOverlayInputRowCompact,
                ]}
              >
                <Ionicons name="list-outline" size={16} color="#64748B" />
                <TextInput
                  value={filters.maxPoints}
                  onChangeText={(value) => setFilters((prev) => ({ ...prev, maxPoints: value }))}
                  keyboardType="numeric"
                  placeholder="Напр. 100"
                  placeholderTextColor="#94A3B8"
                  style={styles.textInput}
                />
              </View>
            </View>

            <View
              style={[
                styles.topOverlayPeriodControl,
                {
                  width: headerFilterSizing.periodWidth,
                  minWidth: headerFilterSizing.periodWidth,
                  maxWidth: headerFilterSizing.periodWidth,
                },
              ]}
            >
              <Pressable
                onPress={() => setPeriodCalendarVisible(true)}
                style={(state: any) => [
                  styles.topOverlayPeriodMainBtn,
                  state?.hovered && { backgroundColor: '#DBEAFE' },
                  state?.pressed && { opacity: 0.95 },
                ]}
              >
                <Ionicons name="calendar-clear-outline" size={16} color="#1D4ED8" />
                <Text
                  style={[styles.secondaryBtnText, { fontSize: headerFilterSizing.periodFontSize }]}
                  numberOfLines={1}
                >
                  {rangeLabel}
                </Text>
              </Pressable>
              <Pressable
                onPress={clearPeriod}
                accessibilityLabel="Очистить период"
                disabled={!filters.from && !filters.to}
                style={(state: any) => [
                  styles.topOverlayPeriodClearBtn,
                  { width: headerFilterSizing.periodClearWidth },
                  (!filters.from && !filters.to) && { opacity: 0.45 },
                  state?.hovered && (filters.from || filters.to) && { backgroundColor: '#DBEAFE' },
                  state?.pressed && (filters.from || filters.to) && { opacity: 0.9 },
                ]}
              >
                <Ionicons name="close-outline" size={16} color="#1D4ED8" />
              </Pressable>
            </View>

            <Pressable
              onPress={() => loadRoutes(filters)}
              accessibilityLabel="Обновить маршруты"
              style={(state: any) => [
                ...primaryBtnStyle(state),
                styles.topOverlayActionBtn,
                styles.topOverlayIconOnlyBtn,
                {
                  width: headerFilterSizing.iconButtonWidth,
                  minWidth: headerFilterSizing.iconButtonWidth,
                },
              ]}
            >
              {loadingRoutes ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Ionicons name="sync-outline" size={18} color="#FFFFFF" />
              )}
            </Pressable>
          </View>
        )}
        {error ? <Text style={styles.topOverlayError}>{error}</Text> : null}
      </View>
    ),
    [
      canViewOthers,
      error,
      filters,
      isMobileWeb,
      mobileFiltersAnim,
      mobileFiltersExpanded,
      loadingRoutes,
      rangeLabel,
      clearPeriod,
      headerFilterSizing,
      selectedUser,
      selectedUserInitials,
      selectedUserLastSeenLabel,
      loadRoutes,
      primaryBtnStyle,
    ]
  );

  const mobileHeaderControlsSlot = useMemo(
    () => (
      <View style={styles.mobileHeaderControlsRow}>
        <Pressable
          onPress={() => loadRoutes(filters)}
          accessibilityLabel="Обновить маршруты"
          style={(state: any) => [
            ...primaryBtnStyle(state),
            styles.topOverlayActionBtn,
            styles.mobileHeaderIconBtn,
          ]}
        >
          {loadingRoutes ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Ionicons name="sync-outline" size={16} color="#FFFFFF" />
          )}
        </Pressable>
        <Pressable
          onPress={() => setMobileFiltersExpanded((prev) => !prev)}
          accessibilityLabel={mobileFiltersExpanded ? 'Свернуть фильтры' : 'Открыть фильтры'}
          style={(state: any) => [
            ...secondaryBtnStyle(state),
            styles.topOverlayActionBtn,
            styles.mobileHeaderIconBtn,
            mobileFiltersExpanded && styles.mobileHeaderIconBtnActive,
          ]}
        >
          <Ionicons name="options-outline" size={16} color="#1D4ED8" />
        </Pressable>
      </View>
    ),
    [
      filters,
      loadRoutes,
      loadingRoutes,
      mobileFiltersExpanded,
      primaryBtnStyle,
      secondaryBtnStyle,
    ]
  );

  useEffect(() => {
    if (isMobileWeb) {
      setHeaderRightSlot(mobileHeaderControlsSlot);
      setHeaderBottomSlot(headerFiltersSlot);
      return () => {
        setHeaderBottomSlot(null);
        setHeaderRightSlot(null);
      };
    }
    setHeaderBottomSlot(null);
    setHeaderRightSlot(headerFiltersSlot);
    return () => setHeaderRightSlot(null);
  }, [
    headerFiltersSlot,
    isMobileWeb,
    mobileHeaderControlsSlot,
    setHeaderBottomSlot,
    setHeaderRightSlot,
  ]);

  return (
    <View style={styles.fullMapRoot}>
      {isMobileWeb && mobileFiltersExpanded ? (
        <Pressable
          style={styles.mobileFiltersBackdrop}
          onPress={() => setMobileFiltersExpanded(false)}
        />
      ) : null}
      <View style={styles.fullMapLayer}>
        <LeafletMap
          points={pointLabels}
          selectedIndex={selectedPointIndex}
          selectedVerticalOffsetPx={
            isMobileWeb && mobilePointsExpanded && selectedPointIndex != null
              ? Math.max(48, Math.round(mapHeight * 0.18))
              : 0
          }
          onMapTap={() => {
            if (!isMobileWeb || !mobilePointsExpanded) return;
            setMobilePointsExpanded(false);
            setMobilePointsCollapseRequestId((prev) => prev + 1);
          }}
          height={mapHeight}
        />
      </View>

      <View pointerEvents="none" style={styles.fullMapTint} />
      <TrackingPointsIsland
        isMobileWeb={isMobileWeb}
        rows={filteredPointRows}
        visibleRows={visiblePoints}
        selectedPointIndex={selectedPointIndex}
        onSelectPoint={focusPoint}
        onPrev={focusPrevMobilePoint}
        onNext={focusNextMobilePoint}
        hasPrev={hasPrevPoint}
        hasNext={hasNextPoint}
        onLoadMore={loadMoreVisiblePoints}
        hasMore={hasMoreVisiblePoints}
        desktopTop={desktopPointPanelTop}
        onExpandedChange={setMobilePointsExpanded}
        collapseRequestId={mobilePointsCollapseRequestId}
      />

      <TrackingUserPickerModal
        visible={userPickerVisible}
        userQuery={userQuery}
        userSearchLoading={userSearchLoading}
        userOptions={userOptions}
        selectedUserId={selectedUser?.id}
        onClose={() => setUserPickerVisible(false)}
        onChangeQuery={setUserQuery}
        onSubmitSearch={searchUsers}
        onSelectUser={(user) => {
          setSelectedUser(user);
          setUserPickerVisible(false);
        }}
      />

      <TrackingPeriodRangeModal
        visible={periodCalendarVisible}
        compact={isCompactWeb}
        initialFrom={filtersRef.current.from || null}
        initialTo={filtersRef.current.to || null}
        onClose={() => setPeriodCalendarVisible(false)}
        onApply={(from, to) => {
          const next = {
            ...filtersRef.current,
            from: from.toISOString(),
            to: to.toISOString(),
          };
          filtersRef.current = next;
          setFilters(next);
        }}
        onReset={() => {
          const next = {
            ...filtersRef.current,
            from: '',
            to: '',
          };
          filtersRef.current = next;
          setFilters(next);
        }}
      />
    </View>
  );
}
