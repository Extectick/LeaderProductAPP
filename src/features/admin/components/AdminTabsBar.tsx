import React from 'react';
import { ScrollView } from 'react-native';
import { Button, Surface } from 'react-native-paper';
import type { AdminTabItem, AdminTabKey } from '../types';
import { styles } from '../screen/styles';

type Props = {
  activeKey: AdminTabKey;
  tabs: AdminTabItem[];
  compact?: boolean;
  onChange: (key: AdminTabKey) => void;
};

export default function AdminTabsBar({ activeKey, tabs, compact, onChange }: Props) {
  return (
    <Surface mode="flat" style={styles.tabsSurface}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsContent}
      >
        {tabs.map((tab) => {
          const active = tab.key === activeKey;
          return (
            <Button
              key={tab.key}
              mode={active ? 'contained-tonal' : 'outlined'}
              icon={compact ? undefined : tab.icon}
              compact={compact}
              onPress={() => onChange(tab.key)}
              style={styles.tabButton}
              labelStyle={compact ? styles.tabButtonLabelCompact : undefined}
            >
              {tab.label}
            </Button>
          );
        })}
      </ScrollView>
    </Surface>
  );
}
