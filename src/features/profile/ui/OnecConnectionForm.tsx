import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from 'react-native-paper';
import type { OnecConnection } from '../api/onecConnections';
import { ProfileAction, ProfileFact, ProfileField, profileSettingsStyles as styles } from './ProfileSettingsPrimitives';

export function OnecConnectionForm({ connection, onSave, onDisconnect, busy, resetKey }: {
  connection: OnecConnection; onSave: (login: string, password: string) => Promise<void>; onDisconnect: () => void; busy: boolean; resetKey: number;
}) {
  const [login, setLogin] = useState(connection.login), [password, setPassword] = useState('');
  useEffect(() => { setLogin(connection.login); setPassword(''); }, [connection.baseKey, connection.login, resetKey]);
  async function submit() {
    const secret = password; setPassword('');
    await onSave(login.trim(), secret);
  }
  return <View style={{ gap: 6 }}>
    <ProfileFact title={connection.label} value={connection.connected ? 'Подключено' : 'Требуется подключение'} icon={connection.connected ? 'check-circle-outline' : 'database-outline'} />
    <ProfileFact title="Имя пользователя 1С" value={connection.displayName || 'Не сопоставлено'} icon="account-outline" />
    <ProfileField label="Логин 1С" value={login} onChangeText={setLogin} editable={!connection.loginLocked && !busy}
      autoCapitalize="none" autoCorrect={false} autoComplete="off" textContentType="none" maxLength={128} />
    {connection.loginLocked && <Text style={styles.hint}>Логин заполнен по вашей учётной записи 1С. Укажите её пароль.</Text>}
    {connection.mapped && !connection.loginLocked && <Text style={styles.hint}>ID 1С найден, но логин пока не определён. Укажите имя, которое используете при входе в 1С.</Text>}
    <ProfileField label={connection.connected ? 'Новый пароль 1С' : 'Пароль 1С'} value={password} onChangeText={setPassword}
      secureTextEntry editable={!busy} autoCapitalize="none" autoCorrect={false} autoComplete="off" textContentType="none" maxLength={512}
      onSubmitEditing={() => { if (login.trim() && password && !busy) void submit(); }} />
    <Text style={styles.hint}>ИИ обращается к этой базе с вашими правами. Пароль хранится на сервере в зашифрованном виде и не передаётся ИИ. Ответ с данными 1С будет виден участникам обращения.</Text>
    <ProfileAction icon="link-variant" loading={busy} disabled={busy || !login.trim() || !password} onPress={() => void submit()}>
      {connection.connected ? 'Проверить и обновить' : 'Подключить 1С'}
    </ProfileAction>
    {connection.connected && <ProfileAction mode="text" icon="link-variant-off" disabled={busy} onPress={onDisconnect}>Отключить 1С</ProfileAction>}
  </View>;
}

