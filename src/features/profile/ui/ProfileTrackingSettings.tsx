import React from 'react';
import { View } from 'react-native';
import { List, Switch, Text } from 'react-native-paper';
import type { TrackingV2Diagnostics } from '@/utils/trackingV2Service';
import { isTrackingReady, trackingRequirements, type TrackingSetupAction } from '@/utils/trackingReadiness';
import { ProfileAction, ProfileFact, profileSettingsStyles } from './ProfileSettingsPrimitives';

export function ProfileTrackingSettings({ diagnostics, enabled, busy, status, lastSentAt, onToggle, onSetup, onRefresh }: {
  diagnostics: TrackingV2Diagnostics; enabled: boolean; busy: boolean; status: string; lastSentAt?: string;
  onToggle: () => void; onSetup: (action: TrackingSetupAction) => void; onRefresh: () => void;
}) {
  const ready = isTrackingReady(diagnostics);
  const requirements = trackingRequirements(diagnostics).filter(item => item.key !== 'device' || !item.ready)
    .sort((left, right) => Number(left.ready) - Number(right.ready));
  return <View>
    <ProfileFact title="Запись маршрута" value={enabled ? status : ready ? 'Готово к включению' : 'Сначала завершите настройку'} icon="map-marker-path"
      onPress={!busy && (enabled || ready) ? onToggle : undefined}
      right={() => <Switch accessibilityLabel="Запись маршрута" value={enabled} onValueChange={onToggle} disabled={busy || (!enabled && !ready)} color="#2563EB" />} />
    {!ready && <Text style={profileSettingsStyles.hint}>Выполнено {requirements.filter(item => item.ready).length} из {requirements.length}. Нажмите на невыполненный пункт.</Text>}
    {requirements.map(item => <ProfileFact key={item.key} title={item.title} value={item.ready ? 'Готово' : item.detail}
      icon={item.ready ? 'check-circle-outline' : 'circle-outline'} onPress={!item.ready && item.action && !busy ? () => onSetup(item.action!) : undefined}
      right={props => <List.Icon {...props} icon={item.ready ? 'check' : item.action ? 'chevron-right' : 'minus'} color={item.ready ? '#059669' : '#64748B'} />} />)}
    {lastSentAt && <ProfileFact title="Последняя отправка" value={new Date(lastSentAt).toLocaleString('ru-RU')} icon="cloud-check-outline" />}
    <ProfileAction icon="refresh" loading={busy} disabled={busy} onPress={onRefresh}>Проверить настройки</ProfileAction>
    <Text style={profileSettingsStyles.hint}>После изменения системных настроек вернитесь сюда. Автозапуск, если он есть в настройках телефона, разрешите отдельно.</Text>
  </View>;
}
