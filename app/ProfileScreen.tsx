import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import apiClient from './apiClient';

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      setError('');
      try {
        const token = await AsyncStorage.getItem('authToken');
        if (!token) {
          router.replace('/AuthScreen');
          return;
        }
        const data = await apiClient.getProfile(token);
        setProfile(data);
      } catch (e: any) {
        setError(e.message || 'Ошибка при загрузке профиля');
        if (e.message === 'API request failed') {
          // Возможно, токен просрочен или неверен
          await AsyncStorage.removeItem('authToken');
          router.replace('/AuthScreen');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleLogout = async () => {
    Alert.alert(
      'Выход',
      'Вы действительно хотите выйти из аккаунта?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Выйти',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem('authToken');
            router.replace('/AuthScreen');
          },
        },
      ],
      { cancelable: true }
    );
  };

  if (loading) {
    return (
      <View style={styles.containerCentered}>
        <ActivityIndicator size="large" color="#5a67d8" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.containerCentered}>
        <Text style={styles.error}>{error}</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace('/AuthScreen')}>
          <Text style={styles.buttonText}>Войти заново</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.containerCentered}>
        <Text style={styles.text}>Профиль не найден</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Профиль пользователя</Text>
      <View style={styles.infoRow}>
        <Text style={styles.label}>Email:</Text>
        <Text style={styles.value}>{profile.email}</Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.label}>Статус активации:</Text>
        <Text style={styles.value}>{profile.isActive ? 'Активирован' : 'Не активирован'}</Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.label}>Дата создания:</Text>
        <Text style={styles.value}>{new Date(profile.createdAt).toLocaleString()}</Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.label}>Дата обновления:</Text>
        <Text style={styles.value}>{new Date(profile.updatedAt).toLocaleString()}</Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.label}>Роль:</Text>
        <Text style={styles.value}>{profile.role}</Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.label}>Отдел:</Text>
        <Text style={styles.value}>{profile.department}</Text>
      </View>
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Выйти из аккаунта</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e2f',
    padding: 20,
  },
  containerCentered: {
    flex: 1,
    backgroundColor: '#1e1e2f',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f0f0f5',
    marginBottom: 30,
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  label: {
    flex: 1,
    color: '#a0a0c0',
    fontSize: 16,
    fontWeight: '600',
  },
  value: {
    flex: 2,
    color: '#f0f0f5',
    fontSize: 16,
  },
  text: {
    color: '#f0f0f5',
    fontSize: 18,
  },
  error: {
    color: '#ff6b6b',
    fontSize: 18,
    marginBottom: 20,
    textAlign: 'center',
  },
  logoutButton: {
    marginTop: 40,
    backgroundColor: '#5a67d8',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  logoutText: {
    color: '#f0f0f5',
    fontSize: 20,
    fontWeight: '700',
  },
  button: {
    backgroundColor: '#5a67d8',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#f0f0f5',
    fontSize: 18,
    fontWeight: '700',
  },
});
