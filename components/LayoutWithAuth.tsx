import AuthScreen from '@/app/(auth)/AuthScreen';
import ProfileSelectionScreen from '@/app/(auth)/ProfileSelectionScreen';
import { AuthContext } from '@/context/AuthContext';
import { Text } from '@react-navigation/elements';
import { useRouter } from 'expo-router';
import React, { ReactNode, useContext, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

interface LayoutWithAuthProps {
  children: ReactNode;
}

export default function LayoutWithAuth({ children }: LayoutWithAuthProps) {
  const authContext = useContext(AuthContext);
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);

  if (!authContext) throw new Error('AuthContext must be used within an AuthProvider');

  const { isLoading, isAuthenticated, profile } = authContext;


  if (isLoading) {
    return <ActivityIndicator size="large" style={{ flex: 1, justifyContent: 'center' }} />;
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  if (!profile) {
    return <ProfileSelectionScreen />
  }

  if (profile.status !== 'ACTIVE') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text>Ваш профиль не активен. Обратитесь к администратору.</Text>
        {/* <Button title="Выйти" onPress={logout} /> */}
      </View>
    );
  }

  return <>{children}</>;
}
