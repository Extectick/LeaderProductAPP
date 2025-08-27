// V:\lp\app\(main)\services\appeals\[id].tsx
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useCallback, useContext } from 'react';
import { View } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import {
  addAppealMessage,
  getAppealById,
  updateAppealStatus,
  assignAppeal,
  updateAppealWatchers,
} from '@/utils/appealsService';
import { AppealDetail, AppealStatus, AttachmentType, AppealMessage } from '@/types/appealsTypes';
import AppealHeader from '@/components/Appeals/AppealHeader'; // <-- исправлено имя файла
import MessagesList from '@/components/Appeals/MessagesList';
import AppealChatInput from '@/components/Appeals/AppealChatInput';
import { AuthContext } from '@/context/AuthContext';
import { useAppealUpdates } from '@/hooks/useAppealUpdates';

export default function AppealDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const appealId = Number(id);
  const [data, setData] = useState<AppealDetail | null>(null);
  const auth = useContext(AuthContext);
  const tabBarHeight = useBottomTabBarHeight();

  const load = useCallback(
    async (force = false) => {
      const d = await getAppealById(appealId, force);
      setData((prev) => {
        if (!prev) return d;
        const existing = prev.messages || [];
        const incoming = d.messages || [];
        const ids = new Set(incoming.map((m) => m.id));
        const optimistic = existing.filter((m) => !ids.has(m.id));
        return { ...d, messages: [...incoming, ...optimistic] };
      });
    },
    [appealId],
  );

  useEffect(() => { load(); }, [load]);

  // Подписка на события конкретного обращения: новые сообщения, смена статуса и т.д.
  useAppealUpdates(appealId, () => load(true));

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
        messages={data.messages || []}
        currentUserId={auth?.profile?.id}
        bottomInset={tabBarHeight + 80}
      />

      <AppealChatInput
        bottomInset={tabBarHeight}
        onSend={async ({ text, files }) => {
          const res = await addAppealMessage(appealId, { text, files });
          const guessType = (mime: string): AttachmentType => {
            if (mime.startsWith('image/')) return 'IMAGE';
            if (mime.startsWith('audio/')) return 'AUDIO';
            return 'FILE';
          };
          const newMsg: AppealMessage = {
            id: res.id,
            text: text,
            createdAt: res.createdAt,
            sender: auth?.profile
              ? { id: auth.profile.id, email: auth.profile.email || '' }
              : { id: 0, email: '' },
            attachments: (files || []).map((f) => ({
              fileUrl: f.uri,
              fileName: f.name,
              fileType: guessType(f.type),
            })),
          };
          setData((prev) =>
            prev ? { ...prev, messages: [...(prev.messages || []), newMsg] } : prev,
          );
          void load(true);
        }}
      />
    </View>
  );
}
