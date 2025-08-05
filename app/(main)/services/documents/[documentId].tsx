import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function DocumentScreen() {
  const { documentId } = useLocalSearchParams();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Документ {documentId}</Text>
      <Text style={styles.content}>
        Содержимое документа {documentId} будет отображено здесь
      </Text>
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
  content: {
    fontSize: 16,
  }
});
