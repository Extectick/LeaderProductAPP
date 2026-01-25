import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View, Image, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Skeleton } from 'moti/skeleton';
import Animated, {
  FadeInDown,
  FadeInUp,
  Layout,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  withSpring,
} from 'react-native-reanimated';
import { Colors } from '@/constants/Colors';
import { Profile, ProfileType, ProfileStatus } from '@/types/userTypes';
import { getProfileById } from '@/utils/userService';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
type Tone = 'green' | 'violet' | 'gray' | 'red' | 'blue';
type Chip = { icon: IoniconName; label: string; tone?: Tone };

export type ProfileViewProps = {
  /** Если указан - показываем чужой профиль, иначе - текущий */
  userId?: number;
  style?: ViewStyle;
  profileOverride?: Profile | null;
  loadingOverride?: boolean;
  errorOverride?: string | null;
};

/* ---------- helpers ---------- */

const profTypeName = (t?: ProfileType | null) =>
  t === 'EMPLOYEE' ? 'Сотрудник' : t === 'CLIENT' ? 'Клиент' : t === 'SUPPLIER' ? 'Поставщик' : 'Неизвестно';

const profStatusTone = (s?: ProfileStatus): Tone =>
  s === 'ACTIVE' ? 'green' : s === 'PENDING' ? 'blue' : s === 'BLOCKED' ? 'red' : 'gray';

/* ---------- main component ---------- */

export function ProfileView({
  userId,
  style,
  profileOverride,
  loadingOverride,
  errorOverride,
}: ProfileViewProps) {
  const usingOverride = profileOverride !== undefined;
  const [profile, setProfile] = useState<Profile | null>(profileOverride ?? null);
  const [loading, setLoading] = useState(usingOverride ? Boolean(loadingOverride) : true);
  const [err, setErr] = useState<string | null>(errorOverride ?? null);

  const isSelf = userId == null; // нет userId => это мой профиль (скрываем действия)

  useEffect(() => {
    if (usingOverride) return;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const data = await getProfileById(userId);
        if (!data) {
          setErr('Не удалось загрузить профиль');
        }
        setProfile(data);
      } catch (e) {
        console.error('Profile fetch error:', e);
        setErr('Не удалось загрузить профиль');
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, usingOverride]);

  useEffect(() => {
    if (!usingOverride) return;
    setProfile(profileOverride ?? null);
    setLoading(Boolean(loadingOverride));
    setErr(errorOverride ?? null);
  }, [errorOverride, loadingOverride, profileOverride, usingOverride]);

  if (loading && !profile) {
    return (
      <View style={style}>
        <ProfileSkeleton showActions={!isSelf} />
      </View>
    );
  }
  if (err || !profile) {
    return (
      <View style={[styles.center, style]}>
        <Text style={{ color: Colors.leaderprod.text }}>{err ?? 'Ошибка'}</Text>
      </View>
    );
  }

  const {
    firstName,
    lastName,
    middleName,
    email,
    phone,
    avatarUrl,
    currentProfileType,
    profileStatus,
    role,
    employeeProfile,
    departmentRoles,
    id,
  } = profile;

  const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ').replace(/\s+/g, ' ');
  const initials = `${(firstName?.[0] ?? '').toUpperCase()}${(lastName?.[0] ?? '').toUpperCase()}` || '👤';
  const mainPhone = phone || employeeProfile?.phone || undefined;
  const deptName = employeeProfile?.department?.name;

  const chips: Chip[] = [
    { icon: 'id-card-outline' as IoniconName, label: profTypeName(currentProfileType), tone: 'violet' },
    { icon: 'shield-checkmark-outline' as IoniconName, label: profileStatus ?? '—', tone: profStatusTone(profileStatus) },
    { icon: 'person-outline' as IoniconName, label: role?.name || '—', tone: 'blue' },
    ...(deptName ? [{ icon: 'business-outline' as IoniconName, label: deptName, tone: 'gray' as Tone }] : []),
  ];

  const facts: Array<{ icon: IoniconName; label: string; value?: string }> = [
    { icon: 'mail-outline', label: 'Email', value: email || '—' },
    { icon: 'call-outline', label: 'Телефон', value: mainPhone || '—' },
    { icon: 'barcode-outline', label: 'ID пользователя', value: String(id) },
    {
      icon: 'calendar-outline',
      label: 'Создан',
      value: employeeProfile?.createdAt ? new Date(employeeProfile.createdAt).toLocaleString() : '—',
    },
    {
      icon: 'refresh-outline',
      label: 'Обновлён',
      value: employeeProfile?.updatedAt ? new Date(employeeProfile.updatedAt).toLocaleString() : '—',
    },
  ];

  return (
    <View style={style}>
      {/* HERO */}
      <Hero
        avatarUrl={avatarUrl || undefined}
        initials={initials}
        title={fullName || 'Профиль'}
        subtitle={deptName ? `${profTypeName(currentProfileType)} • ${deptName}` : profTypeName(currentProfileType)}
        chips={chips}
      />

      {/* Действия — не показываем для своего профиля */}
      {!isSelf && (
        <Animated.View entering={FadeInUp.delay(120).duration(500)} style={styles.actionsRow}>
          <ActionButton
            label="Написать"
            icon="mail-outline"
            disabled={!email}
            onPress={() => email && Linking.openURL(`mailto:${email}`)}
          />
          <ActionButton
            label="Позвонить"
            icon="call-outline"
            disabled={!mainPhone}
            onPress={() => mainPhone && Linking.openURL(`tel:${mainPhone.replace(/[^\d+]/g, '')}`)}
          />
          <ActionButton
            label="Скопировать"
            icon="copy-outline"
            onPress={() => {
              const text = [fullName, email, mainPhone].filter(Boolean).join(' • ');
              if (typeof navigator !== 'undefined' && (navigator as any).clipboard?.writeText) {
                (navigator as any).clipboard.writeText(text);
              }
            }}
          />
        </Animated.View>
      )}

      {/* Основные факты */}
      <Animated.View
        entering={FadeInDown.delay(150).duration(600)}
        layout={Layout.springify()}
        style={styles.cardsWrap}
      >
        {facts.map((f, i) => (
          <InfoCard key={i} icon={f.icon} label={f.label} value={f.value} delay={i * 60} />
        ))}
      </Animated.View>

      {/* Роли по отделам */}
      {departmentRoles?.length ? (
        <Animated.View entering={FadeInDown.delay(180).duration(600)} layout={Layout.springify()}>
          <Text style={styles.sectionTitle}>Роли по отделам</Text>
          <View style={{ gap: 10 }}>
            {departmentRoles.map((dr, idx) => (
              <DepartmentRoleRow
                key={`${dr.department?.id}-${dr.role?.id}-${idx}`}
                department={dr.department?.name || `Отдел #${dr.department?.id ?? '—'}`}
                roleName={dr.role?.name || '—'}
                delay={idx * 60}
              />
            ))}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

/* ---------- subcomponents ---------- */

function Hero({
  avatarUrl,
  initials,
  title,
  subtitle,
  chips,
}: {
  avatarUrl?: string;
  initials: string;
  title: string;
  subtitle?: string;
  chips: Chip[];
}) {
  const float = useSharedValue(0);
  useEffect(() => {
    float.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, []);
  const avatarAnim = useAnimatedStyle(() => {
    const y = (float.value - 0.5) * 8;
    const s = 1 + (float.value - 0.5) * 0.04;
    return { transform: [{ translateY: y }, { scale: s }] };
  });

  return (
    <Animated.View entering={FadeInDown.duration(600)} style={styles.heroWrap}>
      <LinearGradient
        colors={['#C7D2FE', '#E9D5FF']}
        start={{ x: 0, y: 0.4 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroBg}
      />
      <View style={styles.heroInner}>
        <Animated.View style={[styles.avatarOuter, avatarAnim]}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
        </Animated.View>

        <Text style={styles.heroTitle}>{title}</Text>
        {subtitle ? <Text style={styles.heroSubtitle}>{subtitle}</Text> : null}

        <View style={styles.chipsRow}>
          {chips.map((c, idx) => (
            <Chip key={idx} icon={c.icon} label={c.label} tone={c.tone} />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

function Chip({
  label,
  icon,
  tone = 'gray',
}: {
  label: string;
  icon: IoniconName;
  tone?: Tone;
}) {
  const palette = {
    green: { bg: '#DCFCE7', bd: '#86EFAC', text: '#166534' },
    violet: { bg: '#EDE9FE', bd: '#C4B5FD', text: '#4C1D95' },
    gray: { bg: '#F3F4F6', bd: '#E5E7EB', text: '#374151' },
    red: { bg: '#FEE2E2', bd: '#FCA5A5', text: '#991B1B' },
    blue: { bg: '#DBEAFE', bd: '#93C5FD', text: '#1E3A8A' },
  }[tone];

  return (
    <View style={[styles.chip, { backgroundColor: palette.bg, borderColor: palette.bd }]}>
      <Ionicons name={icon} size={14} color={palette.text} />
      <Text style={[styles.chipText, { color: palette.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function InfoCard({
  icon,
  label,
  value,
  delay = 0,
}: {
  icon: IoniconName;
  label: string;
  value?: string;
  delay?: number;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(400)} layout={Layout.springify()}>
      <View style={styles.infoCard}>
        <View style={styles.infoIcon}>
          <Ionicons name={icon} size={18} color="#4F46E5" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.infoLabel}>{label}</Text>
          <Text style={styles.infoValue} numberOfLines={2}>
            {value || '—'}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

function DepartmentRoleRow({
  department,
  roleName,
  delay = 0,
}: {
  department: string;
  roleName: string;
  delay?: number;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(400)} layout={Layout.springify()}>
      <View style={styles.deptRow}>
        <View style={styles.deptIcon}>
          <Ionicons name="business-outline" size={18} color="#0EA5E9" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.deptName}>{department}</Text>
          <Text style={styles.deptRole}>Роль: {roleName}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: IoniconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const onIn = () => (scale.value = withSpring(0.97, { damping: 18, stiffness: 260 }));
  const onOut = () => (scale.value = withSpring(1, { damping: 18, stiffness: 260 }));

  return (
    <Animated.View style={[styles.actionBtn, aStyle]}>
      <Pressable
        disabled={disabled}
        onPressIn={onIn}
        onPressOut={onOut}
        onPress={onPress}
        android_ripple={{ color: '#E5E7EB' }}
        style={({ pressed }) => [
          styles.actionPressable,
          disabled && { opacity: 0.5 },
          pressed && Platform.OS === 'ios' ? { opacity: 0.9 } : null,
        ]}
      >
        <Ionicons name={icon} size={18} color="#111827" />
        <Text style={styles.actionLabel}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function ProfileSkeleton({ showActions }: { showActions?: boolean }) {
  return (
    <View>
      <View style={styles.heroWrap}>
        <View style={[styles.heroInner, { gap: 10 }]}>
          <Skeleton height={96} width={96} radius={28} colorMode="light" />
          <Skeleton height={20} width="60%" radius={6} colorMode="light" />
          <Skeleton height={12} width="40%" radius={6} colorMode="light" />
          <View style={styles.skeletonChipsRow}>
            <Skeleton height={24} width={90} radius={999} colorMode="light" />
            <Skeleton height={24} width={80} radius={999} colorMode="light" />
            <Skeleton height={24} width={110} radius={999} colorMode="light" />
          </View>
        </View>
      </View>

      {showActions ? (
        <View style={styles.actionsRow}>
          <View style={{ flex: 1 }}>
            <Skeleton height={44} radius={12} colorMode="light" width="100%" />
          </View>
          <View style={{ flex: 1 }}>
            <Skeleton height={44} radius={12} colorMode="light" width="100%" />
          </View>
          <View style={{ flex: 1 }}>
            <Skeleton height={44} radius={12} colorMode="light" width="100%" />
          </View>
        </View>
      ) : null}

      <View style={styles.cardsWrap}>
        {[0, 1, 2, 3, 4].map((idx) => (
          <View key={`skeleton-card-${idx}`} style={styles.skeletonCard}>
            <Skeleton height={34} width={34} radius={10} colorMode="light" />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton height={12} width="35%" radius={6} colorMode="light" />
              <Skeleton height={14} width="70%" radius={6} colorMode="light" />
            </View>
          </View>
        ))}
      </View>

      <View style={{ marginTop: 16 }}>
        <Skeleton height={16} width={140} radius={6} colorMode="light" />
        <View style={{ gap: 10, marginTop: 8 }}>
          {[0, 1].map((idx) => (
            <View key={`skeleton-role-${idx}`} style={styles.skeletonCard}>
              <Skeleton height={34} width={34} radius={10} colorMode="light" />
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton height={12} width="55%" radius={6} colorMode="light" />
                <Skeleton height={12} width="45%" radius={6} colorMode="light" />
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/* ---------- styles ---------- */

const styles = StyleSheet.create({
  center: { justifyContent: 'center', alignItems: 'center' },

  heroWrap: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E0E7FF',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  heroBg: { ...StyleSheet.absoluteFillObject },
  heroInner: { padding: 18 },
  avatarOuter: {
    alignSelf: 'flex-start',
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#EEF2FF',
    marginBottom: 10,
  },
  avatar: { width: 88, height: 88, borderRadius: 24 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF' },
  avatarInitials: { fontSize: 28, fontWeight: '800', color: '#0F172A' },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  heroSubtitle: { marginTop: 6, color: '#334155' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },

  chip: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: '700' },

  actionsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  actionBtn: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  actionPressable: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
  },
  actionLabel: { color: '#111827', fontWeight: '700', fontSize: 13 },

  cardsWrap: { gap: 12 },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: { color: '#6B7280', fontSize: 12, fontWeight: '700' },
  infoValue: { color: '#111827', fontSize: 14, fontWeight: '700' },
  skeletonChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  skeletonCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  sectionTitle: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  deptRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deptIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deptName: { color: '#0F172A', fontWeight: '800' },
  deptRole: { color: '#334155', marginTop: 2 },
});

export default ProfileView;
