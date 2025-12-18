import { useThemeColor } from '@/hooks/useThemeColor';
import { AuthContext } from '@/context/AuthContext';
import { AdminUserItem, getUsers } from '@/utils/userService';
import {
  fetchUserRoutesWithPoints,
  RoutePointDto,
  RouteWithPoints,
} from '@/utils/trackingService';
import { Ionicons } from '@expo/vector-icons';
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import RangeCalendarModal from '@/components/RangeCalendarModal';
import LeafletMap from './LeafletMap';
// react-native-maps временно отключаем, чтобы не ломать веб-сборку
const MapView: any = null;
const Polyline: any = null;
const Marker: any = null;

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type UserOption = Pick<
  AdminUserItem,
  'id' | 'email' | 'firstName' | 'lastName' | 'middleName' | 'phone'
>;

type Filters = {
  from: string;
  to: string;
  maxAccuracy: string;
  maxPoints: string;
};

const DEFAULT_POINTS_LIMIT = 100;
const MIN_POINT_DISTANCE_METERS = 12;

const defaultFilters: Filters = {
  from: '',
  to: '',
  maxAccuracy: '5',
  maxPoints: DEFAULT_POINTS_LIMIT.toString(),
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const humanName = (u?: UserOption | null) => {
  if (!u) return 'Не выбрано';
  const parts = [u.lastName, u.firstName, u.middleName].filter(Boolean);
  if (parts.length) return parts.join(' ');
  return u.email || `ID ${u.id}`;
};

const isoToDate = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
};

const formatDateOnly = (d?: Date | null) => {
  if (!d) return '';
  try {
    return d.toLocaleDateString('ru-RU', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
};

const formatTime = (d?: Date | null) => {
  if (!d) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const parseTime = (value: string) => {
  const match = value.trim().match(/^(\d{1,2}):?(\d{0,2})$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2] || '0', 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
};

const toRad = (deg: number) => (deg * Math.PI) / 180;
const calcDistanceMeters = (
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
) => {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return 6371000 * c;
};

const filterNearbyPoints = (
  pts: RoutePointDto[],
  minDistanceMeters = MIN_POINT_DISTANCE_METERS
) => {
  if (pts.length < 2) return pts;
  const result: RoutePointDto[] = [];
  for (const p of pts) {
    const tooClose = result.some(
      (keep) => calcDistanceMeters(keep, p) < minDistanceMeters
    );
    if (!tooClose) {
      result.push(p);
    }
  }
  return result;
};

const parseLimitValue = (
  value?: string | number | null,
  fallback = DEFAULT_POINTS_LIMIT
) => {
  const parsed =
    typeof value === 'number'
      ? value
      : parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, 2000);
};

const Calendar =
  Platform.OS === 'web'
    ? (function loadCalendar() {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          require('react-calendar/dist/Calendar.css');
          return require('react-calendar').default as any;
        } catch (e) {
          console.warn('react-calendar not available:', e);
          return null;
        }
      })()
    : null;

// Динамически подключаем нативные компоненты, чтобы не падать на web
const DateTimePicker =
  Platform.OS === 'web'
    ? null
    : (function loadPicker() {
        try {
          return require('@react-native-community/datetimepicker').default;
        } catch (e) {
          console.warn('DateTimePicker not available:', e);
          return null;
        }
      })();

const DateTimePickerAndroid =
  Platform.OS === 'android'
    ? (() => {
        try {
          return require('@react-native-community/datetimepicker')
            .DateTimePickerAndroid as typeof import('@react-native-community/datetimepicker').DateTimePickerAndroid;
        } catch (e) {
          console.warn('DateTimePickerAndroid not available:', e);
          return null;
        }
      })()
    : null;

export default function TrackingServiceScreen() {
  const auth = useContext(AuthContext);
  const profile = auth?.profile;
  const canViewOthers = useMemo(() => {
    const role = (profile?.role?.name || '').toLowerCase();
    return role.includes('admin') || role.includes('manager');
  }, [profile]);

  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [userQuery, setUserQuery] = useState('');
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [userPickerVisible, setUserPickerVisible] = useState(false);

  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [routes, setRoutes] = useState<RouteWithPoints[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filtersRef = useRef<Filters>(filters);
  const [pickerField, setPickerField] = useState<'from' | 'to' | null>(null);
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [calendarDate, setCalendarDate] = useState<Date | null>(null);
  const [timeInput, setTimeInput] = useState('');
  const [dateError, setDateError] = useState<string | null>(null);
  const [periodCalendarVisible, setPeriodCalendarVisible] = useState(false);
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const [controlledRegion, setControlledRegion] = useState<Region | null>(null);
  const mapRef = useRef<any>(null);
  const [mapInteracting, setMapInteracting] = useState(false);
  const handleMapTouchStart = useCallback(() => setMapInteracting(true), []);
  const handleMapTouchEnd = useCallback(() => setMapInteracting(false), []);
  useEffect(() => {
    if (!mapInteracting) return;
    const t = setTimeout(() => setMapInteracting(false), 1200);
    return () => clearTimeout(t);
  }, [mapInteracting]);
  const isWeb = Platform.OS === 'web';
  const screenH = Dimensions.get('window').height;
  const modalMapHeight = useMemo(
    () => (isWeb ? Math.min(screenH * 0.82, 900) : screenH * 0.6),
    [isWeb, screenH]
  );

  const background = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const mutedText = useThemeColor({}, 'secondaryText');

  useEffect(() => {
    if (profile) {
      setSelectedUser({
        id: profile.id,
        email: profile.email,
        firstName: profile.firstName ?? null,
        lastName: profile.lastName ?? null,
        middleName: profile.middleName ?? null,
        phone: profile.phone ?? null,
      });
    }
  }, [profile]);

  const searchUsers = useCallback(async () => {
    if (!canViewOthers) return;
    setUserSearchLoading(true);
    try {
      const list = await getUsers(userQuery);
      setUserOptions(list);
    } catch (e: any) {
      console.error('Не удалось получить список пользователей', e);
    } finally {
      setUserSearchLoading(false);
    }
  }, [canViewOthers, userQuery]);

  useEffect(() => {
    if (canViewOthers) {
      searchUsers();
    }
  }, [canViewOthers, searchUsers]);

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
      return tb - ta; // новые сверху
    });
  }, [activeRoute]);

  const spacedPoints = useMemo(
    () => filterNearbyPoints(points),
    [points]
  );

  const displayLimit = useMemo(
    () => parseLimitValue(filters.maxPoints, DEFAULT_POINTS_LIMIT),
    [filters.maxPoints]
  );

  const limitedPoints = useMemo(
    () => spacedPoints.slice(0, displayLimit),
    [spacedPoints, displayLimit]
  );

  const baseRegion: Region | null = useMemo(() => {
    if (!limitedPoints.length) return null;
    const first = limitedPoints[0];
    return {
      latitude: first.latitude,
      longitude: first.longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  }, [limitedPoints]);

  const polylineCoords = useMemo(
    () =>
      limitedPoints.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
      })),
    [limitedPoints]
  );

  const hasPolyline = polylineCoords.length > 0;
  const nativeMapAvailable = false; // временно всегда используем Leaflet (см. коммент выше)

  const pointLabels = useMemo(
    () =>
      limitedPoints.map((p, idx) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        label: `${idx + 1}. ${formatDateTime(p.recordedAt)}`,
      })),
    [limitedPoints]
  );

  useEffect(() => {
    if (baseRegion) {
      setControlledRegion(baseRegion);
    } else {
      setControlledRegion(null);
    }
    setSelectedPointIndex(null);
  }, [baseRegion]);

  useEffect(() => {
    if (!mapModalVisible) setMapInteracting(false);
  }, [mapModalVisible]);

  const focusPoint = useCallback(
    (idx: number) => {
      if (!limitedPoints[idx]) return;
      setSelectedPointIndex(idx);
      const p = limitedPoints[idx];
      const region: Region = {
        latitude: p.latitude,
        longitude: p.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      setControlledRegion(region);
      if (mapRef.current && Platform.OS !== 'web') {
        mapRef.current.animateToRegion(region, 350);
      }
    },
    [limitedPoints]
  );

  const openDatePicker = (field: 'from' | 'to') => {
    setPickerField(field);
    const current = isoToDate(filtersRef.current[field]) || new Date();
    setCalendarDate(current);
    setTimeInput(formatTime(current));
    setDateError(null);
    setDateModalVisible(true);
  };

  const applyDateInput = () => {
    if (!pickerField) return;
    const base = calendarDate || new Date();
    const parsedTime = parseTime(timeInput || '00:00');
    if (!parsedTime) {
      setDateError('Неверное время (чч:мм)');
      return;
    }
    const dt = new Date(base);
    dt.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);
    const iso = dt.toISOString();
    setFilters((prev) => ({ ...prev, [pickerField]: iso }));
    filtersRef.current = { ...filtersRef.current, [pickerField]: iso };
    setDateModalVisible(false);
    setPickerField(null);
  };

  const openPeriodCalendar = () => {
    setPeriodCalendarVisible(true);
  };

  const openNativePicker = () => {
    if (!pickerField) return;
    if (Platform.OS === 'android' && DateTimePickerAndroid) {
      const initial = isoToDate(filtersRef.current[pickerField]) || new Date();
      DateTimePickerAndroid.open({
        value: initial,
        mode: 'date',
        is24Hour: true,
        onChange: (event, date?: Date) => {
          if (!date || (event && event.type === 'dismissed')) return;
          setCalendarDate(date);
          setTimeInput(formatTime(date));
        },
      });
    }
  };

  const onRefresh = useCallback(() => {
    loadRoutes();
  }, [loadRoutes]);

  return (
    <View style={{ flex: 1, backgroundColor: background }}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, isWeb && styles.webContentContainer]}
        scrollEnabled={!mapInteracting}
        refreshControl={<RefreshControl refreshing={loadingRoutes} onRefresh={onRefresh} />}
      >
        <Text style={[styles.title, { color: textColor }]}>История перемещений</Text>
        <Text style={{ color: mutedText }}>
          Сервис показывает точки трека за выбранный период. Выберите пользователя и период, затем
          работайте с картой и списком точек.
        </Text>

        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <Text style={[styles.blockTitle, { color: textColor }]}>Пользователь</Text>
          <Pressable
            onPress={() => setUserPickerVisible(true)}
            style={[
              styles.input,
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderColor: mutedText,
              },
            ]}
          >
            <Text style={{ color: textColor, flex: 1 }} numberOfLines={1}>
              {humanName(selectedUser)}
            </Text>
            <Ionicons name="chevron-down" size={18} color={mutedText} />
          </Pressable>
          {!canViewOthers && (
            <Text style={{ color: mutedText, marginTop: 6 }}>
              Вы можете просматривать только собственные треки.
            </Text>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <View style={styles.periodHeader}>
            <Text style={[styles.blockTitle, { color: textColor, flex: 1 }]}>Период</Text>
            <Pressable
              onPress={openPeriodCalendar}
              style={({ pressed }) => [
                styles.secondaryBtn,
                styles.inlineBtn,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Ionicons name="calendar" size={16} color="#0B1220" style={{ marginRight: 6 }} />
              <Text style={styles.secondaryBtnText}>Календарь</Text>
            </Pressable>
          </View>
          <View style={styles.filterRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: mutedText }]}>От</Text>
              <Pressable
                onPress={() => openDatePicker('from')}
                style={[styles.input, styles.dateInput, { borderColor: mutedText }]}
              >
                <Text style={{ color: textColor, flex: 1 }} numberOfLines={1}>
                  {filters.from ? formatDateTime(filters.from) : 'Выбрать дату'}
                </Text>
                <Ionicons name="calendar-outline" size={18} color={mutedText} />
              </Pressable>
            </View>
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: mutedText }]}>До</Text>
              <Pressable
                onPress={() => openDatePicker('to')}
                style={[styles.input, styles.dateInput, { borderColor: mutedText }]}
              >
                <Text style={{ color: textColor, flex: 1 }} numberOfLines={1}>
                  {filters.to ? formatDateTime(filters.to) : 'Выбрать дату'}
                </Text>
                <Ionicons name="calendar-outline" size={18} color={mutedText} />
              </Pressable>
            </View>
          </View>

          <View style={[styles.filterRow, { marginTop: 8 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: mutedText }]}>Макс. точность (м)</Text>
              <TextInput
                value={filters.maxAccuracy}
                onChangeText={(v) => setFilters((prev) => ({ ...prev, maxAccuracy: v }))}
                keyboardType="numeric"
                placeholder="5"
                placeholderTextColor={mutedText}
                style={[styles.input, { color: textColor, borderColor: mutedText }]}
              />
            </View>
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: mutedText }]}>Макс. точек</Text>
              <TextInput
                value={filters.maxPoints}
                onChangeText={(v) => setFilters((prev) => ({ ...prev, maxPoints: v }))}
                keyboardType="numeric"
                placeholder={DEFAULT_POINTS_LIMIT.toString()}
                placeholderTextColor={mutedText}
                style={[styles.input, { color: textColor, borderColor: mutedText }]}
              />
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <Pressable
              onPress={() => setFilters(defaultFilters)}
              style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.secondaryBtnText}>Сбросить</Text>
            </Pressable>

            <Pressable
              onPress={() => loadRoutes(filters)}
              style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
            >
              {loadingRoutes ? (
                <ActivityIndicator color="#0B1220" />
              ) : (
                <Text style={styles.primaryBtnText}>Загрузить</Text>
              )}
            </Pressable>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={[styles.blockTitle, { color: textColor, flex: 1 }]}>Карта трека</Text>
            <Pressable
              onPress={() => setMapModalVisible(true)}
              style={({ pressed }) => [
                styles.secondaryBtn,
                { paddingVertical: 6, paddingHorizontal: 10 },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.secondaryBtnText}>Открыть карту</Text>
            </Pressable>
        </View>
          {nativeMapAvailable ? (
            <View
              onStartShouldSetResponderCapture={() => {
                handleMapTouchStart();
                return false;
              }}
              onResponderRelease={handleMapTouchEnd}
              onResponderTerminate={handleMapTouchEnd}
            >
              <MapView
                ref={(ref: any) => (mapRef.current = ref)}
                style={styles.map}
                region={controlledRegion || baseRegion || undefined}
                showsUserLocation={false}
                showsMyLocationButton={false}
              >
                {polylineCoords.length > 1 && (
                  <Polyline coordinates={polylineCoords} strokeColor="#2563eb" strokeWidth={4} />
                )}
                {polylineCoords[0] && <Marker coordinate={polylineCoords[0]} pinColor="green" title="Старт" />}
                {polylineCoords[polylineCoords.length - 1] && (
                  <Marker
                    coordinate={polylineCoords[polylineCoords.length - 1]}
                    pinColor="red"
                    title="Финиш"
                  />
                )}
                {pointLabels.map((p, idx) => (
                  <Marker
                    key={`pt-${idx}-${p.latitude}-${p.longitude}`}
                    coordinate={{ latitude: p.latitude, longitude: p.longitude }}
                    title={p.label}
                    pinColor={selectedPointIndex === idx ? '#ef4444' : undefined}
                  />
                ))}
              </MapView>
            </View>
          ) : hasPolyline ? (
            <View
              onStartShouldSetResponderCapture={() => {
                handleMapTouchStart();
                return false;
              }}
              onResponderRelease={handleMapTouchEnd}
              onResponderTerminate={handleMapTouchEnd}
            >
              <LeafletMap points={pointLabels} selectedIndex={selectedPointIndex} />
            </View>
          ) : (
            <Text style={{ color: mutedText }}>
              Карта недоступна или нет точек для отображения. Проверьте трек.
            </Text>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <Text style={[styles.blockTitle, { color: textColor, marginBottom: 8 }]}>
            Точки трека ({limitedPoints.length}
            {spacedPoints.length > limitedPoints.length ? ` из ${spacedPoints.length}` : ''})
          </Text>
          {spacedPoints.length === 0 ? (
            <Text style={{ color: mutedText }}>Нет точек за выбранный период.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {limitedPoints.map((p, idx) => (
                <Pressable
                  key={p.id}
                  onPress={() => focusPoint(idx)}
                  style={[
                    styles.pointItem,
                    {
                      borderColor:
                        selectedPointIndex === idx ? '#2563eb' : 'rgba(0,0,0,0.05)',
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pointTime, { color: textColor }]}>
                      {formatDateTime(p.recordedAt)}
                    </Text>
                    <Text style={{ color: mutedText, fontSize: 12, flexWrap: 'wrap' }}>
                      {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: mutedText, fontSize: 12, flexWrap: 'wrap', maxWidth: 100 }}>
                      {p.eventType === 'STOP' ? 'стоп' : 'движение'}
                    </Text>
                    {p.accuracy != null && (
                      <Text style={{ color: mutedText, fontSize: 12 }}>+{p.accuracy} м</Text>
                    )}
                  </View>
                </Pressable>
              ))}
              {spacedPoints.length > limitedPoints.length && (
                <Text style={{ color: mutedText, fontSize: 12 }}>
                  Показаны первые {limitedPoints.length} точек из {spacedPoints.length} после фильтра дублей и ограничений.
                </Text>
              )}
            </View>
          )}
        </View>

        {error && !loadingRoutes ? (
          <Text style={{ color: '#dc2626', marginTop: 6 }}>{error}</Text>
        ) : null}
      </ScrollView>

      <Modal
        visible={userPickerVisible}
        animationType="none"
        transparent
        onRequestClose={() => setUserPickerVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: cardBackground },
              isWeb && styles.webModalCard,
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.blockTitle, { color: textColor, marginBottom: 0 }]}>
                Выбор пользователя
              </Text>
              <Pressable onPress={() => setUserPickerVisible(false)}>
                <Ionicons name="close" size={20} color={textColor} />
              </Pressable>
            </View>

            <TextInput
              placeholder="Поиск по имени или email"
              placeholderTextColor={mutedText}
              value={userQuery}
              onChangeText={setUserQuery}
              onSubmitEditing={searchUsers}
              style={[
                styles.input,
                { color: textColor, borderColor: mutedText, width: '100%' },
              ]}
            />
            <View style={{ minHeight: 28, justifyContent: 'center', marginTop: 6 }}>
              {userSearchLoading ? (
                <ActivityIndicator color={textColor} size="small" />
              ) : null}
            </View>

            <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 8 }}>
              {userOptions.length === 0 ? (
                <Text style={{ color: mutedText }}>Нет результатов</Text>
              ) : (
                userOptions.map((item) => {
                  const isActive = selectedUser?.id === item.id;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => {
                        setSelectedUser(item);
                        setUserPickerVisible(false);
                      }}
                      style={[
                        styles.modalUserRow,
                        { borderColor: isActive ? '#2563eb' : 'rgba(0,0,0,0.05)' },
                      ]}
                    >
                      <Text style={{ color: textColor, fontWeight: '700' }}>
                        {humanName(item)}
                      </Text>
                      <Text style={{ color: mutedText, fontSize: 12 }}>{item.email}</Text>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={dateModalVisible}
        transparent
        animationType="none"
        onRequestClose={() => {
          setDateModalVisible(false);
          setPickerField(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: cardBackground, width: '100%' },
              isWeb && styles.webModalCard,
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.blockTitle, { color: textColor, marginBottom: 0 }]}>
                Выбор даты и времени
              </Text>
              <Pressable
                onPress={() => {
                  setDateModalVisible(false);
                  setPickerField(null);
                }}
              >
                <Ionicons name="close" size={20} color={textColor} />
              </Pressable>
            </View>

            {Platform.OS === 'web' && Calendar ? (
              <Calendar
                value={calendarDate || new Date()}
                onChange={(val: Date) => {
                  setCalendarDate(val);
                  setDateError(null);
                }}
              />
            ) : Platform.OS === 'ios' && DateTimePicker ? (
              <View style={{ marginTop: 12 }}>
                <DateTimePicker
                  value={calendarDate || new Date()}
                  mode="datetime"
                  display="inline"
                  onChange={(_: any, date?: Date) => {
                    if (!date) return;
                    setCalendarDate(date);
                    setTimeInput(formatTime(date));
                    setDateError(null);
                  }}
                />
              </View>
            ) : null}

            <Text style={{ color: mutedText, marginTop: 12 }}>Дата</Text>
            <Pressable
              onPress={openNativePicker}
              disabled={Platform.OS === 'web'}
              style={({ pressed }) => [
                styles.dateInputShell,
                pressed && { opacity: 0.9 },
                Platform.OS === 'web' && { cursor: 'default' as any },
              ]}
            >
              <Ionicons name="calendar-outline" size={18} color={mutedText} />
              <Text style={{ color: calendarDate ? textColor : mutedText, fontWeight: '700' }}>
                {formatDateOnly(calendarDate || isoToDate(filtersRef.current[pickerField || 'from']) || new Date())}
              </Text>
            </Pressable>

            <Text style={{ color: mutedText, marginTop: 12 }}>Время (чч:мм)</Text>
            <TextInput
              value={timeInput}
              onChangeText={(val) => {
                setDateError(null);
                setTimeInput(val.replace(/[^\d:]/g, '').slice(0, 5));
              }}
              keyboardType="numeric"
              placeholder="00:00"
              placeholderTextColor={mutedText}
              style={[
                styles.input,
                {
                  color: textColor,
                  borderColor: mutedText,
                  backgroundColor: cardBackground,
                  borderRadius: 12,
                },
              ]}
            />
            {dateError ? (
              <Text style={{ color: '#dc2626', marginTop: 6 }}>{dateError}</Text>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <Pressable
                onPress={() => {
                  setDateModalVisible(false);
                  setPickerField(null);
                }}
                style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.secondaryBtnText}>Отмена</Text>
              </Pressable>
              <Pressable
                onPress={applyDateInput}
                style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.primaryBtnText}>Применить</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <RangeCalendarModal
        visible={periodCalendarVisible}
        onClose={() => setPeriodCalendarVisible(false)}
        initialFrom={filtersRef.current.from || null}
        initialTo={filtersRef.current.to || null}
        onApply={(from, to) => {
          const next = { ...filtersRef.current, from: from.toISOString(), to: to.toISOString() };
          filtersRef.current = next;
          setFilters(next);
        }}
        onReset={() => {
          const next = { ...filtersRef.current, from: '', to: '' };
          filtersRef.current = next;
          setFilters(next);
        }}
        colors={{ cardBackground, text: textColor, muted: mutedText }}
      />

      <Modal
        visible={mapModalVisible}
        transparent
        animationType="none"
        onRequestClose={() => setMapModalVisible(false)}
      >
        <View
          style={[
            styles.modalBackdrop,
            {
              padding: isWeb ? 8 : 12,
              justifyContent: isWeb ? 'flex-end' : 'center',
            },
          ]}
        >
          <View
            style={[
              styles.fullscreenModal,
              { backgroundColor: cardBackground },
              isWeb ? styles.webFullscreenModal : styles.mobileFullscreenModal,
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.blockTitle, { color: textColor, marginBottom: 0 }]}>
                Карта трека
              </Text>
              <Pressable onPress={() => setMapModalVisible(false)}>
                <Ionicons name="close" size={20} color={textColor} />
              </Pressable>
            </View>
            <View
              style={[
                styles.fullscreenContent,
                isWeb ? styles.fullscreenContentWeb : styles.fullscreenContentMobile,
              ]}
            >
              <View style={styles.modalMapColumn}>
                <View
                  style={[
                    styles.fullscreenMap,
                    {
                      minHeight: modalMapHeight,
                      height: isWeb ? undefined : modalMapHeight,
                    },
                  ]}
                  onStartShouldSetResponderCapture={() => {
                    handleMapTouchStart();
                    return false;
                  }}
                  onResponderRelease={handleMapTouchEnd}
                  onResponderTerminate={handleMapTouchEnd}
                >
                  {nativeMapAvailable ? (
                    <MapView
                      ref={(ref: any) => (mapRef.current = ref)}
                      style={StyleSheet.absoluteFill}
                      region={controlledRegion || baseRegion || undefined}
                      showsUserLocation={false}
                      showsMyLocationButton={false}
                    >
                      {polylineCoords.length > 1 && (
                        <Polyline coordinates={polylineCoords} strokeColor="#2563eb" strokeWidth={4} />
                      )}
                      {polylineCoords[0] && (
                        <Marker coordinate={polylineCoords[0]} pinColor="green" title="Старт" />
                      )}
                      {polylineCoords[polylineCoords.length - 1] && (
                        <Marker
                          coordinate={polylineCoords[polylineCoords.length - 1]}
                          pinColor="red"
                          title="Финиш"
                        />
                      )}
                      {pointLabels.map((p, idx) => (
                        <Marker
                          key={`pt-modal-${idx}-${p.latitude}-${p.longitude}`}
                          coordinate={{ latitude: p.latitude, longitude: p.longitude }}
                          title={p.label}
                          pinColor={selectedPointIndex === idx ? '#ef4444' : undefined}
                        />
                      ))}
                    </MapView>
                  ) : hasPolyline ? (
                    <LeafletMap
                      points={pointLabels}
                      selectedIndex={selectedPointIndex}
                      height={modalMapHeight}
                    />
                  ) : (
                    <Text style={{ color: mutedText }}>Нет точек для отображения</Text>
                  )}
                </View>

                {!isWeb && (
                  <View
                    style={[
                      styles.mobilePointsPanel,
                      { borderColor: mutedText, backgroundColor: cardBackground },
                    ]}
                  >
                    <Text style={[styles.blockTitle, { color: textColor, marginBottom: 6 }]}>
                      Точки ({limitedPoints.length}
                      {spacedPoints.length > limitedPoints.length ? ` из ${spacedPoints.length}` : ''})
                    </Text>
                    <ScrollView
                      contentContainerStyle={{ gap: 8, paddingBottom: 16, paddingHorizontal: 2 }}
                      style={{
                        maxHeight: Math.min(screenH * 0.5, 480),
                        backgroundColor: cardBackground,
                      }}
                    >
                      {limitedPoints.map((p, idx) => (
                        <Pressable
                          key={`sidebar-m-${p.id}`}
                          onPress={() => focusPoint(idx)}
                          style={[
                            styles.pointItem,
                            {
                              borderColor:
                                selectedPointIndex === idx ? '#2563eb' : 'rgba(0,0,0,0.05)',
                            },
                          ]}
                        >
                          <Text style={[styles.pointTime, { color: textColor }]}>
                            {formatDateTime(p.recordedAt)}
                          </Text>
                          <Text style={{ color: mutedText, fontSize: 12, flexWrap: 'wrap' }}>
                            {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
                          </Text>
                          <Text style={{ color: mutedText, fontSize: 12, flexWrap: 'wrap' }}>
                            {p.eventType === 'STOP' ? 'стоп' : 'движение'}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
              {isWeb && (
                <View style={[styles.fullscreenSidebar, { borderColor: mutedText }]}>
                  <ScrollView contentContainerStyle={{ padding: 10, gap: 8 }}>
                    {limitedPoints.map((p, idx) => (
                      <Pressable
                        key={`sidebar-${p.id}`}
                        onPress={() => focusPoint(idx)}
                        style={[
                          styles.pointItem,
                          {
                            borderColor:
                              selectedPointIndex === idx ? '#2563eb' : 'rgba(0,0,0,0.05)',
                          },
                        ]}
                      >
                        <Text style={[styles.pointTime, { color: textColor }]}>
                          {formatDateTime(p.recordedAt)}
                        </Text>
                        <Text style={{ color: mutedText, fontSize: 12, flexWrap: 'wrap' }}>
                          {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
                        </Text>
                        <Text style={{ color: mutedText, fontSize: 12, flexWrap: 'wrap' }}>
                          {p.eventType === 'STOP' ? 'стоп' : 'движение'}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  webContentContainer: {
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  card: {
    borderRadius: 14,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  periodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  blockTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#f9fafb',
  },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateInputShell: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f9fafb',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: '#ffd700',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontWeight: '800',
    fontSize: 15,
    color: '#0B1220',
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  inlineBtn: {
    flex: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#f4f5f7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minWidth: 130,
  },
  secondaryBtnText: {
    fontWeight: '700',
    fontSize: 15,
    color: '#0B1220',
  },
  pointTime: {
    fontWeight: '700',
    fontSize: 13,
  },
  map: {
    height: 240,
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    borderRadius: 14,
    padding: 16,
  },
  periodCard: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    gap: 8,
  },
  webModalCard: {
    maxWidth: 520,
    minWidth: 360,
    alignSelf: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  modalUserRow: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  pointItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
  },
  fullscreenModal: {
    borderRadius: 16,
    padding: 12,
    minHeight: 400,
    overflow: 'hidden',
  },
  webFullscreenModal: {
    width: '100%',
    maxWidth: '96%',
    alignSelf: 'center',
    maxHeight: '92%',
  },
  mobileFullscreenModal: {
    width: '94%',
    height: '97%',
    alignSelf: 'center',
    maxWidth: 720,
    paddingHorizontal: 10,
  },
  fullscreenContent: {
    gap: 12,
    marginTop: 8,
  },
  fullscreenContentWeb: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  fullscreenContentMobile: {
    flexDirection: 'column',
    flex: 1,
  },
  fullscreenMap: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  fullscreenSidebar: {
    width: 240,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  mobilePointsPanel: {
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    paddingBottom: 6,
  },
  modalMapColumn: { flex: 1 },
});
