import React from 'react';
import { Text, View } from 'react-native';

export default function TasksScreen() {
  console.log('Task Screen')
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Задачи</Text>
    </View>
  );
}