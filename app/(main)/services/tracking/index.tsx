import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Platform, ScrollView, StyleSheet, View, useWindowDimensions, type FlatListProps } from 'react-native';
import { ActivityIndicator, Avatar, Button, Dialog, Divider, Icon, IconButton, List, Menu, Portal, Surface, Text, TouchableRipple } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { useOptionalTabBarVisibility } from '@/components/Navigation/TabBarVisibilityContext';
import { useOptionalLastServiceRoute } from '@/src/features/navigation/LastServiceRouteContext';
import TrackingDayPanel from '@/src/features/tracking/TrackingDayPanel';
import TrackingDayPanelHeader from '@/src/features/tracking/TrackingDayPanelHeader';
import type { TrackingTimelineItem } from '@/src/features/tracking/TrackingDayPanel.types';
import { SearchPickerScreen } from '@/src/features/clientOrders/screen/mobile/SearchPickerScreen';
import { getRoleDisplayName } from '@/utils/rbacLabels';
import { getAuthDevicePayload } from '@/utils/tokenService';
import { requestTrackingPosition } from '@/utils/trackingV2Service';
import { trackingCommandConnectionLabel } from '@/utils/trackingReliability';
import { trackingCalendarDate, trackingDayFromCalendar, trackingDayKey, trackingDayLabel, trackingShiftDay, trackingTime as time } from '@/src/features/tracking/trackingPresentation';
import { fetchLocationRequest, fetchTrackingDay, fetchTrackingDayEvents, fetchTrackingLive, fetchTrackingUsers, requestLiveLocation, type TrackingDayData, type TrackingLiveData, type TrackingV2User } from '@/utils/trackingService';
import TrackingMap from './TrackingMap';

function displayName(user?: TrackingV2User | null) {
  return user ? [user.lastName, user.firstName, user.middleName].filter(Boolean).join(' ') || user.email || `Сотрудник ${user.id}` : 'Выбрать сотрудника';
}
function employeeDescription(user: TrackingV2User) {
  const roles = user.roles?.length ? user.roles : user.role ? [user.role] : [];
  return `${user.department?.name || 'Без отдела'} · ${[...new Set(roles.map(getRoleDisplayName))].join(', ') || 'Роль не указана'}`;
}
function currency(value?: string | null) {
  const number = Number(value);
  return Number.isFinite(number) ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(number)} ₽` : '—';
}
function distance(meters = 0) { return meters >= 1000 ? `${(meters / 1000).toFixed(1)} км` : `${meters} м`; }
function duration(seconds = 0) {
  const totalMinutes = Math.round(seconds / 60);
  return totalMinutes >= 60 ? `${Math.floor(totalMinutes / 60)} ч ${totalMinutes % 60} мин` : `${totalMinutes} мин`;
}
function ageLabel(value?: string | null) {
  if (!value) return 'Нет координат';
  const seconds = Math.max(0, (Date.now() - Date.parse(value)) / 1000);
  if (seconds < 60) return 'Получена сейчас';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин назад`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч назад`;
  return `${Math.floor(seconds / 86400)} дн. назад`;
}

export default function TrackingServiceScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const lastService = useOptionalLastServiceRoute();
  const setTabBarHidden = useOptionalTabBarVisibility()?.setHidden;
  const wide = width >= 920;
  const [users, setUsers] = useState<TrackingV2User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [initialRetry, setInitialRetry] = useState(0);
  const [selectedUser, setSelectedUser] = useState<TrackingV2User | null>(null);
  const [ownUserId, setOwnUserId] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState(() => trackingDayKey(new Date()));
  const [dateDraft, setDateDraft] = useState(selectedDay);
  const [data, setData] = useState<TrackingDayData | null>(null);
  const [live, setLive] = useState<TrackingLiveData | null>(null);
  const [loadedKey, setLoadedKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [visibleEvents, setVisibleEvents] = useState(40);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const eventsRequest = useRef<object | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [dateVisible, setDateVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [usersRetry, setUsersRetry] = useState(0);
  const [usersOffset, setUsersOffset] = useState(0);
  const [usersHasMore, setUsersHasMore] = useState(false);
  const usersPageInFlight = useRef(false);
  const [mapFocus, setMapFocus] = useState<{ key: string; latitude: number; longitude: number } | null>(null);
  const [fitRevision, setFitRevision] = useState(0);
  const [, setClock] = useState(0);
  const mounted = useRef(true);
  const loadSequence = useRef(0);
  const requestInFlight = useRef(false);
  const selectionKey = `${selectedUser?.id ?? 0}:${selectedDay}`;
  const selectionRef = useRef(selectionKey);
  selectionRef.current = selectionKey;
  const currentData = loadedKey === selectionKey ? data : null;
  const currentLive = loadedKey === selectionKey ? live : null;
  const connectionLabel = currentLive?.device?.enabled ? trackingCommandConnectionLabel(currentLive.device.lastCommandPollAt) : null;
  const today = trackingDayKey(new Date());
  const dateLabel = selectedDay >= trackingShiftDay(today, -1)
    ? `${trackingDayLabel(selectedDay)} · ${trackingCalendarDate(selectedDay).toLocaleDateString('ru-RU')}`
    : trackingCalendarDate(selectedDay).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  const bottomInset = insets.bottom;
  const modalStyle = { maxHeight: Math.max(200, height - insets.top - insets.bottom - 40) };

  useFocusEffect(useCallback(() => {
    setTabBarHidden?.(true);
    // Age labels must keep aging even if the manager leaves the map untouched.
    const timer = setInterval(() => setClock((value) => value + 1), 30_000);
    return () => { clearInterval(timer); setTabBarHidden?.(false); };
  }, [setTabBarHidden]));
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; loadSequence.current += 1; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setInitialLoading(true);
    setInitialError(null);
    // A dedicated self query is not affected by alphabetical pagination/search.
    void fetchTrackingUsers('', { self: true }).then((result) => {
      if (!cancelled) { setOwnUserId(result[0]?.id ?? null); setSelectedUser((current) => current || result[0] || null); }
    }).catch((reason) => {
      if (!cancelled) setInitialError(reason instanceof Error ? reason.message : 'Не удалось загрузить свой профиль');
    }).finally(() => { if (!cancelled) setInitialLoading(false); });
    return () => { cancelled = true; };
  }, [initialRetry]);
  useEffect(() => {
    if (!pickerVisible) return;
    let cancelled = false;
    usersPageInFlight.current = true;
    setUsersLoading(true);
    setUsersError(null);
    void fetchTrackingUsers(query, { offset: usersOffset }).then((result) => {
      if (cancelled) return;
      setUsers((current) => usersOffset ? [...current, ...result.filter((user) => !current.some((existing) => existing.id === user.id))] : result);
      setUsersHasMore(result.length === 100);
    }).catch((reason) => {
      if (!cancelled) setUsersError(reason instanceof Error ? reason.message : 'Не удалось загрузить сотрудников');
    }).finally(() => { if (!cancelled) { setUsersLoading(false); usersPageInFlight.current = false; } });
    return () => { cancelled = true; };
  }, [pickerVisible, query, usersOffset, usersRetry]);

  const selectedUserId = selectedUser?.id;
  const loadDay = useCallback(async () => {
    if (!selectedUserId) return;
    const sequence = ++loadSequence.current;
    const key = `${selectedUserId}:${selectedDay}`;
    setLoading(true);
    setError(null);
    setEventsError(null);
    setEventsLoading(false);
    eventsRequest.current = null;
    try {
      const [day, current] = await Promise.all([fetchTrackingDay(selectedUserId, selectedDay), fetchTrackingLive(selectedUserId)]);
      if (!mounted.current || sequence !== loadSequence.current || key !== selectionRef.current) return;
      setData(day);
      setLive(current);
      setLoadedKey(key);
      setVisibleEvents(40);
    } catch (reason) {
      if (mounted.current && sequence === loadSequence.current && key === selectionRef.current) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить геомаршрут');
    } finally {
      if (mounted.current && sequence === loadSequence.current) setLoading(false);
    }
  }, [selectedDay, selectedUserId]);
  useEffect(() => { void loadDay(); }, [loadDay]);
  useEffect(() => { setMapFocus(null); setEventsError(null); setVisibleEvents(40); }, [selectionKey]);
  useEffect(() => { setDetailsExpanded(false); }, [selectedUserId]);

  const requestPosition = async () => {
    if (!selectedUser || requestInFlight.current) return;
    requestInFlight.current = true;
    setRequesting(true);
    setError(null);
    const key = selectionKey;
    try {
      const local = Platform.OS === 'android' && selectedUser.id === ownUserId;
      const localInstallId = local ? (await getAuthDevicePayload()).installId : undefined;
      const request = await requestLiveLocation(selectedUser.id, localInstallId);
      if (request.failureReason === 'DEVICE_UPDATE_REQUIRED' || request.failureReason === 'PUSH_UNAVAILABLE') throw new Error('На телефоне сотрудника нужен новый APK с фоновым запросом координат. После установки откройте приложение и включите отслеживание');
      let localError: Error | null = null;
      if (local && request.delivery !== 'native_poll' && request.status === 'PENDING') {
        void requestTrackingPosition(request.id).catch((reason) => { localError = reason instanceof Error ? reason : new Error('Не удалось определить геопозицию'); });
      }
      const deadline = Math.min(Date.parse(request.expiresAt) || Date.now() + 60_000, Date.now() + 60_000);
      let result = await fetchLocationRequest(request.id);
      while (result.status === 'PENDING' && Date.now() < deadline && mounted.current && selectionRef.current === key) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        if (!mounted.current || selectionRef.current !== key) return;
        result = await fetchLocationRequest(request.id);
        if (result.status === 'PENDING' && localError) throw localError;
      }
      if (!mounted.current || selectionRef.current !== key) return;
      if (result.status === 'SUCCEEDED') {
        await loadDay();
        if (!mounted.current || selectionRef.current !== key) return;
        if (result.point) setMapFocus({ key: `requested-${request.id}`, latitude: result.point.latitude, longitude: result.point.longitude });
        setDetailsExpanded(false);
      } else setError(result.failureReason === 'LOCATION_PERMISSION_DENIED' ? 'На телефоне сотрудника нет разрешения на геопозицию.' : result.failureReason === 'LOCATION_SERVICES_DISABLED' ? 'На телефоне сотрудника выключена геолокация.' : result.status === 'FAILED' ? 'Телефон не смог определить или отправить свежую позицию. Проверьте GPS и интернет.' : 'Телефон не ответил за минуту. Доступна последняя полученная позиция.');
    } catch (reason) {
      if (mounted.current && selectionRef.current === key) setError(reason instanceof Error ? reason.message : 'Не удалось запросить геопозицию');
    } finally {
      requestInFlight.current = false;
      if (mounted.current) setRequesting(false);
    }
  };
  const events = useMemo<TrackingTimelineItem[]>(() => [
    // Do not expose later stops before the next page of orders is loaded, or
    // appending earlier orders would move rows already on screen.
    ...(currentData?.stops || []).filter((stop) => !currentData?.orderEventsNextCursor || stop.startedAt < (currentData.orderEvents[currentData.orderEvents.length - 1]?.capturedAt || '')).map((stop) => ({
      key: `stop-${stop.startedAt}`, at: stop.startedAt, icon: 'pause-circle-outline', color: '#D97706',
      title: `Остановка ${Math.max(1, Math.round(stop.durationSeconds / 60))} мин`, subtitle: `${time(stop.startedAt)}–${time(stop.endedAt)}`,
      orderGuid: null as string | null, latitude: stop.latitude, longitude: stop.longitude,
    })),
    ...(currentData?.orderEvents || []).map((event) => ({
      key: event.id, at: event.capturedAt, icon: event.eventType === 'CREATED' ? 'file-document-outline' : 'cloud-upload-outline', color: event.status === 'CAPTURED' ? '#16A34A' : '#94A3B8',
      title: event.eventType === 'CREATED' ? 'Создан заказ' : 'Заказ отправлен', subtitle: `${event.order.number || 'Черновик'} · ${event.order.counterpartyName} · ${currency(event.order.totalAmount)}`,
      orderGuid: event.order.guid || null, latitude: event.latitude, longitude: event.longitude,
    })),
  ].sort((left, right) => Date.parse(left.at) - Date.parse(right.at) || left.key.localeCompare(right.key)), [currentData]);
  const loadMoreEvents = async () => {
    if (loading || eventsRequest.current || !currentData || !selectedUserId) return;
    if (visibleEvents < events.length) { setVisibleEvents((value) => value + 40); return; }
    const cursor = currentData.orderEventsNextCursor;
    if (!cursor) return;
    const pending = {};
    eventsRequest.current = pending;
    const key = selectionKey;
    const sequence = loadSequence.current;
    setEventsLoading(true);
    setEventsError(null);
    try {
      const page = await fetchTrackingDayEvents(selectedUserId, selectedDay, cursor);
      if (!mounted.current || selectionRef.current !== key || sequence !== loadSequence.current) return;
      setData((current) => current ? { ...current, orderEventsNextCursor: page.orderEventsNextCursor,
        orderEvents: [...current.orderEvents, ...page.orderEvents.filter((event) => !current.orderEvents.some((old) => old.id === event.id))] } : current);
      setVisibleEvents((value) => value + 40);
    } catch (reason) {
      if (mounted.current && selectionRef.current === key && sequence === loadSequence.current) setEventsError(reason instanceof Error ? reason.message : 'Не удалось загрузить события');
    } finally {
      if (eventsRequest.current === pending) { eventsRequest.current = null; if (mounted.current) setEventsLoading(false); }
    }
  };
  const summary = currentData ? `${distance(currentData.summary.distanceMeters)} · остановки: ${currentData.summary.stopsCount} · заказы: ${currentData.summary.ordersCount}` : loading || initialLoading ? 'Загружаем маршрут…' : 'Нет данных за этот день';
  const closeService = () => { lastService?.clearLastServiceRoute(); router.replace('/services'); };
  const fitRoute = () => { setMapFocus(null); setFitRevision((value) => value + 1); setDetailsExpanded(false); };
  const selectDay = (day: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day <= trackingDayKey(new Date()) && trackingDayFromCalendar(trackingCalendarDate(day)) === day) setSelectedDay(day);
  };
  const openCalendar = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: trackingCalendarDate(selectedDay), mode: 'date', maximumDate: trackingCalendarDate(today), onChange: (event, value) => { if (event.type === 'set' && value) selectDay(trackingDayFromCalendar(value)); } });
    } else { setDateDraft(selectedDay); setDateVisible(true); }
  };

  const details = <>
    <Text variant="labelMedium" style={styles.muted}>Время Омска · {trackingCalendarDate(selectedDay).toLocaleDateString('ru-RU')}</Text>
    <View style={styles.metrics}>
      <Metric icon="map-marker-distance" label="Маршрут" value={currentData ? distance(currentData.summary.distanceMeters) : '—'} />
      <Metric icon="walk" label="В движении" value={currentData ? duration(currentData.summary.movingSeconds) : '—'} />
      <Metric icon="clock-start" label="Первая точка" value={time(currentData?.summary.startedAt)} />
      <Metric icon="flag-outline" label="Последняя точка" value={time(currentData?.summary.endedAt)} />
      <Metric icon="pause-circle-outline" label="Остановки" value={currentData ? String(currentData.summary.stopsCount) : '—'} />
      <Metric icon="file-document-outline" label="Заказы" value={currentData ? String(currentData.summary.ordersCount) : '—'} />
    </View>
    <List.Item title="Последняя позиция" titleStyle={styles.eventTitle} descriptionStyle={styles.eventDescription} style={styles.eventRow} description={`${ageLabel(currentLive?.point?.recordedAt)}${currentLive?.point?.accuracy != null ? ` · точность ±${Math.round(currentLive.point.accuracy)} м` : ''}${currentLive?.point?.batteryLevel != null ? ` · заряд ${Math.round(currentLive.point.batteryLevel)}%` : ''}`} descriptionNumberOfLines={2} left={() => <View style={styles.eventIcon}><Icon source="crosshairs-gps" color="#DC2626" size={18} /></View>} />
    <Divider />
    <List.Subheader>Хронология</List.Subheader>
  </>;

  const eventListProps: FlatListProps<TrackingTimelineItem> = {
    data: events.slice(0, visibleEvents), keyExtractor: (event) => event.key,
    ListHeaderComponent: details, initialNumToRender: 12, maxToRenderPerBatch: 12, windowSize: 7,
    onEndReachedThreshold: 0.4, onEndReached: () => { if (!eventsError) void loadMoreEvents(); },
    ItemSeparatorComponent: Divider,
    ListEmptyComponent: <Text style={styles.empty}>{loading ? 'Загружаем события…' : 'За этот день остановок и заказов нет'}</Text>,
    ListFooterComponent: eventsLoading ? <ActivityIndicator style={styles.empty} /> : eventsError ? <View style={styles.eventRetry}><Text style={styles.errorText}>{eventsError}</Text><IconButton icon="refresh" accessibilityLabel="Повторить загрузку событий" onPress={() => void loadMoreEvents()} /></View> : null,
    renderItem: ({ item: event }) => <List.Item title={`${time(event.at)} · ${event.title}`} description={event.subtitle} titleNumberOfLines={1} descriptionNumberOfLines={2} style={styles.eventRow} titleStyle={styles.eventTitle} descriptionStyle={styles.eventDescription}
      left={() => <View style={styles.eventIcon}><Icon source={event.icon} color={event.color} size={18} /></View>}
      onPress={event.latitude != null && event.longitude != null ? () => { setMapFocus({ key: event.key, latitude: event.latitude!, longitude: event.longitude! }); setDetailsExpanded(false); } : undefined}
      right={event.orderGuid ? () => <IconButton style={styles.eventAction} icon="chevron-right" size={20} accessibilityLabel="Открыть заказ" onPress={() => router.push({ pathname: '/services/client_orders', params: { orderGuid: event.orderGuid! } })} /> : undefined} />,
  };
  const dateControls = <Surface mode="flat" style={styles.dateRow}>
    <IconButton icon="chevron-left" size={24} accessibilityLabel="Предыдущий день" onPress={() => selectDay(trackingShiftDay(selectedDay, -1))} style={styles.dateArrow} />
    <TouchableRipple accessibilityRole="button" accessibilityLabel="Выбрать дату маршрута" onPress={openCalendar} style={styles.dateField}>
      <View style={styles.dateValue}><Icon source="calendar-month-outline" size={19} color="#2563EB" /><Text style={styles.dateText}>{dateLabel}</Text><Icon source="chevron-down" size={16} color="#64748B" /></View>
    </TouchableRipple>
    <IconButton icon="chevron-right" size={24} accessibilityLabel="Следующий день" disabled={selectedDay >= today} onPress={() => selectDay(trackingShiftDay(selectedDay, 1))} style={styles.dateArrow} />
  </Surface>;

  return <View style={styles.root}>
    <AppHeader title="" icon="map-outline" variant="flat" compact dense tight showBack onBack={closeService} entranceMotion="none" showServerStatus={false}
      titleSlot={<TouchableRipple accessibilityRole="button" accessibilityLabel={`Выбрать сотрудника. ${displayName(selectedUser)}`} onPress={() => { setQuery(''); setUsersOffset(0); setUsers([]); setUsersHasMore(false); setPickerVisible(true); }} style={styles.userButton}>
        <View style={styles.userRow}>
          <View style={styles.flex}>
            <Text style={styles.userName} numberOfLines={1}>{displayName(selectedUser)}</Text>
            <Text style={styles.caption} numberOfLines={1}>{selectedUser ? employeeDescription(selectedUser) : 'Выберите активного сотрудника'}</Text>
          </View>
          <Icon source="chevron-down" size={18} color="#64748B" />
        </View>
      </TouchableRipple>}
      rightSlot={<View style={styles.headerActions}>
        <Menu visible={menuVisible} onDismiss={() => setMenuVisible(false)} anchor={<IconButton icon="dots-horizontal" size={22} accessibilityLabel="Меню геомаршрута" onPress={() => setMenuVisible(true)} style={styles.iconButton} />}>
          <Menu.Item leadingIcon="crosshairs-gps" title={requesting ? 'Запрашиваем геопозицию…' : 'Запросить геопозицию'} disabled={requesting || !selectedUser} onPress={() => { setMenuVisible(false); void requestPosition(); }} />
          <Menu.Item leadingIcon="refresh" title="Обновить данные" disabled={loading || !selectedUser} onPress={() => { setMenuVisible(false); void loadDay(); }} />
          <Menu.Item leadingIcon="fit-to-screen-outline" title="Показать весь маршрут" disabled={!currentData?.polyline.length} onPress={() => { setMenuVisible(false); fitRoute(); }} />
          <Menu.Item leadingIcon="chart-timeline-variant" title="Итоги дня и хронология" onPress={() => { setMenuVisible(false); setDetailsExpanded(true); }} />
        </Menu>
      </View>}
    />
    <View style={[styles.stage, wide && styles.wideStage]}>
      <View style={styles.mapPane}>
        <TrackingMap data={currentData} live={currentLive} focus={mapFocus} fitRevision={fitRevision} bottomInset={wide ? bottomInset : bottomInset + 104} />
        <View pointerEvents="box-none" style={styles.mapTop}>
          {error || (!selectedUser && initialError) ? <Surface elevation={1} style={styles.error}>
            <Icon source="alert-circle-outline" size={20} color="#B91C1C" /><Text style={styles.errorText}>{error || initialError}</Text>
            <IconButton icon="refresh" size={20} accessibilityLabel="Повторить загрузку" onPress={() => selectedUser ? void loadDay() : setInitialRetry((value) => value + 1)} />
          </Surface> : <Surface elevation={1} style={styles.status}>
            {loading || initialLoading || requesting ? <ActivityIndicator size={15} /> : <Icon source={currentLive?.device?.enabled ? 'crosshairs-gps' : 'crosshairs-off'} size={16} color={currentLive?.device?.enabled ? '#2563EB' : '#64748B'} />}
            <Text style={styles.statusText}>{requesting ? 'Запрашиваем геопозицию…' : loading || initialLoading ? 'Загружаем маршрут…' : !selectedUser ? 'Выберите сотрудника' : currentLive?.device?.enabled === false ? 'Отслеживание выключено' : `Позиция: ${ageLabel(currentLive?.point?.recordedAt)}${connectionLabel ? `\n${connectionLabel}` : ''}`}</Text>
          </Surface>}
          <View pointerEvents="box-none" style={styles.mapActions}>
            <IconButton mode="contained" containerColor="#FFFFFF" icon="fit-to-screen-outline" iconColor="#475569" accessibilityLabel="Показать весь маршрут" onPress={fitRoute} disabled={!currentData?.polyline.length} />
            <IconButton mode="contained" containerColor="#FFFFFF" icon="crosshairs-gps" iconColor="#2563EB" accessibilityLabel="Показать последнюю позицию" disabled={!currentLive?.point} onPress={() => { if (currentLive?.point) { setMapFocus({ key: `live-${Date.now()}`, latitude: currentLive.point.latitude, longitude: currentLive.point.longitude }); setDetailsExpanded(false); } }} />
          </View>
        </View>
        {!loading && selectedUser && currentData && !currentData.summary.pointsCount ? <Surface elevation={1} style={[styles.noPoints, { bottom: wide ? 52 + bottomInset : 164 + bottomInset }]}><Text variant="bodySmall">За выбранный день маршрут не записан</Text></Surface> : null}
        <Surface elevation={0} pointerEvents="none" style={[styles.legend, { bottom: wide ? 30 + bottomInset : 130 + bottomInset }]}>
          <Legend color="#DC2626" text="Позиция" /><Legend color="#16A34A" text="Заказ" /><Legend color="#D97706" text="Остановка" />
        </Surface>
      </View>
      {wide ? <Surface elevation={1} style={styles.sidebar}>
        <TrackingDayPanelHeader summary={summary} expanded dateControls={dateControls} onRefresh={() => void loadDay()} refreshing={loading} refreshDisabled={!selectedUser} />
        <FlatList {...eventListProps} contentContainerStyle={{ paddingBottom: bottomInset + 12 }} />
      </Surface> : <TrackingDayPanel summary={summary} expanded={detailsExpanded} onExpandedChange={setDetailsExpanded} bottomInset={bottomInset} dateControls={dateControls} onRefresh={() => void loadDay()} refreshing={loading} refreshDisabled={!selectedUser} listProps={eventListProps} />}
    </View>

    <Modal visible={pickerVisible} onRequestClose={() => setPickerVisible(false)} animationType="slide" statusBarTranslucent>
      <View style={styles.root}>
        <SearchPickerScreen<TrackingV2User>
          visible={pickerVisible} pickerKey="tracking-employees" topInset={insets.top} title="Сотрудники" titleIcon="account-group-outline"
          onClose={() => setPickerVisible(false)} search={query} searchPlaceholder="ФИО, отдел или роль" searchLoading={usersLoading}
          onSearchChange={(value) => { setQuery(value); setUsersOffset(0); setUsers([]); setUsersHasMore(false); }}
          data={users} keyExtractor={(user) => String(user.id)} extraData={selectedUser?.id}
          contentContainerStyle={{ paddingBottom: bottomInset }}
          renderItem={({ item }) => <List.Item
            title={displayName(item)} titleNumberOfLines={2} description={employeeDescription(item)} descriptionNumberOfLines={2}
            titleStyle={styles.employeeName} descriptionStyle={styles.employeeDescription}
            style={[styles.employeeRow, item.id === selectedUser?.id && styles.employeeSelected]}
            accessibilityLabel={`${displayName(item)}. ${employeeDescription(item)}`} accessibilityState={{ selected: item.id === selectedUser?.id }}
            onPress={() => { setSelectedUser(item); setPickerVisible(false); }}
            left={() => <View style={styles.employeeAvatar}>{item.avatarUrl ? <Avatar.Image size={42} source={{ uri: item.avatarUrl }} /> : <Avatar.Text size={42} label={[item.lastName, item.firstName].filter(Boolean).map((part) => part![0]).join('').slice(0, 2) || '?'} style={styles.avatarFallback} color="#2563EB" />}</View>}
            right={(props) => <List.Icon {...props} icon={item.id === selectedUser?.id ? 'check-circle' : 'chevron-right'} color={item.id === selectedUser?.id ? '#16A34A' : '#94A3B8'} />}
          />}
          ListEmptyComponent={<View style={styles.empty}>{usersLoading ? <ActivityIndicator /> : <Text style={styles.emptyText}>{usersError || 'Сотрудники не найдены'}</Text>}</View>}
          ListFooterComponent={usersError ? <Button onPress={() => setUsersRetry((value) => value + 1)}>Повторить загрузку</Button> : usersLoading && users.length ? <ActivityIndicator style={styles.empty} /> : null}
          onEndReached={() => { if (usersHasMore && !usersPageInFlight.current && !usersLoading && !usersError) { usersPageInFlight.current = true; setUsersOffset((value) => value + 100); } }}
        />
      </View>
    </Modal>
    <Portal>
      <Dialog visible={dateVisible} onDismiss={() => setDateVisible(false)} style={[styles.dialog, modalStyle]}>
        <Dialog.Title>Дата маршрута</Dialog.Title>
        <Dialog.ScrollArea style={styles.dateScroll}>
          <ScrollView contentContainerStyle={styles.dateContent}>
            {Platform.OS === 'web' ? <input aria-label="Дата маршрута" type="date" value={dateDraft} max={today} onChange={(event) => { if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value) && event.target.value <= today) setDateDraft(event.target.value); }} style={{ width: '100%', boxSizing: 'border-box', fontSize: 16, padding: 12 }} /> : null}
            {Platform.OS === 'ios' ? <DateTimePicker value={trackingCalendarDate(dateDraft)} mode="date" display="inline" maximumDate={trackingCalendarDate(today)} onChange={(_, value) => { if (value) setDateDraft(trackingDayFromCalendar(value)); }} /> : null}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions><Button onPress={() => setDateVisible(false)}>Отмена</Button><Button mode="contained" onPress={() => { selectDay(dateDraft); setDateVisible(false); }}>Показать</Button></Dialog.Actions>
      </Dialog>
    </Portal>
  </View>;
}

function Legend({ color, text }: { color: string; text: string }) {
  return <View style={styles.legendItem}><Ionicons name="ellipse" size={8} color={color} /><Text style={styles.legendText}>{text}</Text></View>;
}
function Metric({ icon, label, value }: { icon: string; label: string; value: string }) {
  return <View style={styles.metric}><Icon source={icon} size={22} color="#2563EB" /><View style={styles.flex}><Text style={styles.caption}>{label}</Text><Text variant="titleMedium" style={styles.metricValue}>{value}</Text></View></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, backgroundColor: '#F8FAFC' },
  flex: { flex: 1, minWidth: 0 },
  userButton: { minHeight: 48, justifyContent: 'center' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  userName: { fontSize: 14, lineHeight: 19, fontWeight: '800', color: '#0F172A' },
  caption: { fontSize: 11, lineHeight: 16, color: '#64748B' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  iconButton: { margin: 0, width: 42, height: 44, borderRadius: 12 },
  dateRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, backgroundColor: '#FFFFFF', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  dateArrow: { margin: 0, width: 42, height: 42 },
  dateField: { flex: 1, minHeight: 42, justifyContent: 'center' },
  dateValue: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  dateText: { fontSize: 13, color: '#334155', fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  employeeRow: { paddingVertical: 4, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  employeeSelected: { backgroundColor: '#EFF6FF' },
  employeeName: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  employeeDescription: { fontSize: 12, color: '#64748B' },
  employeeAvatar: { justifyContent: 'center' },
  avatarFallback: { backgroundColor: '#EFF6FF' },
  emptyText: { textAlign: 'center', color: '#64748B' },
  stage: { flex: 1, minHeight: 0, position: 'relative' },
  wideStage: { flexDirection: 'row' },
  mapPane: { flex: 1, minHeight: 0, overflow: 'hidden' },
  mapTop: { position: 'absolute', top: 10, left: 10, right: 10, alignItems: 'flex-start', gap: 4 },
  mapActions: { alignSelf: 'flex-end' },
  status: { borderRadius: 16, paddingVertical: 6, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7, maxWidth: '100%', backgroundColor: '#FFFFFF' },
  statusText: { fontSize: 12, lineHeight: 17, color: '#475569', flexShrink: 1 },
  error: { borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingLeft: 12, gap: 6, backgroundColor: '#FEF2F2', width: '100%' },
  errorText: { flex: 1, color: '#B91C1C', fontSize: 12 },
  noPoints: { position: 'absolute', alignSelf: 'center', borderRadius: 12, padding: 10, backgroundColor: '#FFFFFF', maxWidth: '90%' },
  legend: { position: 'absolute', left: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 10, borderRadius: 10, paddingVertical: 5, paddingHorizontal: 8, backgroundColor: 'rgba(255,255,255,0.94)' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText: { fontSize: 10, lineHeight: 15, color: '#475569' },
  sidebar: { width: 320, backgroundColor: '#FFFFFF' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: 4, paddingHorizontal: 12 },
  metric: { width: '50%', minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8 },
  metricValue: { fontWeight: '800', color: '#0F172A' },
  muted: { color: '#64748B', marginTop: 8, paddingHorizontal: 12 },
  empty: { paddingVertical: 24, textAlign: 'center', color: '#64748B' },
  eventRow: { paddingVertical: 2, paddingLeft: 12, paddingRight: 4 },
  eventTitle: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  eventDescription: { fontSize: 12, lineHeight: 16, color: '#64748B' },
  eventIcon: { width: 22, justifyContent: 'center' },
  eventAction: { margin: 0, width: 40, height: 44 },
  eventRetry: { paddingLeft: 12, flexDirection: 'row', alignItems: 'center' },
  dialog: { width: '92%', maxWidth: 480, alignSelf: 'center', marginHorizontal: 0, backgroundColor: '#FFFFFF' },
  dateScroll: { flexShrink: 1, paddingHorizontal: 16 },
  dateContent: { paddingVertical: 12 },
});
