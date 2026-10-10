import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Divider, List, Text } from 'react-native-paper';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ProfileView } from '@/components/Profile/ProfileView';
import { ClientContactsEditor } from '@/components/Profile/ClientContactsEditor';
import { NotificationSettingsSection } from '@/components/Profile/NotificationSettingsSection';
import { ProfileBottomSpacer } from '@/src/features/profile/ui/ProfileBottomSpacer';
import { useProfileData } from '@/src/features/profile/model/ProfileDataContext';
import { isProfileSection } from '@/src/features/profile/lib/presentation';
import { CredentialsSection, TrackingToggle, TrackingAdminHealthCard } from '@/src/features/profile/ui/ProfileServiceSettings';
import { getRoleDisplayName } from '@/utils/rbacLabels';
import { getAppVersionInfo } from '@/utils/appVersion';

function Fact({ title, value, icon }: { title: string; value?: string | null; icon: string }) {
  return <><List.Item title={title} description={value || 'Не указано'} descriptionNumberOfLines={5}
    left={props => <List.Icon {...props} icon={icon} />} titleStyle={{ color: '#64748B', fontSize: 13 }}
    descriptionStyle={{ color: '#0F172A', fontSize: 16 }} style={{ paddingHorizontal: 0, paddingVertical: 10 }} /><Divider /></>;
}
export default function ProfileSettingsScreen() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const { profile, refresh } = useProfileData();
  const router = useRouter();
  if (!profile || !isProfileSection(section)) return <View style={styles.content}><Text>Раздел недоступен</Text><Button onPress={() => router.replace('/profile')}>В профиль</Button></View>;
  const version = getAppVersionInfo();
  const employee = profile.employeeProfile;
  const address = profile.currentProfileType === 'CLIENT' ? profile.clientProfile?.address : profile.currentProfileType === 'SUPPLIER' ? profile.supplierProfile?.address : null;
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Animated.View key={section} entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)} style={styles.detail}>
        {section === 'personal' && <ProfileView profileOverride={profile} disableAppearAnimation presentation="personal" />}
        {section === 'contacts' && <ClientContactsEditor embedded />}
        {section === 'notifications' && <NotificationSettingsSection />}
        {section === 'tracking' && <><TrackingToggle /><TrackingAdminHealthCard /></>}
        {section === 'security' && <>
          <Fact title="Вход через Telegram" value={profile.authMethods?.telegramLinked || profile.telegramId ? profile.telegramUsername ? `@${profile.telegramUsername}` : 'Подключён' : 'Не подключён'} icon="message-outline" />
          <Fact title="Вход через MAX" value={profile.authMethods?.maxLinked || profile.maxId ? profile.maxUsername || 'Подключён' : 'Не подключён'} icon="message-text-outline" />
          <CredentialsSection profile={profile} onAdded={refresh} />
        </>}
        {section === 'work' && <>
          <Fact title="Тип профиля" value={profile.currentProfileType === 'EMPLOYEE' ? 'Сотрудник' : profile.currentProfileType === 'CLIENT' ? 'Клиент' : profile.currentProfileType === 'SUPPLIER' ? 'Поставщик' : 'Не выбран'} icon="account-outline" />
          <Fact title="Роль" value={getRoleDisplayName(profile.role)} icon="badge-account-outline" />
          {employee && <><Fact title="Основной отдел" value={employee.department?.name} icon="office-building-outline" />
            <Fact title="Текущий отдел" value={employee.activeDepartment?.name || employee.department?.name} icon="briefcase-outline" />
            <Fact title="Учётная запись 1С" value={employee.onecUserGuid ? 'Подключена' : 'Не подключена'} icon="link-variant" /></>}
          {(profile.departmentRoles || []).map((entry, index) => <Fact key={`${entry.department.id}-${entry.role.id}-${index}`}
            title={entry.department.name || `Отдел №${entry.department.id}`} value={getRoleDisplayName(entry.role)} icon="account-group-outline" />)}
          {address && <Fact title="Адрес" value={[address.city, address.street, address.state, address.postalCode, address.country].filter(Boolean).join(', ')} icon="map-marker-outline" />}
          <Text style={styles.hint}>Роль и доступ к отделам изменяет администратор.</Text>
        </>}
        {section === 'about' && <>
          <Fact title="Лидер-Продукт" value={`Версия ${version.fullVersionLabel}`} icon="cellphone" />
          <Fact title="Номер сборки" value={version.nativeBuild} icon="package-variant-closed" />
          <Fact title="Обновление приложения" value={version.otaLabel || 'Встроенная версия'} icon="update" />
          <Fact title="ID пользователя" value={String(profile.id)} icon="account-outline" />
          {employee?.createdAt && <Fact title="Профиль сотрудника создан" value={new Date(employee.createdAt).toLocaleString('ru-RU')} icon="calendar-outline" />}
          {employee?.updatedAt && <Fact title="Профиль сотрудника обновлён" value={new Date(employee.updatedAt).toLocaleString('ru-RU')} icon="clock-outline" />}
        </>}
      </Animated.View>
      <ProfileBottomSpacer />
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 18 },
  detail: { gap: 6 }, hint: { color: '#64748B', fontSize: 13, lineHeight: 19, marginTop: 16 },
});
