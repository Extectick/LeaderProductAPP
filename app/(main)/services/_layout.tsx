import { Stack, useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { AppHeader } from '@/components/AppHeader';
import React, { useEffect, useMemo, useRef } from 'react';
import { useNotify } from '@/components/NotificationHost';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthContext } from '@/context/AuthContext';
import type { Profile } from '@/src/entities/user/types';
import { useServicesData } from '@/src/features/services/hooks/useServicesData';
import { useOptionalLastServiceRoute } from '@/src/features/navigation/LastServiceRouteContext';
import { useOptionalUnsavedChanges } from '@/src/features/navigation/UnsavedChangesContext';
import { ServicesHeaderSlotProvider, type ServicesHeaderOverride } from '@/src/features/services/headerSlotContext';
import { useServerStatus } from '@/src/shared/network/useServerStatus';

type HeaderMeta = {
  title: string;
  icon: string;
  showBack: boolean;
  parent?: string;
  subtitle?: string;
};

const loadedProfileAvatarKeys = new Set<string>();
const visibleProfileAvatarUrls = new Map<string, string>();

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
  const auth = React.useContext(AuthContext);
  const pathname = usePathname();
  const globalParams = useGlobalSearchParams<{ backTo?: string; from?: string }>();
  const notify = useNotify();
  const lastService = useOptionalLastServiceRoute();
  const unsavedChanges = useOptionalUnsavedChanges();
  const serverStatus = useServerStatus();
  const { services, loading, loadServices } = useServicesData();
  const lastAlertRef = useRef<string | null>(null);
  const accessRefreshRef = useRef<string | null>(null);
  const [trackingHeaderBottomSlot, setTrackingHeaderBottomSlot] = React.useState<React.ReactNode | null>(null);
  const [trackingHeaderRightSlot, setTrackingHeaderRightSlot] = React.useState<React.ReactNode | null>(null);
  const [headerOverride, setHeaderOverride] = React.useState<ServicesHeaderOverride | null>(null);
  const profileAvatarUrl = React.useMemo(() => resolveProfileAvatarUrl(auth?.profile), [auth?.profile]);
  const profileInitials = React.useMemo(() => resolveProfileInitials(auth?.profile), [auth?.profile]);
  const profileAvatarKey = auth?.profile?.id ? `user:${auth.profile.id}` : profileAvatarUrl || 'anonymous';
  const catalogOffline = serverStatus.isReachable === false;
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
          const showCatalogProfileAction = Platform.OS !== 'web' && isCatalogPath;

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
          const shouldRenderRight = showCatalogProfileAction || showCreateInHeader || showCloudInHeader;
          const rightSlot = shouldRenderRight ? (
            <View style={styles.rightHeaderRow}>
              {showCatalogProfileAction ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Профиль"
                  onPress={() => router.push('/profile')}
                  style={({ pressed }) => [styles.profileHeaderAction, pressed ? styles.profileHeaderActionPressed : null]}
                >
                  <MemoCatalogProfileAvatar offline={catalogOffline} avatarUrl={profileAvatarUrl} avatarKey={profileAvatarKey} initials={profileInitials} />
                </Pressable>
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
                surfaceOverrideColor={activeHeaderOverride ? undefined : (isCatalogPath && catalogOffline ? 'rgba(254, 226, 226, 0.94)' : undefined)}
                borderOverrideColor={activeHeaderOverride ? undefined : (isCatalogPath && catalogOffline ? 'rgba(248, 113, 113, 0.28)' : undefined)}
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

function resolveProfileAvatarUrl(profile: Profile | null | undefined) {
  return (
    profile?.avatarUrl ||
    profile?.employeeProfile?.avatarUrl ||
    profile?.clientProfile?.avatarUrl ||
    profile?.supplierProfile?.avatarUrl ||
    null
  );
}

function resolveProfileInitials(profile: Profile | null | undefined) {
  const parts = [profile?.firstName, profile?.lastName]
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  if (parts.length) {
    return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
  }
  const email = String(profile?.email || '').trim();
  return email ? email[0]?.toUpperCase() || 'P' : 'P';
}

function CatalogProfileAvatar({
  offline,
  avatarUrl,
  avatarKey,
  initials,
}: {
  offline: boolean;
  avatarUrl: string | null;
  avatarKey: string;
  initials: string;
}) {
  const [loading, setLoading] = React.useState(() => Boolean(avatarUrl && !loadedProfileAvatarKeys.has(avatarKey)));
  const [failed, setFailed] = React.useState(false);
  const [displayAvatarUrl, setDisplayAvatarUrl] = React.useState<string | null>(() => visibleProfileAvatarUrls.get(avatarKey) || avatarUrl);
  const [pendingAvatarUrl, setPendingAvatarUrl] = React.useState<string | null>(null);
  const displayAvatarSource = React.useMemo(() => (displayAvatarUrl ? { uri: displayAvatarUrl } : null), [displayAvatarUrl]);
  const pendingAvatarSource = React.useMemo(() => (pendingAvatarUrl ? { uri: pendingAvatarUrl } : null), [pendingAvatarUrl]);

  React.useEffect(() => {
    setFailed(false);
    if (!avatarUrl) {
      visibleProfileAvatarUrls.delete(avatarKey);
      setDisplayAvatarUrl(null);
      setPendingAvatarUrl(null);
      setLoading(false);
      return;
    }
    if (!displayAvatarUrl) {
      setDisplayAvatarUrl(avatarUrl);
      setPendingAvatarUrl(null);
      setLoading(!loadedProfileAvatarKeys.has(avatarKey));
      return;
    }
    if (displayAvatarUrl !== avatarUrl) {
      setPendingAvatarUrl(avatarUrl);
      setLoading(false);
      return;
    }
    setPendingAvatarUrl(null);
    setLoading(false);
  }, [avatarKey, avatarUrl, displayAvatarUrl]);

  const showAvatar = Boolean(displayAvatarSource && !failed);

  if (offline) {
    return (
      <View style={styles.profileHeaderOffline}>
        <Ionicons name="cloud-offline-outline" size={24} color="#DC2626" />
      </View>
    );
  }

  return (
    <>
      {showAvatar ? (
        <ExpoImage
          source={displayAvatarSource}
          style={styles.profileHeaderAvatar}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={displayAvatarUrl || 'profile-avatar'}
          transition={0}
          onLoadStart={() => {
            if (!displayAvatarUrl || loadedProfileAvatarKeys.has(avatarKey)) return;
            setLoading((current) => (current ? current : true));
          }}
          onLoadEnd={() => {
            if (displayAvatarUrl) {
              loadedProfileAvatarKeys.add(avatarKey);
              visibleProfileAvatarUrls.set(avatarKey, displayAvatarUrl);
            }
            setLoading((current) => (current ? false : current));
          }}
          onError={() => {
            setFailed(true);
            setLoading((current) => (current ? false : current));
          }}
        />
      ) : (
        <View style={styles.profileHeaderFallback}>
          <Text style={styles.profileHeaderFallbackText}>{initials}</Text>
        </View>
      )}
      {pendingAvatarSource ? (
        <ExpoImage
          pointerEvents="none"
          source={pendingAvatarSource}
          style={styles.profileHeaderAvatarPreload}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={`pending-${pendingAvatarUrl}`}
          onLoad={() => {
            if (!pendingAvatarUrl) return;
            loadedProfileAvatarKeys.add(avatarKey);
            visibleProfileAvatarUrls.set(avatarKey, pendingAvatarUrl);
            setDisplayAvatarUrl(pendingAvatarUrl);
            setPendingAvatarUrl(null);
          }}
          onError={() => setPendingAvatarUrl(null)}
        />
      ) : null}
      {showAvatar && loading ? (
        <View pointerEvents="none" style={styles.profileHeaderAvatarLoader}>
          <ActivityIndicator size="small" color="#FFFFFF" />
        </View>
      ) : null}
    </>
  );
}

const MemoCatalogProfileAvatar = React.memo(CatalogProfileAvatar);

const styles = StyleSheet.create({
  rightHeaderRow: {
    position: 'relative',
    minWidth: 86,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  profileHeaderAction: {
    position: 'absolute',
    right: -12,
    top: -12,
    width: 64,
    height: 70,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  profileHeaderActionPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.97 }],
  },
  profileHeaderAvatar: {
    width: '100%',
    height: '100%',
  },
  profileHeaderAvatarPreload: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
  },
  profileHeaderAvatarLoader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHeaderFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F766E',
  },
  profileHeaderFallbackText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  profileHeaderOffline: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
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
