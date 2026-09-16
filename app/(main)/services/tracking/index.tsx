import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ActivityIndicator, Button, Dialog, Divider, Icon, IconButton, List, Menu, Portal, Searchbar, SegmentedButtons, Surface, Text, TouchableRipple } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { useOptionalTabBarVisibility } from '@/components/Navigation/TabBarVisibilityContext';
import { useOptionalLastServiceRoute } from '@/src/features/navigation/LastServiceRouteContext';
import TrackingDayPanel from '@/src/features/tracking/TrackingDayPanel';
import { trackingCalendarDate, trackingDayFromCalendar, trackingDayKey, trackingDayLabel, trackingTime as time } from '@/src/features/tracking/trackingPresentation';
import { fetchLocationRequest, fetchTrackingDay, fetchTrackingLive, fetchTrackingUsers, requestLiveLocation, type TrackingDayData, type TrackingLiveData, type TrackingV2User } from '@/utils/trackingService';
import TrackingMap from './TrackingMap';

function displayName(user?: TrackingV2User | null) {
  return user ? [user.lastName, user.firstName, user.middleName].filter(Boolean).join(' ') || user.email || `Сотрудник ${user.id}` : 'Выбрать сотрудника';
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
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<TrackingV2User | null>(null);
  const [selectedDay, setSelectedDay] = useState(() => trackingDayKey(new Date()));
  const [dateDraft, setDateDraft] = useState(selectedDay);
  const [data, setData] = useState<TrackingDayData | null>(null);
  const [live, setLive] = useState<TrackingLiveData | null>(null);
  const [loadedKey, setLoadedKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [dateVisible, setDateVisible] = useState(false);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [usersRetry, setUsersRetry] = useState(0);
  const [mapFocus, setMapFocus] = useState<{ key: string; latitude: number; longitude: number } | null>(null);
  const [fitRevision, setFitRevision] = useState(0);
  const mounted = useRef(true);
  const loadSequence = useRef(0);
  const requestInFlight = useRef(false);
  const selectionKey = `${selectedUser?.id ?? 0}:${selectedDay}`;
  const selectionRef = useRef(selectionKey);
  selectionRef.current = selectionKey;
  const currentData = loadedKey === selectionKey ? data : null;
  const currentLive = loadedKey === selectionKey ? live : null;
  const today = trackingDayKey(new Date());
  const yesterday = trackingDayKey(new Date(Date.now() - 86_400_000));
  const bottomInset = Math.max(insets.bottom, 8);
  const modalStyle = { maxHeight: Math.max(200, height - insets.top - insets.bottom - 40) };

  useFocusEffect(useCallback(() => {
    setTabBarHidden?.(true);
    return () => setTabBarHidden?.(false);
  }, [setTabBarHidden]));
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; loadSequence.current += 1; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setUsersLoading(true);
    setUsersError(null);
    const timer = setTimeout(() => {
      void fetchTrackingUsers(query).then((result) => {
        if (cancelled) return;
        setUsers(result);
        // Searching the picker must never change the route behind the dialog.
        if (!query.trim()) setSelectedUser((current) => current || result[0] || null);
      }).catch((reason) => {
        if (!cancelled) setUsersError(reason instanceof Error ? reason.message : 'Не удалось загрузить сотрудников');
      }).finally(() => { if (!cancelled) setUsersLoading(false); });
    }, query ? 300 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, usersRetry]);

  const selectedUserId = selectedUser?.id;
  const loadDay = useCallback(async () => {
    if (!selectedUserId) return;
    const sequence = ++loadSequence.current;
    const key = `${selectedUserId}:${selectedDay}`;
    setLoading(true);
    setError(null);
    try {
      const [day, current] = await Promise.all([fetchTrackingDay(selectedUserId, selectedDay), fetchTrackingLive(selectedUserId)]);
      if (!mounted.current || sequence !== loadSequence.current || key !== selectionRef.current) return;
      setData(day);
      setLive(current);
      setLoadedKey(key);
    } catch (reason) {
      if (mounted.current && sequence === loadSequence.current && key === selectionRef.current) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить геомаршрут');
    } finally {
      if (mounted.current && sequence === loadSequence.current) setLoading(false);
    }
  }, [selectedDay, selectedUserId]);
  useEffect(() => { void loadDay(); }, [loadDay]);
  useEffect(() => { setMapFocus(null); setDetailsExpanded(false); }, [selectionKey]);

  const requestPosition = async () => {
    if (!selectedUser || requestInFlight.current) return;
    requestInFlight.current = true;
    setRequesting(true);
    setError(null);
    const key = selectionKey;
    try {
      const request = await requestLiveLocation(selectedUser.id);
      const deadline = Math.min(Date.parse(request.expiresAt) || Date.now() + 30_000, Date.now() + 30_000);
      let result = await fetchLocationRequest(request.id);
      while (result.status === 'PENDING' && Date.now() < deadline && mounted.current && selectionRef.current === key) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        if (!mounted.current || selectionRef.current !== key) return;
        result = await fetchLocationRequest(request.id);
      }
      if (!mounted.current || selectionRef.current !== key) return;
      if (result.status === 'SUCCEEDED') await loadDay();
      else setError(result.status === 'FAILED' ? 'Не удалось получить свежую геопозицию сотрудника.' : 'Телефон не ответил. Доступна последняя полученная позиция.');
    } catch (reason) {
      if (mounted.current && selectionRef.current === key) setError(reason instanceof Error ? reason.message : 'Не удалось запросить геопозицию');
    } finally {
      requestInFlight.current = false;
      if (mounted.current) setRequesting(false);
    }
  };
  const events = useMemo(() => [
    ...(currentData?.stops || []).map((stop, index) => ({
      key: `stop-${index}`, at: stop.startedAt, icon: 'pause-circle-outline', color: '#D97706',
      title: `Остановка ${Math.max(1, Math.round(stop.durationSeconds / 60))} мин`, subtitle: `${time(stop.startedAt)}–${time(stop.endedAt)}`,
      orderGuid: null as string | null, latitude: stop.latitude, longitude: stop.longitude,
    })),
    ...(currentData?.orderEvents || []).map((event) => ({
      key: event.id, at: event.capturedAt, icon: event.eventType === 'CREATED' ? 'file-document-outline' : 'cloud-upload-outline', color: event.status === 'CAPTURED' ? '#16A34A' : '#94A3B8',
      title: event.eventType === 'CREATED' ? 'Создан заказ' : 'Заказ отправлен', subtitle: `${event.order.number || 'Черновик'} · ${event.order.counterpartyName} · ${currency(event.order.totalAmount)}`,
      orderGuid: event.order.guid || null, latitude: event.latitude, longitude: event.longitude,
    })),
  ].sort((left, right) => Date.parse(left.at) - Date.parse(right.at)), [currentData]);
  const summary = currentData ? `${distance(currentData.summary.distanceMeters)} · остановки: ${currentData.summary.stopsCount} · заказы: ${currentData.summary.ordersCount}` : loading || usersLoading ? 'Загружаем маршрут…' : 'Нет данных за этот день';
  const closeService = () => { lastService?.clearLastServiceRoute(); router.replace('/services'); };
  const fitRoute = () => { setMapFocus(null); setFitRevision((value) => value + 1); setDetailsExpanded(false); };
  const openCalendar = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: trackingCalendarDate(dateDraft), mode: 'date', maximumDate: trackingCalendarDate(today), onChange: (event, value) => { if (event.type === 'set' && value) setDateDraft(trackingDayFromCalendar(value)); } });
    } else setCalendarVisible(true);
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
    <List.Item title="Последняя позиция" description={`${ageLabel(currentLive?.point?.recordedAt)}${currentLive?.point?.accuracy != null ? ` · точность ±${Math.round(currentLive.point.accuracy)} м` : ''}${currentLive?.point?.batteryLevel != null ? ` · заряд ${Math.round(currentLive.point.batteryLevel)}%` : ''}`} descriptionNumberOfLines={3} left={(props) => <List.Icon {...props} icon="crosshairs-gps" color="#DC2626" />} />
    <Divider />
    <List.Subheader>Хронология</List.Subheader>
    {!events.length ? <Text style={styles.empty}>{loading ? 'Загружаем события…' : 'За этот день остановок и заказов нет'}</Text> : null}
    {events.map((event) => <React.Fragment key={event.key}>
      <List.Item title={`${time(event.at)} · ${event.title}`} description={event.subtitle} titleNumberOfLines={2} descriptionNumberOfLines={3} left={(props) => <List.Icon {...props} icon={event.icon} color={event.color} />} onPress={event.latitude != null && event.longitude != null ? () => { setMapFocus({ key: event.key, latitude: event.latitude!, longitude: event.longitude! }); setDetailsExpanded(false); } : undefined} right={event.orderGuid ? (props) => <IconButton {...props} icon="chevron-right" accessibilityLabel="Открыть заказ" onPress={() => router.push({ pathname: '/services/client_orders', params: { orderGuid: event.orderGuid! } })} /> : undefined} />
      <Divider />
    </React.Fragment>)}
    <Button icon="refresh" loading={loading} disabled={loading || !selectedUser} onPress={() => void loadDay()} style={styles.refreshButton}>Обновить данные</Button>
  </>;

  return <View style={styles.root}>
    <AppHeader title="" icon="map-outline" variant="document" compact dense tight showBack onBack={closeService} entranceMotion="none" horizontalPadding={6} showServerStatus={false}
      titleSlot={<TouchableRipple accessibilityRole="button" accessibilityLabel={`Выбрать сотрудника. ${displayName(selectedUser)}`} onPress={() => { setQuery(''); setPickerVisible(true); }} style={styles.userButton}>
        <View style={styles.userRow}>
          <View style={styles.flex}>
            <Text style={styles.userName} numberOfLines={1}>{displayName(selectedUser)}</Text>
            <Text style={styles.caption} numberOfLines={1}>{trackingDayLabel(selectedDay)}{selectedUser?.department?.name ? ` · ${selectedUser.department.name}` : ''}</Text>
          </View>
          <Icon source="chevron-down" size={18} color="#64748B" />
        </View>
      </TouchableRipple>}
      rightSlot={<View style={styles.headerActions}>
        <IconButton icon="calendar-month-outline" size={22} iconColor={selectedDay === today ? '#475569' : '#2563EB'} accessibilityLabel="Фильтр по дате" onPress={() => { setDateDraft(selectedDay); setCalendarVisible(false); setDateVisible(true); }} style={styles.iconButton} />
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
        <TrackingMap data={currentData} live={currentLive} focus={mapFocus} fitRevision={fitRevision} bottomInset={wide ? bottomInset : bottomInset + 72} />
        <View pointerEvents="box-none" style={styles.mapTop}>
          {error || (!selectedUser && usersError) ? <Surface elevation={1} style={styles.error}>
            <Icon source="alert-circle-outline" size={20} color="#B91C1C" /><Text style={styles.errorText}>{error || usersError}</Text>
            <IconButton icon="refresh" size={20} accessibilityLabel="Повторить загрузку" onPress={() => selectedUser ? void loadDay() : setUsersRetry((value) => value + 1)} />
          </Surface> : <Surface elevation={1} style={styles.status}>
            {loading || usersLoading || requesting ? <ActivityIndicator size={15} /> : <Icon source={currentLive?.device?.enabled ? 'crosshairs-gps' : 'crosshairs-off'} size={16} color={currentLive?.device?.enabled ? '#2563EB' : '#64748B'} />}
            <Text style={styles.statusText}>{requesting ? 'Запрашиваем геопозицию…' : loading || usersLoading ? 'Загружаем маршрут…' : !selectedUser ? 'Нет доступных сотрудников' : currentLive?.device?.enabled === false ? 'Отслеживание выключено' : `Позиция: ${ageLabel(currentLive?.point?.recordedAt)}`}</Text>
          </Surface>}
          <View pointerEvents="box-none" style={styles.mapActions}>
            <IconButton mode="contained" containerColor="#FFFFFF" icon="fit-to-screen-outline" iconColor="#475569" accessibilityLabel="Показать весь маршрут" onPress={fitRoute} disabled={!currentData?.polyline.length} />
            <IconButton mode="contained" containerColor="#FFFFFF" icon="crosshairs-gps" iconColor="#2563EB" accessibilityLabel="Показать последнюю позицию" disabled={!currentLive?.point} onPress={() => { if (currentLive?.point) { setMapFocus({ key: `live-${Date.now()}`, latitude: currentLive.point.latitude, longitude: currentLive.point.longitude }); setDetailsExpanded(false); } }} />
          </View>
        </View>
        {!loading && selectedUser && currentData && !currentData.summary.pointsCount ? <Surface elevation={1} style={[styles.noPoints, { bottom: wide ? 52 + bottomInset : 132 + bottomInset }]}><Text variant="bodySmall">За выбранный день маршрут не записан</Text></Surface> : null}
        <Surface elevation={0} pointerEvents="none" style={[styles.legend, { bottom: wide ? 30 + bottomInset : 98 + bottomInset }]}>
          <Legend color="#DC2626" text="Позиция" /><Legend color="#16A34A" text="Заказ" /><Legend color="#D97706" text="Остановка" />
        </Surface>
      </View>
      {wide ? <Surface elevation={1} style={styles.sidebar}>
        <List.Subheader>Итоги дня</List.Subheader>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomInset + 24 }}>{details}</ScrollView>
      </Surface> : <TrackingDayPanel summary={summary} expanded={detailsExpanded} onExpandedChange={setDetailsExpanded} bottomInset={bottomInset}>{details}</TrackingDayPanel>}
    </View>

    <Portal>
      <Dialog visible={pickerVisible} onDismiss={() => setPickerVisible(false)} style={[styles.dialog, modalStyle]}>
        <Dialog.Title>Сотрудник</Dialog.Title>
        <Dialog.Content style={styles.searchContent}><Searchbar value={query} onChangeText={setQuery} placeholder="Имя или отдел" loading={usersLoading} style={styles.search} inputStyle={styles.searchInput} /></Dialog.Content>
        <Dialog.ScrollArea style={styles.userList}>
          <FlatList data={usersLoading ? [] : users} keyboardShouldPersistTaps="handled" keyExtractor={(user) => String(user.id)} renderItem={({ item }) => <List.Item title={displayName(item)} titleNumberOfLines={2} description={item.department?.name || 'Без отдела'} onPress={() => { setSelectedUser(item); setPickerVisible(false); }} right={(props) => item.id === selectedUser?.id ? <List.Icon {...props} icon="check-circle" color="#16A34A" /> : <List.Icon {...props} icon="chevron-right" />} />} ListEmptyComponent={<View style={styles.empty}>{usersLoading ? <ActivityIndicator /> : <Text>{usersError || 'Сотрудники не найдены'}</Text>}</View>} />
        </Dialog.ScrollArea>
        <Dialog.Actions>{usersError ? <Button onPress={() => setUsersRetry((value) => value + 1)}>Повторить</Button> : null}<Button onPress={() => setPickerVisible(false)}>Закрыть</Button></Dialog.Actions>
      </Dialog>
      <Dialog visible={dateVisible} onDismiss={() => setDateVisible(false)} style={[styles.dialog, modalStyle]}>
        <Dialog.Title>Дата маршрута</Dialog.Title>
        <Dialog.ScrollArea style={styles.dateScroll}>
          <ScrollView contentContainerStyle={styles.dateContent}>
            <SegmentedButtons value={dateDraft === today ? 'today' : dateDraft === yesterday ? 'yesterday' : 'custom'} onValueChange={(value) => { if (value === 'today') setDateDraft(today); else if (value === 'yesterday') setDateDraft(yesterday); else openCalendar(); }} buttons={[{ value: 'today', label: 'Сегодня' }, { value: 'yesterday', label: 'Вчера' }, { value: 'custom', label: 'Дата', icon: 'calendar' }]} />
            <List.Item title={trackingCalendarDate(dateDraft).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })} description="Маршрут за один день · время Омска" titleNumberOfLines={2} descriptionNumberOfLines={2} left={(props) => <List.Icon {...props} icon="calendar-month-outline" />} right={(props) => <List.Icon {...props} icon="chevron-right" />} onPress={openCalendar} />
            {calendarVisible && Platform.OS === 'web' ? <input aria-label="Дата маршрута" type="date" value={dateDraft} max={today} onChange={(event) => { if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value) && event.target.value <= today) setDateDraft(event.target.value); }} style={{ width: '100%', boxSizing: 'border-box', fontSize: 16, padding: 12 }} /> : null}
            {calendarVisible && Platform.OS === 'ios' ? <DateTimePicker value={trackingCalendarDate(dateDraft)} mode="date" display="inline" maximumDate={trackingCalendarDate(today)} onChange={(_, value) => { if (value) setDateDraft(trackingDayFromCalendar(value)); }} /> : null}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions><Button onPress={() => setDateVisible(false)}>Отмена</Button><Button mode="contained" onPress={() => { setSelectedDay(dateDraft); setDateVisible(false); }}>Показать</Button></Dialog.Actions>
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
  userButton: { minHeight: 44, justifyContent: 'center', borderRadius: 12, overflow: 'hidden' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  userName: { fontSize: 14, lineHeight: 19, fontWeight: '800', color: '#0F172A' },
  caption: { fontSize: 11, lineHeight: 16, color: '#64748B' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  iconButton: { margin: 0, width: 42, height: 44, borderRadius: 12 },
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
  metrics: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: 8 },
  metric: { width: '50%', minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 8 },
  metricValue: { fontWeight: '800', color: '#0F172A' },
  muted: { color: '#64748B', marginTop: 8 },
  empty: { paddingVertical: 24, textAlign: 'center', color: '#64748B' },
  refreshButton: { marginTop: 16 },
  dialog: { width: '92%', maxWidth: 480, alignSelf: 'center', marginHorizontal: 0, backgroundColor: '#FFFFFF' },
  searchContent: { paddingBottom: 12 },
  search: { backgroundColor: '#F1F5F9', borderRadius: 14 },
  searchInput: { fontSize: 14 },
  userList: { flexShrink: 1, paddingHorizontal: 12, minHeight: 80 },
  dateScroll: { flexShrink: 1, paddingHorizontal: 16 },
  dateContent: { paddingVertical: 12 },
});
