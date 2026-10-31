import { OnecConnectionForm } from './OnecConnectionForm';
import React, { useCallback, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Text } from 'react-native-paper';
import { ProfileAction, profileSettingsStyles as styles } from './ProfileSettingsPrimitives';
import { loadOnecConnections, removeOnecConnection, saveOnecConnection, type OnecConnection } from '../api/onecConnections';

export function ProfileOnecConnections({ userId, initialBase, onConnected }: { userId: number; initialBase?: string; onConnected?: () => Promise<void> }) {
  const [rows, setRows] = useState<OnecConnection[]>([]), [selected, setSelected] = useState(initialBase || '');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const [resetKey, reset] = useState(0);
  const request = useRef<AbortController | null>(null), epoch = useRef(0);
  useFocusEffect(useCallback(() => {
    const version = ++epoch.current, controller = new AbortController(); request.current = controller;
    setLoading(true); setError('');
    void loadOnecConnections(userId, controller.signal).then(data => {
      if (version !== epoch.current) return;
      setRows(data); setSelected(old => data.some(c => c.baseKey === old) ? old : data[0]?.baseKey || '');
    }).catch(e => { if (version === epoch.current && !controller.signal.aborted) setError(e.message); })
      .finally(() => { if (version === epoch.current) setLoading(false); });
    const sub = AppState.addEventListener('change', state => { if (state !== 'active') reset(x => x + 1); });
    return () => { epoch.current++; request.current?.abort(); sub.remove(); reset(x => x + 1); setBusy(false); };
  }, [userId]));
  async function mutate(operation: (signal: AbortSignal) => Promise<OnecConnection>, connected: boolean) {
    const version = ++epoch.current; request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); setNotice('');
    try {
      const value = await operation(controller.signal);
      if (version !== epoch.current) return;
      setRows(old => old.map(row => row.baseKey === value.baseKey ? value : row)); reset(x => x + 1);
      setNotice(connected ? 'Подключение проверено. Можно пользоваться 1С в чате.' : 'Доступ отозван. ИИ больше не использует это подключение.');
      if (connected && onConnected) await onConnected();
    } catch (e) { if (version === epoch.current && !controller.signal.aborted) setError(e instanceof Error ? e.message : 'Подключение не выполнено.'); }
    finally { if (version === epoch.current) setBusy(false); }
  }
  if (loading) return <ActivityIndicator accessibilityLabel="Загрузка подключений 1С" style={{ margin: 24 }} />;
  const current = rows.find(row => row.baseKey === selected);
  return <View style={{ gap: 8 }}>
    {rows.length > 1 && rows.map(row => <ProfileAction key={row.baseKey} mode="text" icon={row.baseKey === selected ? 'radiobox-marked' : 'radiobox-blank'} disabled={busy}
      onPress={() => { setSelected(row.baseKey); reset(x => x + 1); setError(''); setNotice(''); }}>{row.label}</ProfileAction>)}
    {error ? <Text accessibilityRole="alert" style={{ color: '#B91C1C', marginVertical: 8 }}>{error}</Text> : null}
    {notice ? <Text accessibilityRole="alert" style={{ color: '#047857', marginVertical: 8 }}>{notice}</Text> : null}
    {current ? <OnecConnectionForm key={`${userId}:${current.baseKey}`} connection={current} busy={busy} resetKey={resetKey}
      onSave={(login, password) => mutate(signal => saveOnecConnection(userId, current.baseKey, login, password, signal), true)}
      onDisconnect={() => void mutate(signal => removeOnecConnection(userId, current.baseKey, signal), false)} />
      : !error && <Text style={styles.hint}>Подключения 1С пока не настроены. Обратитесь в IT.</Text>}
  </View>;
}
