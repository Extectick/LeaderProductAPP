import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import ThemeSwitcher from '../components/ThemeSwitcher';
import { useThemeColor } from '../hooks/useThemeColor';
import { logout } from '../utils/auth';

interface ProfileScreenProps {
  profile?: any;
  loading: boolean;
  error?: string;
  onRefresh?: () => Promise<void>;
}

export default function ProfileScreen({
  profile: propProfile,
  loading: propLoading,
  error: propError,
  onRefresh
}: ProfileScreenProps) {
  const router = useRouter();
  const [profile, setProfile] = useState(propProfile);
  const [loading, setLoading] = useState(propLoading);
  const [error, setError] = useState(propError || '');
  const [refreshing, setRefreshing] = useState(false);

  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const buttonColor = useThemeColor({}, 'button');
  const buttonTextColor = useThemeColor({}, 'buttonText');
  const errorColor = useThemeColor({}, 'error');
  const secondaryTextColor = useThemeColor({}, 'secondaryText');

  useEffect(() => {
    if (!propProfile && onRefresh) {
      onRefresh();
    }
  }, [propProfile, onRefresh]);

  const handleRefresh = async () => {
    if (onRefresh) {
      setRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    }
  };

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
        <Text style={[styles.label, { color: secondaryTextColor }]}>{label}:</Text>
        <Text style={[styles.value, { color: textColor }]}>
          {typeof value === 'boolean' 
            ? value ? 'Да' : 'Нет'
            : value.toString()}
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
          onPress={() => router.replace('/AuthScreen')}
        >
          <Text style={[styles.buttonText, { color: buttonTextColor }]}>Войти заново</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.containerCentered, { backgroundColor }]}>
        <Text style={[styles.text, { color: textColor }]}>Профиль не найден</Text>
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: buttonColor }]} 
          onPress={() => router.push('/ProfileSelectionScreen')}
        >
          <Text style={[styles.buttonText, { color: buttonTextColor }]}>Создать профиль</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.logoutButton, { backgroundColor: buttonColor }]} 
          onPress={handleLogout}
        >
          <Text style={[styles.logoutText, { color: buttonTextColor }]}>Выйти из аккаунта</Text>
        </TouchableOpacity>
      </View>
    );
  }
  
  const { email, profileStatus, currentProfileType, createdAt, updatedAt, role, employeeProfile, phone } = profile.profile;

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <ThemeSwitcher />
      <Text style={[styles.title, { 
        color: textColor,
        marginBottom: 30,
        textAlign: 'center'
      }]}>Профиль пользователя</Text>
    
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
        style={[styles.logoutButton, { backgroundColor: buttonColor }]} 
        onPress={handleLogout}
      >
        <Text style={[styles.logoutText, { color: buttonTextColor }]}>Выйти из аккаунта</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: 'transparent',
  },
  containerCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
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
  text: {
    fontSize: 18,
  },
  error: {
    fontSize: 18,
    marginBottom: 20,
    textAlign: 'center',
  },
  logoutButton: {
    marginTop: 40,
    paddingVertical: 15,
    paddingHorizontal: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  logoutText: {
    fontSize: 20,
    fontWeight: '700',
  },
  button: {
    paddingVertical: 15,
    paddingHorizontal: 15,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 5,
    
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '700',
  },
});
