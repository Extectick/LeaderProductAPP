import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';
import { useTabBarSpacerHeight } from '@/components/Navigation/TabBarSpacer';
import { createAdminStyles } from '@/components/admin/adminStyles';
import { useTheme } from '@/context/ThemeContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Redirect } from 'expo-router';
import React, { useMemo } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import useAdminScreen from '../hooks/useAdminScreen';
import DepartmentsTab from '../tabs/departments/DepartmentsTab';
import RolesTab from '../tabs/roles/RolesTab';
import ServicesTab from '../tabs/services/ServicesTab';
import UpdatesTab from '../tabs/updates/UpdatesTab';
import UsersTab from '../tabs/users/UsersTab';
import AdminDesktopLayout from './AdminDesktopLayout';
import AdminMobileLayout from './AdminMobileLayout';
import { ADMIN_DESKTOP_BREAKPOINT, styles } from './styles';

export default function AdminScreen() {
  const controller = useAdminScreen();
  const { width } = useWindowDimensions();
  const { theme, themes } = useTheme();
  const colors = themes[theme];
  const background = useThemeColor({}, 'background');
  const topInset = useHeaderContentTopInset();
  const tabBarSpacer = useTabBarSpacerHeight();
  const isDesktop = Platform.OS === 'web' && width >= ADMIN_DESKTOP_BREAKPOINT;
  const legacyStyles = useMemo(() => createAdminStyles(colors), [colors]);

  if (controller.isCheckingAdmin) {
    return (
      <View style={[styles.centerRoot, { backgroundColor: background }]}>
        <ActivityIndicator />
        <Text>Проверяем права администратора</Text>
      </View>
    );
  }

  if (!controller.isAdmin) {
    return <Redirect href={{ pathname: '/access-denied', params: { reason: 'no_permission' } }} />;
  }

  const tabs = (
    <>
      <UsersTab
        active={controller.activeTab === 'users'}
        styles={legacyStyles}
        colors={colors}
        btnGradient={[colors.tint, colors.tint]}
        queuedUserId={controller.queuedUserId}
        onConsumeQueuedUser={() => controller.setQueuedUserId(null)}
      />
      <DepartmentsTab
        active={controller.activeTab === 'departments'}
        styles={legacyStyles}
        colors={colors}
        onOpenUser={(userId) => {
          controller.setQueuedUserId(userId);
          controller.setActiveTab('users');
        }}
      />
      <RolesTab active={controller.activeTab === 'roles'} styles={legacyStyles} colors={colors} />
      <ServicesTab active={controller.activeTab === 'services'} styles={legacyStyles} colors={colors} />
      <UpdatesTab
        active={controller.activeTab === 'updates'}
        styles={legacyStyles}
        colors={colors}
        isWide={isDesktop}
      />
    </>
  );

  const layout = isDesktop ? (
    <AdminDesktopLayout activeTab={controller.activeTab} onTabChange={controller.setActiveTab}>
      {tabs}
    </AdminDesktopLayout>
  ) : (
    <AdminMobileLayout activeTab={controller.activeTab} onTabChange={controller.setActiveTab}>
      {tabs}
    </AdminMobileLayout>
  );

  return (
    <View style={[styles.root, { backgroundColor: background }]}>
      <View
        style={[
          styles.container,
          {
            paddingTop: topInset,
            paddingBottom: isDesktop ? 0 : tabBarSpacer + 16,
          },
        ]}
      >
        {layout}
      </View>
    </View>
  );
}
