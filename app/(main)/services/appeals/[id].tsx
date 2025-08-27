// V:\lp\app\(main)\services\appeals\[id].tsx
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useCallback, useContext } from 'react';
import { View } from 'react-native';
import {
  addAppealMessage,
  getAppealById,
  updateAppealStatus,
  assignAppeal,
  updateAppealWatchers,
} from '@/utils/appealsService';
import { AppealDetail, AppealStatus } from '@/types/appealsTypes';
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

  const load = useCallback(async (force = false) => {
    const d = await getAppealById(appealId, force);
    setData(d);
  }, [appealId]);

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

      <MessagesList messages={data.messages || []} currentUserId={auth?.profile?.id} />

      <AppealChatInput
        onSend={async ({ text, files }) => {
          await addAppealMessage(appealId, { text, files });
          await load(true);
        }}
      />
    </View>
  );
}
