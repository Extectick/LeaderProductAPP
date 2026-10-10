import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, HelperText, IconButton, List, Text, TextInput, useTheme } from 'react-native-paper';
import { apiClient } from '@/utils/apiClient';

export type ClientContacts = { phones: { label: string; number: string }[]; telegramUrl: string | null; maxUrl: string | null };
type ContactResponse = { settings: ClientContacts; defaultPhone: string | null; effective: ClientContacts };
const empty: ClientContacts = { phones: [], telegramUrl: null, maxUrl: null };

/** Shared by the employee profile and the administrator's user editor. */
export function ClientContactsEditor({ userId, disabled = false }: { userId?: number; disabled?: boolean }) {
  const theme = useTheme();
  const [expanded, setExpanded] = React.useState(false);
  const [value, setValue] = React.useState<ClientContacts>(empty);
  const [baseline, setBaseline] = React.useState<ClientContacts | null>(null);
  const [defaultPhone, setDefaultPhone] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [failed, setFailed] = React.useState(false);
  const requestId = React.useRef(0);
  const path = `/users/${userId ?? 'me'}/client-contacts`;
  React.useEffect(() => {
    requestId.current++;
    setBaseline(null); setValue(empty); setMessage(''); setExpanded(false); setBusy(false);
    return () => { requestId.current++; };
  }, [path]);
  const request = async (save: boolean) => {
    const id = ++requestId.current;
    setBusy(true); setMessage(''); setFailed(false);
    try {
      const result = await apiClient<ClientContacts, ContactResponse>(path, save ? { method: 'PUT', body: value } : {});
      if (id !== requestId.current) return;
      if (!result.ok || !result.data) throw new Error(result.message || 'Не удалось загрузить контакты');
      setValue(result.data.settings); setBaseline(result.data.settings); setDefaultPhone(result.data.defaultPhone);
      if (save) setMessage('Контакты сохранены');
    } catch (error: any) {
      if (id !== requestId.current) return;
      setFailed(true); setMessage(error?.message || 'Нет связи с сервером. Изменения пока не сохранены.');
    } finally { if (id === requestId.current) setBusy(false); }
  };
  const locked = busy || disabled;
  return <List.Accordion title="Контакты для клиентов" description="Телефоны, Telegram и MAX" expanded={expanded}
    left={props => <List.Icon {...props} icon="card-account-phone-outline" />}
    onPress={() => { setExpanded(!expanded); if (!expanded && !baseline && !busy) void request(false); }}>
    <View style={styles.body}>
      {busy && !baseline ? <ActivityIndicator accessibilityLabel="Загрузка контактов" /> : null}
      {baseline ? <>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {value.phones.length ? 'Клиент увидит указанные ниже номера.' : defaultPhone ? `По умолчанию: ${defaultPhone}` : 'В профиле нет телефона. Добавьте номер для связи.'}
        </Text>
        {value.phones.map((phone, index) => <View key={index} style={styles.row}>
          <View style={styles.fields}>
            <TextInput mode="outlined" dense label={`Телефон ${index + 1}`} value={phone.number} keyboardType="phone-pad" maxLength={40} disabled={locked}
              onChangeText={number => setValue(prev => ({ ...prev, phones: prev.phones.map((p, i) => i === index ? { ...p, number } : p) }))} />
            <TextInput mode="outlined" dense label="Подпись — необязательно" value={phone.label} maxLength={32} disabled={locked}
              onChangeText={label => setValue(prev => ({ ...prev, phones: prev.phones.map((p, i) => i === index ? { ...p, label } : p) }))} />
          </View>
          <IconButton icon="close" accessibilityLabel={`Удалить телефон ${index + 1}`} disabled={locked}
            onPress={() => setValue(prev => ({ ...prev, phones: prev.phones.filter((_, i) => i !== index) }))} />
        </View>)}
        <Button icon="plus" disabled={locked || value.phones.length >= 5} onPress={() => setValue(prev => ({ ...prev,
          phones: [...prev.phones, { label: '', number: prev.phones.length === 0 ? defaultPhone || '' : '' }] }))}>Добавить телефон</Button>
        <TextInput mode="outlined" dense label="Telegram" placeholder="@username или https://t.me/…" autoCapitalize="none" autoCorrect={false}
          value={value.telegramUrl || ''} maxLength={250} disabled={locked} onChangeText={telegramUrl => setValue(prev => ({ ...prev, telegramUrl }))} />
        <TextInput mode="outlined" dense label="MAX" placeholder="https://max.ru/…" autoCapitalize="none" autoCorrect={false}
          value={value.maxUrl || ''} maxLength={250} disabled={locked} onChangeText={maxUrl => setValue(prev => ({ ...prev, maxUrl }))} />
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Эти контакты видны по ссылке на заказ. Номер входа и привязка ботов не изменятся.</Text>
        <Button mode="contained" loading={busy} disabled={locked || JSON.stringify(value) === JSON.stringify(baseline)} onPress={() => void request(true)}>Сохранить контакты</Button>
      </> : failed ? <Button onPress={() => void request(false)}>Повторить</Button> : null}
      {message ? <HelperText type={failed ? 'error' : 'info'} visible accessibilityLiveRegion="polite">{message}</HelperText> : null}
    </View>
  </List.Accordion>;
}
const styles = StyleSheet.create({ body: { padding: 16, gap: 10 }, row: { flexDirection: 'row', alignItems: 'center' }, fields: { flex: 1, gap: 6 } });
