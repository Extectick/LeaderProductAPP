import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar, Button, Divider, List, Switch, Text, TouchableRipple } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import type { Profile } from '@/src/entities/user/types';
import { profileIdentity, type ProfileSectionKey } from '../lib/presentation';
import { ProfileLogoutButton } from './ProfileLogoutButton';

type Props = {
  profile: Profile; version: string; trackingEnabled: boolean; trackingBusy: boolean;
  trackingText: string; trackingColor: string; onToggleTracking: () => void;
  onOpen: (section: ProfileSectionKey) => void; onLogout: () => void;
};
type IconName = React.ComponentProps<typeof Ionicons>['name'];

function Section({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><Divider style={styles.divider} />{children}</View>;
}
function Row({ title, description, icon, onPress, danger = false }: {
  title: string; description?: string; icon: IconName; onPress: () => void; danger?: boolean;
}) {
  return <><List.Item title={title} description={description} onPress={onPress} accessibilityRole="button"
    accessibilityLabel={title} titleNumberOfLines={2} descriptionNumberOfLines={2}
    style={styles.row} containerStyle={styles.rowContent} titleStyle={[styles.rowTitle, danger && styles.danger]} descriptionStyle={styles.description}
    left={() => <View style={styles.icon}><Ionicons name={icon} size={25} color={danger ? '#DC2626' : '#566982'} /></View>}
    right={() => !danger ? <View style={styles.chevron}><Ionicons name="chevron-forward" size={20} color="#566982" /></View> : null} />
    {!danger && <Divider style={styles.divider} />}</>;
}

/** Presentational surface shared by the native screen and the isolated visual QA harness. */
export function ProfileHome(props: Props) {
  const { profile, onOpen } = props;
  const identity = profileIdentity(profile);
  const linked = Boolean(profile.employeeProfile?.onecUserGuid);
  return <View style={styles.body}>
    <View style={styles.identity}>
      <TouchableRipple onPress={() => onOpen('personal')} accessibilityRole="button" accessibilityLabel="Изменить фото и личные данные" borderless style={styles.avatar}>
        {profile.avatarUrl ? <Avatar.Image size={76} source={{ uri: profile.avatarUrl }} /> : identity.initials
          ? <Avatar.Text size={76} label={identity.initials} color="#2563EB" style={styles.avatarFill} labelStyle={styles.initials} />
          : <Avatar.Icon size={76} icon="account-outline" color="#2563EB" style={styles.avatarFill} />}
      </TouchableRipple>
      <View style={styles.identityText}>
        <Text style={styles.name}>{identity.name}</Text>
        <Text style={styles.subtitle}>{identity.subtitle}</Text>
        {profile.employeeProfile ? <View style={styles.connection}>
          <Ionicons name="ellipse" size={8} color={linked ? '#059669' : '#94A3B8'} />
          <Text style={[styles.connectionText, { color: linked ? '#059669' : '#64748B' }]}>{linked ? '1С подключена' : '1С не подключена'}</Text>
        </View> : null}
      </View>
    </View>
    <Button mode="contained-tonal" icon={({ color }) => <Ionicons name="create-outline" size={25} color={color} />} buttonColor="#E8F1FF" textColor="#2563EB"
      onPress={() => onOpen('personal')} style={styles.edit} contentStyle={styles.editContent} labelStyle={styles.editLabel}>Изменить данные</Button>
    <Section title="КОНТАКТЫ">
      <Row title="Контакты для клиентов" description="Телефоны, мессенджеры и почта" icon="people-outline" onPress={() => onOpen('contacts')} />
    </Section>
    <Section title="РАБОЧИЕ ИНСТРУМЕНТЫ">
      <View style={styles.trackingRow}>
        <View style={styles.trackingLink}>
          <List.Item title="Геолокация" description={props.trackingText} onPress={() => onOpen('tracking')}
            accessibilityRole="button" accessibilityLabel="Настройки геолокации" style={styles.row}
            containerStyle={styles.rowContent} titleStyle={styles.rowTitle} descriptionStyle={[styles.description, { color: props.trackingColor }]} descriptionNumberOfLines={2}
            left={() => <View style={styles.icon}><Ionicons name="location-outline" size={26} color="#566982" /></View>} />
        </View>
        <Switch value={props.trackingEnabled} onValueChange={props.onToggleTracking} disabled={props.trackingBusy}
          color="#2563EB" accessibilityLabel="Запись геолокации" style={styles.switch} />
      </View>
      <Divider style={styles.divider} />
    </Section>
    <Section title="НАСТРОЙКИ">
      <Row title="Личные данные" description="Фото, имя, телефон и почта" icon="person-outline" onPress={() => onOpen('personal')} />
      <Row title="Работа и отделы" description={identity.subtitle} icon="briefcase-outline" onPress={() => onOpen('work')} />
      <Row title="Безопасность" description="Пароль, вход через Telegram и MAX" icon="shield-checkmark-outline" onPress={() => onOpen('security')} />
      <Row title="Уведомления" description="В приложении, Telegram и MAX" icon="notifications-outline" onPress={() => onOpen('notifications')} />
      <Row title="О приложении" description={`Версия ${props.version}`} icon="information-circle-outline" onPress={() => onOpen('about')} />
    </Section>
    <View style={styles.logout}><ProfileLogoutButton onPress={props.onLogout} /></View>
  </View>;
}
const styles = StyleSheet.create({
  body: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 0, paddingBottom: 12 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 0, marginBottom: 14 },
  avatar: { borderRadius: 38 }, avatarFill: { backgroundColor: '#DBE7FF' }, initials: { fontSize: 28, fontWeight: '700' },
  identityText: { flex: 1, gap: 4 }, name: { fontSize: 18, lineHeight: 23, fontWeight: '700', color: '#0F172A' },
  subtitle: { fontSize: 14, lineHeight: 20, color: '#64748B' }, connection: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  connectionText: { fontSize: 13, lineHeight: 20 }, edit: { borderRadius: 8 }, editContent: { minHeight: 40 }, editLabel: { fontSize: 14, fontWeight: '700' },
  section: { marginTop: 22 }, sectionTitle: { color: '#64748B', fontSize: 11, fontWeight: '600', lineHeight: 16, marginBottom: 9 },
  divider: { backgroundColor: '#DDE5EF' }, row: { paddingVertical: 6, paddingLeft: 0, paddingRight: 0, minHeight: 56 }, rowContent: { marginVertical: 0 },
  rowTitle: { color: '#0F172A', fontSize: 14, lineHeight: 21, fontWeight: '600' }, description: { color: '#64748B', fontSize: 12, lineHeight: 18, marginTop: 2 },
  icon: { width: 32, alignItems: 'center', justifyContent: 'center' }, chevron: { justifyContent: 'center', paddingLeft: 4 },
  trackingRow: { flexDirection: 'row', alignItems: 'center' }, trackingLink: { flex: 1 }, switch: { marginLeft: 4 },
  logout: { marginTop: 8 }, danger: { color: '#DC2626' },
});
