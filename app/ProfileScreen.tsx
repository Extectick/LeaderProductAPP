import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ensureAuth, logout } from '../utils/auth';
import apiClient from './apiClient';

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchProfile = async () => {
    setLoading(true);
    setError('');
    
    try {
      const token = await ensureAuth();
      if (!token) {
        router.replace('/AuthScreen');
        return;
      }
      
      const data = await apiClient.getProfile(token);
      // console.log(data)
      setProfile(data);
    } catch (e: any) {
      setError(e.message || 'Ошибка при загрузке профиля');
      if (e.message === 'Unauthorized') {
        await logout();
        router.replace('/AuthScreen');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
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
            try {
              await logout();
              router.replace('/AuthScreen');
            } catch (e) {
              console.error('Logout error:', e);
              router.replace('/AuthScreen');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const renderProfileField = (label: string, value: any) => {
    if (value === undefined || value === null) return null;
    
    return (
      <View style={styles.infoRow}>
        <Text style={styles.label}>{label}:</Text>
        <Text style={styles.value}>
          {typeof value === 'boolean' 
            ? value ? 'Да' : 'Нет'
            : value.toString()}
        </Text>
      </View>
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
        <TouchableOpacity 
          style={styles.button} 
          onPress={() => router.replace('/AuthScreen')}
        >
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
  
  const { email, profileStatus, currentProfileType, createdAt, updatedAt, role, employeeProfile, phone } = profile.profile;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Профиль пользователя</Text>
      
      {renderProfileField('Email', email)}
      {renderProfileField('Статус', profileStatus)}
      {renderProfileField('Тип профиля', currentProfileType)}
      {renderProfileField('Дата создания', new Date(createdAt).toLocaleString())}
      {renderProfileField('Дата обновления', new Date(updatedAt).toLocaleString())}
      
      {role && renderProfileField('Роль', role.name)}
      
      {employeeProfile?.department && 
        renderProfileField('Отдел', employeeProfile.department.name)}
      
      {phone && renderProfileField('Телефон', phone)}
      
      <TouchableOpacity 
        style={styles.logoutButton} 
        onPress={handleLogout}
      >
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