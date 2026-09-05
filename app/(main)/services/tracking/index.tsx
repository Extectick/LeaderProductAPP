import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import {
  fetchLocationRequest,
  fetchTrackingDay,
  fetchTrackingLive,
  fetchTrackingUsers,
  requestLiveLocation,
  type TrackingDayData,
  type TrackingLiveData,
  type TrackingV2User,
} from '@/utils/trackingService';
import TrackingMap from './TrackingMap';

const OMSK_OFFSET_MS = 6 * 60 * 60 * 1000;

function dayKey(date: Date) {
  return new Date(date.getTime() + OMSK_OFFSET_MS).toISOString().slice(0, 10);
}

function displayName(user?: TrackingV2User | null) {
  if (!user) return 'Сотрудник';
  return [user.lastName, user.firstName, user.middleName].filter(Boolean).join(' ') || user.email || `Сотрудник ${user.id}`;
}

function time(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function currency(value?: string | null) {
  const number = Number(value);
  return Number.isFinite(number) ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(number)} ₽` : '—';
}

function distance(meters = 0) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} км` : `${meters} м`;
}

function duration(seconds = 0) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours ? `${hours} ч ${minutes} мин` : `${minutes} мин`;
}

function ageLabel(seconds?: number | null) {
  if (seconds == null) return 'Нет координат';
  if (seconds < 60) return 'Получена сейчас';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин назад`;
  return `${Math.floor(seconds / 3600)} ч назад`;
}

export default function TrackingServiceScreen() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const wide = width >= 920;
  const [users, setUsers] = useState<TrackingV2User[]>([]);
  const [selectedUser, setSelectedUser] = useState<TrackingV2User | null>(null);
  const [selectedDay, setSelectedDay] = useState(dayKey(new Date()));
  const [data, setData] = useState<TrackingDayData | null>(null);
  const [live, setLive] = useState<TrackingLiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [mapFocus, setMapFocus] = useState<{ key: string; latitude: number; longitude: number } | null>(null);

  const loadUsers = useCallback(async () => {
    const result = await fetchTrackingUsers(query);
    setUsers(result);
    setSelectedUser((current) => current && result.some((user) => user.id === current.id) ? current : result[0] || null);
  }, [query]);

  const loadDay = useCallback(async (background = false) => {
    if (!selectedUser) return;
    if (background) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const [day, current] = await Promise.all([
        fetchTrackingDay(selectedUser.id, selectedDay),
        fetchTrackingLive(selectedUser.id),
      ]);
      setData(day);
      setLive(current);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить геомаршрут');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDay, selectedUser]);

  useEffect(() => { void loadUsers().catch((e) => setError(e instanceof Error ? e.message : String(e))); }, []);
  useEffect(() => { if (selectedUser) void loadDay(); }, [loadDay, selectedUser]);
  useEffect(() => { setMapFocus(null); }, [selectedDay, selectedUser?.id]);

  const requestPosition = useCallback(async () => {
    if (!selectedUser || requesting) return;
    setRequesting(true);
    setError(null);
    try {
      const request = await requestLiveLocation(selectedUser.id);
      const deadline = Date.parse(request.expiresAt) || Date.now() + 30_000;
      let result = await fetchLocationRequest(request.id);
      while (result.status === 'PENDING' && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        result = await fetchLocationRequest(request.id);
      }
      if (result.status === 'SUCCEEDED') await loadDay(true);
      else if (result.status === 'TIMED_OUT') setError('Телефон не ответил. Показаны последние доступные координаты.');
      else if (result.status === 'FAILED') setError('Не удалось получить свежую геопозицию сотрудника.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось запросить геопозицию');
    } finally {
      setRequesting(false);
    }
  }, [loadDay, requesting, selectedUser]);

  const dateValue = useMemo(() => new Date(`${selectedDay}T06:00:00+06:00`), [selectedDay]);
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const events = useMemo(() => {
    const stopEvents = (data?.stops || []).map((stop, index) => ({
      key: `stop-${index}`,
      at: stop.startedAt,
      icon: 'pause-circle-outline' as const,
      color: '#F59E0B',
      title: `Остановка ${Math.max(1, Math.round(stop.durationSeconds / 60))} мин`,
      subtitle: `${time(stop.startedAt)}–${time(stop.endedAt)}`,
      orderGuid: null as string | null,
      latitude: stop.latitude,
      longitude: stop.longitude,
    }));
    const orderEvents = (data?.orderEvents || []).map((event) => ({
      key: event.id,
      at: event.capturedAt,
      icon: event.eventType === 'CREATED' ? 'document-text-outline' as const : 'cloud-upload-outline' as const,
      color: event.status === 'CAPTURED' ? '#16A34A' : '#94A3B8',
      title: event.eventType === 'CREATED' ? 'Создан заказ' : 'Заказ отправлен',
      subtitle: `${event.order.number || 'Черновик'} · ${event.order.counterpartyName} · ${currency(event.order.totalAmount)}`,
      orderGuid: event.order.guid || null,
      latitude: event.latitude,
      longitude: event.longitude,
    }));
    return [...stopEvents, ...orderEvents].sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  }, [data]);

  return (
    <View style={styles.root}>
      <View style={[styles.toolbar, wide && styles.toolbarWide]}>
        <Pressable style={styles.userButton} onPress={() => setPickerVisible(true)}>
          <View style={styles.userIcon}><Ionicons name="person" size={18} color="#2563EB" /></View>
          <View style={styles.flex}>
            <Text style={styles.userName} numberOfLines={1}>{displayName(selectedUser)}</Text>
            <Text style={styles.caption} numberOfLines={1}>
              {selectedUser?.department?.name || 'Без отдела'} · {ageLabel(live?.point?.ageSeconds)}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={18} color="#64748B" />
        </Pressable>
        <Pressable style={[styles.liveButton, requesting && styles.disabled]} onPress={requestPosition} disabled={requesting || !selectedUser}>
          {requesting ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="locate" size={18} color="#FFFFFF" />}
          <Text style={styles.liveButtonText}>{requesting ? 'Запрашиваем…' : 'Запросить геопозицию'}</Text>
        </Pressable>
      </View>

      <View style={styles.dayRow}>
        <Pressable onPress={() => setSelectedDay(today)} style={[styles.dayChip, selectedDay === today && styles.dayChipActive]}>
          <Text style={[styles.dayChipText, selectedDay === today && styles.dayChipTextActive]}>Сегодня</Text>
        </Pressable>
        <Pressable onPress={() => setSelectedDay(yesterday)} style={[styles.dayChip, selectedDay === yesterday && styles.dayChipActive]}>
          <Text style={[styles.dayChipText, selectedDay === yesterday && styles.dayChipTextActive]}>Вчера</Text>
        </Pressable>
        <Pressable onPress={() => setCalendarVisible(true)} style={[styles.dayChip, selectedDay !== today && selectedDay !== yesterday && styles.dayChipActive]}>
          <Ionicons name="calendar-outline" size={16} color={selectedDay !== today && selectedDay !== yesterday ? '#FFFFFF' : '#475569'} />
          <Text style={[styles.dayChipText, selectedDay !== today && selectedDay !== yesterday && styles.dayChipTextActive]}>{dateValue.toLocaleDateString('ru-RU')}</Text>
        </Pressable>
      </View>

      {error ? <View style={styles.error}><Ionicons name="alert-circle-outline" size={18} color="#B91C1C" /><Text style={styles.errorText}>{error}</Text></View> : null}

      <View style={[styles.content, wide && styles.contentWide]}>
        <View style={styles.mapPane}>
          <TrackingMap
            key={`${selectedUser?.id || 0}:${selectedDay}:${mapFocus?.key || 'route'}`}
            data={data}
            live={live}
            focus={mapFocus}
          />
          {loading ? <View style={styles.loadingOverlay}><ActivityIndicator size="large" color="#2563EB" /></View> : null}
          <View style={styles.legend}>
            <Legend color="#DC2626" text="Сейчас" /><Legend color="#16A34A" text="Заказ" /><Legend color="#F59E0B" text="Остановка" />
          </View>
        </View>

        <ScrollView
          style={styles.detailsPane}
          contentContainerStyle={styles.detailsContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadDay(true)} />}
        >
          <Text style={styles.sectionTitle}>Итоги дня</Text>
          <View style={styles.metrics}>
            <Metric icon="navigate-outline" label="Маршрут" value={distance(data?.summary.distanceMeters)} />
            <Metric icon="walk-outline" label="В движении" value={duration(data?.summary.movingSeconds)} />
            <Metric icon="time-outline" label="Первая точка" value={time(data?.summary.startedAt)} />
            <Metric icon="flag-outline" label="Последняя точка" value={time(data?.summary.endedAt)} />
            <Metric icon="pause-outline" label="Остановки" value={String(data?.summary.stopsCount ?? 0)} />
            <Metric icon="document-text-outline" label="Заказы" value={String(data?.summary.ordersCount ?? 0)} />
            <Metric icon="battery-half-outline" label="Батарея" value={live?.point?.batteryLevel != null ? `${Math.round(live.point.batteryLevel)}%` : '—'} />
          </View>

          <Text style={styles.sectionTitle}>Хронология</Text>
          {!events.length && !loading ? <Text style={styles.empty}>За этот день остановок и заказов пока нет</Text> : null}
          {events.map((event) => (
            <Pressable
              key={event.key}
              disabled={event.latitude == null || event.longitude == null}
              onPress={() => event.latitude != null && event.longitude != null && setMapFocus({
                key: event.key,
                latitude: event.latitude,
                longitude: event.longitude,
              })}
              style={styles.timelineRow}
            >
              <View style={[styles.timelineIcon, { borderColor: event.color }]}><Ionicons name={event.icon} size={19} color={event.color} /></View>
              <View style={styles.flex}>
                <View style={styles.timelineTitleRow}><Text style={styles.timelineTitle}>{event.title}</Text><Text style={styles.timelineTime}>{time(event.at)}</Text></View>
                <Text style={styles.timelineSubtitle}>{event.subtitle}</Text>
              </View>
              {event.orderGuid ? (
                <Pressable
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Открыть заказ"
                  onPress={() => router.push({ pathname: '/services/client_orders', params: { orderGuid: event.orderGuid! } })}
                >
                  <Ionicons name="chevron-forward" size={20} color="#64748B" />
                </Pressable>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => setPickerVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerVisible(false)}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.modalTitle}>Сотрудник</Text>
            <View style={styles.search}><Ionicons name="search" size={18} color="#64748B" /><TextInput value={query} onChangeText={setQuery} onSubmitEditing={() => loadUsers()} placeholder="Поиск сотрудника" style={styles.searchInput} /></View>
            <ScrollView style={{ maxHeight: 420 }}>
              {users.map((user) => (
                <Pressable key={user.id} style={styles.userRow} onPress={() => { setSelectedUser(user); setPickerVisible(false); }}>
                  <View style={styles.flex}><Text style={styles.userName}>{displayName(user)}</Text><Text style={styles.caption}>{user.department?.name || 'Без отдела'}</Text></View>
                  {user.id === selectedUser?.id ? <Ionicons name="checkmark-circle" size={22} color="#16A34A" /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {calendarVisible ? (
        Platform.OS === 'web' ? (
          <Modal transparent visible animationType="fade" onRequestClose={() => setCalendarVisible(false)}>
            <Pressable style={styles.modalBackdrop} onPress={() => setCalendarVisible(false)}>
              <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
                <input type="date" value={selectedDay} onChange={(event) => { setSelectedDay(event.target.value); setCalendarVisible(false); }} style={{ fontSize: 18, padding: 12 }} />
              </Pressable>
            </Pressable>
          </Modal>
        ) : (
          <DateTimePicker value={dateValue} mode="date" maximumDate={new Date()} onChange={(_, value) => { setCalendarVisible(false); if (value) setSelectedDay(dayKey(value)); }} />
        )
      ) : null}
    </View>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color }]} /><Text style={styles.legendText}>{text}</Text></View>;
}

function Metric({ icon, label, value }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string }) {
  return <View style={styles.metric}><Ionicons name={icon} size={22} color="#2563EB" /><View><Text style={styles.caption}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  flex: { flex: 1, minWidth: 0 },
  toolbar: { gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFFFFF', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  toolbarWide: { flexDirection: 'row', alignItems: 'center' },
  userButton: { minHeight: 54, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, backgroundColor: '#F8FAFC', borderRadius: 12 },
  userIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DBEAFE' },
  userName: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  caption: { fontSize: 12, color: '#64748B', marginTop: 2 },
  liveButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18, borderRadius: 12, backgroundColor: '#2563EB' },
  liveButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.6 },
  dayRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#FFFFFF' },
  dayChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 38, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#F1F5F9' },
  dayChipActive: { backgroundColor: '#2563EB' },
  dayChipText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  dayChipTextActive: { color: '#FFFFFF' },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#FEF2F2' },
  errorText: { flex: 1, color: '#B91C1C', fontSize: 13 },
  content: { flex: 1 },
  contentWide: { flexDirection: 'row' },
  mapPane: { flex: 1.25, minHeight: 300, position: 'relative', overflow: 'hidden' },
  detailsPane: { flex: 1, backgroundColor: '#FFFFFF' },
  detailsContent: { padding: 16, paddingBottom: 40 },
  loadingOverlay: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(248,250,252,0.66)' } as any,
  legend: { position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', gap: 10, backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { color: '#334155', fontSize: 11, fontWeight: '700' },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: '#0F172A', marginBottom: 10, marginTop: 4 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E2E8F0', marginBottom: 18 },
  metric: { width: '50%', minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  metricValue: { fontSize: 18, lineHeight: 22, fontWeight: '900', color: '#0F172A' },
  empty: { color: '#64748B', textAlign: 'center', paddingVertical: 28 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 68, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  timelineIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  timelineTitleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  timelineTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  timelineTime: { fontSize: 12, color: '#64748B' },
  timelineSubtitle: { fontSize: 12, color: '#64748B', marginTop: 4 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.36)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 520, maxHeight: '80%', borderRadius: 18, backgroundColor: '#FFFFFF', padding: 16 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A', marginBottom: 12 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 46, borderRadius: 12, backgroundColor: '#F1F5F9', marginBottom: 10 },
  searchInput: { flex: 1, fontSize: 15, color: '#0F172A', outlineStyle: 'none' } as any,
  userRow: { flexDirection: 'row', alignItems: 'center', minHeight: 62, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
});
