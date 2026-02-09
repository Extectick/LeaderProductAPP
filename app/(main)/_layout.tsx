// app/(main)/_layout.tsx
import Navigation from '@/components/Navigation/Navigation';
import { AuthContext } from '@/context/AuthContext';
import { useAppealUpdates } from '@/hooks/useAppealUpdates';
import { useNotify } from '@/components/NotificationHost';
import { bindPushNavigation } from '@/utils/pushNotifications';
import { getProfileGate } from '@/utils/profileGate';
import { usePathname, useRouter } from 'expo-router';
import React, { useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

function AppealsNotificationsBridge() {
  const auth = useContext(AuthContext);
  const router = useRouter();
  const pathname = usePathname();
  const notify = useNotify();
  const shownRef = useRef<Set<string>>(new Set());

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

  const handleEvent = useCallback(
    (evt: any) => {
      const eventName = evt?.event || evt?.eventType || evt?.type;
      if (eventName !== 'messageAdded') return;
      const appealId = Number(evt?.appealId);
      if (!Number.isFinite(appealId) || appealId <= 0) return;
      if (evt?.senderId === userId || evt?.sender?.id === userId) return;

      const isAppealsList = pathname === '/services/appeals' || pathname === '/services/appeals/';
      const chatMatch = pathname?.match(/^\/services\/appeals\/(\d+)$/);
      const activeAppealId = chatMatch ? Number(chatMatch[1]) : null;
      if (isAppealsList) return;
      if (activeAppealId && activeAppealId === appealId) return;

      const messageId = Number(evt?.id || evt?.messageId);
      const key = Number.isFinite(messageId)
        ? `appeal-msg-${appealId}-${messageId}`
        : `appeal-msg-${appealId}-${evt?.createdAt || Date.now()}`;
      if (shownRef.current.has(key)) return;
      shownRef.current.add(key);
      if (shownRef.current.size > 200) {
        const next = Array.from(shownRef.current).slice(-120);
        shownRef.current = new Set(next);
      }

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
    },
    [notify, pathname, router, userId]
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
  const auth = useContext(AuthContext);

  useEffect(() => {
    if (!auth) return;
    if (auth.isLoading) return;

    const gate = getProfileGate(auth.profile);
    if (!auth.isAuthenticated) {
      router.replace('/(auth)/AuthScreen' as any);
    } else if (gate === 'pending') {
      router.replace('/(auth)/ProfilePendingScreen' as any);
    } else if (gate === 'blocked') {
      router.replace('/(auth)/ProfileBlockedScreen' as any);
    } else if (gate === 'none') {
      router.replace('/ProfileSelectionScreen' as any);
    }
  }, [auth, router]);

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
