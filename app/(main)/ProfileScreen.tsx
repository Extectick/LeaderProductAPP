import React from 'react';
import { Text, View } from 'react-native';

export default function ProfileScreen() {
  console.log('Progile Screen')
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Профиль</Text>
    </View>
  );
}