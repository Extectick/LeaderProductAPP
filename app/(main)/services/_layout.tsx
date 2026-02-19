import { Stack, usePathname, useRouter } from 'expo-router';
import { AppHeader } from '@/components/AppHeader';
import React, { useEffect, useMemo, useRef } from 'react';
import { useNotify } from '@/components/NotificationHost';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useServicesData } from '@/src/features/services/hooks/useServicesData';
import { useServerStatus } from '@/src/shared/network/useServerStatus';

type HeaderMeta = {
  title: string;
  icon: string;
  showBack: boolean;
  parent?: string;
  subtitle?: string;
};

const headerMap: Record<string, HeaderMeta> = {
  index: { title: 'Каталог сервисов', icon: 'apps-outline', showBack: false, subtitle: 'Все доступные сервисы' },
  qrcodes: { title: 'QR генератор', icon: 'qr-code-outline', showBack: true, parent: '/services', subtitle: 'Создание и аналитика QR' },
  'qrcodes/index': { title: 'Список QR кодов', icon: 'qr-code-outline', showBack: true, parent: '/services/qrcodes', subtitle: 'Все ваши QR-коды' },
  'qrcodes/form': { title: 'Форма QR кода', icon: 'qr-code-outline', showBack: true, parent: '/services/qrcodes', subtitle: 'Создание и правка' },
  'qrcodes/analytics': { title: 'Аналитика QR', icon: 'stats-chart-outline', showBack: true, parent: '/services/qrcodes', subtitle: 'Просмотры и сканы' },
  appeals: { title: 'Обращения', icon: 'chatbubbles-outline', showBack: true, parent: '/services', subtitle: 'Центр общения' },
  'appeals/index': { title: 'Обращения', icon: 'chatbubbles-outline', showBack: true, parent: '/services', subtitle: 'Центр общения' },
  'appeals/index.web': { title: 'Обращения', icon: 'chatbubbles-outline', showBack: true, parent: '/services', subtitle: 'Центр общения' },
  'appeals/[id]': { title: 'Обращения', icon: 'chatbubbles-outline', showBack: true, parent: '/services/appeals', subtitle: 'Центр общения' },
  'appeals/[id].web': { title: 'Обращения', icon: 'chatbubbles-outline', showBack: true, parent: '/services/appeals', subtitle: 'Центр общения' },
  'appeals/new': { title: 'Новое обращение', icon: 'chatbubbles-outline', showBack: true, parent: '/services/appeals', subtitle: 'Создать обращение' },
  'appeals/new.web': { title: 'Новое обращение', icon: 'chatbubbles-outline', showBack: true, parent: '/services/appeals', subtitle: 'Создать обращение' },
  tracking: { title: 'Геомаршруты', icon: 'map-outline', showBack: true, parent: '/services', subtitle: 'Маршруты и точки на карте' },
  'tracking/index': { title: 'Геомаршруты', icon: 'map-outline', showBack: true, parent: '/services', subtitle: 'Маршруты и точки на карте' },
};

export default function ServicesLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const notify = useNotify();
  const { services, loading } = useServicesData();
  const { isReachable } = useServerStatus();
  const lastAlertRef = useRef<string | null>(null);

  const serviceKey = useMemo(() => {
    if (!pathname) return null;
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] !== 'services') return null;
    if (!parts[1]) return null;
    return parts[1];
  }, [pathname]);

  const guardedService = useMemo(() => {
    if (!serviceKey) return null;
    return (services || []).find((service) => service.key === serviceKey) || null;
  }, [serviceKey, services]);

  const deniedByAccess = !!serviceKey && !loading && (!guardedService || !guardedService.visible || !guardedService.enabled);
  const deniedByOffline = !!serviceKey && !loading && !!guardedService && guardedService.kind === 'CLOUD' && !isReachable;

  useEffect(() => {
    if (!serviceKey) return;
    if (loading) return;
    if (!deniedByAccess && !deniedByOffline) return;

    const reason = deniedByOffline ? 'offline' : 'denied';
    const alertKey = `${serviceKey}-${reason}`;
    if (lastAlertRef.current !== alertKey) {
      lastAlertRef.current = alertKey;
      notify(
        deniedByOffline
          ? {
              type: 'warning',
              title: 'Нет связи с сервером',
              message: 'Для открытия облачного сервиса нужна связь с сервером.',
              icon: 'cloud-offline-outline',
              durationMs: 5000,
            }
          : {
              type: 'error',
              title: 'Ошибка',
              message: 'Сервис временно недоступен',
              icon: 'close-circle-outline',
              durationMs: 5200,
            }
      );
    }
    router.replace('/services');
  }, [deniedByAccess, deniedByOffline, loading, notify, router, serviceKey]);

  const servicesSummary = useMemo(() => {
    const visible = (services || []).filter((service) => service.visible);
    const enabled = visible.filter((service) => service.enabled).length;
    const cloud = visible.filter((service) => service.kind === 'CLOUD').length;
    return { visible: visible.length, enabled, cloud };
  }, [services]);
  const blocked = !!serviceKey && !loading && (deniedByAccess || deniedByOffline);
  if (serviceKey && (loading || blocked)) return null;

  const showCloudServiceInHeader = Boolean(serviceKey && guardedService?.kind === 'CLOUD');

  return (
    <Stack
      screenOptions={({ route, navigation }) => {
        const name = (route as any)?.routeName || (route.name as string);
        let meta = headerMap[name as keyof typeof headerMap];
        const currentPath = String(pathname || '').split('?')[0];

        const isAppeals = name?.includes('appeals');
        const isAppealsList = name === 'appeals' || name === 'appeals/index' || name === 'appeals/index.web';
        const showCreateInHeader = /^\/services\/appeals\/?$/.test(currentPath);
        const showServicesSummaryInHeader = /^\/services\/?$/.test(currentPath);

        if (!meta && isAppeals) {
          meta = {
            title: 'Обращения',
            icon: 'chatbubbles-outline',
            showBack: !isAppealsList,
            parent: '/services/appeals',
            subtitle: 'Центр общения',
          };
        }
        if (!meta) meta = { title: 'Сервисы', icon: 'apps-outline', showBack: true, parent: '/services' };

        const shouldShowBack = meta.showBack;
        const onBack = () => {
          if (currentPath.startsWith('/services/qrcodes/')) {
            router.replace('/services/qrcodes');
            return;
          }
          if (currentPath === '/services/qrcodes') {
            router.replace('/services');
            return;
          }
          const target = isAppeals ? '/services' : (meta as any).parent;
          if (target) {
            router.replace(target as any);
            return;
          }
          if (navigation.canGoBack()) navigation.goBack();
          else router.replace('/services');
        };

        const showCloudInHeader = showCloudServiceInHeader && !showCreateInHeader;
        const shouldRenderRight = showCreateInHeader || showCloudInHeader || showServicesSummaryInHeader;
        const rightSlot = shouldRenderRight ? (
          <View style={styles.rightHeaderRow}>
            {showServicesSummaryInHeader ? (
              <View style={styles.servicesSummaryChip}>
                <Ionicons name="grid-outline" size={13} color="#1E3A8A" />
                <Text style={styles.servicesSummaryText}>
                  {servicesSummary.enabled}/{servicesSummary.visible}
                </Text>
              </View>
            ) : null}
            {showCloudInHeader ? (
              <View style={styles.cloudHeaderBadge}>
                <Ionicons name="cloud-outline" size={13} color="#1E40AF" />
              </View>
            ) : null}
            {showCreateInHeader ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Создать обращение"
                onPress={() => router.push('/services/appeals/new')}
                style={({ pressed }) => [styles.createBtn, pressed ? styles.createBtnPressed : null]}
              >
                <Ionicons name="add" size={16} color="#1D4ED8" />
                <Text style={styles.createBtnText}>Создать</Text>
              </Pressable>
            ) : null}
          </View>
        ) : undefined;

        return {
          headerTransparent: true,
          headerShadowVisible: false,
          headerStatusBarHeight: 0,
          headerStyle: { backgroundColor: 'transparent' },
          header: () => (
            <AppHeader
              title={meta.title}
              subtitle={meta.subtitle}
              icon={meta.icon}
              showBack={shouldShowBack}
              onBack={shouldShowBack ? onBack : undefined}
              rightSlot={rightSlot}
            />
          ),
          animation: 'ios_from_left',
        };
      }}
    />
  );
}

const styles = StyleSheet.create({
  rightHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  servicesSummaryChip: {
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  servicesSummaryText: {
    color: '#1E3A8A',
    fontSize: 12,
    fontWeight: '800',
  },
  cloudHeaderBadge: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtn: {
    minHeight: 34,
    borderRadius: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  createBtnPressed: {
    opacity: 0.9,
  },
  createBtnText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '800',
  },
});
