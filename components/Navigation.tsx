// components/Navigation.tsx
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createDrawerNavigator } from '@react-navigation/drawer';
import React from 'react';
import { Platform } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import HomeScreen from '../app/tabs/HomeScreen';
import ProfileScreen from '../app/tabs/ProfileScreen';
import TasksScreen from '../app/tabs/TasksScreen';

import { useThemeColor } from '../hooks/useThemeColor';

const Tab = createBottomTabNavigator();
const Drawer = createDrawerNavigator();

function MobileTabs() {
  const tabBarBackground = useThemeColor({}, 'cardBackground');
  const tabIconSelected = useThemeColor({}, 'tabIconSelected');
  const tabIconDefault = useThemeColor({}, 'tabIconDefault');

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: tabBarBackground,
          borderTopWidth: 0,
          height: 60,
          shadowColor: '#000',
          shadowOpacity: 0.7,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: -5 },
          elevation: 10,
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName = 'home-outline';

          if (route.name === 'Home') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'Tasks') iconName = focused ? 'list' : 'list-outline';
          else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: tabIconSelected,
        tabBarInactiveTintColor: tabIconDefault,
        headerShown: false,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Tasks" component={TasksScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function WebDrawer() {
  const drawerBackground = useThemeColor({}, 'cardBackground');
  const drawerActiveTintColor = useThemeColor({}, 'tabIconSelected');
  const drawerInactiveTintColor = useThemeColor({}, 'tabIconDefault');

  return (
    <Drawer.Navigator
      screenOptions={({ route }) => ({
        drawerStyle: {
          backgroundColor: drawerBackground,
          width: 240,
        },
        drawerActiveTintColor,
        drawerInactiveTintColor,
        drawerIcon: ({ focused, color, size }) => {
          let iconName = 'home-outline';

          if (route.name === 'Home') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'Tasks') iconName = focused ? 'list' : 'list-outline';
          else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        headerShown: false,
      })}
    >
      <Drawer.Screen name="Home" component={HomeScreen} />
      <Drawer.Screen name="Tasks" component={TasksScreen} />
      <Drawer.Screen name="Profile" component={ProfileScreen} />
    </Drawer.Navigator>
  );
}

export default function Navigation() {
  return Platform.OS === 'web' ? <WebDrawer /> : <MobileTabs />;
}
