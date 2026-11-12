import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useAppSurfaceTheme } from '@/components/ui/appSurfaceTokens';
import { ConnectionAction } from './ConnectionPrimitives';
import {ConnectionDialog} from './ConnectionDialog';

export type MailPreviewProvider = 'mail' | 'yandex';
const providers = [
  { id: 'mail', label: 'Mail.ru' },
  { id: 'yandex', label: 'Яндекс' },
] as const;

/** Interactive design only: selected providers never authorize a real mailbox. */
export function MailConnectionPreview({ connected, onChange }: {
  connected: MailPreviewProvider[]; onChange: (providers: MailPreviewProvider[]) => void;
}) {
  const t = useAppSurfaceTheme();
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<MailPreviewProvider | null>(null);
  const available = providers.filter(provider => !connected.includes(provider.id));
  const canAdd = selected !== null && available.some(provider => provider.id === selected);
  function closeDialog(){setAdding(false);setSelected(null);}
  function addProvider() {
    if (!canAdd || !selected) return;
    onChange([...connected, selected]);
    closeDialog();
  }
  return <View style={styles.body}>
    {adding && <ConnectionDialog visible title="Выберите провайдера" onClose={closeDialog}>
      <View accessibilityRole="radiogroup" accessibilityLabel="Почтовый сервис">
        {available.map(provider => <Pressable key={provider.id} accessibilityRole="radio"
          accessibilityLabel={provider.label} accessibilityState={{ checked: selected === provider.id }}
          onPress={() => setSelected(provider.id)}
          style={({ pressed }) => [styles.provider, { borderColor: t.line, backgroundColor: pressed ? t.panel : 'transparent' }]}>
          <Ionicons name="mail-outline" size={22} color={t.muted} />
          <Text style={[styles.providerName, { flex: 1, color: t.text }]}>{provider.label}</Text>
          <Ionicons name={selected === provider.id ? 'radio-button-on' : 'radio-button-off'} size={22}
            color={selected === provider.id ? t.accent : t.muted} />
        </Pressable>)}
      </View>
      <View style={styles.actions}>
        <ConnectionAction mode="text" style={styles.action} onPress={closeDialog}>Отмена</ConnectionAction>
        <ConnectionAction style={styles.action} disabled={!canAdd} onPress={addProvider}>Подключить</ConnectionAction>
      </View>
    </ConnectionDialog>}
      {providers.filter(provider => connected.includes(provider.id)).map(provider =>
          <View key={provider.id} style={[styles.connection, { borderColor: t.line }]}>
            <View style={styles.account}>
              <Ionicons name="mail-outline" size={22} color={t.muted} />
              <View style={styles.accountText}>
                <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.providerName, { color: t.text, fontWeight: '600' }]}>{provider.label}</Text>
              </View>
            </View>
            <Text style={{flexShrink:0,color:t.green,fontSize:12}}>Подключено</Text>
            <ConnectionAction compact mode="text" textColor={t.danger} accessibilityLabel={`Отвязать ${provider.label}`}
              onPress={() => onChange(connected.filter(id => id !== provider.id))}>Отвязать</ConnectionAction>
          </View>)}
      {available.length > 0 && <ConnectionAction compact mode="text" textColor={t.accentText} style={{ alignSelf: 'flex-start' }} onPress={() => {
        setSelected(null); setAdding(true);
      }}>{connected.length === 0 ? 'Подключить' : 'Добавить'}</ConnectionAction>}
  </View>;
}

const styles = StyleSheet.create({
  body: { gap: 16 },
  provider: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  providerName: { flexShrink: 1, fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 },
  action: { minWidth: 132, flexGrow: 1, flexBasis: 132 },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  account: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  accountText: { flex: 1, minWidth: 0, gap: 2 },
});
