// app/(main)/_layout.tsx
import Navigation from '@/components/Navigation/Navigation';
import { StyleSheet, View } from 'react-native';

export default function MainLayout() {
  return (
    <View style={styles.container}>

      {/* Общие UI элементы */}
      {/* <AppHeader /> */}
      <Navigation />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
