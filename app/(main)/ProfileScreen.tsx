import { AnimatedButton } from '@/components/AnimatedButton';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { logout } from '@/utils/authService';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function ProfileScreen() {
  
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Профиль</Text>
      <AnimatedButton
        
        onPress={() => logout()}
        style={styles.button}
        title="Выход"
      />
      <ThemeSwitcher />
    </View>
  );
}

const styles = StyleSheet.create({
  text: {
    textAlign: 'center',
    marginBottom: 30,
  },
  button: {
    paddingHorizontal: 30,
    paddingVertical: 15,
  },
});