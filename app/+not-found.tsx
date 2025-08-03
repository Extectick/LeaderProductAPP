import { AnimatedButton } from '@/components/AnimatedButton';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { Colors } from '@/constants/Colors';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <IconSymbol 
          name="questionmark.circle" 
          size={64} 
          color={Colors.light.tint}
          style={styles.icon} 
        />
        <ThemedText type="title" style={styles.title}>
          Страница не найдена
        </ThemedText>
        <ThemedText style={styles.text}>
          Запрошенная страница не существует
        </ThemedText>
        <AnimatedButton 
          onPress={() => router.replace('/HomeScreen')}
          style={styles.button}
          title="На главную"
        />
        <AnimatedButton 
          onPress={() => router.back()}
          style={styles.button}
          title="Назад"
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
