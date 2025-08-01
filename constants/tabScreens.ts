import HomeScreen from '../app/(main)/HomeScreen';
import ProfileScreen from '../app/(main)/ProfileScreen';
import TasksScreen from '../app/(main)/TasksScreen';

export interface SidebarItem {
  icon: string;
  label: string;
  path: SidebarPath;
}

export type SidebarPath = 
  | '/HomeScreen' 
  | '/TasksScreen' 
  | '/ProfileScreen';

const tabScreens: {
  name: string;
  component: React.ComponentType<any>;
  options: { title: string };
  sidebar: SidebarItem;
}[] = [
  {
    name: 'HomeScreen',
    component: HomeScreen,
    options: { title: 'Главная' },
    sidebar: {
      icon: 'home-outline',
      label: 'Главная',
      path: '/HomeScreen',
    },
  },
  {
    name: 'TasksScreen',
    component: TasksScreen,
    options: { title: 'Задачи' },
    sidebar: {
      icon: 'list-outline',
      label: 'Задачи',
      path: '/TasksScreen',
    },
  },
  {
    name: 'ProfileScreen',
    component: ProfileScreen,
    options: { title: 'Профиль' },
    sidebar: {
      icon: 'person-outline',
      label: 'Профиль',
      path: '/ProfileScreen',
    },
  },
];

export default tabScreens;
