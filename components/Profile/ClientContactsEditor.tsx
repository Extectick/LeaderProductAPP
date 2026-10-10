import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, HelperText, IconButton, List, Text, TextInput, useTheme } from 'react-native-paper';
import { apiClient } from '@/utils/apiClient';
import { ProfileAction, ProfileFact, ProfileField, profileSettingsStyles } from '@/src/features/profile/ui/ProfileSettingsPrimitives';

export type ClientContacts = { phones: { label: string; number: string }[]; telegramUrl: string | null; maxUrl: string | null; whatsappUrl: string | null; email: string | null };
type ContactResponse = { settings: ClientContacts; defaultPhone: string | null; effective: ClientContacts };
const empty: ClientContacts = { phones: [], telegramUrl: null, maxUrl: null, whatsappUrl: null, email: null };

/** Shared by the employee profile and the administrator's user editor. */
export function ClientContactsEditor({ userId, disabled = false, embedded = false }: { userId?: number; disabled?: boolean; embedded?: boolean }) {
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
    if (embedded) void request(false);
    return () => { requestId.current++; };
  }, [path, embedded]);
  const request = async (save: boolean) => {
    const id = ++requestId.current;
    setBusy(true); setMessage(''); setFailed(false);
    try {
      const result = await apiClient<ClientContacts, ContactResponse>(path, save ? { method: 'PUT', body: value } : {});
      if (id !== requestId.current) return;
      if (!result.ok || !result.data) throw new Error(result.message || 'Не удалось загрузить контакты');
      const settings = { ...empty, ...result.data.settings };
      setValue(settings); setBaseline(settings); setDefaultPhone(result.data.defaultPhone);
      if (save) setMessage('Контакты сохранены');
    } catch (error: any) {
      if (id !== requestId.current) return;
      setFailed(true); setMessage(error?.message || 'Нет связи с сервером. Изменения пока не сохранены.');
    } finally { if (id === requestId.current) setBusy(false); }
  };
  const locked = busy || disabled;
  const Field = embedded ? ProfileField : TextInput;
  const Action = embedded ? ProfileAction : Button;
  const body = <View style={[styles.body, embedded && { padding: 0 }]}>
      {busy && !baseline ? <ActivityIndicator accessibilityLabel="Загрузка контактов" /> : null}
      {baseline ? <>
        {embedded && !value.phones.length ? <ProfileFact title="Телефон по умолчанию" value={defaultPhone || 'Добавьте номер для связи'} icon="phone-outline" /> : <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {value.phones.length ? 'Клиент увидит указанные ниже номера.' : defaultPhone ? `По умолчанию: ${defaultPhone}` : 'В профиле нет телефона. Добавьте номер для связи.'}
        </Text>}
        {value.phones.map((phone, index) => <View key={index} style={styles.row}>
          <View style={styles.fields}>
            <Field mode="outlined" dense label={`Телефон ${index + 1}`} accessibilityLabel={`Телефон ${index + 1}`} value={phone.number} keyboardType="phone-pad" maxLength={40} disabled={locked}
              onChangeText={number => setValue(prev => ({ ...prev, phones: prev.phones.map((p, i) => i === index ? { ...p, number } : p) }))} />
            <Field mode="outlined" dense label="Подпись — необязательно" accessibilityLabel={`Подпись телефона ${index + 1}`} value={phone.label} maxLength={32} disabled={locked}
              onChangeText={label => setValue(prev => ({ ...prev, phones: prev.phones.map((p, i) => i === index ? { ...p, label } : p) }))} />
          </View>
          <IconButton icon="close" accessibilityLabel={`Удалить телефон ${index + 1}`} disabled={locked}
            onPress={() => setValue(prev => ({ ...prev, phones: prev.phones.filter((_, i) => i !== index) }))} />
        </View>)}
        <Action mode="text" icon="plus" disabled={locked || value.phones.length >= 5} onPress={() => setValue(prev => ({ ...prev,
          phones: [...prev.phones, { label: '', number: prev.phones.length === 0 ? defaultPhone || '' : '' }] }))}>Добавить телефон</Action>
        <Field mode="outlined" dense label="Telegram" accessibilityLabel="Telegram" placeholder="@username или https://t.me/…" autoCapitalize="none" autoCorrect={false}
          value={value.telegramUrl || ''} maxLength={250} disabled={locked} onChangeText={telegramUrl => setValue(prev => ({ ...prev, telegramUrl }))} />
        <Field mode="outlined" dense label="MAX" accessibilityLabel="MAX" placeholder="https://max.ru/…" autoCapitalize="none" autoCorrect={false}
          value={value.maxUrl || ''} maxLength={250} disabled={locked} onChangeText={maxUrl => setValue(prev => ({ ...prev, maxUrl }))} />
        <Field mode="outlined" dense label="WhatsApp" accessibilityLabel="WhatsApp" placeholder="+7… или https://wa.me/…" autoCapitalize="none" autoCorrect={false}
          left={embedded ? undefined : <TextInput.Icon icon="whatsapp" />} value={value.whatsappUrl || ''} maxLength={250} disabled={locked}
          onChangeText={whatsappUrl => setValue(prev => ({ ...prev, whatsappUrl }))} />
        <Field mode="outlined" dense label="Почта для клиентов" accessibilityLabel="Почта для клиентов" placeholder="name@example.ru" keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
          left={embedded ? undefined : <TextInput.Icon icon="email-outline" />} value={value.email || ''} maxLength={254} disabled={locked}
          onChangeText={email => setValue(prev => ({ ...prev, email }))} />
        <Text variant="bodySmall" style={embedded ? profileSettingsStyles.hint : { color: theme.colors.onSurfaceVariant }}>Видны клиенту по ссылке на заказ. Данные для входа не меняются.</Text>
        <Action mode={embedded ? 'contained-tonal' : 'contained'} loading={busy} disabled={locked || JSON.stringify(value) === JSON.stringify(baseline)} onPress={() => void request(true)}>Сохранить контакты</Action>
      </> : failed ? <Button onPress={() => void request(false)}>Повторить</Button> : null}
      {message ? <HelperText type={failed ? 'error' : 'info'} visible accessibilityLiveRegion="polite">{message}</HelperText> : null}
    </View>;
  return embedded ? body : <List.Accordion title="Контакты для клиентов" description="Телефоны, мессенджеры и почта" expanded={expanded}
    left={props => <List.Icon {...props} icon="card-account-phone-outline" />}
    onPress={() => { setExpanded(!expanded); if (!expanded && !baseline && !busy) void request(false); }}>{body}</List.Accordion>;
}
const styles = StyleSheet.create({ body: { padding: 16, gap: 10 }, row: { flexDirection: 'row', alignItems: 'center' }, fields: { flex: 1, gap: 6 } });
