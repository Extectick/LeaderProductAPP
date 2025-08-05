import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function DocumentsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Документы</Text>
      
      <View style={styles.list}>
        <Link href="./1" asChild>
          <Pressable style={styles.docLink}>
            <Text>Документ 1</Text>
          </Pressable>
        </Link>
        <Link href="./2" asChild>
          <Pressable style={styles.docLink}>
            <Text>Документ 2</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  list: {
    gap: 8,
  },
  docLink: {
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  }
});
