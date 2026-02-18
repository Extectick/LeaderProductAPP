import React, { useMemo, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { Redirect } from 'expo-router';

import { useTheme } from '@/context/ThemeContext';
import { gradientColors, ThemeKey } from '@/constants/Colors';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useTabBarSpacerHeight } from '@/components/Navigation/TabBarSpacer';
import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';

import { createAdminStyles } from '@/components/admin/adminStyles';
import AdminTabsBar from '@/components/admin/AdminTabsBar';
import UsersTab from './tabs/UsersTab';
import DepartmentsTab from './tabs/DepartmentsTab';
import RolesTab from './tabs/RolesTab';
import UpdatesTab from './tabs/UpdatesTab';
import ServicesTab from './tabs/ServicesTab';

type TabKey = 'users' | 'departments' | 'roles' | 'services' | 'updates';

export default function AdminScreen() {
  const { isAdmin, isCheckingAdmin } = useIsAdmin();
  const { theme, themes } = useTheme();
  const colors = themes[theme];
  const styles = useMemo(() => createAdminStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const isWide = width >= 980;
  const tabBarSpacer = useTabBarSpacerHeight();
  const headerTopInset = useHeaderContentTopInset();
  const grad = gradientColors[theme as ThemeKey] || gradientColors.leaderprod;
  const btnGradient = useMemo(() => [grad[0], grad[1]] as [string, string], [grad]);

  const [activeTab, setActiveTab] = useState<TabKey>('users');
  const [queuedUserId, setQueuedUserId] = useState<number | null>(null);

  if (isCheckingAdmin) return null;
  if (!isAdmin) {
    return <Redirect href={{ pathname: '/access-denied', params: { reason: 'no_permission' } }} />;
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.container, { paddingTop: headerTopInset, paddingBottom: tabBarSpacer + 16 }]}>
        <View style={{ gap: 2 }}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: isWide ? 22 : 20 }}>Администрирование</Text>
          <Text style={{ color: colors.secondaryText, fontSize: 12 }}>
            Управление пользователями, ролями, отделами и сервисами
          </Text>
        </View>
        <AdminTabsBar
          styles={styles}
          activeKey={activeTab}
          tabs={[
            { key: 'users', label: 'Пользователи' },
            { key: 'departments', label: 'Отделы' },
            { key: 'roles', label: 'Роли' },
            { key: 'services', label: 'Сервисы' },
            { key: 'updates', label: 'Обновления' },
          ]}
          onChange={(key) => setActiveTab(key as TabKey)}
        />

        <View style={styles.panel}>
          <UsersTab
            active={activeTab === 'users'}
            styles={styles}
            colors={colors}
            btnGradient={btnGradient}
            queuedUserId={queuedUserId}
            onConsumeQueuedUser={() => setQueuedUserId(null)}
          />
          <DepartmentsTab
            active={activeTab === 'departments'}
            styles={styles}
            colors={colors}
            onOpenUser={(userId) => {
              setQueuedUserId(userId);
              setActiveTab('users');
            }}
          />
          <RolesTab
            active={activeTab === 'roles'}
            styles={styles}
            colors={colors}
          />
          <ServicesTab
            active={activeTab === 'services'}
            styles={styles}
            colors={colors}
          />
          <UpdatesTab
            active={activeTab === 'updates'}
            styles={styles}
            colors={colors}
            isWide={isWide}
          />
        </View>
      </View>
    </View>
  );
}
