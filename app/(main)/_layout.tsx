// app/(main)/_layout.tsx
import Navigation from '@/components/Navigation/Navigation';
import { AuthContext } from '@/context/AuthContext';
import { useAppealUpdates } from '@/hooks/useAppealUpdates';
import { useNotify } from '@/components/NotificationHost';
import { normalizeRoutePath } from '@/src/shared/lib/routePath';
import { startAppealsOutboxAutoFlush, stopAppealsOutboxAutoFlush } from '@/src/features/appeals/sync/outbox';
import { bindPushNavigation } from '@/utils/pushNotifications';
import { getProfileGate } from '@/utils/profileGate';
import {
  getAppealMuteStatus,
  getNotificationSettings,
  type NotificationSettings,
} from '@/utils/notificationSettingsService';
import { usePathname, useRouter } from 'expo-router';
import React, { useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

function AppealsNotificationsBridge() {
  const auth = useContext(AuthContext);
  const router = useRouter();
  const pathname = usePathname();
  const notify = useNotify();
  const shownRef = useRef<Set<string>>(new Set());
  const settingsCacheRef = useRef<{
    value: NotificationSettings | null;
    ts: number;
    inFlight: Promise<NotificationSettings | null> | null;
  }>({ value: null, ts: 0, inFlight: null });
  const muteCacheRef = useRef<Map<number, { value: boolean; ts: number }>>(new Map());
  const muteInFlightRef = useRef<Map<number, Promise<boolean>>>(new Map());
  const SETTINGS_TTL_MS = 30_000;
  const MUTE_TTL_MS = 15_000;

  const userId = auth?.profile?.id;
  const departmentIds = useMemo(() => {
    const ids = new Set<number>();
    (auth?.profile?.departmentRoles || []).forEach((dr) => {
      if (dr.department?.id) ids.add(dr.department.id);
    });
    if (auth?.profile?.employeeProfile?.department?.id) {
      ids.add(auth.profile.employeeProfile.department.id);
    }
    return Array.from(ids);
  }, [auth?.profile?.departmentRoles, auth?.profile?.employeeProfile?.department?.id]);

  useEffect(() => {
    if (!auth?.isAuthenticated) return;
    let cleanup: (() => void) | undefined;
    bindPushNavigation((appealId) => {
      router.push(`/(main)/services/appeals/${appealId}` as any);
    })
      .then((cb) => {
        cleanup = cb;
      })
      .catch((error) => {
        console.warn('[push] navigation binding failed', error);
      });
    return () => {
      cleanup?.();
    };
  }, [auth?.isAuthenticated, router]);

  const rememberShown = useCallback((key: string) => {
    if (!key) return false;
    if (shownRef.current.has(key)) return false;
    shownRef.current.add(key);
    if (shownRef.current.size > 220) {
      const next = Array.from(shownRef.current).slice(-140);
      shownRef.current = new Set(next);
    }
    return true;
  }, []);

  const loadSettings = useCallback(
    async (force = false): Promise<NotificationSettings | null> => {
      const now = Date.now();
      const cached = settingsCacheRef.current;
      if (!force && cached.value && now - cached.ts < SETTINGS_TTL_MS) return cached.value;
      if (!force && cached.inFlight) return cached.inFlight;

      const req = getNotificationSettings()
        .then((settings) => {
          settingsCacheRef.current = {
            value: settings ?? null,
            ts: Date.now(),
            inFlight: null,
          };
          return settings ?? null;
        })
        .catch(() => {
          settingsCacheRef.current = {
            value: null,
            ts: Date.now(),
            inFlight: null,
          };
          return null;
        });

      settingsCacheRef.current = {
        value: cached.value,
        ts: cached.ts,
        inFlight: req,
      };
      return req;
    },
    []
  );

  const loadAppealMuted = useCallback(async (appealId: number): Promise<boolean> => {
    const now = Date.now();
    const cached = muteCacheRef.current.get(appealId);
    if (cached && now - cached.ts < MUTE_TTL_MS) return cached.value;

    const existingInFlight = muteInFlightRef.current.get(appealId);
    if (existingInFlight) return existingInFlight;

    const req = getAppealMuteStatus(appealId)
      .then((muted) => {
        muteCacheRef.current.set(appealId, { value: !!muted, ts: Date.now() });
        muteInFlightRef.current.delete(appealId);
        return !!muted;
      })
      .catch(() => {
        // Safe default: при неизвестном состоянии не показываем in-app уведомление.
        muteCacheRef.current.set(appealId, { value: true, ts: Date.now() });
        muteInFlightRef.current.delete(appealId);
        return true;
      });

    muteInFlightRef.current.set(appealId, req);
    return req;
  }, []);

  const canShowInApp = useCallback(
    async (
      appealId: number,
      key: 'pushNewMessage' | 'pushStatusChanged' | 'pushDeadlineChanged'
    ): Promise<boolean> => {
      const settings = await loadSettings(false);
      if (!settings) return false;
      if (!settings.inAppNotificationsEnabled) return false;
      if (!settings[key]) return false;
      const muted = await loadAppealMuted(appealId);
      if (muted) return false;
      return true;
    },
    [loadAppealMuted, loadSettings]
  );

  useEffect(() => {
    settingsCacheRef.current = { value: null, ts: 0, inFlight: null };
    muteCacheRef.current.clear();
    muteInFlightRef.current.clear();
    if (auth?.isAuthenticated) {
      void loadSettings(true);
    }
  }, [auth?.isAuthenticated, userId, loadSettings]);

  useEffect(() => {
    if (!auth?.isAuthenticated) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void loadSettings(true);
      }
    });
    return () => sub.remove();
  }, [auth?.isAuthenticated, loadSettings]);

  const handleEvent = useCallback(
    (evt: any) => {
      void (async () => {
        const eventName = evt?.event || evt?.eventType || evt?.type;
        const appealId = Number(evt?.appealId);
        if (!Number.isFinite(appealId) || appealId <= 0) return;

        const isAppealsList = pathname === '/services/appeals' || pathname === '/services/appeals/';
        const chatMatch = pathname?.match(/^\/services\/appeals\/(\d+)$/);
        const activeAppealId = chatMatch ? Number(chatMatch[1]) : null;

        if (eventName === 'messageAdded') {
          if (isAppealsList) return;
          if (activeAppealId && activeAppealId === appealId) return;
          if (evt?.senderId === userId || evt?.sender?.id === userId) return;
          if (evt?.type === 'SYSTEM') {
            const systemType = evt?.systemEvent?.type;
            if (systemType === 'assignees_changed' || systemType === 'department_changed') return;
          }

          const allowed = await canShowInApp(appealId, 'pushNewMessage');
          if (!allowed) return;

          const messageId = Number(evt?.id || evt?.messageId);
          const key = Number.isFinite(messageId)
            ? `appeal-msg-${appealId}-${messageId}`
            : `appeal-msg-${appealId}-${evt?.createdAt || Date.now()}`;
          if (!rememberShown(key)) return;

          const senderName =
            evt?.senderName ||
            [evt?.sender?.firstName, evt?.sender?.lastName].filter(Boolean).join(' ').trim() ||
            evt?.sender?.email ||
            'Пользователь';
          const snippet = evt?.text ? String(evt.text).trim() : '';
          const messageText = snippet || '[Вложение]';
          const appealNumber = Number(evt?.appealNumber) || appealId;
          const dismissKeys = [`appeal:${appealId}`];
          if (Number.isFinite(messageId) && messageId > 0) {
            dismissKeys.push(`appeal-message:${messageId}`);
          }

          notify({
            id: key,
            title: `Обращение #${appealNumber}`,
            message: `${senderName}: ${messageText}`,
            type: 'info',
            icon: 'chatbubble-ellipses-outline',
            avatarUrl: evt?.sender?.avatarUrl || evt?.senderAvatarUrl || '',
            durationMs: 6000,
            dismissKeys,
            onPress: () => {
              router.push(`/(main)/services/appeals/${appealId}` as any);
            },
          });
          return;
        }

        if (eventName === 'statusUpdated' || eventName === 'deadlineUpdated') {
          if (activeAppealId && activeAppealId === appealId) return;
          const allowed = await canShowInApp(
            appealId,
            eventName === 'statusUpdated' ? 'pushStatusChanged' : 'pushDeadlineChanged'
          );
          if (!allowed) return;

          const key = `${eventName}-${appealId}-${evt?.status || evt?.deadline || Date.now()}`;
          if (!rememberShown(key)) return;

          const appealNumber = Number(evt?.appealNumber) || appealId;
          const statusMap: Record<string, string> = {
            OPEN: 'Открыто',
            IN_PROGRESS: 'В работе',
            RESOLVED: 'Ожидание подтверждения',
            COMPLETED: 'Завершено',
            DECLINED: 'Отклонено',
          };
          const message =
            eventName === 'statusUpdated'
              ? `Статус изменён: ${statusMap[String(evt?.status)] || String(evt?.status || 'обновлён')}`
              : 'Дедлайн обращения изменён';

          notify({
            id: key,
            title: `Обращение #${appealNumber}`,
            message,
            type: 'info',
            icon: eventName === 'statusUpdated' ? 'swap-horizontal-outline' : 'time-outline',
            durationMs: 6000,
            dismissKeys: [`appeal:${appealId}`],
            onPress: () => {
              router.push(`/(main)/services/appeals/${appealId}` as any);
            },
          });
          return;
        }

        if (eventName === 'appealNotify') {
          if (activeAppealId && activeAppealId === appealId) return;
          const allowed = await canShowInApp(appealId, 'pushStatusChanged');
          if (!allowed) return;

          const key =
            String(evt?.dedupeKey || '').trim() ||
            `appeal-notify-${evt?.kind || 'event'}-${appealId}-${evt?.actorId || 0}-${evt?.message || ''}`;
          if (!rememberShown(key)) return;

          const appealNumber = Number(evt?.appealNumber) || appealId;
          notify({
            id: key,
            title: evt?.title || `Обращение #${appealNumber}`,
            message: String(evt?.message || 'Обновление по обращению'),
            type: 'info',
            icon: evt?.icon || 'notifications-outline',
            durationMs: 6000,
            dismissKeys: [`appeal:${appealId}`],
            onPress: () => {
              router.push(`/(main)/services/appeals/${appealId}` as any);
            },
          });
        }
      })();
    },
    [canShowInApp, notify, pathname, rememberShown, router, userId]
  );

  useAppealUpdates(
    undefined,
    handleEvent,
    userId,
    departmentIds
  );

  return null;
}

export default function MainLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const auth = useContext(AuthContext);
  const lastRedirectRef = useRef('');

  useEffect(() => {
    void startAppealsOutboxAutoFlush();
    return () => {
      stopAppealsOutboxAutoFlush();
    };
  }, []);

  useEffect(() => {
    if (!auth) return;
    if (auth.isLoading) return;

    let target: string | null = null;
    const gate = getProfileGate(auth.profile);
    if (!auth.isAuthenticated) {
      target = '/(auth)/AuthScreen';
    } else if (gate === 'pending') {
      target = '/(auth)/ProfilePendingScreen';
    } else if (gate === 'blocked') {
      target = '/(auth)/ProfileBlockedScreen';
    } else if (gate === 'none') {
      target = '/ProfileSelectionScreen';
    }

    if (!target) {
      lastRedirectRef.current = '';
      return;
    }

    const currentPath = normalizeRoutePath(pathname);
    const targetPath = normalizeRoutePath(target);
    if (currentPath === targetPath) {
      lastRedirectRef.current = '';
      return;
    }
    if (lastRedirectRef.current === targetPath) return;
    lastRedirectRef.current = targetPath;
    router.replace(target as any);
  }, [auth, pathname, router]);

  return (
    <View style={styles.container}>
      <AppealsNotificationsBridge />

      {/* Общие UI элементы */}
      {/* <AppHeader /> */}
      <Navigation />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
