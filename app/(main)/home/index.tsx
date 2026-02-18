import React from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';

import HomeActivityFeed from '@/components/Home/HomeActivityFeed';
import HomeHero from '@/components/Home/HomeHero';
import HomeMetricCard from '@/components/Home/HomeMetricCard';
import HomeQuickActions from '@/components/Home/HomeQuickActions';
import HomeScansMiniChart from '@/components/Home/HomeScansMiniChart';
import { HomeDashboardSkeleton } from '@/components/Home/HomeSkeleton';
import TabBarSpacer from '@/components/Navigation/TabBarSpacer';
import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';
import { AuthContext } from '@/context/AuthContext';
import { useHomeDashboardData } from '@/hooks/useHomeDashboardData';
import type { HomeMetricId } from '@/src/entities/home/types';
import { isMaxMiniAppLaunch, prepareMaxWebApp } from '@/utils/maxAuthService';
import { getServicesForUser, type ServiceAccessItem } from '@/utils/servicesService';

const PRIMARY_METRICS: HomeMetricId[] = ['open_appeals', 'my_tasks', 'daily_scans'];
const SECONDARY_METRICS: HomeMetricId[] = ['unread_messages', 'urgent_deadlines'];

export default function HomeScreen() {
  const router = useRouter();
  const auth = React.useContext(AuthContext);
  const reducedMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const topInsetFromHeader = useHeaderContentTopInset({ hasSubtitle: true });
  const isMaxLaunch = Platform.OS === 'web' && isMaxMiniAppLaunch();

  const { dashboard, refreshing, initialLoading, onRefresh } = useHomeDashboardData();
  const [servicesSnapshot, setServicesSnapshot] = React.useState<{ loaded: boolean; items: ServiceAccessItem[] }>({
    loaded: false,
    items: [],
  });

  React.useEffect(() => {
    if (!isMaxLaunch) return;
    prepareMaxWebApp();
  }, [isMaxLaunch]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const services = await getServicesForUser();
        if (!cancelled) {
          setServicesSnapshot({ loaded: true, items: services });
        }
      } catch {
        if (!cancelled) {
          setServicesSnapshot({ loaded: true, items: [] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isDesktop = Platform.OS === 'web' && width >= 1160;
  const isTablet = width >= 760;
  const isMobile = !isTablet;
  const isWebMobileLayout = Platform.OS === 'web' && width <= 820;
  const quickActionColumns: 2 | 4 = isDesktop ? 4 : 2;
  const metricsPerRow = isDesktop ? 3 : 2;
  const contentTopPadding =
    Platform.OS === 'web'
      ? isWebMobileLayout
        ? 20
        : topInsetFromHeader + (isMaxLaunch ? 0 : 20)
      : 20;

  const userName = React.useMemo(() => {
    const profile = auth?.profile;
    const byName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim();
    if (byName) return byName;
    if (profile?.email) return profile.email;
    return 'Команда';
  }, [auth?.profile]);

  const findService = React.useCallback(
    (key: string, routeFragment?: string) =>
      servicesSnapshot.items.find(
        (svc) =>
          svc.key === key ||
          (routeFragment ? String(svc.route || '').toLowerCase().includes(routeFragment.toLowerCase()) : false)
      ),
    [servicesSnapshot.items]
  );

  const appealsService = findService('appeals', '/appeals');
  const qrService = findService('qrcodes', '/qrcodes');
  const isQrVisible = qrService ? qrService.visible !== false : true;
  const isQrEnabled = qrService ? qrService.enabled !== false : true;

  const quickActions = React.useMemo(
    () => [
      {
        id: 'services',
        title: 'Сервисы',
        description: 'Каталог инструментов компании',
        icon: 'apps-outline',
        gradient: ['#38BDF8', '#2563EB'] as const,
        onPress: () => router.push('/services'),
      },
      {
        id: 'appeals',
        title: 'Обращения',
        description: 'Проверить обращения и ответы',
        icon: 'mail-open-outline',
        gradient: ['#818CF8', '#4F46E5'] as const,
        hidden: Boolean(appealsService && !appealsService.visible),
        enabled: appealsService ? appealsService.enabled !== false : true,
        statusLabel:
          appealsService && appealsService.enabled === false
            ? 'Недоступно для вашей роли'
            : undefined,
        onPress: () => router.push('/services/appeals'),
      },
      {
        id: 'qrcodes',
        title: 'QR-коды',
        description: 'Статистика и управление кодами',
        icon: 'qr-code-outline',
        gradient: ['#34D399', '#059669'] as const,
        hidden: Boolean(qrService && !qrService.visible),
        enabled: qrService ? qrService.enabled !== false : true,
        statusLabel:
          qrService && qrService.enabled === false
            ? 'Недоступно для вашей роли'
            : undefined,
        onPress: () => router.push('/services/qrcodes'),
      },
      {
        id: 'tasks',
        title: 'Задачи',
        description: 'Открыть список текущих задач',
        icon: 'checkbox-outline',
        gradient: ['#F59E0B', '#D97706'] as const,
        onPress: () => router.push('/tasks'),
      },
    ],
    [appealsService, qrService, router]
  );

  const primaryMetricIds = PRIMARY_METRICS.filter((id) => (id === 'daily_scans' ? isQrVisible : true));
  const primaryMetrics = primaryMetricIds.map((id) => {
    const metric = dashboard.metrics[id];
    if (id === 'daily_scans' && !isQrEnabled) {
      return {
        ...metric,
        state: 'locked' as const,
        value: null,
        hint: 'Сервис QR-кодов недоступен для вашей роли или отдела',
      };
    }
    return metric;
  });
  const secondaryMetrics = SECONDARY_METRICS.map((id) => dashboard.metrics[id]);
  const allMetrics = [...primaryMetrics, ...secondaryMetrics];
  const activityMaxHeight = isDesktop ? 540 : 300;

  const content = (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.scrollContent, { paddingTop: contentTopPadding }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.page}>
        <HomeHero
          userName={userName}
          updatedAt={dashboard.lastUpdatedAt}
          onOpenServices={() => router.push('/services')}
        />

        <HomeQuickActions actions={quickActions} columns={quickActionColumns} />

        {initialLoading ? (
          <HomeDashboardSkeleton />
        ) : (
          <View style={[styles.mainGrid, isDesktop ? styles.mainGridDesktop : null]}>
            <Animated.View
              entering={reducedMotion ? undefined : FadeInUp.delay(80).duration(360)}
              style={styles.leftColumn}
            >
              <View style={[styles.sectionHeader, styles.sectionCard, isMobile ? styles.sectionCardMobile : null]}>
                <View style={styles.sectionTitleWrap}>
                  <Ionicons name="speedometer-outline" size={isMobile ? 16 : 18} color="#0F172A" />
                  <Text style={[styles.sectionTitle, isMobile ? styles.sectionTitleMobile : null]}>
                    Ключевые показатели
                  </Text>
                </View>
                <Text style={[styles.sectionHint, isMobile ? styles.sectionHintMobile : null]}>
                  Обновление каждые 30 секунд
                </Text>
              </View>

              <View style={styles.metricsGrid}>
                {allMetrics.map((metric, index) => {
                  const isLast = index === allMetrics.length - 1;
                  const isOddCount = allMetrics.length % 2 === 1;
                  const stretchLastMobile = isMobile && metricsPerRow === 2 && isOddCount && isLast;
                  return (
                    <View
                      key={metric.id}
                      style={{ width: stretchLastMobile ? '100%' : `${100 / metricsPerRow}%`, padding: 5 }}
                    >
                      <HomeMetricCard
                        compact={isMobile}
                        metric={metric}
                        delay={70 + index * 40}
                        onPress={metric.state === 'ready' ? () => router.push('/services/appeals') : undefined}
                      />
                    </View>
                  );
                })}
              </View>

              {isQrVisible ? (
                <HomeScansMiniChart
                  series={dashboard.scansSeries}
                  state={isQrEnabled ? dashboard.scansSeriesState : 'locked'}
                  message={
                    isQrEnabled
                      ? dashboard.scansSeriesMessage
                      : 'Сервис QR-кодов недоступен для вашей роли или отдела'
                  }
                  onPress={isQrEnabled ? () => router.push('/services/qrcodes/analytics') : undefined}
                  disabled={!isQrEnabled}
                />
              ) : null}
            </Animated.View>

            <View style={[styles.rightColumn, isDesktop ? styles.rightColumnDesktop : null]}>
              <HomeActivityFeed
                items={dashboard.activity}
                state={dashboard.activityState}
                message={dashboard.activityMessage}
                onOpenItem={(item) => router.push(item.route as any)}
                maxListHeight={activityMaxHeight}
              />
            </View>
          </View>
        )}
      </View>

      <TabBarSpacer extra={66} />
      {Platform.OS === 'web' ? <View style={{ height: 18 }} /> : null}
    </ScrollView>
  );

  if (Platform.OS === 'web') {
    return <View style={styles.safe}>{content}</View>;
  }

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safe}>
      {content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F0F4FF',
  },
  scroll: {
    flex: 1,
    backgroundColor: '#F0F4FF',
  },
  scrollContent: {
    width: '100%',
    paddingBottom: 20,
  },
  page: {
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center',
    gap: 14,
    paddingHorizontal: 14,
  },
  mainGrid: {
    gap: 14,
  },
  mainGridDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  leftColumn: {
    flex: 1.6,
    gap: 12,
  },
  rightColumn: {
    width: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
    marginTop: 8,
  },
  rightColumnDesktop: {
    flex: 1,
    minWidth: 320,
    marginTop: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#EEF2FF',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  sectionCardMobile: {
    paddingVertical: 8,
  },
  sectionTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    color: '#0F172A',
    fontWeight: '900',
    fontSize: 17,
  },
  sectionTitleMobile: {
    fontSize: 15,
  },
  sectionHint: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionHintMobile: {
    fontSize: 11,
    flexShrink: 1,
    textAlign: 'right',
    maxWidth: 136,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -5,
  },
});
