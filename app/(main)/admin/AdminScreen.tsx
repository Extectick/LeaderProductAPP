import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Redirect } from 'expo-router';

import { useTheme } from '@/context/ThemeContext';
import { gradientColors, ThemeKey } from '@/constants/Colors';
import { useIsAdmin } from '@/hooks/useIsAdmin';

import { createAdminStyles } from '@/components/admin/adminStyles';
import UsersTab from './tabs/UsersTab';
import DepartmentsTab from './tabs/DepartmentsTab';
import RolesTab from './tabs/RolesTab';
import UpdatesTab from './tabs/UpdatesTab';

type TabKey = 'users' | 'departments' | 'roles' | 'updates';

export default function AdminScreen() {
  const { isAdmin, isCheckingAdmin } = useIsAdmin();
  const { theme, themes } = useTheme();
  const colors = themes[theme];
  const styles = useMemo(() => createAdminStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const isWide = width >= 980;
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
      <View style={styles.container}>
        <Text style={styles.title}>Администрирование</Text>
        <Text style={styles.subtitle}>Управляйте пользователями, отделами, ролями и релизами приложения.</Text>
        <View style={styles.card}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsContent}
            style={styles.tabsScroll}
          >
            <Pressable
              onPress={() => setActiveTab('users')}
              style={[styles.tabBtn, activeTab === 'users' && styles.tabBtnActive]}
            >
              <Text style={[styles.tabText, activeTab === 'users' && styles.tabTextActive]}>Пользователи</Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('departments')}
              style={[styles.tabBtn, activeTab === 'departments' && styles.tabBtnActive]}
            >
              <Text style={[styles.tabText, activeTab === 'departments' && styles.tabTextActive]}>Отделы</Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('roles')}
              style={[styles.tabBtn, activeTab === 'roles' && styles.tabBtnActive]}
            >
              <Text style={[styles.tabText, activeTab === 'roles' && styles.tabTextActive]}>Роли</Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('updates')}
              style={[styles.tabBtn, activeTab === 'updates' && styles.tabBtnActive]}
            >
              <Text style={[styles.tabText, activeTab === 'updates' && styles.tabTextActive]}>Обновления</Text>
            </Pressable>
          </ScrollView>

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
