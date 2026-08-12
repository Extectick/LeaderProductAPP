import React from 'react';
import { View } from 'react-native';
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
      <View
        style={[
          styles.mobilePanelContent,
          activeTab !== 'users' ? styles.mobilePanelContentPadded : null,
        ]}
      >
        {children}
      </View>
    </View>
  );
}
