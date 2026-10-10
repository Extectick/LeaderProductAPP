import { Stack, usePathname, useRouter } from 'expo-router';
import React from 'react';
import { BackHandler, Platform } from 'react-native';
import { Appbar } from 'react-native-paper';
import { useReducedMotion } from 'react-native-reanimated';
import { ProfileDataProvider } from '@/src/features/profile/model/ProfileDataContext';
import { isProfileSection, profileSections } from '@/src/features/profile/lib/presentation';

export default function ProfileLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const goBack = React.useCallback(() => {
    if (pathname.replace(/\/+$/, '') === '/profile') router.replace('/services' as any);
    else if (router.canGoBack()) router.back();
    else router.replace('/profile');
  }, [pathname, router]);
  React.useEffect(() => {
    if (Platform.OS === 'web' || !/^\/profile(?:\/|$)/.test(pathname)) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { goBack(); return true; });
    return () => subscription.remove();
  }, [goBack, pathname]);
  return <ProfileDataProvider><Stack screenOptions={{
    headerTransparent: false, headerShadowVisible: false,
    contentStyle: { backgroundColor: '#F8FAFC' },
    animation: reduceMotion ? 'none' : 'slide_from_right',
    header: ({ route }) => {
      const section = (route.params as { section?: string } | undefined)?.section;
      return <Appbar.Header mode="small" elevated={false} style={{ backgroundColor: '#F8FAFC' }}>
        <Appbar.BackAction onPress={goBack} color="#566982" accessibilityLabel="Назад" />
        <Appbar.Content title={isProfileSection(section) ? profileSections[section] : 'Профиль'}
          titleStyle={{ color: '#0F172A', fontSize: route.name === 'index' ? 22 : 20, fontWeight: '700' }} />
      </Appbar.Header>;
    },
  }} /></ProfileDataProvider>;
}
