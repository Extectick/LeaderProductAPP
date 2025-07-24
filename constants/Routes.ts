import React, { ComponentType } from 'react';
import Ionicons from 'react-native-vector-icons/Ionicons';
import HomeScreen from '../app/tabs/HomeScreen';
import ProfileScreen from '../app/tabs/ProfileScreen';
import TasksScreen from '../app/tabs/TasksScreen';

// Разрешённые названия иконок
type IconName = 'home' | 'list' | 'person';

export interface RouteConfig {
  name: string;
  component: ComponentType;
  icon: (focused: boolean) => React.ReactElement;
  tabBarLabel: string;
}

const getIcon = (name: IconName, focused: boolean): React.ReactElement => {
  const iconName = focused ? name : `${name}-outline`;
  return React.createElement(Ionicons, { 
    name: iconName as any, 
    size: 24 
  });
};

export const routes: RouteConfig[] = [
  {
    name: 'Home',
    component: HomeScreen,
    icon: (focused) => getIcon('home', focused),
    tabBarLabel: 'Главная',
  },
  {
    name: 'Tasks',
    component: TasksScreen,
    icon: (focused) => getIcon('list', focused),
    tabBarLabel: 'Задания',
  },
  {
    name: 'Profile',
    component: ProfileScreen,
    icon: (focused) => getIcon('person', focused),
    tabBarLabel: 'Профиль',
  },
];
