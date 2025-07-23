import CustomAlert from '@/components/CustomAlert'; // кастомный алерт
import ThemeSwitcher from '@/components/ThemeSwitcher';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useThemeColor } from '../../hooks/useThemeColor';
import apiClient from '../../utils/apiClient';

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showLogoutAlert, setShowLogoutAlert] = useState(false);

  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const buttonColor = useThemeColor({}, 'button');
  const buttonTextColor = useThemeColor({}, 'buttonText');
  const errorColor = useThemeColor({}, 'error');
  const secondaryTextColor = useThemeColor({}, 'secondaryText');

  const fetchProfile = async () => {
    try {
      setError('');
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) throw new Error('Токен не найден. Авторизуйтесь заново.');

      const data = await apiClient.getProfile(token);
      setProfile(data.profile);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки профиля');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchProfile();
  };

  const confirmLogout = async () => {
    setShowLogoutAlert(false);
    try {
      const accessToken = await AsyncStorage.getItem('accessToken');
      const refreshToken = await AsyncStorage.getItem('refreshToken');
      if (accessToken && refreshToken) {
        await apiClient.logout(accessToken, refreshToken);
      }
    } catch {}
    finally {
      await AsyncStorage.clear();
      router.replace('/AuthScreen');
    }
  };

  const renderField = (label: string, value: any) => {
    if (!value) return null;
    return (
      <View style={styles.infoRow}>
        <Text style={[styles.label, { color: secondaryTextColor }]}>{label}:</Text>
        <Text style={[styles.value, { color: textColor }]}>
          {typeof value === 'boolean' ? (value ? 'Да' : 'Нет') : value.toString()}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.containerCentered, { backgroundColor }]}>
        <ActivityIndicator size="large" color={buttonColor} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.containerCentered, { backgroundColor }]}>
        <Text style={[styles.error, { color: errorColor }]}>{error}</Text>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: buttonColor }]}
          onPress={fetchProfile}
        >
          <Text style={[styles.buttonText, { color: buttonTextColor }]}>Повторить</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: buttonColor }]}
          onPress={() => setShowLogoutAlert(true)}
        >
          <Text style={[styles.logoutText, { color: buttonTextColor }]}>Выйти</Text>
        </TouchableOpacity>

        <CustomAlert
          visible={showLogoutAlert}
          title="Выход"
          message="Вы действительно хотите выйти?"
          confirmText="Выйти"
          cancelText="Отмена"
          onConfirm={confirmLogout}
          onCancel={() => setShowLogoutAlert(false)}
        />
      </View>
    );
  }

  const {
    email,
    profileStatus,
    currentProfileType,
    createdAt,
    updatedAt,
    role,
    employeeProfile,
    phone
  } = profile;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <ThemeSwitcher />

      <Text style={[styles.title, { color: textColor }]}>Профиль пользователя</Text>

      {renderField('Email', email)}
      {renderField('Статус', profileStatus)}
      {renderField('Тип профиля', currentProfileType)}
      {renderField('Дата создания', new Date(createdAt).toLocaleString())}
      {renderField('Дата обновления', new Date(updatedAt).toLocaleString())}
      {role && renderField('Роль', role.name)}
      {employeeProfile?.department && renderField('Отдел', employeeProfile.department.name)}
      {phone && renderField('Телефон', phone)}

      <TouchableOpacity
        style={[styles.logoutButton, { backgroundColor: buttonColor }]}
        onPress={() => setShowLogoutAlert(true)}
      >
        <Text style={[styles.logoutText, { color: buttonTextColor }]}>Выйти из аккаунта</Text>
      </TouchableOpacity>

      <CustomAlert
        visible={showLogoutAlert}
        title="Выход"
        message="Вы действительно хотите выйти?"
        confirmText="Выйти"
        cancelText="Отмена"
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutAlert(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  containerCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 30,
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  label: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  value: {
    flex: 2,
    fontSize: 16,
  },
  error: {
    fontSize: 18,
    marginBottom: 20,
    textAlign: 'center',
  },
  button: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '700',
  },
  logoutButton: {
    marginTop: 30,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  logoutText: {
    fontSize: 18,
    fontWeight: '700',
  },
});
