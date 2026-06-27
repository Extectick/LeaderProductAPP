import React from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { logger } from '@/utils/logger';
import { useUnsavedChanges } from '@/src/features/navigation/UnsavedChangesContext';
import ClientOrdersMobileLayout from './mobile/ClientOrdersMobileLayout';
import ClientOrdersDesktopLayout from './desktop/ClientOrdersDesktopLayout';

const WEB_DESKTOP_BREAKPOINT = 1024;

type ErrorBoundaryProps = {
  children: React.ReactNode;
  onExit: () => void;
};

type ErrorBoundaryState = {
  error: Error | null;
};

class ClientOrdersErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logger.captureException(error, { where: 'ClientOrdersScreen', componentStack: info.componentStack }, 'client-orders');
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.errorRoot}>
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Не удалось открыть заказы клиентов</Text>
          <Text style={styles.errorText} selectable>
            {this.state.error.message || 'Произошла ошибка интерфейса.'}
          </Text>
          <Pressable style={styles.errorButton} onPress={this.props.onExit}>
            <Text style={styles.errorButtonText}>В каталог сервисов</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

function ClientOrdersScreenContent() {
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

export default function ClientOrdersScreen() {
  const router = useRouter();
  const exitToServices = React.useCallback(() => router.replace('/services'), [router]);

  return (
    <ClientOrdersErrorBoundary onExit={exitToServices}>
      <ClientOrdersScreenContent />
    </ClientOrdersErrorBoundary>
  );
}

const styles = StyleSheet.create({
  errorRoot: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#F8FAFC',
  },
  errorCard: {
    gap: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#FFFFFF',
    padding: 20,
  },
  errorTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 23,
  },
  errorText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  errorButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
  },
  errorButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
});
