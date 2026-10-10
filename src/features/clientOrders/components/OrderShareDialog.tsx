import React from 'react';
import { Linking, Platform, Share, View } from 'react-native';
import { Button, Dialog, HelperText, Portal, Text } from 'react-native-paper';
import * as Clipboard from 'expo-clipboard';
import { apiClient } from '@/utils/apiClient';
import type { useClientOrdersWorkspace } from '../useClientOrdersWorkspace';

type Workspace = ReturnType<typeof useClientOrdersWorkspace>;
type Link = { url: string; expiresAt: string; active: boolean };
export function OrderShareDialog({ visible, onClose, workspace }: { visible: boolean; onClose: () => void; workspace: Workspace }) {
  const [link, setLink] = React.useState<Link | null>(null);
  const [guid, setGuid] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [confirm, setConfirm] = React.useState<'revoke' | 'rotate' | null>(null);
  const requestId = React.useRef(0);
  React.useEffect(() => {
    const id = ++requestId.current;
    setLink(null); setMessage(''); setConfirm(null); setBusy(false);
    if (!visible) return;
    const selected = workspace.selectedOrder?.guid;
    const serverGuid = selected && !selected.startsWith('device-') ? selected : null;
    setGuid(serverGuid);
    if (serverGuid) {
      setBusy(true);
      void apiClient<undefined, Link | null>(`/api/order-sharing/${encodeURIComponent(serverGuid)}/share`).then(result => {
        if (id !== requestId.current) return;
        if (result.ok) setLink(result.data || null);
        else setMessage(result.message || 'Не удалось проверить ссылку');
      }).catch(() => { if (id === requestId.current) setMessage('Для ссылки нужен интернет'); })
        .finally(() => { if (id === requestId.current) setBusy(false); });
    }
    return () => { requestId.current++; };
    // A successful save changes the selected guid; do not reset this open dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const publish = async (rotate = false) => {
    if (busy || workspace.mutationLocked) return;
    setBusy(true); setMessage(''); setConfirm(null);
    const id = requestId.current;
    try {
      let order = workspace.selectedOrder;
      if (!workspace.readOnly && (workspace.dirty || !order || order.guid.startsWith('device-'))) {
        order = await workspace.saveDraft({ reason: 'manual', intent: 'SAVE', serverOnly: true });
      }
      if (!order || order.guid.startsWith('device-')) throw new Error('Не удалось сохранить заказ на сервере. Проверьте подключение и заполнение заказа. Черновик остаётся на устройстве.');
      const result = await apiClient<{ rotate: boolean }, Link>(`/api/order-sharing/${encodeURIComponent(order.guid)}/share`, { method: 'POST', body: { rotate } });
      if (!result.ok || !result.data) throw new Error(result.message || 'Не удалось создать ссылку');
      if (id !== requestId.current) return;
      setGuid(order.guid); setLink(result.data);
    } catch (error: any) { if (id === requestId.current) setMessage(error?.message || 'Не удалось создать ссылку'); }
    finally { if (id === requestId.current) setBusy(false); }
  };
  const revoke = async () => {
    if (!guid || busy) return;
    setBusy(true); setMessage(''); setConfirm(null);
    try {
      const result = await apiClient(`/api/order-sharing/${encodeURIComponent(guid)}/share`, { method: 'DELETE' });
      if (!result.ok) throw new Error(result.message);
      setLink(null); setMessage('Ссылка отключена');
    } catch { setMessage('Не удалось отключить ссылку. Повторите попытку.'); }
    finally { setBusy(false); }
  };
  const share = async () => {
    if (!link) return;
    try {
      if (Platform.OS === 'web') { await Clipboard.setStringAsync(link.url); setMessage('Ссылка скопирована'); }
      else await Share.share({ message: link.url });
    } catch { setMessage('Не удалось поделиться. Попробуйте скопировать ссылку.'); }
  };
  const ready = !!link?.active && !workspace.dirty;
  return <Portal><Dialog visible={visible} onDismiss={busy ? undefined : onClose} style={{ maxWidth: 520, width: '92%', alignSelf: 'center' }}>
    <Dialog.Title>Заказ для клиента</Dialog.Title>
    <Dialog.Content>
      <Text variant="bodyMedium">Товары, фото, цены и контакты менеджера. Без остатков и себестоимости.</Text>
      <Text variant="bodySmall" style={{ marginTop: 8 }}>Сохранённые изменения обновляются по ссылке. Создание ссылки не отправляет заказ в 1С.</Text>
      {link?.active ? <Text variant="bodySmall" style={{ marginTop: 8 }}>Доступ до {new Date(link.expiresAt).toLocaleDateString('ru-RU')}</Text> : null}
      {message ? <HelperText type="info" visible accessibilityLiveRegion="polite">{message}</HelperText> : null}
      <View style={{ gap: 8, marginTop: 16 }}>
        {!ready ? <Button mode="contained" icon="link-variant" loading={busy} disabled={busy || workspace.mutationLocked} onPress={() => void publish()}>Сохранить и получить ссылку</Button> : <>
          <Button mode="contained" icon="share-variant" disabled={busy} onPress={() => void share()}>Отправить клиенту</Button>
          <Button icon="content-copy" disabled={busy} onPress={() => { void Clipboard.setStringAsync(link!.url).then(() => setMessage('Ссылка скопирована')).catch(() => setMessage('Не удалось скопировать ссылку')); }}>Копировать ссылку</Button>
          <Button icon="open-in-new" disabled={busy} onPress={() => { void Linking.openURL(link!.url).catch(() => setMessage('Не удалось открыть браузер')); }}>Посмотреть как клиент</Button>
        </>}
        {link?.active && !confirm ? <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Button compact disabled={busy} onPress={() => setConfirm('rotate')}>Новая ссылка</Button>
          <Button compact textColor="#B42318" disabled={busy} onPress={() => setConfirm('revoke')}>Отключить</Button>
        </View> : null}
        {confirm ? <><Text>Старая ссылка перестанет работать. Продолжить?</Text><View style={{ flexDirection: 'row' }}>
          <Button onPress={() => setConfirm(null)}>Отмена</Button>
          <Button onPress={() => { void (confirm === 'revoke' ? revoke() : publish(true)); }}>Подтвердить</Button>
        </View></> : null}
      </View>
    </Dialog.Content>
    <Dialog.Actions><Button disabled={busy} onPress={onClose}>Закрыть</Button></Dialog.Actions>
  </Dialog></Portal>;
}
