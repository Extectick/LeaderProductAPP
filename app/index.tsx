import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AuthContext } from '@/context/AuthContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { getProfileGate } from '@/utils/profileGate';
import { isTelegramMiniAppLaunch } from '@/utils/telegramAuthService';

export default function RootRedirect() {
  const router = useRouter();
  const auth = React.useContext(AuthContext);
  const background = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');

  useEffect(() => {
    if (!auth) return;
    if (auth.isLoading) return;

    const gateState = getProfileGate(auth.profile);
    const gate = !auth.isAuthenticated
      ? isTelegramMiniAppLaunch()
        ? '/(auth)/telegram'
        : '/(auth)/AuthScreen'
      : gateState === 'active'
      ? '/home'
      : gateState === 'pending'
      ? '/(auth)/ProfilePendingScreen'
      : gateState === 'blocked'
      ? '/(auth)/ProfileBlockedScreen'
      : '/ProfileSelectionScreen';

    router.replace(gate as any);
  }, [auth, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: background }}>
      <ActivityIndicator color={textColor} />
    </View>
  );
}
