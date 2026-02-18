/**
 * Sidebar routing map for expo-router.
 */
export type SidebarPath = '/home' | '/tasks' | '/profile' | '/services' | '/admin';

export type SidebarScreenItem = {
  name: 'home' | 'tasks' | 'services' | 'profile' | 'admin';
  sidebar: {
    icon: string;
    label: string;
    path: SidebarPath;
  };
};

export const sidebarScreens: SidebarScreenItem[] = [
  {
    name: 'home',
    sidebar: {
      icon: 'home-outline',
      label: 'Главная',
      path: '/home',
    },
  },
  {
    name: 'tasks',
    sidebar: {
      icon: 'list-outline',
      label: 'Задачи',
      path: '/tasks',
    },
  },
  {
    name: 'services',
    sidebar: {
      icon: 'apps',
      label: 'Сервисы',
      path: '/services',
    },
  },
  {
    name: 'profile',
    sidebar: {
      icon: 'person-outline',
      label: 'Профиль',
      path: '/profile',
    },
  },
  {
    name: 'admin',
    sidebar: {
      icon: 'shield-checkmark-outline',
      label: 'Админ',
      path: '/admin',
    },
  },
];
