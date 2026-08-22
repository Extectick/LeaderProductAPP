import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, Text, View, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOptionalTabBarVisibility } from '@/components/Navigation/TabBarVisibilityContext';
import { useServicesHeaderSlot } from '@/src/features/services/headerSlotContext';
import { CounterpartyBottomTabs, COUNTERPARTY_TABS } from '../components/CounterpartyBottomTabs';
import { CounterpartySkeleton, SectionUnavailable } from '../components/CounterpartyCardPrimitives';
import CounterpartyPager, {
  type CounterpartyPagerRef,
  type PageScrollStateChangedNativeEventData,
  type PagerViewOnPageScrollEvent,
  type PagerViewOnPageSelectedEvent,
} from '../components/CounterpartyPager';
import { CounterpartyActivityTab } from '../components/sections/CounterpartyActivityTab';
import { CounterpartyFinanceTab } from '../components/sections/CounterpartyFinanceTab';
import { CounterpartyOverviewTab } from '../components/sections/CounterpartyOverviewTab';
import { CounterpartyProfileTab } from '../components/sections/CounterpartyProfileTab';
import { useCounterpartyCard } from '../hooks/useCounterpartyCard';
import type { CounterpartyCardTab, CounterpartyOrganizationSummary, CounterpartySalesPeriod } from '../model/counterpartyCard.types';
import { MetricInfoProvider } from '../components/MetricInfoDialog';

const INDEX_BY_TAB = new Map(COUNTERPARTY_TABS.map((tab, index) => [tab.key, index]));

function firstParam(value: string | string[] | undefined) {
  return String(Array.isArray(value) ? value[0] || '' : value || '').trim();
}

function validInitialTab(value: string): CounterpartyCardTab {
  return COUNTERPARTY_TABS.some((tab) => tab.key === value) ? value as CounterpartyCardTab : 'overview';
}

export default function CounterpartyCardScreen() {
  const params = useLocalSearchParams<{ counterpartyGuid?: string | string[]; organizationGuid?: string | string[]; sourceOrderGuid?: string | string[]; initialTab?: string | string[] }>();
  const counterpartyGuid = firstParam(params.counterpartyGuid);
  const initialOrganizationGuid = firstParam(params.organizationGuid) || null;
  const [organizationGuid, setOrganizationGuid] = React.useState<string | null>(initialOrganizationGuid);
  const [organizationMenuOpen, setOrganizationMenuOpen] = React.useState(false);
  const [period, setPeriod] = React.useState<CounterpartySalesPeriod>('month');
  const [customRange, setCustomRange] = React.useState<{ from: string; to: string } | null>(null);
  const initialTab = validInitialTab(firstParam(params.initialTab));
  const [activeTab, setActiveTab] = React.useState<CounterpartyCardTab>(initialTab);
  const visitedRef = React.useRef(new Set<CounterpartyCardTab>([initialTab, 'overview']));
  const pagerRef = React.useRef<CounterpartyPagerRef>(null);
  const activeIndexRef = React.useRef(INDEX_BY_TAB.get(initialTab) || 0);
  const settledIndexRef = React.useRef(activeIndexRef.current);
  const draggingRef = React.useRef(false);
  const pendingPageFrameRef = React.useRef<number | null>(null);
  const router = useRouter();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { setHeaderOverride } = useServicesHeaderSlot();
  const tabBarVisibility = useOptionalTabBarVisibility();
  const setTabBarHidden = tabBarVisibility?.setHidden;
  const card = useCounterpartyCard(counterpartyGuid, organizationGuid, period, customRange);

  React.useLayoutEffect(() => {
    setHeaderOverride({ hidden: true });
    setTabBarHidden?.(true);
    return () => {
      setHeaderOverride(null);
      setTabBarHidden?.(false);
    };
  }, [setHeaderOverride, setTabBarHidden]);

  const activateTab = React.useCallback((tab: CounterpartyCardTab) => {
    const index = INDEX_BY_TAB.get(tab) || 0;
    visitedRef.current.add(tab);
    activeIndexRef.current = index;
    setActiveTab(tab);
  }, []);

  const selectTab = React.useCallback((tab: CounterpartyCardTab) => {
    const index = INDEX_BY_TAB.get(tab) || 0;
    if (index === activeIndexRef.current && index === settledIndexRef.current) return;

    activateTab(tab);
    if (pendingPageFrameRef.current !== null) cancelAnimationFrame(pendingPageFrameRef.current);
    pendingPageFrameRef.current = requestAnimationFrame(() => {
      pendingPageFrameRef.current = null;
      settledIndexRef.current = index;
      pagerRef.current?.setPageWithoutAnimation(index);
    });
  }, [activateTab]);

  React.useEffect(() => () => {
    if (pendingPageFrameRef.current !== null) cancelAnimationFrame(pendingPageFrameRef.current);
  }, []);

  const onPageSelected = React.useCallback((event: PagerViewOnPageSelectedEvent) => {
    const index = event.nativeEvent.position;
    settledIndexRef.current = index;
    activateTab(COUNTERPARTY_TABS[index]?.key || 'overview');
  }, [activateTab]);

  const onPageScrollStateChanged = React.useCallback((event: NativeSyntheticEvent<PageScrollStateChangedNativeEventData>) => {
    const state = event.nativeEvent.pageScrollState;
    draggingRef.current = state === 'dragging';
    if (state === 'idle') activateTab(COUNTERPARTY_TABS[settledIndexRef.current]?.key || 'overview');
  }, [activateTab]);

  const onPageScroll = React.useCallback((event: PagerViewOnPageScrollEvent) => {
    if (!draggingRef.current) return;
    const coordinate = event.nativeEvent.position + event.nativeEvent.offset;
    const target = Math.max(0, Math.min(COUNTERPARTY_TABS.length - 1, Math.round(coordinate)));
    if (target !== activeIndexRef.current) activateTab(COUNTERPARTY_TABS[target]?.key || 'overview');
  }, [activateTab]);

  const close = React.useCallback(() => {
    if (organizationMenuOpen) { setOrganizationMenuOpen(false); return; }
    if (navigation.canGoBack?.()) navigation.goBack();
    else router.replace('/services/client_orders' as any);
  }, [navigation, organizationMenuOpen, router]);
  React.useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => subscription.remove();
  }, [close]);
  React.useEffect(() => {
    if (!organizationMenuOpen) return undefined;
    return navigation.addListener?.('beforeRemove', (event: any) => {
      event.preventDefault();
      setOrganizationMenuOpen(false);
    });
  }, [navigation, organizationMenuOpen]);
  const title = card.data?.identity.name || 'Контрагент';
  const financeVisited = activeTab === 'finance' || visitedRef.current.has('finance');
  const organizationOptions = card.data?.organizationOptions || card.data?.context.availableOrganizations || [];
  const selectOrganization = React.useCallback((organization: CounterpartyOrganizationSummary) => {
    setOrganizationGuid(organization.guid);
    setOrganizationMenuOpen(false);
  }, []);

  return (
    <MetricInfoProvider>
    <View style={[styles.root, { paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 10 : 0) }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Назад" onPress={close} hitSlop={10} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#334155" />
        </Pressable>
        <View style={styles.headerText}>
          <Text numberOfLines={1} style={styles.title}>{title}</Text>
          <Pressable disabled={!organizationOptions.length} onPress={() => setOrganizationMenuOpen((value) => !value)} style={styles.organizationTrigger}>
            <Text numberOfLines={1} style={styles.subtitle}>{card.data?.context.organizationName || 'Выберите организацию'}</Text>
            {organizationOptions.length ? <MaterialCommunityIcons name="chevron-down" size={15} color="#64748B" /> : null}
          </Pressable>
        </View>
      </View>
      {card.data?.financeSummary?.shipmentProhibited ? <Pressable accessibilityRole="button" accessibilityLabel="Отгрузка запрещена. Открыть раздел Деньги" onPress={() => selectTab('finance')} style={({ pressed }) => [styles.shipmentAlert, pressed && styles.shipmentAlertPressed]}><MaterialCommunityIcons name="alert-circle-outline" size={19} color="#DC2626" /><Text style={styles.shipmentAlertText}>Отгрузка запрещена</Text></Pressable> : null}
      {organizationMenuOpen ? (
        <View style={styles.organizationOverlay}><Pressable style={StyleSheet.absoluteFill} onPress={() => setOrganizationMenuOpen(false)} /><View style={styles.organizationMenu}>
          {organizationOptions.map((organization) => (
            <Pressable key={organization.guid} onPress={() => selectOrganization(organization)} style={[styles.organizationOption, organization.guid === organizationGuid && styles.organizationOptionActive]}>
              <MaterialCommunityIcons name={organization.guid === organizationGuid ? 'radiobox-marked' : 'radiobox-blank'} size={18} color={organization.guid === organizationGuid ? '#2563EB' : '#94A3B8'} />
              <Text style={[styles.organizationOptionText, organization.guid === organizationGuid && styles.organizationOptionTextActive]}>{organization.name}</Text>
            </Pressable>
          ))}
        </View></View>
      ) : null}

      {!counterpartyGuid ? (
        <SectionUnavailable />
      ) : card.loading && !card.data ? (
        <>
          <CounterpartySkeleton tab={activeTab} />
          <View style={{ paddingBottom: insets.bottom }}><CounterpartyBottomTabs active={activeTab} onSelect={selectTab} /></View>
        </>
      ) : card.error && !card.data ? (
        <View style={styles.fullError}>
          <SectionUnavailable onRetry={card.retry} />
          <Text style={styles.errorText}>{card.error}</Text>
        </View>
      ) : card.data ? (
        <>
          {card.error ? <Pressable onPress={card.retry} style={styles.partialError}><Text numberOfLines={2} style={styles.partialErrorText}>{card.error}. Нажмите, чтобы повторить.</Text></Pressable> : null}
          <CounterpartyPager
            ref={pagerRef}
            style={styles.pager}
            initialPage={INDEX_BY_TAB.get(initialTab) || 0}
            onPageSelected={onPageSelected}
            onPageScroll={onPageScroll}
            onPageScrollStateChanged={onPageScrollStateChanged}
            offscreenPageLimit={1}
            overScrollMode="never"
            keyboardDismissMode="on-drag"
          >
            <View key="overview" collapsable={false} style={styles.page}>
              <CounterpartyOverviewTab
                data={card.data}
                refreshing={card.refreshing}
                onRefresh={card.refresh}
                onRetry={card.retry}
                periodLoading={card.loading}
                period={period}
                customRange={customRange}
                onPeriodChange={setPeriod}
                onCustomPeriodApply={(range) => {
                  setCustomRange(range);
                  setPeriod('custom');
                }}
              />
            </View>
            <View key="finance" collapsable={false} style={styles.page}>
              <CounterpartyFinanceTab data={card.data} refreshing={card.refreshing} loading={card.loading} onRefresh={card.refresh} onRetry={card.retry} organizationSelected={Boolean(organizationGuid)} renderChart={financeVisited} period={period} customRange={customRange} onPeriodChange={setPeriod} onCustomPeriodApply={(range) => { setCustomRange(range); setPeriod('custom'); }} />
            </View>
            <View key="activity" collapsable={false} style={styles.page}>
              {visitedRef.current.has('activity') || activeTab === 'activity' ? <CounterpartyActivityTab data={card.data} refreshing={card.refreshing} onRefresh={card.refresh} onRetry={card.retry} /> : null}
            </View>
            <View key="profile" collapsable={false} style={styles.page}>
              {visitedRef.current.has('profile') || activeTab === 'profile' ? <CounterpartyProfileTab data={card.data} refreshing={card.refreshing} onRefresh={card.refresh} onRetry={card.retry} /> : null}
            </View>
          </CounterpartyPager>
          <View style={{ paddingBottom: insets.bottom }}><CounterpartyBottomTabs active={activeTab} onSelect={selectTab} /></View>
        </>
      ) : null}
    </View></MetricInfoProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderBottomColor: '#DCE5F1', backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 8 },
  back: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
  pressed: { opacity: 0.65 },
  headerText: { flex: 1, minWidth: 0 },
  title: { color: '#0F172A', fontSize: 16, fontWeight: '900' },
  subtitle: { color: '#64748B', fontSize: 11, fontWeight: '600', marginTop: 2 },
  organizationTrigger: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', maxWidth: '100%' },
  organizationOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 20, elevation: 20 },
  organizationMenu: { position: 'absolute', top: 62, left: 55, right: 10, borderWidth: 1, borderColor: '#DCE5F1', borderRadius: 12, backgroundColor: '#FFFFFF', paddingVertical: 5, shadowColor: '#0F172A', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  organizationOption: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, paddingVertical: 7 },
  organizationOptionActive: { backgroundColor: '#EFF6FF' },
  organizationOptionText: { flex: 1, color: '#334155', fontSize: 13, fontWeight: '700' },
  organizationOptionTextActive: { color: '#1D4ED8', fontWeight: '900' },
  pager: { flex: 1, backgroundColor: '#FFFFFF' },
  page: { flex: 1, backgroundColor: '#FFFFFF' },
  fullError: { flex: 1, justifyContent: 'center' },
  errorText: { color: '#B91C1C', fontSize: 12, fontWeight: '600', textAlign: 'center', paddingHorizontal: 24, marginTop: -34 },
  partialError: { backgroundColor: '#FFF7ED', paddingHorizontal: 12, paddingVertical: 7 },
  partialErrorText: { color: '#9A3412', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  shipmentAlert: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#FCA5A5', backgroundColor: '#FFF1F2', paddingHorizontal: 12, paddingVertical: 5 },
  shipmentAlertPressed: { backgroundColor: '#FFE4E6' },
  shipmentAlertText: { color: '#B91C1C', fontSize: 12.5, lineHeight: 18, fontWeight: '900' },
});
