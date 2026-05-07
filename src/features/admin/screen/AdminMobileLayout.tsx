import React from 'react';
import { View } from 'react-native';
import { Surface } from 'react-native-paper';
import AdminTabsBar from '../components/AdminTabsBar';
import { ADMIN_TABS } from '../lib/adminTabs';
import type { AdminTabKey } from '../types';
import { styles } from './styles';

type Props = {
  activeTab: AdminTabKey;
  children: React.ReactNode;
  onTabChange: (tab: AdminTabKey) => void;
};

export default function AdminMobileLayout({ activeTab, children, onTabChange }: Props) {
  return (
    <View style={styles.mobileLayout}>
      <AdminTabsBar activeKey={activeTab} tabs={ADMIN_TABS} compact onChange={onTabChange} />
      <Surface mode="flat" style={styles.paperPanel}>
        <View style={styles.paperPanelContent}>{children}</View>
      </Surface>
    </View>
  );
}
