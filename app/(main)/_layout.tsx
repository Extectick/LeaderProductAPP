// app/(main)/_layout.tsx
import AppHeader from '@/components/AppHeader';
import Navigation from '@/components/Navigation/Navigation';
import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

export default function MainLayout() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader />
      <Navigation />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
