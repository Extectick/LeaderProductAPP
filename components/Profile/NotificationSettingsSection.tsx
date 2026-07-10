import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getNotificationSettings,
  updateNotificationSettings,
  type NotificationSettings,
} from '@/utils/notificationSettingsService';

const DEFAULT_SETTINGS: NotificationSettings = {
  inAppNotificationsEnabled:    true,
  telegramNotificationsEnabled: true,
  maxNotificationsEnabled:      true,
  pushNewMessage:               true,
  pushStatusChanged:            true,
  pushDeadlineChanged:          true,
  telegramNewAppeal:            true,
  telegramStatusChanged:        true,
  telegramDeadlineChanged:      true,
  telegramUnreadReminder:       true,
  telegramClosureReminder:      true,
  telegramNewMessage:           true,
  maxNewAppeal:                 true,
  maxStatusChanged:             true,
  maxDeadlineChanged:           true,
  maxUnreadReminder:            true,
  maxClosureReminder:           true,
  maxNewMessage:                true,
};

export function NotificationSettingsSection() {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState<string | null>(null);

  useEffect(() => {
    void getNotificationSettings().then((s) => {
      if (s) setSettings(s);
      setLoading(false);
    });
  }, []);

  const toggle = async (key: keyof NotificationSettings) => {
    if (saving) return;
    const prev = settings;
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);           // оптимистично
    setSaving(key as string);
    try {
      const saved = await updateNotificationSettings({ [key]: next[key] });
      setSettings(saved);
    } catch {
      setSettings(prev);    // откат
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator size="small" color="#6366F1" />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.icon}>
          <Ionicons name="notifications-outline" size={17} color="#1E293B" />
        </View>
        <Text style={styles.title}>Уведомления</Text>
      </View>

      {/* Push + in-app */}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Уведомления об обращениях</Text>
          <Text style={styles.hint}>Push-уведомления и всплывающие уведомления в приложении</Text>
        </View>
        <Switch
          value={settings.inAppNotificationsEnabled}
          onValueChange={() => void toggle('inAppNotificationsEnabled')}
          disabled={!!saving}
          trackColor={{ false: '#CBD5E1', true: '#6366F1' }}
          thumbColor="#fff"
        />
      </View>

      {/* Telegram bot */}
      <View style={[styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DDD6FE', paddingTop: 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Уведомления в Telegram</Text>
          <Text style={styles.hint}>Получать уведомления через Telegram-бота</Text>
        </View>
        <Switch
          value={settings.telegramNotificationsEnabled}
          onValueChange={() => void toggle('telegramNotificationsEnabled')}
          disabled={!!saving}
          trackColor={{ false: '#CBD5E1', true: '#6366F1' }}
          thumbColor="#fff"
        />
      </View>

      <View style={[styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DDD6FE', paddingTop: 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Уведомления в MAX</Text>
          <Text style={styles.hint}>Получать уведомления через MAX-бота</Text>
        </View>
        <Switch
          value={settings.maxNotificationsEnabled}
          onValueChange={() => void toggle('maxNotificationsEnabled')}
          disabled={!!saving}
          trackColor={{ false: '#CBD5E1', true: '#6366F1' }}
          thumbColor="#fff"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  icon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  hint: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
});
