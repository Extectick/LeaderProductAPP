import React, { useEffect, useRef, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Colors as fallbackColors } from '@/constants/Colors';
import { useTheme } from '@/context/ThemeContext';
import type { Profile } from '@/src/entities/user/types';
import { profileIdentity } from '@/src/features/profile/lib/presentation';
import { formatPhoneDisplay, normalizePhoneInputToDigits11 } from '@/utils/phone';
import { getRoleDisplayName } from '@/utils/rbacLabels';

export type UserProfileCardProps = {
  profile: Profile;
  presenceLabel?: string | null;
  presenceOnline?: boolean;
  style?: ViewStyle;
};

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Palette = typeof fallbackColors.light;

function InfoRow({ icon, label, value, colors, verified = false }: {
  icon: IconName; label: string; value: string; colors: Palette; verified?: boolean;
}) {
  return (
    <View style={[styles.infoRow, { borderColor: colors.inputBorder }]}>
      <Ionicons name={icon} size={19} color={colors.secondaryText} style={styles.rowIcon} accessible={false} />
      <View style={styles.rowContent}>
        <View style={styles.labelLine}>
          <Text style={[styles.label, { color: colors.secondaryText }]}>{label}</Text>
          {verified ? <Ionicons name="checkmark-circle-outline" size={15} color={colors.tint} accessibilityLabel={label === 'Почта' ? 'Почта подтверждена' : `${label} подтверждён`} /> : null}
        </View>
        <Text selectable style={[styles.value, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}

function readableDate(value: Date | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }) : null;
}

/** Read-only contents. The containing profile/entity viewer owns scrolling and access. */
export function UserProfileCard(props: UserProfileCardProps) {
  return <UserProfileContents key={props.profile.id} {...props} />;
}

function UserProfileContents({ profile, presenceLabel, presenceOnline, style }: UserProfileCardProps) {
  const { theme, themes } = useTheme();
  const colors = themes?.[theme] || fallbackColors.light;
  const identity = profileIdentity(profile);
  const employee = profile.currentProfileType === 'EMPLOYEE' || !profile.currentProfileType ? profile.employeeProfile : null;
  const activeProfile = profile.currentProfileType === 'CLIENT' ? profile.clientProfile : profile.currentProfileType === 'SUPPLIER' ? profile.supplierProfile : employee;
  const phone = String(profile.phone || '').trim();
  const phoneDigits = normalizePhoneInputToDigits11(phone);
  const email = String(profile.email || '').trim();
  const avatarUrl = profile.avatarUrl || activeProfile?.avatarUrl;
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [notice, setNotice] = useState<{ key: string; text: string; error: boolean } | null>(null);
  const contactKey = `${profile.id}:${phone}:${email}`;
  const currentContact = useRef(contactKey);
  currentContact.current = contactKey;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const online = presenceOnline ?? profile.isOnline;
  const presence = presenceLabel || (online === true ? 'В сети' : online === false ? 'Не в сети' : null);
  const created = readableDate(activeProfile?.createdAt);
  const updated = readableDate(activeProfile?.updatedAt);
  const roleRows = profile.departmentRoles?.length ? profile.departmentRoles : (employee?.departmentRoles || []).map(row => ({ department: employee?.department, role: row.role }));
  const statusLabel = { ACTIVE: 'Активен', PENDING: 'Ожидает подтверждения', BLOCKED: 'Заблокирован' }[profile.profileStatus];
  const typeLabel = profile.currentProfileType ? { EMPLOYEE: 'Сотрудник', CLIENT: 'Клиент', SUPPLIER: 'Поставщик' }[profile.currentProfileType] : null;

  async function runContactAction(action: () => Promise<unknown>, success?: string) {
    const key = contactKey;
    setNotice(null);
    try {
      await action();
      if (success && mounted.current && currentContact.current === key) setNotice({ key, text: success, error: false });
    } catch {
      if (mounted.current && currentContact.current === key) setNotice({ key, text: 'Не удалось выполнить действие. Попробуйте ещё раз.', error: true });
    }
  }

  async function copyContacts() {
    const copied = await Clipboard.setStringAsync([phone, email].filter(Boolean).join('\n'));
    if (copied === false) throw new Error('Clipboard unavailable');
  }

  function actionButton(icon: IconName, label: string, onPress: () => void, compact = false) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
        style={({ pressed }) => [styles.action, compact && styles.copyAction, { backgroundColor: colors.cardBackground, borderColor: colors.inputBorder, opacity: pressed ? 0.65 : 1 }]}>
        <Ionicons name={icon} size={20} color={colors.tint} accessible={false} />
        {!compact ? <Text style={[styles.actionLabel, { color: colors.text }]}>{label}</Text> : null}
      </Pressable>
    );
  }

  return (
    <View testID="user-profile-card" style={[styles.root, style]}>
      <View style={styles.identity}>
        <View style={[styles.avatar, { backgroundColor: colors.disabledBackground }]}>
          {avatarUrl && avatarUrl !== failedAvatar ? (
            <Image accessibilityLabel={`Фото: ${identity.name}`} source={{ uri: avatarUrl }} style={styles.avatarImage} onError={() => setFailedAvatar(avatarUrl)} />
          ) : (
            <Text accessible={false} style={[styles.initials, { color: colors.secondaryText }]}>{identity.initials || '?'}</Text>
          )}
        </View>
        <View style={styles.identityText}>
          <Text accessibilityRole="header" selectable style={[styles.name, { color: colors.text }]}>{identity.name}</Text>
          <Text style={[styles.role, { color: colors.secondaryText }]}>{getRoleDisplayName(profile.role)}</Text>
          {presence ? (
            <View style={styles.presence}>
              <View style={[styles.presenceDot, { backgroundColor: online === true ? colors.success : colors.secondaryText }]} />
              <Text style={[styles.presenceText, { color: colors.secondaryText }]}>{presence}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {phoneDigits || email ? (
        <View style={styles.actions}>
          {phoneDigits ? actionButton('call-outline', 'Позвонить', () => void runContactAction(() => Linking.openURL(`tel:+${phoneDigits}`))) : null}
          {email ? actionButton('mail-outline', 'Написать', () => void runContactAction(() => Linking.openURL(`mailto:${encodeURIComponent(email)}`))) : null}
          {actionButton('copy-outline', 'Скопировать контакты', () => void runContactAction(
            copyContacts, 'Контакты скопированы',
          ), true)}
        </View>
      ) : phone ? (
        <View style={styles.actions}>{actionButton('copy-outline', 'Скопировать контакты', () => void runContactAction(copyContacts, 'Контакты скопированы'), true)}</View>
      ) : null}
      {notice?.key === contactKey ? <Text accessibilityLiveRegion="polite" style={[styles.notice, { color: notice.error ? colors.error : colors.secondaryText }]}>{notice.text}</Text> : null}

      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>Контакты</Text>
        {phone ? <InfoRow icon="call-outline" label="Телефон" value={formatPhoneDisplay(phone) || phone} verified={Boolean(profile.phoneVerifiedAt)} colors={colors} /> : null}
        {email ? <InfoRow icon="mail-outline" label="Почта" value={email} verified={Boolean(profile.emailVerifiedAt)} colors={colors} /> : null}
        {!phone && !email ? <Text style={[styles.empty, { color: colors.secondaryText }]}>Контакты не указаны</Text> : null}
      </View>

      {employee || roleRows.length ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>Работа</Text>
          {employee?.department ? <InfoRow icon="business-outline" label="Отдел" value={employee.department.name} colors={colors} /> : null}
          {employee?.activeDepartment && employee.activeDepartment.id !== employee.department?.id ? <InfoRow icon="business-outline" label="Активный отдел" value={employee.activeDepartment.name} colors={colors} /> : null}
          {roleRows.map((row, index) => <InfoRow key={`${row.department?.id}-${row.role.id}-${index}`} icon="people-outline" label={row.department?.name || 'Отдел'} value={getRoleDisplayName(row.role)} colors={colors} />)}
          {employee ? <InfoRow icon="link-outline" label="Профиль 1С" value={employee.onecUserGuid ? 'Связан' : 'Не связан'} colors={colors} /> : null}
        </View>
      ) : null}

      <View style={[styles.details, { borderColor: colors.inputBorder }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Подробности профиля" accessibilityState={{ expanded: detailsOpen }}
          onPress={() => setDetailsOpen(value => !value)} style={({ pressed }) => [styles.detailsToggle, { opacity: pressed ? 0.65 : 1 }]}>
          <Text style={[styles.detailsLabel, { color: colors.secondaryText }]}>Подробности</Text>
          <Ionicons name={detailsOpen ? 'chevron-up-outline' : 'chevron-down-outline'} size={17} color={colors.secondaryText} accessible={false} />
        </Pressable>
        {detailsOpen ? <View>
          <InfoRow icon="finger-print-outline" label="ID пользователя" value={String(profile.id)} colors={colors} />
          {typeLabel ? <InfoRow icon="person-outline" label="Тип профиля" value={typeLabel} colors={colors} /> : null}
          {statusLabel ? <InfoRow icon="shield-checkmark-outline" label="Статус профиля" value={statusLabel} colors={colors} /> : null}
          {created ? <InfoRow icon="calendar-outline" label="Создан" value={created} colors={colors} /> : null}
          {updated ? <InfoRow icon="refresh-outline" label="Обновлён" value={updated} colors={colors} /> : null}
        </View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingTop: 4, paddingBottom: 24, gap: 24 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  initials: { fontSize: 25, fontWeight: '600' },
  identityText: { flex: 1, minWidth: 0, gap: 5 },
  name: { fontSize: 22, lineHeight: 28, fontWeight: '600' },
  role: { fontSize: 14, lineHeight: 20 },
  presence: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  presenceDot: { width: 6, height: 6, borderRadius: 3 },
  presenceText: { flexShrink: 1, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { minHeight: 46, minWidth: 46, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
  copyAction: { flexGrow: 0 },
  actionLabel: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  notice: { fontSize: 13, lineHeight: 19, marginTop: -12 },
  section: { gap: 0 },
  sectionTitle: { fontSize: 16, lineHeight: 22, fontWeight: '600', marginBottom: 6 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  rowIcon: { marginTop: 3 },
  rowContent: { flex: 1, minWidth: 0, gap: 3 },
  labelLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 12, lineHeight: 18, flexShrink: 1 },
  value: { fontSize: 15, lineHeight: 22 },
  empty: { fontSize: 14, lineHeight: 21, paddingVertical: 10 },
  details: { borderTopWidth: StyleSheet.hairlineWidth },
  detailsToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  detailsLabel: { fontSize: 13, lineHeight: 20 },
});
