import React from 'react';
import { View } from 'react-native';
import { ActivityIndicator, Button, Divider, HelperText, List, Switch } from 'react-native-paper';
import { getNotificationSettings, updateNotificationSettings, type NotificationSettings } from '@/utils/notificationSettingsService';

const channels = [
  { key: 'inAppNotificationsEnabled', title: 'В приложении', description: 'Push и уведомления об обращениях', icon: 'bell-outline' },
  { key: 'telegramNotificationsEnabled', title: 'Telegram', description: 'Уведомления через бота', icon: 'message-outline' },
  { key: 'maxNotificationsEnabled', title: 'MAX', description: 'Уведомления через бота', icon: 'message-text-outline' },
] as const;

export function NotificationSettingsSection() {
  const [settings, setSettings] = React.useState<NotificationSettings | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState<string | null>(null);
  const [error, setError] = React.useState('');
  const lock = React.useRef(false);
  const alive = React.useRef(true);
  const load = React.useCallback(async () => {
    setLoading(true); setError('');
    try {
      const next = await getNotificationSettings();
      if (!next) throw new Error();
      if (alive.current) setSettings(next);
    } catch { if (alive.current) setError('Настройки недоступны. Попробуйте при наличии сети.'); }
    finally { if (alive.current) setLoading(false); }
  }, []);
  React.useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; }; }, [load]);
  const toggle = async (key: typeof channels[number]['key']) => {
    if (lock.current || !settings) return;
    lock.current = true;
    const previous = settings;
    setSettings({ ...previous, [key]: !previous[key] }); setSaving(key); setError('');
    try {
      const saved = await updateNotificationSettings({ [key]: !previous[key] });
      if (alive.current) setSettings(saved);
    } catch {
      if (alive.current) { setSettings(previous); setError('Не удалось сохранить. Предыдущее значение восстановлено.'); }
    } finally { lock.current = false; if (alive.current) setSaving(null); }
  };
  if (loading) return <ActivityIndicator accessibilityLabel="Загрузка настроек уведомлений" />;
  return <View>
    {settings && channels.map(channel => <React.Fragment key={channel.key}>
      <List.Item title={channel.title} description={channel.description} descriptionNumberOfLines={2}
        onPress={() => void toggle(channel.key)}
        left={props => <List.Icon {...props} icon={channel.icon} />}
        right={() => <Switch value={settings[channel.key]} onValueChange={() => void toggle(channel.key)} disabled={Boolean(saving)}
          accessibilityLabel={`Уведомления: ${channel.title}`} color="#2563EB" />} />
      <Divider />
    </React.Fragment>)}
    {error ? <HelperText type="error" accessibilityLiveRegion="polite">{error}</HelperText> : null}
    {!settings && <Button onPress={() => void load()}>Повторить</Button>}
  </View>;
}
