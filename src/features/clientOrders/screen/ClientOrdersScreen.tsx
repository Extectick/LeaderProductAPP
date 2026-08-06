import React from 'react';
import { ActivityIndicator, BackHandler, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { AuthContext } from '@/context/AuthContext';
import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';
import { useNotificationViewport } from '@/context/NotificationViewportContext';
import { useServicesHeaderSlot } from '@/src/features/services/headerSlotContext';
import { logger } from '@/utils/logger';
import { getProfile } from '@/utils/userService';
import { isClientOrdersOnecUserLinked } from '../lib/clientOrdersAccess';
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
  const auth = React.useContext(AuthContext);
  const topInset = useHeaderContentTopInset({ compact: true, hasSubtitle: false, extraGap: 2 });
  const { headerBottomOffset } = useNotificationViewport();
  const { setHeaderOverride } = useServicesHeaderSlot();
  const [profileRefreshing, setProfileRefreshing] = React.useState(false);
  const [profileRefreshError, setProfileRefreshError] = React.useState<string | null>(null);
  const closeOverlayRef = React.useRef<(() => boolean) | null>(null);
  const isOnecUserMissing = Boolean(auth && !auth.isLoading && !isClientOrdersOnecUserLinked(auth.profile));
  const exitToServices = React.useCallback(() => router.replace('/services'), [router]);

  React.useLayoutEffect(() => {
    if (!isOnecUserMissing) return undefined;
    setHeaderOverride({ hidden: false });
    return () => setHeaderOverride(null);
  }, [isOnecUserMissing, setHeaderOverride]);

  const refreshProfile = React.useCallback(async () => {
    if (!auth || profileRefreshing) return;
    setProfileRefreshing(true);
    setProfileRefreshError(null);
    try {
      const freshProfile = await getProfile();
      if (!freshProfile) {
        throw new Error('Не удалось получить актуальный профиль. Проверьте подключение и повторите попытку.');
      }
      await auth.setProfile(freshProfile);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось обновить профиль.';
      setProfileRefreshError(message);
      logger.captureException(error, { where: 'ClientOrdersScreen:refreshProfile' }, 'client-orders');
    } finally {
      setProfileRefreshing(false);
    }
  }, [auth, profileRefreshing]);

  const registerBackOverlayHandler = React.useCallback((handler: (() => boolean) | null) => {
    closeOverlayRef.current = handler;
  }, []);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener?.('beforeRemove', (event: any) => {
      if (closeOverlayRef.current?.()) {
        event.preventDefault();
        return;
      }
    });
    return unsubscribe;
  }, [navigation]);

  React.useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (closeOverlayRef.current?.()) return true;
      exitToServices();
      return true;
    });

    return () => subscription.remove();
  }, [exitToServices]);

  if (isOnecUserMissing) {
    return (
      <View
        style={[
          styles.blockedRoot,
          { paddingTop: Math.max(topInset, headerBottomOffset || 0) + 12 },
        ]}
      >
        <View style={styles.blockedCard}>
          <View style={styles.blockedIcon}>
            <Text style={styles.blockedIconText}>1С</Text>
          </View>
          <Text style={styles.blockedTitle}>Пользователь не сопоставлен с 1С</Text>
          <Text style={styles.blockedText}>
            Работа с заказами клиентов недоступна. Обратитесь к администратору, чтобы он указал пользователя 1С в вашем профиле.
          </Text>
          {profileRefreshError ? <Text style={styles.blockedError}>{profileRefreshError}</Text> : null}
          <View style={styles.blockedActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Обновить профиль"
              disabled={profileRefreshing}
              onPress={() => void refreshProfile()}
              style={({ pressed }) => [
                styles.blockedButton,
                styles.blockedPrimaryButton,
                pressed && !profileRefreshing ? styles.blockedButtonPressed : null,
                profileRefreshing ? styles.blockedButtonDisabled : null,
              ]}
            >
              {profileRefreshing ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
              <Text style={styles.blockedPrimaryButtonText}>Обновить</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Назад к сервисам"
              onPress={exitToServices}
              style={({ pressed }) => [
                styles.blockedButton,
                styles.blockedSecondaryButton,
                pressed ? styles.blockedButtonPressed : null,
              ]}
            >
              <Text style={styles.blockedSecondaryButtonText}>Назад</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

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
  blockedRoot: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  blockedCard: {
    width: '100%',
    maxWidth: 640,
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  blockedIcon: {
    minWidth: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
  },
  blockedIconText: {
    color: '#2563EB',
    fontSize: 18,
    fontWeight: '900',
  },
  blockedTitle: {
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 26,
    textAlign: 'center',
  },
  blockedText: {
    maxWidth: 520,
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
    textAlign: 'center',
  },
  blockedError: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  blockedActions: {
    width: '100%',
    maxWidth: 360,
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  blockedButton: {
    minHeight: 46,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  blockedPrimaryButton: {
    backgroundColor: '#2563EB',
  },
  blockedSecondaryButton: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  blockedPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  blockedSecondaryButtonText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '900',
  },
  blockedButtonPressed: {
    opacity: 0.78,
  },
  blockedButtonDisabled: {
    opacity: 0.64,
  },
});
