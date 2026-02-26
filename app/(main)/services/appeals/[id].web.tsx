import AppealDetailContent from '@/components/Appeals/AppealDetailContent';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View, useWindowDimensions } from 'react-native';
import useWebSidebarMetrics from '@/hooks/useWebSidebarMetrics';
import {
  DESKTOP_LEFT_PAGE_INSET,
  DESKTOP_SPLIT_ENTER_WIDTH,
  DESKTOP_SPLIT_EXIT_WIDTH,
  WEB_SIDEBAR_BREAKPOINT,
} from '@/components/Appeals/desktopLayoutConfig';

const APPEAL_FORCE_PAGE_ONCE_KEY = 'lp:appeals:force-page-once:v1';

export default function AppealDetailWebScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { sidebarWidthPx, ready: sidebarReady } = useWebSidebarMetrics();
  const { id, forcePage, backTo } = useLocalSearchParams<{ id: string; forcePage?: string; backTo?: string }>();
  const appealId = Number(id);
  const fromAnalytics = String(backTo || '').toLowerCase() === 'analytics';
  const [forcePageOnce] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const raw = window.sessionStorage.getItem(APPEAL_FORCE_PAGE_ONCE_KEY);
      if (!raw) return false;
      window.sessionStorage.removeItem(APPEAL_FORCE_PAGE_ONCE_KEY);
      const parsed = JSON.parse(raw) as { appealId?: number; at?: number };
      if (Number(parsed.appealId) !== appealId) return false;
      const ts = Number(parsed.at || 0);
      if (!Number.isFinite(ts) || Date.now() - ts > 15000) return false;
      return true;
    } catch {
      return false;
    }
  });
  const forcePageMode = fromAnalytics || forcePage === '1' || forcePageOnce;
  const usesWebSidebar = width > WEB_SIDEBAR_BREAKPOINT;
  const effectiveContentWidth = Math.max(0, width - (usesWebSidebar ? sidebarWidthPx : 0));
  const splitBasisWidth = Math.max(0, effectiveContentWidth - DESKTOP_LEFT_PAGE_INSET);
  const [splitEligible, setSplitEligible] = useState(false);
  const splitDecisionReady = !usesWebSidebar || sidebarReady;
  const canReturnToSplit = splitDecisionReady && splitBasisWidth >= DESKTOP_SPLIT_ENTER_WIDTH;
  const allowAutoReturn = forcePage === '1' && !fromAnalytics;

  useEffect(() => {
    if (!allowAutoReturn) return;
    if (!forcePageMode) return;
    if (!canReturnToSplit) return;
    if (!Number.isFinite(appealId) || appealId <= 0) return;
    router.replace(`/services/appeals?appealId=${appealId}` as any);
  }, [allowAutoReturn, appealId, canReturnToSplit, forcePageMode, router]);

  useEffect(() => {
    if (forcePageMode) {
      setSplitEligible(false);
      return;
    }
    if (!splitDecisionReady) return;
    setSplitEligible((prev) => (prev ? splitBasisWidth >= DESKTOP_SPLIT_EXIT_WIDTH : splitBasisWidth >= DESKTOP_SPLIT_ENTER_WIDTH));
  }, [forcePageMode, splitBasisWidth, splitDecisionReady]);

  const isDesktopSplit = !forcePageMode && splitDecisionReady && splitEligible;

  useEffect(() => {
    if (!isDesktopSplit || !Number.isFinite(appealId) || appealId <= 0) return;
    router.replace(`/services/appeals?appealId=${appealId}` as any);
  }, [appealId, isDesktopSplit, router]);

  if (isDesktopSplit) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="small" color="#6B7280" />
      </View>
    );
  }

  return <AppealDetailContent appealId={appealId} mode="page" />;
}
