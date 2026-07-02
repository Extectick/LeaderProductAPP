import { Stack, useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { AppHeader } from '@/components/AppHeader';
import React, { useEffect, useMemo, useRef } from 'react';
import { useNotify } from '@/components/NotificationHost';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useServicesData } from '@/src/features/services/hooks/useServicesData';
import { useOptionalLastServiceRoute } from '@/src/features/navigation/LastServiceRouteContext';
import { useOptionalUnsavedChanges } from '@/src/features/navigation/UnsavedChangesContext';
import { ServicesHeaderSlotProvider, type ServicesHeaderOverride } from '@/src/features/services/headerSlotContext';
import ServicesCatalogStatusAction from '@/src/features/services/ui/ServicesCatalogStatusAction';

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
  'appeals/analytics': { title: 'Аналитика обращений', icon: 'stats-chart-outline', showBack: true, parent: '/services/appeals', subtitle: 'SLA, часы и выплаты' },
  tracking: { title: 'Геомаршруты', icon: 'map-outline', showBack: true, parent: '/services', subtitle: 'Маршруты и точки на карте' },
  'tracking/index': { title: 'Геомаршруты', icon: 'map-outline', showBack: true, parent: '/services', subtitle: 'Маршруты и точки на карте' },
  stock_balances: { title: 'Остатки по складам', icon: 'cube-outline', showBack: true, parent: '/services', subtitle: 'Склады, организации и серии товаров' },
  'stock_balances/index': { title: 'Остатки по складам', icon: 'cube-outline', showBack: true, parent: '/services', subtitle: 'Склады, организации и серии товаров' },
  transport_tasks: { title: 'Задания на перевозку', icon: 'map-outline', showBack: true, parent: '/services', subtitle: 'Привязка к 1С' },
  'transport_tasks/index': { title: 'Задания на перевозку', icon: 'map-outline', showBack: true, parent: '/services', subtitle: 'Привязка к 1С' },
  client_orders: { title: 'Заказы клиентов', icon: 'receipt-outline', showBack: true, parent: '/services', subtitle: 'Создание заказа клиента' },
  'client_orders/index': { title: 'Заказы клиентов', icon: 'receipt-outline', showBack: true, parent: '/services', subtitle: 'Создание заказа клиента' },
  'client_orders/index.web': { title: 'Заказы клиентов', icon: 'receipt-outline', showBack: true, parent: '/services', subtitle: 'Создание заказа клиента' },
};

export default function ServicesLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const globalParams = useGlobalSearchParams<{ backTo?: string; from?: string }>();
  const notify = useNotify();
  const lastService = useOptionalLastServiceRoute();
  const unsavedChanges = useOptionalUnsavedChanges();
  const { services, loading, loadServices } = useServicesData();
  const lastAlertRef = useRef<string | null>(null);
  const accessRefreshRef = useRef<string | null>(null);
  const [trackingHeaderBottomSlot, setTrackingHeaderBottomSlot] = React.useState<React.ReactNode | null>(null);
  const [trackingHeaderRightSlot, setTrackingHeaderRightSlot] = React.useState<React.ReactNode | null>(null);
  const [headerOverride, setHeaderOverride] = React.useState<ServicesHeaderOverride | null>(null);
  const headerSlotContextValue = React.useMemo(
    () => ({
      setHeaderBottomSlot: setTrackingHeaderBottomSlot,
      setHeaderRightSlot: setTrackingHeaderRightSlot,
      setHeaderOverride,
    }),
    []
  );

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

  const missingServiceMetadata = !!serviceKey && !loading && !guardedService;
  const deniedByAccess = !!serviceKey && !loading && !!guardedService && (!guardedService.visible || !guardedService.enabled);
  useEffect(() => {
    if (!serviceKey) return;
    if (loading) return;
    if (missingServiceMetadata && accessRefreshRef.current !== serviceKey) {
      accessRefreshRef.current = serviceKey;
      void loadServices(true);
      return;
    }

    if (!deniedByAccess) return;

    const reason = 'denied';
    const alertKey = `${serviceKey}-${reason}`;
    if (lastAlertRef.current !== alertKey) {
      lastAlertRef.current = alertKey;
      notify({
        type: 'error',
        title: 'Ошибка',
        message: 'Сервис временно недоступен',
        icon: 'close-circle-outline',
        durationMs: 5200,
      });
    }
    router.replace('/services');
  }, [deniedByAccess, loadServices, loading, missingServiceMetadata, notify, router, serviceKey]);

  const blocked = !!serviceKey && !loading && deniedByAccess;
  if (serviceKey && blocked) return null;

  const showCloudServiceInHeader = Boolean(serviceKey && guardedService?.kind === 'CLOUD');

  return (
    <ServicesHeaderSlotProvider value={headerSlotContextValue}>
      <Stack
        screenOptions={({ route, navigation }) => {
          const name = (route as any)?.routeName || (route.name as string);
          let meta = headerMap[name as keyof typeof headerMap];
          const currentPath = String(pathname || '').split('?')[0];
          const isCatalogPath = /^\/services\/?$/.test(currentPath);

          const isAppeals = name?.includes('appeals');
          const isAppealsList = name === 'appeals' || name === 'appeals/index' || name === 'appeals/index.web';
          const showCreateInHeader = /^\/services\/appeals\/?$/.test(currentPath);
          const showCatalogStatusAction = isCatalogPath;

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
            const runBack = () => {
            const replaceWithCatalog = () => {
              lastService?.clearLastServiceRoute();
              router.replace('/services');
            };
            const isAppealsListPath = /^\/services\/appeals\/?$/.test(currentPath);
            const isAppealDetailPath = /^\/services\/appeals\/[^/]+$/.test(currentPath);
            const backToAnalytics =
              String(globalParams?.backTo || '').toLowerCase() === 'analytics' ||
              String(globalParams?.from || '').toLowerCase() === 'analytics';
            if (isAppealDetailPath && backToAnalytics) {
              router.replace('/services/appeals/analytics');
              return;
            }

            if (currentPath.startsWith('/services/qrcodes/')) {
              router.replace('/services/qrcodes');
              return;
            }
            if (currentPath === '/services/qrcodes') {
              replaceWithCatalog();
              return;
            }
            const target = isAppeals
              ? (isAppealsListPath ? '/services' : '/services/appeals')
              : (meta as any).parent;
            if (target) {
              if (target === '/services') {
                replaceWithCatalog();
                return;
              }
              router.replace(target as any);
              return;
            }
            if (navigation.canGoBack()) navigation.goBack();
            else replaceWithCatalog();
            };
            if (unsavedChanges) {
              unsavedChanges.confirmNavigation(runBack);
              return;
            }
            runBack();
          };

          const showTrackingBottomSlot = /^\/services\/tracking(?:\/.*)?$/.test(currentPath);
          const isClientOrdersPath = /^\/services\/client_orders(?:\/.*)?$/.test(currentPath);
          const showCloudInHeader = showCloudServiceInHeader && !showCreateInHeader && !isClientOrdersPath;
          const shouldRenderRight = showCatalogStatusAction || showCreateInHeader || showCloudInHeader;
          const rightSlot = shouldRenderRight ? (
            <View style={styles.rightHeaderRow}>
              {showCatalogStatusAction ? (
                <ServicesCatalogStatusAction loadServices={loadServices} />
              ) : null}
              {showCloudInHeader ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Действия сервиса"
                  onPress={() => undefined}
                  style={({ pressed }) => [styles.cloudHeaderAction, pressed ? styles.cloudHeaderActionPressed : null]}
                >
                  <Ionicons name="ellipsis-horizontal" size={17} color="#1E40AF" />
                </Pressable>
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
          const resolvedRightSlot = showTrackingBottomSlot
            ? (trackingHeaderRightSlot ?? rightSlot)
            : rightSlot;
          const activeHeaderOverride = isClientOrdersPath ? headerOverride : null;
          const overrideHasRightSlot = !!activeHeaderOverride && Object.prototype.hasOwnProperty.call(activeHeaderOverride, 'rightSlot');
          const overrideHasBottomSlot = !!activeHeaderOverride && Object.prototype.hasOwnProperty.call(activeHeaderOverride, 'bottomSlot');
          const resolvedHeaderRightSlot = overrideHasRightSlot ? activeHeaderOverride?.rightSlot : resolvedRightSlot;
          const resolvedHeaderBottomSlot = overrideHasBottomSlot
            ? activeHeaderOverride?.bottomSlot
            : showTrackingBottomSlot
              ? trackingHeaderBottomSlot
              : undefined;

          return {
            headerTransparent: true,
            headerShadowVisible: false,
            headerStatusBarHeight: 0,
            headerStyle: { backgroundColor: 'transparent' },
            header: () => (
              <AppHeader
                title={activeHeaderOverride?.title ?? meta.title}
                subtitle={activeHeaderOverride?.subtitle ?? (isClientOrdersPath ? undefined : meta.subtitle)}
                icon={activeHeaderOverride?.icon ?? meta.icon}
                showBack={activeHeaderOverride?.showBack ?? shouldShowBack}
                onBack={
                  activeHeaderOverride?.onBack ??
                  ((activeHeaderOverride?.showBack ?? shouldShowBack) ? onBack : undefined)
                }
                tight={activeHeaderOverride?.tight ?? showTrackingBottomSlot}
                dense={activeHeaderOverride?.dense ?? isClientOrdersPath}
                compact={activeHeaderOverride?.compact ?? isClientOrdersPath}
                horizontalPadding={activeHeaderOverride?.horizontalPadding ?? (isClientOrdersPath ? 6 : undefined)}
                titleSlot={activeHeaderOverride?.titleSlot}
                rightSlot={resolvedHeaderRightSlot}
                bottomSlot={resolvedHeaderBottomSlot}
                surfaceVisible={activeHeaderOverride?.surfaceVisible ?? !isCatalogPath}
                entranceMotion={activeHeaderOverride?.entranceMotion ?? (isClientOrdersPath ? 'none' : isCatalogPath ? 'fade' : 'slide')}
                variant={activeHeaderOverride?.variant ?? 'default'}
                showServerStatus={activeHeaderOverride?.showServerStatus ?? !isCatalogPath}
              />
            ),
            animation: isClientOrdersPath ? 'fade' : 'ios_from_left',
          };
        }}
      />
    </ServicesHeaderSlotProvider>
  );
}

const styles = StyleSheet.create({
  rightHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cloudHeaderAction: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cloudHeaderActionPressed: {
    opacity: 0.78,
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
