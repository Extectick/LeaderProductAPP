// V:\lp\app\(main)\services\appeals\[id].tsx
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { View, ScrollView } from 'react-native';
import {
  addAppealMessage,
  getAppealById,
  updateAppealStatus,
  assignAppeal,
  updateAppealWatchers,
} from '@/utils/appealsService';
import { AppealDetail, AppealStatus } from '@/types/appealsTypes';
import MessageBubble from '@/components/Appeals/MessageBubble';
import AppealHeader from '@/components/Appeals/AppealHeader'; // <-- исправлено имя файла
import AppealStatusMenu from '@/components/Appeals/AppealStatusMenu';

export default function AppealDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const appealId = Number(id);
  const [data, setData] = useState<AppealDetail | null>(null);
  const [statusMenu, setStatusMenu] = useState(false);

  const load = useCallback(async (force = false) => {
    const d = await getAppealById(appealId, force);
    setData(d);
  }, [appealId]);

  useEffect(() => { load(); }, [load]);

  if (!data) return null;

  async function handleChangeStatus(next: AppealStatus) {
    if (!data || next === data.status) { 
      setStatusMenu(false); 
      return; 
    }
    try {
      setData(prev => prev ? { ...prev, status: next } : prev); // ✅
      await updateAppealStatus(appealId, next);
      await load(true);
    } catch (e) {
      await load(true);
      console.warn('Ошибка смены статуса:', e);
    } finally {
      setStatusMenu(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <AppealHeader
        data={data}
        onChangeStatus={() => setStatusMenu(true)}
        onAssign={() => assignAppeal(appealId, []).then(() => load(true))}
        onWatch={() => updateAppealWatchers(appealId, []).then(() => load(true))}
      />

      <ScrollView style={{ flex: 1 }}>
        {data.messages.map(m => (
          <MessageBubble
            key={m.id}
            message={m}
            own={false /* сравни с текущим userId */}
          />
        ))}
      </ScrollView>

      <AppealStatusMenu
        visible={statusMenu}
        current={data.status}
        onClose={() => setStatusMenu(false)}
        onSelect={(s) => handleChangeStatus(s)}
      />

      {/* input + attachments:
          onSend = async (text, files) => { await addAppealMessage(appealId, { text, files }); await load(true); }
      */}
    </View>
  );
}
