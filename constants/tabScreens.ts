import HomeScreen from "@/app/(main)/home";
import ProfileScreen from "@/app/(main)/profile";
import TasksScreen from "@/app/(main)/tasks";
import ServicesStack from '@/stacks/ServicesStack';
import AdminScreen from "@/app/(main)/admin";
export type SidebarPath = 
  | '/home' 
  | '/tasks' 
  | '/profile'
  | '/services/index'
  | '/admin';

export const tabScreens = [
  {
    name: 'home',
    component: HomeScreen,
    options: { title: 'Главная' },
    sidebar: {
      icon: 'home-outline',
      label: 'Главная',
      path: '/home',
    },
  },
  {
    name: 'tasks',
    component: TasksScreen,
    options: { title: 'Задачи' },
    sidebar: {
      icon: 'list-outline',
      label: 'Задачи',
      path: '/tasks',
    },
  },
  {
    name: 'services',
    component: ServicesStack,
    options: { title: 'Сервисы' },
    sidebar: {
      icon: 'apps',
      label: 'Сервисы',
      path: '/services',
    },
  },
  {
    name: 'profile',
    component: ProfileScreen,
    options: { title: 'Профиль' },
    sidebar: {
      icon: 'person-outline',
      label: 'Профиль',
      path: '/profile',
    },
  },
  {
    name: 'admin',
    component: AdminScreen,
    options: { title: 'Админ' },
    sidebar: {
      icon: 'shield-checkmark-outline',
      label: 'Админ',
      path: '/admin',
    },
  }
];
