import Ionicons from '@expo/vector-icons/Ionicons';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useThemeColor } from '../hooks/useThemeColor';

type SidebarPath = '/tabs/HomeScreen' | '/tabs/TasksScreen' | '/tabs/ProfileScreen';
type IconName = keyof typeof Ionicons.glyphMap;

export type SidebarItem = {
  icon: IconName;
  label: string;
  path: SidebarPath;
};

type WebSidebarProps = {
  items: SidebarItem[];
};

export default function WebSidebar({ items }: WebSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const backgroundColor = useThemeColor({}, 'cardBackground');
  const activeColor = useThemeColor({}, 'button');
  const textColor = useThemeColor({}, 'text');
  const inactiveColor = useThemeColor({}, 'secondaryText');

  return (
    <View style={[styles.sidebar, { backgroundColor }]}>
      {items.map((item) => {
        const isActive = pathname === item.path;
        return (
          <TouchableOpacity
            key={item.path}
            onPress={() => router.replace(item.path)}
            style={[
              styles.item,
              isActive && { backgroundColor: activeColor },
            ]}
          >
            <Ionicons
              name={item.icon}
              size={22}
              color={isActive ? '#fff' : inactiveColor}
              style={styles.icon}
            />
            <Text style={[styles.label, { color: isActive ? '#fff' : textColor }]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 220,
    paddingVertical: 20,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 6,
  },
  icon: {
    marginRight: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
});
