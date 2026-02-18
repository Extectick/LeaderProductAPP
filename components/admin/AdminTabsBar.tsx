import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { AdminStyles } from './adminStyles';

type AdminTabItem = {
  key: string;
  label: string;
};

type AdminTabsBarProps = {
  styles: AdminStyles;
  activeKey: string;
  tabs: AdminTabItem[];
  onChange: (key: string) => void;
};

export default function AdminTabsBar({ styles, activeKey, tabs, onChange }: AdminTabsBarProps) {
  return (
    <View style={styles.tabsWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsContent}
        style={styles.tabsScroll}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === activeKey;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onChange(tab.key)}
              style={[styles.tabBtn, isActive && styles.tabBtnActive]}
            >
              <Text numberOfLines={1} style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
