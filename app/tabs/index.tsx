import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { useThemeColor } from '../../hooks/useThemeColor';
import ProfileScreen from './ProfileScreen';

const Tab = createBottomTabNavigator();

function HomeScreen() {
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');

  return (
    <View style={[styles.screenContainer, { backgroundColor }]}>
      <Text style={[styles.text, { color: textColor }]}>Главная</Text>
      {/* <ThemeSwitcher /> */}
    </View>
  );
}

function TasksScreen() {
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');

  return (
    <View style={[styles.screenContainer, { backgroundColor }]}>
      <Text style={[styles.text, { color: textColor }]}>Задания</Text>
      {/* <ThemeSwitcher /> */}
    </View>
  );
}

function TabsNavigator() {
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

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Tasks') {
            iconName = focused ? 'list' : 'list-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          }

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

export default TabsNavigator;

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 18,
  },
});
