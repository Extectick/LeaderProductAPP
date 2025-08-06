import HomeScreen from "@/app/(main)/home";
import ProfileScreen from "@/app/(main)/profile";
import ServicesScreen from "@/app/(main)/services";
import TasksScreen from "@/app/(main)/tasks";

export type SidebarPath = 
  | '/home' 
  | '/tasks' 
  | '/profile'
  | '/services';

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
    component: ServicesScreen,
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
  }
];
