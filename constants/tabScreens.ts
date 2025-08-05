import HomeScreen from '../app/(main)/HomeScreen';
import ProfileScreen from '../app/(main)/ProfileScreen';
import ServicesScreen from '../app/(main)/services/ServicesScreen';
import TasksScreen from '../app/(main)/TasksScreen';

export interface SidebarItem {
  icon: string;
  label: string;
  path: SidebarPath;
}

export type SidebarPath = 
  | '/HomeScreen' 
  | '/TasksScreen' 
  | '/ProfileScreen'
  | '/services'
  | `/services/${string}`
  | `/services/documents/${string}`
  ;

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
    name: 'ServicesScreen',
    component: ServicesScreen,
    options: { title: 'Сервисы' },
    sidebar: {
      icon: 'apps',
      label: 'Сервисы',
    path: '/services',
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
