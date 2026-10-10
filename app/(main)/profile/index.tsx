import React from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { ActivityIndicator, Button, Text } from 'react-native-paper';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { useFocusEffect, useRouter } from 'expo-router';
import { AuthContext } from '@/context/AuthContext';
import { useTracking } from '@/context/TrackingContextV2';
import CustomAlert from '@/components/CustomAlert';
import { ProfileBottomSpacer } from '@/src/features/profile/ui/ProfileBottomSpacer';
import { getAppVersionInfo } from '@/utils/appVersion';
import { logoutUser } from '@/utils/authService';
import { ProfileHome } from '@/src/features/profile/ui/ProfileHome';
import { useProfileData } from '@/src/features/profile/model/ProfileDataContext';
import { trackingSummary, type ProfileSectionKey } from '@/src/features/profile/lib/presentation';
import { isTrackingReady, TrackingSetupRequiredError } from '@/utils/trackingReadiness';

export default function ProfileScreen() {
  const { profile, loading, error, refresh } = useProfileData();
  const auth = React.useContext(AuthContext);
  const router = useRouter();
  const tracking = useTracking();
  const [busy, setBusy] = React.useState(false);
  const toggleLock = React.useRef(false);
  const [confirmLogout, setConfirmLogout] = React.useState(false);
  const [logoutBusy, setLogoutBusy] = React.useState(false);
  const logoutLock = React.useRef(false);
  const [now, setNow] = React.useState(Date.now());
  useFocusEffect(React.useCallback(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []));
  const summary = trackingSummary(tracking.trackingEnabled, tracking.trackingStatus, tracking.nativeDiagnostics.lastRecordedAt, now);
  const toggleTracking = async () => {
    if (toggleLock.current) return;
    if (!tracking.trackingEnabled && !isTrackingReady(tracking.reliability)) { open('tracking'); return; }
    toggleLock.current = true; setBusy(true);
    try { if (tracking.trackingEnabled) await tracking.stopTracking(); else await tracking.startTracking(); }
    catch (e) { if (e instanceof TrackingSetupRequiredError) open('tracking'); else Alert.alert('Геолокация', e instanceof Error ? e.message : 'Не удалось изменить состояние геолокации'); }
    finally { toggleLock.current = false; setBusy(false); }
  };
  const open = (section: ProfileSectionKey) => router.push({ pathname: '/profile/settings', params: { section } } as any);
  const logout = async () => {
    if (logoutLock.current) return;
    logoutLock.current = true;
    setLogoutBusy(true);
    try {
      await logoutUser();
      auth?.setAuthenticated(false);
      await auth?.setProfile(null);
      setConfirmLogout(false);
      router.replace('/(auth)/AuthScreen');
    }
    catch { Alert.alert('Выход', 'Не удалось выйти из аккаунта. Попробуйте ещё раз.'); }
    finally { logoutLock.current = false; setLogoutBusy(false); }
  };
  if (!profile) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
    {loading ? <ActivityIndicator /> : <><Text>{error || 'Профиль пока не загружен'}</Text><Button onPress={() => void refresh()}>Повторить</Button></>}
  </View>;
  return <>
    <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <Animated.View entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}>
        <ProfileHome profile={profile} version={getAppVersionInfo().fullVersionLabel}
          trackingEnabled={tracking.trackingEnabled} trackingBusy={busy || tracking.trackingStatus === 'starting' || tracking.trackingStatus === 'stopping'} trackingText={summary.text} trackingColor={summary.color}
          onToggleTracking={() => void toggleTracking()} onOpen={open} onLogout={() => setConfirmLogout(true)} />
      </Animated.View>
      <ProfileBottomSpacer />
    </ScrollView>
    <CustomAlert visible={confirmLogout} title="Выйти из аккаунта?" message="Отслеживание геолокации будет остановлено."
      cancelText="Отмена" confirmText={logoutBusy ? 'Выходим…' : 'Выйти'}
      onCancel={() => { if (!logoutBusy) setConfirmLogout(false); }} onConfirm={() => void logout()} />
  </>;
}
