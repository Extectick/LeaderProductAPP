import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from 'react-native-paper';
import type { OnecConnection } from '../api/onecConnections';
import { ConnectionAction, ConnectionField } from './ConnectionPrimitives';
import { useAppSurfaceTheme } from '@/components/ui/appSurfaceTokens';

export function OnecConnectionForm({ connection, onSave, onDisconnect, busy, resetKey }: {
  connection: OnecConnection; onSave: (login: string, password: string) => Promise<void>; onDisconnect: () => void; busy: boolean; resetKey: number;
}) {
  const t = useAppSurfaceTheme();
  const [login, setLogin] = useState(connection.login), [password, setPassword] = useState('');
  useEffect(() => { setLogin(connection.login); setPassword(''); }, [connection.baseKey, connection.login, resetKey]);
  async function submit() {
    const secret = password; setPassword('');
    await onSave(login.trim(), secret);
  }
  if (connection.connected) return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
    <Text selectable numberOfLines={1} ellipsizeMode="tail" accessibilityLabel={connection.displayName || connection.login}
      style={{ flex: 1, minWidth: 0, color: t.text, fontSize: 14, lineHeight: 20 }}>{connection.displayName || connection.login}</Text>
    <Text style={{ flexShrink: 0, color: t.green, fontSize: 12 }}>Подключено</Text>
    <ConnectionAction compact mode="text" textColor={t.danger} loading={busy} disabled={busy} onPress={onDisconnect}>
      Отвязать
    </ConnectionAction>
  </View>;
  return <View style={{ gap: 18 }}>
    <ConnectionField label="Логин" value={login} onChangeText={setLogin} editable={!connection.loginLocked && !busy}
      autoCapitalize="none" autoCorrect={false} autoComplete="off" textContentType="none" maxLength={128} />
    <ConnectionField label="Пароль" value={password} onChangeText={setPassword}
      secureTextEntry editable={!busy} autoCapitalize="none" autoCorrect={false} autoComplete="off" textContentType="none" maxLength={512}
      onSubmitEditing={() => { if (login.trim() && password && !busy) void submit(); }} />
    <ConnectionAction loading={busy} disabled={busy || !login.trim() || !password} onPress={() => void submit()}>
      {busy ? 'Подключаем…' : 'Подключить'}
    </ConnectionAction>
  </View>;
}

