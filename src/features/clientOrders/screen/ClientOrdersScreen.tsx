import React from 'react';
import { BackHandler, Platform, useWindowDimensions } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { useUnsavedChanges } from '@/src/features/navigation/UnsavedChangesContext';
import ClientOrdersMobileLayout from './mobile/ClientOrdersMobileLayout';
import ClientOrdersDesktopLayout from './desktop/ClientOrdersDesktopLayout';

const WEB_DESKTOP_BREAKPOINT = 1024;

export default function ClientOrdersScreen() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const navigation = useNavigation<any>();
  const { confirmNavigation, registerUnsavedChanges } = useUnsavedChanges();
  const allowNextNavigationRef = React.useRef(false);
  const closeOverlayRef = React.useRef<(() => boolean) | null>(null);
  const registerBackOverlayHandler = React.useCallback((handler: (() => boolean) | null) => {
    closeOverlayRef.current = handler;
  }, []);

  React.useEffect(() => {
    registerUnsavedChanges({
      active: true,
      minimal: true,
      title: 'Выйти в каталог сервисов?',
      message: '',
      confirmText: 'Выйти',
      cancelText: 'Остаться',
      icon: 'view-grid-outline',
      iconColor: '#2563EB',
      confirmButtonColor: '#2563EB',
      confirmButtonTextColor: '#FFFFFF',
      cancelButtonTextColor: '#2563EB',
      warningTextColor: '#1D4ED8',
      warningBackgroundColor: '#EFF6FF',
      warningBorderColor: '#BFDBFE',
      onDiscard: () => {
        allowNextNavigationRef.current = true;
      },
    });

    return () => registerUnsavedChanges(null);
  }, [registerUnsavedChanges]);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener?.('beforeRemove', (event: any) => {
      if (closeOverlayRef.current?.()) {
        event.preventDefault();
        return;
      }
      if (allowNextNavigationRef.current) {
        allowNextNavigationRef.current = false;
        return;
      }
      event.preventDefault();
      confirmNavigation(() => {
        allowNextNavigationRef.current = true;
        navigation.dispatch(event.data.action);
      });
    });
    return unsubscribe;
  }, [confirmNavigation, navigation]);

  React.useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (closeOverlayRef.current?.()) return true;
      confirmNavigation(() => router.replace('/services'));
      return true;
    });

    return () => subscription.remove();
  }, [confirmNavigation, router]);

  if (Platform.OS === 'web' && width >= WEB_DESKTOP_BREAKPOINT) {
    return <ClientOrdersDesktopLayout />;
  }

  return <ClientOrdersMobileLayout registerBackOverlayHandler={registerBackOverlayHandler} />;
}
