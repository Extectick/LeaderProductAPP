import { AnimatedButton } from '@/components/AnimatedButton';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { Colors } from '@/constants/Colors';
import { logout } from '@/utils/authService';
import { useNavigation } from '@react-navigation/native';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

export default function AccessDeniedScreen() {
  const navigation = useNavigation();

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <IconSymbol 
          name="lock.display" 
          size={64} 
          color={Colors.light.tint}
          style={styles.icon} 
        />
        <ThemedText type="title" style={styles.title}>
          Доступ запрещен
        </ThemedText>
        <ThemedText style={styles.text}>
          У вас нет прав для просмотра этой страницы
        </ThemedText>
        <AnimatedButton 
          onPress={() => router.reload}
          style={styles.button}
          title="Обновить"
        />
        <AnimatedButton 
          onPress={() => logout()}
          style={styles.button}
          title="Выход"
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    gap: 20,
  },
  icon: {
    marginBottom: 20,
  },
  title: {
    textAlign: 'center',
  },
  text: {
    textAlign: 'center',
    marginBottom: 30,
  },
  button: {
    paddingHorizontal: 30,
    paddingVertical: 15,
  },
});
