import React from 'react';
import { Text, View } from 'react-native';

export default function HomeScreen() {
  console.log('Home Screen')
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Главная</Text>
    </View>
  );
}