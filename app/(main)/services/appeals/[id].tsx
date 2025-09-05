// V:\lp\app\(main)\services\appeals\[id].tsx
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useCallback, useContext } from 'react';
import { View } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import {
  getAppealById,
  updateAppealStatus,
  assignAppeal,
  updateAppealWatchers,
} from '@/utils/appealsService';
import { AppealDetail, AppealStatus, AppealMessage } from '@/types/appealsTypes';
import AppealChatStore from '@/context/AppealChatStore';
import AppealHeader from '@/components/Appeals/AppealHeader'; // <-- исправлено имя файла
import MessagesList from '@/components/Appeals/MessagesList';
import AppealChatInput from '@/components/Appeals/AppealChatInput';
import { AuthContext } from '@/context/AuthContext';
import { useAppealUpdates } from '@/hooks/useAppealUpdates';

export default function AppealDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const appealId = Number(id);
  const [data, setData] = useState<AppealDetail | null>(null);
  const [messages, setMessages] = useState<AppealMessage[]>([]);
  const auth = useContext(AuthContext);
  const tabBarHeight = useBottomTabBarHeight();
  const [inputHeight, setInputHeight] = useState(0);

  const load = useCallback(async (force = false) => {
    const d = await getAppealById(appealId, force);
    setData(d);
    AppealChatStore.setMessages(appealId, d.messages || []);
  }, [appealId]);

  useEffect(() => {
    AppealChatStore.init().then(() => AppealChatStore.retryQueue());
    return AppealChatStore.subscribe(appealId, setMessages);
  }, [appealId]);

  useEffect(() => { load(); }, [load]);

  // Подписка на события конкретного обращения: новые сообщения, смена статуса и т.д.
  useAppealUpdates(appealId, (evt) => {
    if (evt.type === 'messageAdded' && evt.appealId === appealId) {
      const newMsg: AppealMessage = {
        id: evt.messageId,
        text: evt.text || '',
        createdAt: evt.createdAt,
        sender: { id: evt.senderId, email: '' },
        attachments: [],
        status: 'sent',
      };
      AppealChatStore.syncIncomingMessage(appealId, newMsg);
    } else if (evt.type === 'messageDelivered') {
      AppealChatStore.updateMessage(appealId, evt.messageId, {
        status: 'delivered',
        deliveredAt: evt.deliveredAt,
      });
    } else if (evt.type === 'messageRead') {
      AppealChatStore.updateMessage(appealId, evt.messageId, {
        status: 'read',
        readAt: evt.readAt,
      });
    } else {
      void load(true);
    }
  });

  if (!data) return null;

  async function handleChangeStatus(next: AppealStatus) {
    if (!data || next === data.status) return;
    try {
      setData(prev => (prev ? { ...prev, status: next } : prev));
      await updateAppealStatus(appealId, next);
      await load(true);
    } catch (e) {
      await load(true);
      console.warn('Ошибка смены статуса:', e);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <AppealHeader
        data={data}
        onChangeStatus={(s) => handleChangeStatus(s)}
        onAssign={() => assignAppeal(appealId, []).then(() => load(true))}
        onWatch={() => updateAppealWatchers(appealId, []).then(() => load(true))}
      />

      <MessagesList
        messages={messages}
        currentUserId={auth?.profile?.id}
        bottomInset={inputHeight}
      />

      <AppealChatInput
        bottomInset={tabBarHeight}
        onHeightChange={setInputHeight}
        onSend={async ({ text, files }) => {
          await AppealChatStore.sendMessage(
            appealId,
            { text, files },
            auth?.profile
              ? { id: auth.profile.id, email: auth.profile.email || '' }
              : undefined,
          );
        }}
      />
    </View>
  );
}
