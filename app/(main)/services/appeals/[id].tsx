import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
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

export default function AppealDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const appealId = Number(id);
  const [data, setData] = useState<AppealDetail | null>(null);

  async function load(force = false) {
    const d = await getAppealById(appealId, force);
    setData(d);
  }
  useEffect(() => { load(); }, [appealId]);

  if (!data) return null;

  return (
    <View style={{ flex: 1 }}>
      {/* Header: номер, статус/приоритет, кнопки действий */}
      <ScrollView style={{ flex: 1 }}>
        {/* таймлайн статусов, инфо блоки */}
        {data.messages.map(m => (
          <MessageBubble key={m.id} message={m} own={false /* сравнивай с текущим userId */} />
        ))}
      </ScrollView>
      {/* input + attachments:
          onSend = async (text, files) => { await addAppealMessage(appealId, { text, files }); await load(true); }
      */}
    </View>
  );
}
