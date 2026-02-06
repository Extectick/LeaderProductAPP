import Ionicons from '@expo/vector-icons/Ionicons';
import type { Href } from 'expo-router';
import type { ThemeKey } from '@/constants/Colors';

export type TabAccent =
  | string
  | Partial<Record<ThemeKey, string>>;

export type BottomTabItem = {
  routeName: string;
  href: Href;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  matchPath: string;
  requiresAdmin?: boolean;
  activeTint?: TabAccent;
  inactiveTint?: TabAccent;
};

export const bottomTabItems: BottomTabItem[] = [
  {
    routeName: 'home/index',
    href: '/home',
    label: 'Главная',
    icon: 'home-outline',
    matchPath: '/home',
  },
  {
    routeName: 'tasks/index',
    href: '/tasks',
    label: 'Задачи',
    icon: 'list-outline',
    matchPath: '/tasks',
  },
  {
    routeName: 'services',
    href: '/services',
    label: 'Сервисы',
    icon: 'apps',
    matchPath: '/services',
  },
  {
    routeName: 'profile',
    href: '/profile',
    label: 'Профиль',
    icon: 'person-outline',
    matchPath: '/profile',
    activeTint: '#22C55E',
  },
  {
    routeName: 'admin',
    href: '/admin',
    label: 'Админ',
    icon: 'shield-checkmark-outline',
    matchPath: '/admin',
    requiresAdmin: true,
  },
];
