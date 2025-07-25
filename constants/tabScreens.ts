import HomeScreen from '../app/tabs/HomeScreen';
import ProfileScreen from '../app/tabs/ProfileScreen';
import TasksScreen from '../app/tabs/TasksScreen';
import { SidebarItem } from '../components/WebSidebar';
// импортируй новые экраны сюда
// import NotificationsScreen from './NotificationsScreen';

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
      path: '/tabs/HomeScreen',
    },
  },
  {
    name: 'TasksScreen',
    component: TasksScreen,
    options: { title: 'Задачи' },
    sidebar: {
      icon: 'list-outline',
      label: 'Задачи',
      path: '/tabs/TasksScreen',
    },
  },
  {
    name: 'ProfileScreen',
    component: ProfileScreen,
    options: { title: 'Профиль' },
    sidebar: {
      icon: 'person-outline',
      label: 'Профиль',
      path: '/tabs/ProfileScreen',
    },
  },
  // Добавь сюда новые экраны
  // {
  //   name: 'NotificationsScreen',
  //   component: NotificationsScreen,
  //   options: { title: 'Уведомления' },
  //   sidebar: {
  //     icon: 'notifications-outline',
  //     label: 'Уведомления',
  //     path: '/tabs/NotificationsScreen',
  //   },
  // },
];

export default tabScreens;
