import Ionicons from '@expo/vector-icons/Ionicons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React, { useEffect, useState } from 'react';
import { Dimensions, Platform, View } from 'react-native';
import tabScreens from '../constants/tabScreens';
import { useThemeColor } from '../hooks/useThemeColor';
import WebSidebar from './WebSidebar_old';

const Tab = createBottomTabNavigator();

export default function Navigation() {
  const [isWebSidebar, setIsWebSidebar] = useState(false);
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');

  useEffect(() => {
    const updateLayout = () => {
      const screenWidth = Dimensions.get('window').width;
      setIsWebSidebar(Platform.OS === 'web' && screenWidth >= 768);
    };

    updateLayout();
    const subscription = Dimensions.addEventListener('change', updateLayout);
    return () => subscription.remove();
  }, []);

  if (isWebSidebar) {
    const sidebarItems = tabScreens.map((screen) => screen.sidebar);

    return (
      <View style={{ flexDirection: 'row', flex: 1 }}>
        <WebSidebar items={sidebarItems} />
        <View style={{ flex: 1 }} />
      </View>
    );
  }

  return (
    <Tab.Navigator
      initialRouteName={tabScreens[0].name}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => {
          const screen = tabScreens.find((s) => s.name === route.name);
          const iconName = screen?.sidebar.icon ?? 'ellipse-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: textColor,
        tabBarInactiveTintColor: 'gray',
        tabBarStyle: {
          backgroundColor,
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