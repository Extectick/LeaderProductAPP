import tabScreens from '@/constants/tabScreens';
import { useThemeColor } from '@/hooks/useThemeColor';
import Ionicons from '@expo/vector-icons/Ionicons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';

const Tab = createBottomTabNavigator();

export default function MobileTabs() {
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');

  return (
    <Tab.Navigator
      initialRouteName={tabScreens[0].name}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => {
          const screen = tabScreens.find((s) => s.name === route.name);
          const iconName = screen?.sidebar.icon as any;
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: textColor,
        tabBarInactiveTintColor: 'gray',
        tabBarStyle: {
          backgroundColor,
          borderTopWidth: 0,
          elevation: 0
        },
      })}
    >
      {tabScreens.map((screen) => (
        <Tab.Screen
          key={screen.name}
          name={screen.name}
          component={screen.component}
          options={screen.options}
        />
      ))}
    </Tab.Navigator>
  );
}
