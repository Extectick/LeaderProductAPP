import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AuthContext, isValidProfile } from '@/context/AuthContext';
import { useThemeColor } from '@/hooks/useThemeColor';

export default function RootRedirect() {
  const router = useRouter();
  const auth = React.useContext(AuthContext);
  const background = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');

  useEffect(() => {
    if (!auth) return;
    if (auth.isLoading) return;

    const gate = !auth.isAuthenticated
      ? '/(auth)/AuthScreen'
      : isValidProfile(auth.profile)
      ? '/home'
      : '/ProfileSelectionScreen';

    router.replace(gate as any);
  }, [auth, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: background }}>
      <ActivityIndicator color={textColor} />
    </View>
  );
}
