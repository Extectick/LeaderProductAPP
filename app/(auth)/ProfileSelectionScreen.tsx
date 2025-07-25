import ThemeSwitcher from '@/components/ThemeSwitcher';
import { useProfile } from '@/context/ProfileContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export default function ProfileSelectionScreen() {
  const router = useRouter();
  const { selectProfileType, loading } = useProfile();

  const [selectedType, setSelectedType] = useState<'CLIENT' | 'SUPPLIER' | 'EMPLOYEE' | null>(null);
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');

  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const buttonColor = useThemeColor({}, 'button');
  const buttonTextColor = useThemeColor({}, 'buttonText');
  const inputBackgroundColor = useThemeColor({}, 'inputBackground');
  const inputBorderColor = useThemeColor({}, 'inputBorder');
  const secondaryTextColor = useThemeColor({}, 'secondaryText');

  const handleSubmit = async () => {
    if (!selectedType) return setError('Выберите тип профиля');
    if (!fullName.trim()) return setError('Введите ФИО');
    setError('');
    try {
      await selectProfileType(selectedType);
      router.replace('/(main)/HomeScreen');
    } catch {
      setError('Ошибка создания профиля');
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor }]}>
        <ActivityIndicator size="large" color={buttonColor} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Text style={[styles.title, { color: textColor }]}>Выберите тип профиля</Text>
      <Text style={[styles.subtitle, { color: secondaryTextColor }]}>
        Это поможет нам настроить приложение под ваши нужды
      </Text>

      {['CLIENT', 'SUPPLIER', 'EMPLOYEE'].map((type) => (
        <TouchableOpacity
          key={type}
          style={[
            styles.button,
            { backgroundColor: buttonColor },
            selectedType === type && { opacity: 0.8 },
          ]}
          onPress={() => setSelectedType(type as any)}
          disabled={loading}
        >
          <Text style={[styles.buttonText, { color: buttonTextColor }]}>
            {{
              CLIENT: 'Клиент',
              SUPPLIER: 'Поставщик',
              EMPLOYEE: 'Сотрудник',
            }[type]}
          </Text>
          {loading && selectedType === type && (
            <ActivityIndicator color={buttonTextColor} style={styles.loader} />
          )}
        </TouchableOpacity>
      ))}

      {selectedType && (
        <>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: inputBackgroundColor,
                borderColor: inputBorderColor,
                color: textColor,
              },
            ]}
            placeholder="Фамилия Имя"
            placeholderTextColor={secondaryTextColor}
            value={fullName}
            onChangeText={setFullName}
            editable={!loading}
          />

          {error !== '' && <Text style={[styles.errorText, { color: 'red' }]}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled, { backgroundColor: buttonColor }]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={buttonTextColor} />
            ) : (
              <Text style={[styles.buttonText, { color: buttonTextColor }]}>Создать профиль</Text>
            )}
          </TouchableOpacity>
        </>
      )}
      <ThemeSwitcher />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 30,
    textAlign: 'center',
  },
  button: {
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  loader: {
    position: 'absolute',
    right: 20,
  },
  input: {
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 16,
    marginBottom: 15,
  },
  errorText: {
    marginBottom: 10,
    textAlign: 'center',
  },
});
