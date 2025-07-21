// D:\Extectick\LeaderProductAPP\app\ProfileSelectionScreen.tsx
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import ThemeSwitcher from '../components/ThemeSwitcher';
import { useProfile } from '../context/ProfileContext';
import { useThemeColor } from '../hooks/useThemeColor';

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

  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const buttonColor = useThemeColor({}, 'button');
  const buttonTextColor = useThemeColor({}, 'buttonText');
  const secondaryTextColor = useThemeColor({}, 'secondaryText');

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <ThemeSwitcher />
      <Text style={[styles.title, { color: textColor }]}>Выберите тип профиля</Text>
      <Text style={[styles.subtitle, { color: secondaryTextColor }]}>Это поможет нам настроить приложение под ваши нужды</Text>

      <TouchableOpacity
        style={[
          styles.button, 
          { backgroundColor: buttonColor },
          selectedType === 'CLIENT' && { opacity: 0.8 }
        ]}
        onPress={() => handleSelect('CLIENT')}
        disabled={loading}
      >
        <Text style={[styles.buttonText, { color: buttonTextColor }]}>Клиент</Text>
        {loading && selectedType === 'CLIENT' && (
          <ActivityIndicator color={buttonTextColor} style={styles.loader} />
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.button, 
          { backgroundColor: buttonColor },
          selectedType === 'SUPPLIER' && { opacity: 0.8 }
        ]}
        onPress={() => handleSelect('SUPPLIER')}
        disabled={loading}
      >
        <Text style={[styles.buttonText, { color: buttonTextColor }]}>Поставщик</Text>
        {loading && selectedType === 'SUPPLIER' && (
          <ActivityIndicator color={buttonTextColor} style={styles.loader} />
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.button, 
          { backgroundColor: buttonColor },
          selectedType === 'EMPLOYEE' && { opacity: 0.8 }
        ]}
        onPress={() => handleSelect('EMPLOYEE')}
        disabled={loading}
      >
        <Text style={[styles.buttonText, { color: buttonTextColor }]}>Сотрудник</Text>
        {loading && selectedType === 'EMPLOYEE' && (
          <ActivityIndicator color={buttonTextColor} style={styles.loader} />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
