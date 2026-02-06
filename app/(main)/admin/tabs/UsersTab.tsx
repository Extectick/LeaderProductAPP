import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';

import ShimmerButton from '@/components/ShimmerButton';
import {
  assignUserRole,
  adminUpdatePassword,
  adminUpdateUser,
  adminUpdateUserProfile,
  AdminUserItem,
  getDepartments,
  getProfileById,
  getRoles,
  getUsers,
  RoleItem,
  Department,
} from '@/utils/userService';
import { Profile, ProfileStatus } from '@/types/userTypes';

import { AdminStyles } from '@/components/admin/adminStyles';
import { EditableCard, SelectableChip, SelectorCard, StaticCard } from '@/components/admin/AdminCards';
import { usePresence } from '@/hooks/usePresence';
import { useTabBarSpacerHeight } from '@/components/Navigation/TabBarSpacer';

const formatPhone = (input: string) => {
  const digits = input.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  let num = digits;
  if (num.startsWith('8')) num = '7' + num.slice(1);
  if (!num.startsWith('7')) num = '7' + num;
  const parts = [
    '+7',
    num.slice(1, 4) ? ` (${num.slice(1, 4)}` : '',
    num.length > 4 ? ')' : '',
    num.slice(4, 7) ? ` ${num.slice(4, 7)}` : '',
    num.length > 7 ? '-' : '',
    num.slice(7, 9),
    num.length > 9 ? '-' : '',
    num.slice(9, 11),
  ];
  return parts.join('').replace(/\s+-/g, ' ').trim();
};

const normalizePhoneE164 = (val: string) => {
  const digits = val.replace(/\D/g, '').slice(0, 15);
  if (!digits) return '';
  let num = digits;
  if (num.startsWith('8')) num = '7' + num.slice(1);
  if (!num.startsWith('7')) num = '7' + num;
  return `+${num}`;
};

const withOpacity = (color: string, opacity: number) => {
  if (!color.startsWith('#')) return color;
  const hex = color.replace('#', '');
  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  const int = Number.parseInt(normalized, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

type FormState = {
  firstName: string;
  lastName: string;
  middleName: string;
  email: string;
  phone: string;
  status: ProfileStatus;
  departmentId: number | null;
  roleId: number | null;
};

const STATUS_OPTIONS: ProfileStatus[] = ['ACTIVE', 'PENDING', 'BLOCKED'];
type UserStatusFilter = 'all' | ProfileStatus;
type OnlineFilter = 'all' | 'online' | 'offline';
type SortKey = 'recent' | 'name' | 'role' | 'status';
type SortDir = 'asc' | 'desc';

const STATUS_FILTERS: Array<{ key: UserStatusFilter; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'ACTIVE', label: 'Активные' },
  { key: 'PENDING', label: 'Ожидают' },
  { key: 'BLOCKED', label: 'Заблокированы' },
];

const ONLINE_FILTERS: Array<{ key: OnlineFilter; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'online', label: 'Онлайн' },
  { key: 'offline', label: 'Оффлайн' },
];

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'recent', label: 'Активность' },
  { key: 'name', label: 'Имя' },
  { key: 'role', label: 'Роль' },
  { key: 'status', label: 'Статус' },
];

const statusMeta = (status?: ProfileStatus) => {
  if (status === 'ACTIVE') return { label: 'Активен', color: '#16A34A', bg: '#DCFCE7' };
  if (status === 'BLOCKED') return { label: 'Заблокирован', color: '#DC2626', bg: '#FEE2E2' };
  return { label: 'На проверке', color: '#2563EB', bg: '#DBEAFE' };
};

type AddressForm = {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

type ProfileFormState = {
  status: ProfileStatus;
  phone: string;
  departmentId?: number | null;
  address?: AddressForm;
};

type ProfilesFormState = {
  client: ProfileFormState | null;
  supplier: ProfileFormState | null;
  employee: ProfileFormState | null;
};

type UsersTabProps = {
  active: boolean;
  styles: AdminStyles;
  colors: any;
  btnGradient: [string, string];
  queuedUserId: number | null;
  onConsumeQueuedUser: () => void;
};

function FilterChip({
  styles,
  label,
  active,
  onPress,
  compact,
}: {
  styles: AdminStyles;
  label: string;
  active: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [hovered, setHovered] = useState(false);

  const animateTo = (value: number) => {
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: true,
      friction: 6,
      tension: 160,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => animateTo(0.96)}
      onPressOut={() => animateTo(1)}
      onHoverIn={() => {
        setHovered(true);
        animateTo(1.03);
      }}
      onHoverOut={() => {
        setHovered(false);
        animateTo(1);
      }}
    >
      <Animated.View
        style={[
          styles.filterChip,
          compact && styles.filterChipCompact,
          active && styles.filterChipActive,
          hovered && styles.filterChipHover,
          { transform: [{ scale }] },
        ]}
      >
        <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

function SummaryChip({
  styles,
  label,
  value,
  color,
  active,
  onPress,
}: {
  styles: AdminStyles;
  label: string;
  value: number;
  color: string;
  active: boolean;
  onPress: () => void;
}) {
  const bg = withOpacity(color, active ? 0.18 : 0.1);
  const border = withOpacity(color, active ? 0.6 : 0.35);

  return (
    <Pressable onPress={onPress}>
      {({ pressed, hovered }) => (
        <MotiView
          animate={{
            scale: pressed ? 0.96 : hovered ? 1.02 : 1,
            opacity: pressed ? 0.92 : 1,
          }}
          transition={{ type: 'timing', duration: 120 }}
          style={[
            styles.summaryCard,
            { backgroundColor: bg, borderColor: border },
            active && {
              backgroundColor: withOpacity(color, 0.22),
              borderColor: withOpacity(color, 0.75),
            },
          ]}
        >
          <Text style={[styles.summaryValue, { color }]}>{value}</Text>
          <Text style={styles.summaryLabel}>{label}</Text>
        </MotiView>
      )}
    </Pressable>
  );
}

function UserListItem({
  styles,
  item,
  active,
  isWide,
  onPress,
  isOnline,
  statusMeta,
}: {
  styles: AdminStyles;
  item: AdminUserItem;
  active: boolean;
  isWide: boolean;
  onPress: () => void;
  isOnline: boolean;
  statusMeta: { label: string; color: string; bg: string };
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [hovered, setHovered] = useState(false);

  const animateTo = (value: number) => {
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: true,
      friction: 7,
      tension: 180,
    }).start();
  };

  const initials =
    `${(item.firstName?.[0] || '').toUpperCase()}${(item.lastName?.[0] || '').toUpperCase()}` || 'U';
  const fullName =
    [item.lastName, item.firstName, item.middleName].filter(Boolean).join(' ') || item.email;
  const departmentName = item.departmentName || null;
  const phoneDisplay = item.phone ? formatPhone(item.phone) : '—';

  return (
    <View style={[styles.userCardWrap, isWide && styles.userCardWrapWide]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => animateTo(0.98)}
        onPressOut={() => animateTo(1)}
        onHoverIn={() => {
          setHovered(true);
          animateTo(Platform.OS === 'web' ? 1.01 : 1.02);
        }}
        onHoverOut={() => {
          setHovered(false);
          animateTo(1);
        }}
      >
        <Animated.View
          style={[
            styles.userCard,
            active && styles.userCardActive,
            item.profileStatus === 'BLOCKED' && styles.userCardBlocked,
            hovered && styles.userCardHover,
            { transform: [{ scale }] },
          ]}
        >
          <View style={styles.userRow}>
            <View style={styles.userAvatarWrap}>
              {item.avatarUrl ? (
                <Image source={{ uri: item.avatarUrl }} style={styles.userAvatar} resizeMode="cover" />
              ) : (
                <View style={[styles.userAvatar, styles.userAvatarFallback]}>
                  <Text style={styles.userAvatarText}>{initials}</Text>
                </View>
              )}
              <View style={[styles.userPresenceDot, { backgroundColor: isOnline ? '#22c55e' : '#94a3b8' }]} />
            </View>
            <View style={styles.userInfo}>
              <View style={styles.userNameRow}>
                <Text style={styles.userName} numberOfLines={2}>
                  {fullName}
                </Text>
                <View style={styles.userIdBadge}>
                  <Text style={styles.userIdText}>#{item.id}</Text>
                </View>
              </View>
              <Text style={styles.userMeta} numberOfLines={2}>
                {item.email}
              </Text>
              <Text style={styles.userMeta}>
                <Text style={styles.userMetaStrong}>Тел:</Text> {phoneDisplay}
              </Text>
              <View style={styles.userPillsRow}>
                <View style={[styles.statusPill, { backgroundColor: statusMeta.bg, borderColor: statusMeta.color }]}>
                  <Text style={[styles.statusPillText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
                </View>
                <View style={styles.rolePill}>
                  <Text style={styles.rolePillText} numberOfLines={2}>
                    {item.role?.name || 'Без роли'}
                  </Text>
                </View>
                {departmentName ? (
                  <View style={styles.departmentPill}>
                    <Text style={styles.departmentPillText} numberOfLines={2}>
                      {departmentName}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </View>
  );
}

export default function UsersTab({
  active,
  styles,
  colors,
  btnGradient,
  queuedUserId,
  onConsumeQueuedUser,
}: UsersTabProps) {
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [search, setSearch] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [employeeStatusMap, setEmployeeStatusMap] = useState<Record<number, ProfileStatus | null>>({});
  const [pickerType, setPickerType] = useState<'role' | 'department' | null>(null);
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>('all');
  const [onlineFilter, setOnlineFilter] = useState<OnlineFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const presenceMap = usePresence(active ? users.map((u) => u.id) : []);
  const [form, setForm] = useState<FormState>({
    firstName: '',
    lastName: '',
    middleName: '',
    email: '',
    phone: '',
    status: 'PENDING',
    departmentId: null,
    roleId: null,
  });
  const [profileForms, setProfileForms] = useState<ProfilesFormState>({
    client: null,
    supplier: null,
    employee: null,
  });
  const [initialProfileForms, setInitialProfileForms] = useState<ProfilesFormState | null>(null);
  const [initialForm, setInitialForm] = useState<FormState | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [activeTab, setActiveTab] = useState<'user' | 'profiles'>('user');
  const [activeProfileTab, setActiveProfileTab] = useState<'employee' | 'client' | 'supplier'>('employee');
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const columns = windowWidth >= 1600 ? 3 : windowWidth >= 1200 ? 2 : 1;
  const isWide = columns > 1;
  const showSideFilters = windowWidth >= 1200;
  const showSummaryGrid = windowWidth >= 1100;
  const modalMaxHeight = Math.max(320, Math.min(windowHeight - 24, Platform.OS === 'web' ? 860 : windowHeight - 24));
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabBarSpacer = useTabBarSpacerHeight();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount = [statusFilter !== 'all', onlineFilter !== 'all', sortKey !== 'recent'].filter(Boolean).length;

  useEffect(() => {
    if (showSideFilters) {
      setFiltersOpen(false);
    }
  }, [showSideFilters]);

  const loadRefs = useCallback(async () => {
    try {
      const [r, d] = await Promise.all([getRoles(), getDepartments()]);
      setRoles(r);
      setDepartments(d);
    } catch (e: any) {
      console.warn('loadRefs error', e?.message);
    }
  }, []);

  const loadUsers = useCallback(
    async (q?: string) => {
      setLoadingUsers(true);
      try {
        const data = await getUsers(q);
        setUsers(data);
      } catch (e: any) {
        Alert.alert('Ошибка', e?.message || 'Не удалось загрузить пользователей');
      } finally {
        setLoadingUsers(false);
      }
    },
    []
  );

  const missingEmployeeStatusIds = useMemo(
    () => users.map((u) => u.id).filter((id) => employeeStatusMap[id] === undefined),
    [users, employeeStatusMap]
  );

  useEffect(() => {
    if (!active || missingEmployeeStatusIds.length === 0) return;
    let cancelled = false;
    const ids = [...missingEmployeeStatusIds];
    const concurrency = 4;

    const worker = async () => {
      while (!cancelled) {
        const id = ids.shift();
        if (id == null) return;
        try {
          const profile = await getProfileById(id);
          const status = profile?.employeeProfile?.status ?? null;
          if (!cancelled) {
            setEmployeeStatusMap((prev) => ({ ...prev, [id]: status }));
          }
        } catch {
          if (!cancelled) {
            setEmployeeStatusMap((prev) => ({ ...prev, [id]: null }));
          }
        }
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, ids.length) }, () => worker());
    void Promise.all(workers);
    return () => {
      cancelled = true;
    };
  }, [active, missingEmployeeStatusIds]);

  const buildAddressForm = useCallback(
    (address?: { street?: string; city?: string; state?: string | null; postalCode?: string | null; country?: string } | null): AddressForm => ({
      street: address?.street || '',
      city: address?.city || '',
      state: address?.state || '',
      postalCode: address?.postalCode || '',
      country: address?.country || '',
    }),
    []
  );

  const buildProfileForms = useCallback((profile: Profile): ProfilesFormState => {
    return {
      client: profile.clientProfile
        ? {
            status: profile.clientProfile.status || 'PENDING',
            phone: formatPhone(profile.clientProfile.phone || ''),
            address: buildAddressForm(profile.clientProfile.address),
          }
        : null,
      supplier: profile.supplierProfile
        ? {
            status: profile.supplierProfile.status || 'PENDING',
            phone: formatPhone(profile.supplierProfile.phone || ''),
            address: buildAddressForm(profile.supplierProfile.address),
          }
        : null,
      employee: profile.employeeProfile
        ? {
            status: profile.employeeProfile.status || 'PENDING',
            phone: formatPhone(profile.employeeProfile.phone || ''),
            departmentId: profile.employeeProfile.department?.id ?? null,
          }
        : null,
    };
  }, [buildAddressForm]);

  const syncForm = useCallback((profile: Profile) => {
    const next: FormState = {
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      middleName: profile.middleName || '',
      email: profile.email || '',
      phone: formatPhone(profile.phone || profile.employeeProfile?.phone || ''),
      status: profile.profileStatus || 'PENDING',
      departmentId: profile.employeeProfile?.department?.id ?? null,
      roleId: profile.role?.id ?? null,
    };
    setForm(next);
    setInitialForm(next);
    setNewPassword('');
    const profilesState = buildProfileForms(profile);
    setProfileForms(profilesState);
    setInitialProfileForms(profilesState);
  }, [buildProfileForms]);

  const loadProfile = useCallback(
    async (userId?: number | null) => {
      if (!userId) return;
      try {
        setProfileLoading(true);
        const prof = await getProfileById(userId);
        if (!prof) throw new Error('Профиль не найден');
        setSelectedProfile(prof);
        syncForm(prof);
      } catch (e: any) {
        Alert.alert('Ошибка', e?.message || 'Не удалось загрузить профиль');
        setSelectedProfile(null);
        setInitialForm(null);
      } finally {
        setProfileLoading(false);
      }
    },
    [syncForm]
  );

  useEffect(() => {
    if (!active) return;
    void loadRefs();
    void loadUsers('');
  }, [active, loadRefs, loadUsers]);

  useEffect(() => {
    if (!active) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void loadUsers(search.trim());
    }, 400);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search, loadUsers, active]);

  useEffect(() => {
    if (!active || !queuedUserId) return;
    setSelectedUserId(queuedUserId);
    setModalVisible(true);
    void loadProfile(queuedUserId);
    onConsumeQueuedUser();
  }, [active, queuedUserId, onConsumeQueuedUser, loadProfile]);

  const isDirty = useMemo(() => {
    if (!initialForm) return false;
    const profileDirty = initialProfileForms
      ? JSON.stringify(profileForms) !== JSON.stringify(initialProfileForms)
      : false;
    return (
      form.firstName.trim() !== initialForm.firstName.trim() ||
      form.lastName.trim() !== initialForm.lastName.trim() ||
      form.middleName.trim() !== initialForm.middleName.trim() ||
      form.email.trim() !== initialForm.email.trim() ||
      form.phone.trim() !== initialForm.phone.trim() ||
      form.status !== initialForm.status ||
      form.departmentId !== initialForm.departmentId ||
      form.roleId !== initialForm.roleId ||
      newPassword.trim().length > 0 ||
      profileDirty
    );
  }, [form, initialForm, newPassword, profileForms, initialProfileForms]);

  const selectedRole = useMemo(
    () => (form.roleId ? roles.find((r) => r.id === form.roleId) || null : null),
    [roles, form.roleId]
  );
  const selectedDepartment = useMemo(
    () => (form.departmentId ? departments.find((d) => d.id === form.departmentId) || null : null),
    [departments, form.departmentId]
  );

  const resolveEmployeeStatus = useCallback(
    (u: AdminUserItem) => {
      const cached = employeeStatusMap[u.id];
      if (cached !== undefined) return cached;
      return u.currentProfileType === 'EMPLOYEE' ? u.profileStatus ?? null : null;
    },
    [employeeStatusMap]
  );

  const filteredUsers = useMemo(() => {
    let list = users;
    if (statusFilter !== 'all') {
      list = list.filter((u) => {
        const status = resolveEmployeeStatus(u);
        return status === statusFilter;
      });
    }
    if (onlineFilter !== 'all') {
      list = list.filter((u) => {
        const presence = presenceMap[u.id];
        const isOnline = presence?.isOnline ?? u.isOnline ?? false;
        return onlineFilter === 'online' ? isOnline : !isOnline;
      });
    }
    return list;
  }, [users, statusFilter, onlineFilter, presenceMap, resolveEmployeeStatus]);

  const statusCounts = useMemo(() => {
    let total = 0;
    const counts: Record<UserStatusFilter, number> = { all: 0, ACTIVE: 0, PENDING: 0, BLOCKED: 0 };
    users.forEach((u) => {
      const st = resolveEmployeeStatus(u);
      if (!st) return;
      total += 1;
      counts[st] = (counts[st] || 0) + 1;
    });
    counts.all = total;
    return counts;
  }, [users, resolveEmployeeStatus]);

  const onlineCounts = useMemo(() => {
    let online = 0;
    let offline = 0;
    users.forEach((u) => {
      const presence = presenceMap[u.id];
      const isOnline = presence?.isOnline ?? u.isOnline ?? false;
      if (isOnline) online += 1;
      else offline += 1;
    });
    return { all: users.length, online, offline };
  }, [users, presenceMap]);

  const sortedUsers = useMemo(() => {
    const list = [...filteredUsers];
    const dir = sortDir === 'asc' ? 1 : -1;
    const statusRank = (s?: ProfileStatus) => (s === 'BLOCKED' ? 0 : s === 'PENDING' ? 1 : 2);
    const nameKey = (u: AdminUserItem) =>
      `${u.lastName || ''} ${u.firstName || ''} ${u.middleName || ''}`.trim().toLowerCase() ||
      (u.email || '').toLowerCase();
    const roleKey = (u: AdminUserItem) => (u.role?.name || '').toLowerCase();
    const lastSeenKey = (u: AdminUserItem) => {
      const p = presenceMap[u.id];
      const lastSeen = p?.lastSeenAt ?? u.lastSeenAt;
      return lastSeen ? new Date(lastSeen).getTime() : 0;
    };
    const isOnline = (u: AdminUserItem) => {
      const p = presenceMap[u.id];
      return p?.isOnline ?? u.isOnline ?? false;
    };

    list.sort((a, b) => {
      if (sortKey === 'name') return nameKey(a).localeCompare(nameKey(b), 'ru') * dir;
      if (sortKey === 'role') return roleKey(a).localeCompare(roleKey(b), 'ru') * dir;
      if (sortKey === 'status') return (statusRank(a.profileStatus) - statusRank(b.profileStatus)) * dir;

      // recent: online first, then lastSeen desc, then name
      const aOnline = isOnline(a);
      const bOnline = isOnline(b);
      if (aOnline !== bOnline) return (aOnline ? -1 : 1) * dir;
      const aSeen = lastSeenKey(a);
      const bSeen = lastSeenKey(b);
      if (aSeen !== bSeen) return (bSeen - aSeen) * dir;
      return nameKey(a).localeCompare(nameKey(b), 'ru') * dir;
    });
    return list;
  }, [filteredUsers, sortKey, sortDir, presenceMap]);

  const isSummaryActive = useCallback(
    (key: string) => {
      if (key === 'total') return statusFilter === 'all' && onlineFilter === 'all';
      if (key === 'active') return statusFilter === 'ACTIVE';
      if (key === 'pending') return statusFilter === 'PENDING';
      if (key === 'blocked') return statusFilter === 'BLOCKED';
      if (key === 'online') return onlineFilter === 'online';
      return false;
    },
    [onlineFilter, statusFilter]
  );

  const applySummaryFilter = useCallback(
    (key: string) => {
      if (key === 'total') {
        setStatusFilter('all');
        setOnlineFilter('all');
        return;
      }
      if (key === 'active' || key === 'pending' || key === 'blocked') {
        setStatusFilter(key.toUpperCase() as ProfileStatus);
        setOnlineFilter('all');
        return;
      }
      if (key === 'online') {
        setOnlineFilter('online');
        setStatusFilter('all');
      }
    },
    [setOnlineFilter, setStatusFilter]
  );

  const summaryItems = useMemo(
    () => [
      { key: 'total', label: 'Всего', value: sortedUsers.length, color: colors.tint },
      { key: 'active', label: 'Активные', value: statusCounts.ACTIVE ?? 0, color: '#16A34A' },
      { key: 'pending', label: 'Ожидают', value: statusCounts.PENDING ?? 0, color: '#2563EB' },
      { key: 'blocked', label: 'Заблокированы', value: statusCounts.BLOCKED ?? 0, color: '#DC2626' },
      { key: 'online', label: 'Онлайн', value: onlineCounts.online ?? 0, color: '#22C55E' },
    ],
    [colors.tint, onlineCounts, sortedUsers.length, statusCounts]
  );

  const userInitials = useMemo(() => {
    const first = (form.firstName || selectedProfile?.firstName || '').trim()[0] || '';
    const last = (form.lastName || selectedProfile?.lastName || '').trim()[0] || '';
    return `${first}${last}`.toUpperCase() || 'U';
  }, [form.firstName, form.lastName, selectedProfile]);

  const profileTabs = useMemo(
    () => [
      {
        key: 'employee' as const,
        label: 'Сотрудник',
        avatarUrl: selectedProfile?.employeeProfile?.avatarUrl || null,
        status: profileForms.employee?.status || null,
        available: Boolean(selectedProfile?.employeeProfile),
      },
      {
        key: 'client' as const,
        label: 'Клиент',
        avatarUrl: selectedProfile?.clientProfile?.avatarUrl || null,
        status: profileForms.client?.status || null,
        available: Boolean(selectedProfile?.clientProfile),
      },
      {
        key: 'supplier' as const,
        label: 'Поставщик',
        avatarUrl: selectedProfile?.supplierProfile?.avatarUrl || null,
        status: profileForms.supplier?.status || null,
        available: Boolean(selectedProfile?.supplierProfile),
      },
    ],
    [profileForms, selectedProfile]
  );

  useEffect(() => {
    if (!selectedProfile) return;
    setActiveTab('user');
  }, [selectedProfile?.id, modalVisible]);

  useEffect(() => {
    if (!selectedProfile) return;
    const available = profileTabs.filter((tab) => tab.available);
    const hasActive = profileTabs.some((tab) => tab.key === activeProfileTab && tab.available);
    if (!hasActive) {
      setActiveProfileTab(available[0]?.key ?? 'employee');
    }
  }, [activeProfileTab, profileTabs, selectedProfile]);
  const roleOptions = useMemo(() => roles.map((r) => ({ value: r.id, label: r.name })), [roles]);
  const departmentOptions = useMemo(
    () => [{ value: null, label: 'Без отдела' }, ...departments.map((d) => ({ value: d.id, label: d.name }))],
    [departments]
  );

  const handleSelectUser = (user: AdminUserItem) => {
    setSelectedUserId(user.id);
    setModalVisible(true);
    void loadProfile(user.id);
  };

  const cycleStatus = useCallback(() => {
    const idx = STATUS_OPTIONS.indexOf(form.status);
    const next = STATUS_OPTIONS[(idx + 1) % STATUS_OPTIONS.length];
    setForm((prev) => ({ ...prev, status: next }));
  }, [form.status]);

  const handleRoleChipPress = useCallback(() => {
    if (!roles.length) {
      Alert.alert('Нет ролей', 'Сначала создайте роли');
      return;
    }
    setPickerType('role');
  }, [roles]);

  const handleDepartmentChipPress = useCallback(() => {
    if (!departments.length) {
      setForm((prev) => ({ ...prev, departmentId: null }));
    }
    setPickerType('department');
  }, [departments]);

  const handleSave = async () => {
    if (!selectedUserId || !initialForm) return;
    const payload: Partial<FormState> & { profileStatus?: ProfileStatus } = {};
    if (form.firstName.trim() !== initialForm.firstName.trim()) payload.firstName = form.firstName.trim();
    if (form.lastName.trim() !== initialForm.lastName.trim()) payload.lastName = form.lastName.trim();
    if (form.middleName.trim() !== initialForm.middleName.trim()) payload.middleName = form.middleName.trim();
    if (form.email.trim() !== initialForm.email.trim()) payload.email = form.email.trim();
    if (form.phone.trim() !== initialForm.phone.trim()) payload.phone = normalizePhoneE164(form.phone);
    if (form.status !== initialForm.status) payload.profileStatus = form.status;
    if (form.departmentId !== initialForm.departmentId) payload.departmentId = form.departmentId;

    setSaving(true);
    try {
      if (Object.keys(payload).length) {
        await adminUpdateUser(selectedUserId, payload);
      }
      if (form.roleId && form.roleId !== initialForm.roleId) {
        await assignUserRole(selectedUserId, { roleId: form.roleId });
      }
      if (newPassword.trim()) {
        await adminUpdatePassword(selectedUserId, newPassword.trim());
      }

      if (initialProfileForms) {
        const updateProfile = async (
          type: 'client' | 'supplier' | 'employee',
          current: ProfileFormState | null,
          initial: ProfileFormState | null
        ) => {
          if (!current || !initial) return;
          const profilePayload: any = {};

          if (current.status !== initial.status) profilePayload.status = current.status;
          if (current.phone.trim() !== initial.phone.trim()) {
            profilePayload.phone = normalizePhoneE164(current.phone);
          }

          if (type === 'employee') {
            if (current.departmentId !== initial.departmentId) {
              profilePayload.departmentId = current.departmentId ?? null;
            }
          } else {
            const curAddress = current.address || {
              street: '',
              city: '',
              state: '',
              postalCode: '',
              country: '',
            };
            const initAddress = initial.address || {
              street: '',
              city: '',
              state: '',
              postalCode: '',
              country: '',
            };
            const addressChanged = JSON.stringify(curAddress) !== JSON.stringify(initAddress);
            if (addressChanged) {
              const hasAny = Object.values(curAddress).some((v) => String(v || '').trim().length > 0);
              if (!hasAny) {
                profilePayload.address = null;
              } else {
                if (!curAddress.street.trim() || !curAddress.city.trim() || !curAddress.country.trim()) {
                  throw new Error('Для адреса обязательны улица, город и страна');
                }
                profilePayload.address = {
                  street: curAddress.street.trim(),
                  city: curAddress.city.trim(),
                  state: curAddress.state.trim() || null,
                  postalCode: curAddress.postalCode.trim() || null,
                  country: curAddress.country.trim(),
                };
              }
            }
          }

          if (Object.keys(profilePayload).length) {
            await adminUpdateUserProfile(selectedUserId, type, profilePayload);
          }
        };

        await updateProfile('employee', profileForms.employee, initialProfileForms.employee);
        await updateProfile('client', profileForms.client, initialProfileForms.client);
        await updateProfile('supplier', profileForms.supplier, initialProfileForms.supplier);
      }

      await loadProfile(selectedUserId);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUserId
            ? {
                ...u,
                firstName: form.firstName,
                lastName: form.lastName,
                middleName: form.middleName,
                email: form.email,
                phone: form.phone,
                profileStatus: form.status,
                role: selectedRole ? { id: selectedRole.id, name: selectedRole.name } : u.role,
              }
            : u
        )
      );
      Alert.alert('Успех', 'Данные пользователя обновлены');
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось сохранить изменения');
    } finally {
      setSaving(false);
    }
  };

  if (!active) {
    return <View style={{ display: 'none' }} />;
  }

  const ChipsRow = ({ children }: { children: React.ReactNode }) =>
    showSideFilters ? (
      <View style={styles.filterChipsRow}>{children}</View>
    ) : (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
        {children}
      </ScrollView>
    );

  const filtersContent = (
    <View style={[styles.filterGrid, (showSideFilters || isWide) && styles.filterGridWide]}>
      <View style={[styles.filterGroup, showSideFilters && styles.filterGroupFull]}>
        <View style={styles.filterGroupHeader}>
          <Text style={styles.filterLabel}>Статус</Text>
        </View>
        <ChipsRow>
          {STATUS_FILTERS.map((opt) => {
            const active = statusFilter === opt.key;
            const count = statusCounts[opt.key] ?? 0;
            return (
              <FilterChip
                key={`status-${opt.key}`}
                styles={styles}
                active={active}
                compact
                onPress={() => setStatusFilter(opt.key)}
                label={`${opt.label} · ${count}`}
              />
            );
          })}
        </ChipsRow>
      </View>
      <View style={[styles.filterGroup, showSideFilters && styles.filterGroupFull]}>
        <View style={styles.filterGroupHeader}>
          <Text style={styles.filterLabel}>Онлайн</Text>
        </View>
        <ChipsRow>
          {ONLINE_FILTERS.map((opt) => {
            const active = onlineFilter === opt.key;
            const count = onlineCounts[opt.key] ?? 0;
            return (
              <FilterChip
                key={`online-${opt.key}`}
                styles={styles}
                active={active}
                compact
                onPress={() => setOnlineFilter(opt.key)}
                label={`${opt.label} · ${count}`}
              />
            );
          })}
        </ChipsRow>
      </View>
      <View style={[styles.filterGroup, showSideFilters && styles.filterGroupFull]}>
        <View style={styles.filterGroupHeader}>
          <Text style={styles.filterLabel}>Сортировка</Text>
          <Pressable
            onPress={() => setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
            style={styles.sortDirBtn}
          >
            <Text style={styles.sortDirText}>{sortDir === 'asc' ? '↑ Возр.' : '↓ Убыв.'}</Text>
          </Pressable>
        </View>
        <ChipsRow>
          {SORT_OPTIONS.map((opt) => {
            const active = sortKey === opt.key;
            return (
              <FilterChip
                key={`sort-${opt.key}`}
                styles={styles}
                active={active}
                compact
                onPress={() => setSortKey(opt.key)}
                label={opt.label}
              />
            );
          })}
        </ChipsRow>
      </View>
      <View style={styles.filterGroupCompactRow}>
        <Pressable
          onPress={() => {
            setStatusFilter('all');
            setOnlineFilter('all');
            setSortKey('recent');
            setSortDir('desc');
          }}
          style={styles.resetBtn}
        >
          <Text style={styles.resetBtnText}>Сбросить фильтры</Text>
        </Pressable>
        <Text style={styles.filterHint}>Найдено: {sortedUsers.length}</Text>
      </View>
    </View>
  );

  return (
    <>
      <View style={styles.summaryWrap}>
        {showSummaryGrid ? (
          <View style={styles.summaryRowWrap}>
            {summaryItems.map((item) => (
              <SummaryChip
                key={item.key}
                styles={styles}
                label={item.label}
                value={item.value}
                color={item.color}
                active={isSummaryActive(item.key)}
                onPress={() => applySummaryFilter(item.key)}
              />
            ))}
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.summaryRow}>
            {summaryItems.map((item) => (
              <SummaryChip
                key={item.key}
                styles={styles}
                label={item.label}
                value={item.value}
                color={item.color}
                active={isSummaryActive(item.key)}
                onPress={() => applySummaryFilter(item.key)}
              />
            ))}
          </ScrollView>
        )}
      </View>
      <View style={styles.toolbarRow}>
        <View style={[styles.searchRow, styles.searchRowCompact, { flex: 1 }]}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Поиск по имени, email или телефону"
            style={[styles.searchInput, { paddingVertical: 0 }]}
          />
          {loadingUsers && <ActivityIndicator size="small" />}
        </View>
        {!showSideFilters ? (
          <Pressable
            onPress={() => setFiltersOpen(true)}
            style={[styles.filterIconBtn, filtersOpen && styles.filterActionActive]}
            accessibilityLabel="Фильтры"
          >
            <Ionicons name="filter-outline" size={18} color={colors.text} />
            {activeFilterCount > 0 ? (
              <View style={[styles.filterBadge, { position: 'absolute', top: -4, right: -4 }]}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </View>
      {!showSideFilters ? <Text style={styles.filterHint}>Найдено: {sortedUsers.length}</Text> : null}
      <View style={[styles.usersBody, showSideFilters && styles.usersBodyWide]}>
        {showSideFilters ? (
          <View style={styles.filtersColumn}>
            <View style={styles.filtersCard}>
              <Text style={styles.sectionTitle}>Фильтры</Text>
              {filtersContent}
            </View>
          </View>
        ) : null}
        <View style={styles.userListWrap}>
          <FlatList
            data={sortedUsers}
            numColumns={columns}
            key={`user-list-${columns}`}
            columnWrapperStyle={columns > 1 ? styles.userColumnWrap : undefined}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => {
              const activeRow = item.id === selectedUserId;
              const presence = presenceMap[item.id];
              const isOnline = presence?.isOnline ?? item.isOnline ?? false;
              return (
                <UserListItem
                  styles={styles}
                  item={item}
                  active={activeRow}
                  isWide={isWide}
                  onPress={() => handleSelectUser(item)}
                  isOnline={isOnline}
                  statusMeta={statusMeta(resolveEmployeeStatus(item) || item.profileStatus || 'PENDING')}
                />
              );
            }}
            ListEmptyComponent={
              <Text style={styles.subtitle}>
                {loadingUsers ? 'Поиск...' : 'Нет пользователей по выбранным фильтрам'}
              </Text>
            }
            style={{ flex: 1 }}
            contentContainerStyle={{
              flexGrow: 1,
              paddingTop: 6,
              paddingBottom: tabBarSpacer + 12,
              ...(Platform.OS === 'web' && showSideFilters ? { paddingHorizontal: 8 } : {}),
            }}
          />
        </View>
      </View>

      <Modal
        visible={filtersOpen && !showSideFilters}
        transparent
        animationType="fade"
        onRequestClose={() => setFiltersOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => setFiltersOpen(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={[styles.filtersModalCard, { backgroundColor: colors.cardBackground }]}>
            <View style={styles.filtersModalHeader}>
              <Text style={styles.filtersModalTitle}>Фильтры</Text>
              <Pressable onPress={() => setFiltersOpen(false)} style={styles.filtersModalClose}>
                <Text style={styles.filtersModalCloseText}>Закрыть</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>{filtersContent}</ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={active && modalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ width: '100%', maxWidth: 980, maxHeight: modalMaxHeight, height: modalMaxHeight }}
          >
            <View style={[styles.modalCard, { backgroundColor: colors.cardBackground, maxHeight: modalMaxHeight, flex: 1 }]}>
              {profileLoading ? (
                <View style={styles.center}>
                  <ActivityIndicator size="large" color={colors.tint} />
                </View>
              ) : selectedProfile ? (
                <View style={styles.modalBody}>
                  <ScrollView
                    style={styles.modalScroll}
                    contentContainerStyle={styles.modalScrollContent}
                    showsVerticalScrollIndicator
                  >
                    <View style={styles.heroWrap}>
                      <LinearGradient
                        colors={['#C7D2FE', '#E9D5FF']}
                        start={{ x: 0, y: 0.4 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.heroBg}
                      />
                      <View style={styles.heroInner}>
                        <View style={styles.avatarOuter}>
                          {selectedProfile.avatarUrl ? (
                            <Image source={{ uri: selectedProfile.avatarUrl }} style={styles.avatar} resizeMode="cover" />
                          ) : (
                            <View style={[styles.avatar, styles.avatarFallback]}>
                              <Text style={styles.avatarInitials}>{userInitials}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.heroTitle}>
                          {[form.lastName, form.firstName, form.middleName].filter(Boolean).join(' ') || 'Профиль'}
                        </Text>
                        <Text style={styles.heroSubtitle}>
                          {selectedDepartment?.name || selectedProfile.employeeProfile?.department?.name || 'Без отдела'}
                        </Text>
                        <View style={styles.chipsRow}>
                          <SelectableChip styles={styles} label="Сотрудник" icon="id-card-outline" tone="violet" />
                          <SelectableChip
                            styles={styles}
                            label={form.status || 'STATUS'}
                            icon="shield-checkmark-outline"
                            tone={form.status === 'ACTIVE' ? 'green' : form.status === 'BLOCKED' ? 'red' : 'blue'}
                            onPress={cycleStatus}
                          />
                          <SelectableChip
                            styles={styles}
                            label={selectedRole?.name || 'Роль'}
                            icon="person-outline"
                            tone="blue"
                            onPress={handleRoleChipPress}
                          />
                          <SelectableChip
                            styles={styles}
                            label={selectedDepartment?.name || 'Отдел'}
                            icon="business-outline"
                            tone="gray"
                            onPress={handleDepartmentChipPress}
                          />
                        </View>
                      </View>
                    </View>

                    <View style={styles.modalTabs}>
                      <Pressable
                        onPress={() => setActiveTab('user')}
                        style={[styles.tabBtn, activeTab === 'user' && styles.tabBtnActive]}
                      >
                        <Text style={[styles.tabText, activeTab === 'user' && styles.tabTextActive]}>Пользователь</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setActiveTab('profiles')}
                        style={[styles.tabBtn, activeTab === 'profiles' && styles.tabBtnActive]}
                      >
                        <Text style={[styles.tabText, activeTab === 'profiles' && styles.tabTextActive]}>Профили</Text>
                      </Pressable>
                    </View>

                    {activeTab === 'user' ? (
                      <View style={styles.cardsWrap}>
                        <SelectorCard
                          styles={styles}
                          icon="shield-checkmark-outline"
                          label="Статус"
                          options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
                          selected={form.status}
                          onSelect={(v) => setForm((prev) => ({ ...prev, status: v as ProfileStatus }))}
                        />
                        <EditableCard
                          styles={styles}
                          icon="mail-outline"
                          label="Email"
                          value={form.email}
                          onChangeText={(text) => setForm((prev) => ({ ...prev, email: text }))}
                          placeholder="email@example.com"
                          keyboardType="email-address"
                        />
                        <EditableCard
                          styles={styles}
                          icon="call-outline"
                          label="Телефон"
                          value={form.phone}
                          mask="+7 (999) 999-99-99"
                          onMaskedChange={(masked, raw) => {
                            const normalizedMasked = formatPhone(masked || raw || '');
                            setForm((prev) => ({ ...prev, phone: normalizedMasked }));
                          }}
                          onChangeText={(text) => setForm((prev) => ({ ...prev, phone: formatPhone(text) }))}
                          placeholder="+7 ..."
                          keyboardType="phone-pad"
                        />
                        <EditableCard
                          styles={styles}
                          icon="document-text-outline"
                          label="Фамилия"
                          value={form.lastName}
                          onChangeText={(text) => setForm((prev) => ({ ...prev, lastName: text }))}
                          placeholder="Фамилия"
                        />
                        <EditableCard
                          styles={styles}
                          icon="document-text-outline"
                          label="Имя"
                          value={form.firstName}
                          onChangeText={(text) => setForm((prev) => ({ ...prev, firstName: text }))}
                          placeholder="Имя"
                        />
                        <EditableCard
                          styles={styles}
                          icon="document-text-outline"
                          label="Отчество"
                          value={form.middleName}
                          onChangeText={(text) => setForm((prev) => ({ ...prev, middleName: text }))}
                          placeholder="Отчество"
                        />
                        <EditableCard
                          styles={styles}
                          icon="key-outline"
                          label="Новый пароль"
                          value={newPassword}
                          onChangeText={setNewPassword}
                          placeholder="Оставьте пустым чтобы не менять"
                          secureTextEntry
                        />

                        <StaticCard
                          styles={styles}
                          icon="barcode-outline"
                          label="ID пользователя"
                          value={`#${selectedProfile.id}`}
                        />
                      </View>
                    ) : (
                      <View style={{ gap: 12 }}>
                        <View style={styles.profileTabsRow}>
                          {profileTabs.map((tab) => {
                            const isActive = tab.key === activeProfileTab;
                            return (
                              <Pressable
                                key={tab.key}
                                onPress={() => tab.available && setActiveProfileTab(tab.key)}
                                disabled={!tab.available}
                                style={{ flexGrow: isWide ? 0 : 1 }}
                              >
                                <View
                                  style={[
                                    styles.profileTabCard,
                                    isActive && styles.profileTabCardActive,
                                    !tab.available && styles.profileTabCardDisabled,
                                  ]}
                                >
                                  {tab.avatarUrl ? (
                                    <Image source={{ uri: tab.avatarUrl }} style={styles.profileAvatar} resizeMode="cover" />
                                  ) : (
                                    <View style={[styles.profileAvatar, styles.profileAvatarFallback]}>
                                      <Text style={styles.profileAvatarText}>{userInitials}</Text>
                                    </View>
                                  )}
                                  <View style={styles.profileTabMeta}>
                                    <Text style={styles.profileTabLabel}>{tab.label}</Text>
                                    <Text style={styles.profileTabStatus}>
                                      {tab.available ? tab.status || '—' : 'Не создан'}
                                    </Text>
                                  </View>
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>

                        {activeProfileTab === 'employee' ? (
                          <View style={{ gap: 8 }}>
                            <Text style={styles.sectionTitle}>Профиль сотрудника</Text>
                            {profileForms.employee ? (
                              <>
                                <SelectorCard
                                  styles={styles}
                                  icon="shield-checkmark-outline"
                                  label="Статус профиля"
                                  options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
                                  selected={profileForms.employee.status}
                                  onSelect={(v) =>
                                    setProfileForms((prev) => ({
                                      ...prev,
                                      employee: prev.employee ? { ...prev.employee, status: v as ProfileStatus } : prev.employee,
                                    }))
                                  }
                                />
                                <EditableCard
                                  styles={styles}
                                  icon="call-outline"
                                  label="Телефон (сотрудник)"
                                  value={profileForms.employee.phone}
                                  mask="+7 (999) 999-99-99"
                                  onMaskedChange={(masked) =>
                                    setProfileForms((prev) => ({
                                      ...prev,
                                      employee: prev.employee ? { ...prev.employee, phone: formatPhone(masked || '') } : prev.employee,
                                    }))
                                  }
                                  onChangeText={(text) =>
                                    setProfileForms((prev) => ({
                                      ...prev,
                                      employee: prev.employee ? { ...prev.employee, phone: formatPhone(text) } : prev.employee,
                                    }))
                                  }
                                  placeholder="+7 ..."
                                  keyboardType="phone-pad"
                                />
                              </>
                            ) : (
                              <StaticCard styles={styles} icon="alert-circle-outline" label="Профиль сотрудника" value="Не создан" />
                            )}
                          </View>
                        ) : null}

                        {activeProfileTab === 'client' ? (
                          <View style={{ gap: 8 }}>
                            <Text style={styles.sectionTitle}>Профиль клиента</Text>
                            {profileForms.client ? (
                              <>
                                <SelectorCard
                                  styles={styles}
                                  icon="shield-checkmark-outline"
                                  label="Статус профиля"
                                  options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
                                  selected={profileForms.client.status}
                                  onSelect={(v) =>
                                    setProfileForms((prev) => ({
                                      ...prev,
                                      client: prev.client ? { ...prev.client, status: v as ProfileStatus } : prev.client,
                                    }))
                                  }
                                />
                                <EditableCard
                                  styles={styles}
                                  icon="call-outline"
                                  label="Телефон (клиент)"
                                  value={profileForms.client.phone}
                                  mask="+7 (999) 999-99-99"
                                  onMaskedChange={(masked) =>
                                    setProfileForms((prev) => ({
                                      ...prev,
                                      client: prev.client ? { ...prev.client, phone: formatPhone(masked || '') } : prev.client,
                                    }))
                                  }
                                  onChangeText={(text) =>
                                    setProfileForms((prev) => ({
                                      ...prev,
                                      client: prev.client ? { ...prev.client, phone: formatPhone(text) } : prev.client,
                                    }))
                                  }
                                  placeholder="+7 ..."
                                  keyboardType="phone-pad"
                                />
                                <EditableCard
                                  styles={styles}
                                  icon="location-outline"
                                  label="Улица"
                                  value={profileForms.client.address?.street || ''}
                                  onChangeText={(text) =>
                                    setProfileForms((prev) => ({
                                      ...prev,
                                      client: prev.client
                                        ? {
                                            ...prev.client,
                                            address: { ...(prev.client.address || buildAddressForm(null)), street: text },
                                          }
                                        : prev.client,
                                    }))
                                  }
                                  placeholder="Улица"
                                />
                                <EditableCard
                                  styles={styles}
                                  icon="business-outline"
                                  label="Город"
                                  value={profileForms.client.address?.city || ''}
                                  onChangeText={(text) =>
                                    setProfileForms((prev) => ({
                                      ...prev,
                                      client: prev.client
                                        ? {
                                            ...prev.client,
                                            address: { ...(prev.client.address || buildAddressForm(null)), city: text },
                                          }
                                        : prev.client,
                                    }))
                                  }
                                  placeholder="Город"
                                />
                                <EditableCard
                                  styles={styles}
                                  icon="map-outline"
                                  label="Регион"
                                  value={profileForms.client.address?.state || ''}
                                  onChangeText={(text) =>
                                    setProfileForms((prev) => ({
                                      ...prev,
                                      client: prev.client
                                        ? {
                                            ...prev.client,
                                            address: { ...(prev.client.address || buildAddressForm(null)), state: text },
                                          }
                                        : prev.client,
                                    }))
                                  }
                                  placeholder="Регион"
                                />
                                <EditableCard
                                  styles={styles}
                                  icon="mail-outline"
                                  label="Индекс"
                                  value={profileForms.client.address?.postalCode || ''}
                                  onChangeText={(text) =>
                                    setProfileForms((prev) => ({
                                      ...prev,
                                      client: prev.client
                                        ? {
                                            ...prev.client,
                                            address: { ...(prev.client.address || buildAddressForm(null)), postalCode: text },
                                          }
                                        : prev.client,
                                    }))
                                  }
                                  placeholder="Почтовый индекс"
                                  keyboardType="numeric"
                                />
                                <EditableCard
                                  styles={styles}
                                  icon="flag-outline"
                                  label="Страна"
                                  value={profileForms.client.address?.country || ''}
                                  onChangeText={(text) =>
                                    setProfileForms((prev) => ({
                                      ...prev,
                                      client: prev.client
                                        ? {
                                            ...prev.client,
                                            address: { ...(prev.client.address || buildAddressForm(null)), country: text },
                                          }
                                        : prev.client,
                                    }))
                                  }
                                  placeholder="Страна"
                                />
                              </>
                            ) : (
                              <StaticCard styles={styles} icon="alert-circle-outline" label="Профиль клиента" value="Не создан" />
                            )}
                          </View>
                        ) : null}

                        {activeProfileTab === 'supplier' ? (
                          <View style={{ gap: 8 }}>
                            <Text style={styles.sectionTitle}>Профиль поставщика</Text>
                            {profileForms.supplier ? (
                              <>
                                <SelectorCard
                                  styles={styles}
                                  icon="shield-checkmark-outline"
                                  label="Статус профиля"
                                  options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
                                  selected={profileForms.supplier.status}
                                  onSelect={(v) =>
                                    setProfileForms((prev) => ({
                                      ...prev,
                                      supplier: prev.supplier ? { ...prev.supplier, status: v as ProfileStatus } : prev.supplier,
                                    }))
                                  }
                                />
                                <EditableCard
                                  styles={styles}
                                  icon="call-outline"
                                  label="Телефон (поставщик)"
                                  value={profileForms.supplier.phone}
                                  mask="+7 (999) 999-99-99"
                                  onMaskedChange={(masked) =>
                                    setProfileForms((prev) => ({
                                      ...prev,
                                      supplier: prev.supplier ? { ...prev.supplier, phone: formatPhone(masked || '') } : prev.supplier,
                                    }))
                                  }
                                  onChangeText={(text) =>
                                    setProfileForms((prev) => ({
                                      ...prev,
                                      supplier: prev.supplier ? { ...prev.supplier, phone: formatPhone(text) } : prev.supplier,
                                    }))
                                  }
                                  placeholder="+7 ..."
                                  keyboardType="phone-pad"
                                />
                                <EditableCard
                                  styles={styles}
                                  icon="location-outline"
                                  label="Улица"
                                  value={profileForms.supplier.address?.street || ''}
                                  onChangeText={(text) =>
                                    setProfileForms((prev) => ({
                                      ...prev,
                                      supplier: prev.supplier
                                        ? {
                                            ...prev.supplier,
                                            address: { ...(prev.supplier.address || buildAddressForm(null)), street: text },
                                          }
                                        : prev.supplier,
                                    }))
                                  }
                                  placeholder="Улица"
                                />
                                <EditableCard
                                  styles={styles}
                                  icon="business-outline"
                                  label="Город"
                                  value={profileForms.supplier.address?.city || ''}
                                  onChangeText={(text) =>
                                    setProfileForms((prev) => ({
                                      ...prev,
                                      supplier: prev.supplier
                                        ? {
                                            ...prev.supplier,
                                            address: { ...(prev.supplier.address || buildAddressForm(null)), city: text },
                                          }
                                        : prev.supplier,
                                    }))
                                  }
                                  placeholder="Город"
                                />
                                <EditableCard
                                  styles={styles}
                                  icon="map-outline"
                                  label="Регион"
                                  value={profileForms.supplier.address?.state || ''}
                                  onChangeText={(text) =>
                                    setProfileForms((prev) => ({
                                      ...prev,
                                      supplier: prev.supplier
                                        ? {
                                            ...prev.supplier,
                                            address: { ...(prev.supplier.address || buildAddressForm(null)), state: text },
                                          }
                                        : prev.supplier,
                                    }))
                                  }
                                  placeholder="Регион"
                                />
                                <EditableCard
                                  styles={styles}
                                  icon="mail-outline"
                                  label="Индекс"
                                  value={profileForms.supplier.address?.postalCode || ''}
                                  onChangeText={(text) =>
                                    setProfileForms((prev) => ({
                                      ...prev,
                                      supplier: prev.supplier
                                        ? {
                                            ...prev.supplier,
                                            address: { ...(prev.supplier.address || buildAddressForm(null)), postalCode: text },
                                          }
                                        : prev.supplier,
                                    }))
                                  }
                                  placeholder="Почтовый индекс"
                                  keyboardType="numeric"
                                />
                                <EditableCard
                                  styles={styles}
                                  icon="flag-outline"
                                  label="Страна"
                                  value={profileForms.supplier.address?.country || ''}
                                  onChangeText={(text) =>
                                    setProfileForms((prev) => ({
                                      ...prev,
                                      supplier: prev.supplier
                                        ? {
                                            ...prev.supplier,
                                            address: { ...(prev.supplier.address || buildAddressForm(null)), country: text },
                                          }
                                        : prev.supplier,
                                    }))
                                  }
                                  placeholder="Страна"
                                />
                              </>
                            ) : (
                              <StaticCard styles={styles} icon="alert-circle-outline" label="Профиль поставщика" value="Не создан" />
                            )}
                          </View>
                        ) : null}
                      </View>
                    )}

                    {isDirty ? (
                      <View style={{ marginTop: 12 }}>
                        <ShimmerButton
                          title={saving ? 'Сохраняем...' : 'Сохранить'}
                          loading={saving}
                          gradientColors={btnGradient}
                          onPress={handleSave}
                        />
                      </View>
                    ) : null}
                  </ScrollView>
                </View>
              ) : (
                <Text style={{ color: colors.text }}>Нет данных</Text>
              )}
              <TouchableOpacity style={styles.modalClose} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCloseText}>Закрыть</Text>
              </TouchableOpacity>

              {pickerType && (
                <View style={styles.pickerOverlay} pointerEvents="box-none">
                  <TouchableWithoutFeedback onPress={() => setPickerType(null)}>
                    <View style={StyleSheet.absoluteFill} />
                  </TouchableWithoutFeedback>
                  <View style={[styles.pickerCard, { backgroundColor: colors.cardBackground }]}>
                    <Text style={styles.pickerTitle}>
                      {pickerType === 'role' ? 'Выбор роли' : 'Выбор отдела'}
                    </Text>
                    <ScrollView style={{ maxHeight: 320 }}>
                      {(pickerType === 'role' ? roleOptions : departmentOptions).map((opt) => {
                        const activeOption =
                          pickerType === 'role'
                            ? opt.value === form.roleId
                            : opt.value === form.departmentId;
                        return (
                          <Pressable
                            key={`${pickerType}-${opt.value ?? 'none'}`}
                            onPress={() => {
                              if (pickerType === 'role') {
                                setForm((prev) => ({ ...prev, roleId: Number(opt.value) }));
                              } else {
                                setForm((prev) => ({
                                  ...prev,
                                  departmentId: opt.value === null ? null : Number(opt.value),
                                }));
                              }
                              setPickerType(null);
                            }}
                            style={[styles.pickerOption, activeOption && styles.pickerOptionActive]}
                          >
                            <Text style={[styles.pickerOptionText, activeOption && styles.pickerOptionTextActive]}>
                              {opt.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}
