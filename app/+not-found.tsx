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
      <View style={styles.blobOne} />
      <View style={styles.blobTwo} />

      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <IconSymbol name="questionmark.circle" size={64} color="#0ea5e9" />
        </View>

        <ThemedText type="title" style={styles.title}>
          Ой, страницы нет
        </ThemedText>
        <ThemedText style={styles.text}>
          Возможно, ссылка устарела или страница была перемещена. Попробуйте вернуться домой или в прошлый экран.
        </ThemedText>

        <View style={styles.actions}>
          <AnimatedButton
            onPress={() => router.replace('/home' as any)}
            style={StyleSheet.flatten([styles.button, styles.primary])}
            title="На главную"
          />
          <AnimatedButton
            onPress={() => router.back()}
            style={StyleSheet.flatten([styles.button, styles.secondary])}
            title="Назад"
          />
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    overflow: 'hidden',
  },
  blobOne: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#0ea5e930',
    top: -40,
    left: -60,
  },
  blobTwo: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: '#7c3aed20',
    bottom: -60,
    right: -80,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    padding: 20,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    gap: 14,
  },
  iconWrap: {
    alignSelf: 'flex-start',
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#e0f2fe',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.tabIconDefault,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    marginTop: 6,
  },
  button: {
    flex: 1,
    minWidth: 140,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  primary: {
    backgroundColor: '#0ea5e9',
  },
  secondary: {
    backgroundColor: '#f3f4f6',
  },
});
