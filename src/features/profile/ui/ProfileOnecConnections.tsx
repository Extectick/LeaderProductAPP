import { OnecConnectionForm } from './OnecConnectionForm';
import React, { useCallback, useRef, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Text } from 'react-native-paper';
import { ConnectionAction } from './ConnectionPrimitives';
import { ConnectionDialog } from './ConnectionDialog';
import { useAppSurfaceTheme } from '@/components/ui/appSurfaceTokens';
import { loadOnecConnections, removeOnecConnection, saveOnecConnection, type OnecConnection } from '../api/onecConnections';

export function ProfileOnecConnections({ userId, initialBase, onConnected }: { userId: number; initialBase?: string; onConnected?: (signal: AbortSignal) => Promise<void> }) {
  const t = useAppSurfaceTheme();
  const [rows, setRows] = useState<OnecConnection[]>([]), [selected, setSelected] = useState(initialBase || '');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [resetKey, reset] = useState(0), [editing, setEditing] = useState(false);
  const busyRef = useRef(false), selectedRef = useRef(selected); selectedRef.current = selected;
  const protectedEntry = useRef(Boolean(initialBase || onConnected));
  const request = useRef<AbortController | null>(null), epoch = useRef(0);
  useFocusEffect(useCallback(() => {
    const version = ++epoch.current, controller = new AbortController(); request.current = controller;
    setLoading(true); setError(''); setRows([]); setEditing(false);
    void loadOnecConnections(userId, controller.signal).then(data => {
      if (version !== epoch.current) return;
      const next = data.find(row => row.baseKey === selectedRef.current) ?? data[0];
      setRows(data); setSelected(next?.baseKey || '');
      if (protectedEntry.current && next && !next.connected) setEditing(true);
      protectedEntry.current = false;
    }).catch(e => { if (version === epoch.current && !controller.signal.aborted) setError(e.message); })
      .finally(() => { if (version === epoch.current) setLoading(false); });
    const sub = AppState.addEventListener('change', state => { if (state !== 'active') { reset(x => x + 1); setEditing(false); } });
    return () => { epoch.current++; request.current?.abort(); sub.remove(); reset(x => x + 1); setEditing(false); busyRef.current = false; setBusy(false); };
  }, [userId, loadAttempt]));
  async function mutate(operation: (signal: AbortSignal) => Promise<OnecConnection>, connected: boolean) {
    if (busyRef.current) return;
    busyRef.current = true;
    const version = ++epoch.current; request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError('');
    try {
      const value = await operation(controller.signal);
      if (version !== epoch.current) return;
      setRows(old => old.map(row => row.baseKey === value.baseKey ? value : row)); reset(x => x + 1);
      if (connected) setEditing(false);
      if (connected && onConnected) await onConnected(controller.signal);
    } catch (e) { if (version === epoch.current && !controller.signal.aborted) setError(e instanceof Error ? e.message : 'Подключение не выполнено.'); }
    finally { if (version === epoch.current) { busyRef.current = false; setBusy(false); } }
  }
  function closeDialog() {
    if (busyRef.current) return;
    setEditing(false); setError(''); reset(x => x + 1);
  }
  if (loading) return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }}>
    <ActivityIndicator accessibilityLabel="Загрузка подключений 1С" color={t.accent} size="small" />
    <Text style={{ color: t.muted, fontSize: 13 }}>Загрузка…</Text>
  </View>;
  const current = rows.find(row => row.baseKey === selected);
  return <View style={{ gap: 16 }}>
    {rows.length > 1 && <View accessibilityRole="radiogroup" accessibilityLabel="База 1С" style={{ gap: 2 }}>
      <Text style={{ color: t.muted, fontSize: 12 }}>Выберите базу</Text>
      {rows.map(row => <Pressable key={row.baseKey} accessibilityRole="radio" accessibilityLabel={row.label}
        accessibilityState={{ checked: row.baseKey === selected, disabled: busy }} disabled={busy}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingVertical: 8, backgroundColor: pressed ? t.panel : 'transparent' })}
        onPress={() => { setSelected(row.baseKey); reset(x => x + 1); setError(''); }}>
        <Ionicons name={row.baseKey === selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={row.baseKey === selected ? t.accent : t.muted} />
        <Text style={{ flex: 1, color: t.text, fontSize: 14 }}>{row.label}</Text>
      </Pressable>)}
    </View>}
    {error && !editing ? <Text accessibilityRole="alert" style={{ color: t.danger, marginVertical: 8 }}>{error}</Text> : null}
    {current?.connected ? <OnecConnectionForm key={`${userId}:${current.baseKey}`} connection={current} busy={busy} resetKey={resetKey}
      onSave={(login, password) => mutate(signal => saveOnecConnection(userId, current.baseKey, login, password, signal), true)}
      onDisconnect={() => void mutate(signal => removeOnecConnection(userId, current.baseKey, signal), false)} />
      : current ? <ConnectionAction compact mode="text" textColor={t.accentText} style={{alignSelf:'flex-start'}} disabled={busy} onPress={() => { setError(''); reset(x => x + 1); setEditing(true); }}>Подключить</ConnectionAction>
      : <View style={{ gap: 12 }}>
        {!error && <Text style={{ color: t.muted, fontSize: 13 }}>Нет доступных баз 1С</Text>}
        <ConnectionAction mode="outlined" onPress={() => setLoadAttempt(value => value + 1)}>{error ? 'Повторить' : 'Обновить'}</ConnectionAction>
      </View>}
    {editing && current && !current.connected ? <ConnectionDialog visible title="Подключение пользователя 1С" busy={busy} onClose={closeDialog}>
      {error ? <Text accessibilityRole="alert" style={{ color: t.danger }}>{error}</Text> : null}
      <OnecConnectionForm key={`${userId}:${current.baseKey}`} connection={current} busy={busy} resetKey={resetKey}
        onSave={(login, password) => mutate(signal => saveOnecConnection(userId, current.baseKey, login, password, signal), true)}
        onDisconnect={() => {}} />
    </ConnectionDialog> : null}
  </View>;
}
