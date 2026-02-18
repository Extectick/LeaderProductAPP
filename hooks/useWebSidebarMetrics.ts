import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  WEB_SIDEBAR_COLLAPSE_STORAGE_KEY,
  WEB_SIDEBAR_STATE_EVENT,
  getPersistedWebSidebarCollapsed,
  getWebSidebarWidthByCollapsed,
  isWebSidebarStateDetail,
  type WebSidebarStateEventDetail,
} from '@/components/Navigation/sidebarEvents';

type SidebarMetrics = {
  sidebarWidthPx: number;
  sidebarCollapsed: boolean;
  ready: boolean;
};

function getInitialMetrics(): SidebarMetrics {
  if (Platform.OS !== 'web') {
    return { sidebarWidthPx: 0, sidebarCollapsed: false, ready: true };
  }
  const collapsed = getPersistedWebSidebarCollapsed();
  return {
    sidebarWidthPx: getWebSidebarWidthByCollapsed(collapsed),
    sidebarCollapsed: collapsed,
    ready: false,
  };
}

export default function useWebSidebarMetrics(): SidebarMetrics {
  const [metrics, setMetrics] = useState<SidebarMetrics>(() => getInitialMetrics());
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<WebSidebarStateEventDetail | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const applyDetail = (detail: WebSidebarStateEventDetail) => {
      const width = Math.max(0, Math.round(detail.width));
      if (!Number.isFinite(width) || width <= 0) return;
      setMetrics((prev) => {
        const sameWidth = Math.abs(prev.sidebarWidthPx - width) < 1;
        if (sameWidth && prev.sidebarCollapsed === detail.collapsed && prev.ready) {
          return prev;
        }
        return {
          sidebarWidthPx: width,
          sidebarCollapsed: detail.collapsed,
          ready: true,
        };
      });
    };

    const flushPending = () => {
      rafRef.current = null;
      const next = pendingRef.current;
      pendingRef.current = null;
      if (next) applyDetail(next);
    };

    const schedule = (detail: WebSidebarStateEventDetail) => {
      pendingRef.current = detail;
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(flushPending);
    };

    const syncFromStorage = () => {
      const collapsed = getPersistedWebSidebarCollapsed();
      schedule({
        collapsed,
        width: getWebSidebarWidthByCollapsed(collapsed),
        phase: 'end',
      });
    };

    const onSidebarState = (event: Event) => {
      const customEvent = event as CustomEvent<unknown>;
      if (!isWebSidebarStateDetail(customEvent.detail)) return;
      schedule(customEvent.detail);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== WEB_SIDEBAR_COLLAPSE_STORAGE_KEY) return;
      syncFromStorage();
    };

    syncFromStorage();
    window.addEventListener(WEB_SIDEBAR_STATE_EVENT, onSidebarState as EventListener);
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener(WEB_SIDEBAR_STATE_EVENT, onSidebarState as EventListener);
      window.removeEventListener('storage', onStorage);
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      pendingRef.current = null;
    };
  }, []);

  return metrics;
}
