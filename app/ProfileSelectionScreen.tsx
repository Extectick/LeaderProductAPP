import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useProfile } from '../context/ProfileContext';

export default function ProfileSelectionScreen() {
  const router = useRouter();
  const { selectProfileType, loading } = useProfile();
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const handleSelect = async (type: 'CLIENT' | 'SUPPLIER' | 'EMPLOYEE') => {
    setSelectedType(type);
    try {
      await selectProfileType(type);
      router.replace('/tabs');
    } catch (error) {
      console.error('Profile selection failed:', error);
      setSelectedType(null);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Выберите тип профиля</Text>
      <Text style={styles.subtitle}>Это поможет нам настроить приложение под ваши нужды</Text>

      <TouchableOpacity
        style={[styles.button, selectedType === 'CLIENT' && styles.selected]}
        onPress={() => handleSelect('CLIENT')}
        disabled={loading}
      >
        <Text style={styles.buttonText}>Клиент</Text>
        {loading && selectedType === 'CLIENT' && (
          <ActivityIndicator color="#fff" style={styles.loader} />
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, selectedType === 'SUPPLIER' && styles.selected]}
        onPress={() => handleSelect('SUPPLIER')}
        disabled={loading}
      >
        <Text style={styles.buttonText}>Поставщик</Text>
        {loading && selectedType === 'SUPPLIER' && (
          <ActivityIndicator color="#fff" style={styles.loader} />
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, selectedType === 'EMPLOYEE' && styles.selected]}
        onPress={() => handleSelect('EMPLOYEE')}
        disabled={loading}
      >
        <Text style={styles.buttonText}>Сотрудник</Text>
        {loading && selectedType === 'EMPLOYEE' && (
          <ActivityIndicator color="#fff" style={styles.loader} />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e2f',
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#a0a0c0',
    marginBottom: 30,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#3a3a52',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    alignItems: 'center',
  },
  selected: {
    backgroundColor: '#5a67d8',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  loader: {
    position: 'absolute',
    right: 20,
  },
});
