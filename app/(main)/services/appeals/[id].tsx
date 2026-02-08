// V:\lp\app\(main)\services\appeals\[id].tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, useCallback, useContext, useRef } from 'react';
import { Platform, View } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import {
  addAppealMessage,
  getAppealById,
  updateAppealStatus,
  assignAppeal,
  updateAppealWatchers,
  markAppealMessageRead,
} from '@/utils/appealsService';
import { AppealDetail, AppealStatus, AppealMessage } from '@/types/appealsTypes';
import AppealHeader from '@/components/Appeals/AppealHeader'; // <-- исправлено имя файла
import MessagesList from '@/components/Appeals/MessagesList';
import AppealChatInput from '@/components/Appeals/AppealChatInput';
import { AuthContext } from '@/context/AuthContext';
import { useAppealUpdates } from '@/hooks/useAppealUpdates';
import { getMessages, setMessages, setAppeals, upsertMessage, subscribe as subscribeAppeals } from '@/utils/appealsStore';
import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';

const useSafeBottomTabBarHeight = () => {
  if (Platform.OS === 'web') return 0;
  try {
    return useBottomTabBarHeight();
  } catch (e) {
    console.warn('BottomTabBarHeight unavailable, falling back to 0 on this screen.', e);
    return 0;
  }
};

export default function AppealDetailScreen() {
  const headerTopInset = useHeaderContentTopInset({ hasSubtitle: true });
  const { id } = useLocalSearchParams<{ id: string }>();
  const appealId = Number(id);
  const router = useRouter();
  const [data, setData] = useState<AppealDetail | null>(null);
  const [messages, setMessagesState] = useState<AppealMessage[]>(getMessages(appealId));
  const auth = useContext(AuthContext);
  const tabBarHeight = useSafeBottomTabBarHeight();
  const [inputHeight, setInputHeight] = useState(0);
  const markPending = useRef<Set<number>>(new Set());
  const markTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (force = false) => {
    const d = await getAppealById(appealId, force);
    setData(d);
    if (d?.messages) {
      await setMessages(appealId, d.messages);
      await setAppeals([d as any]);
      setMessagesState(getMessages(appealId));
    }
  }, [appealId]);

  useEffect(() => { load(); }, [load]);

  // подписка на локальный стор сообщений/апеллов
  useEffect(() => {
    const unsub = subscribeAppeals(() => {
      setMessagesState(getMessages(appealId));
    });
    return () => unsub();
  }, [appealId]);

  // Помечаем непрочитанные сообщения как прочитанные для текущего пользователя
  useEffect(() => {
    const userId = auth?.profile?.id;
    if (!data || !userId) return;
    const unread = (messages || []).filter(
      (m) => m.sender?.id !== userId && !m.isRead && !markPending.current.has(m.id)
    );
    if (unread.length === 0) return;
    if (markTimer.current) clearTimeout(markTimer.current);
    markTimer.current = setTimeout(() => {
      const targets = unread.slice(0, 10); // батчим до 10 за проход
      targets.forEach((m) => markPending.current.add(m.id));
      Promise.all(
        targets.map((m) =>
          markAppealMessageRead(appealId, m.id).catch(() => {
            markPending.current.delete(m.id);
          })
        )
      ).finally(() => {
        targets.forEach((m) => markPending.current.delete(m.id));
      });
    }, 250);
  }, [messages, appealId, auth?.profile?.id]);

  // Подписка на события конкретного обращения: новые сообщения, смена статуса и т.д.
  useAppealUpdates(appealId, (evt) => {
    if (evt.type === 'messageAdded' && evt.appealId === appealId) {
      const newMsg: AppealMessage = {
        id: evt.id || evt.messageId,
        text: evt.text || '',
        createdAt: evt.createdAt || new Date().toISOString(),
        sender: evt.sender || { id: evt.senderId, email: '' },
        attachments: evt.attachments || [],
        isRead: evt.isRead,
        readBy: evt.readBy || [],
      };
      upsertMessage(appealId, newMsg, auth?.profile?.id)
        .then(() => setMessagesState(getMessages(appealId)))
        .catch(() => {});
      // если сообщение не наше - сразу отмечаем прочитанным
      if (evt.senderId !== auth?.profile?.id) {
        void markAppealMessageRead(appealId, evt.id || evt.messageId).catch(() => {});
        // Подстраховка: подтянуть свежие данные, если вдруг сокет потеряли часть сообщений
        if (syncTimer.current) clearTimeout(syncTimer.current);
        syncTimer.current = setTimeout(() => load(true).catch(() => {}), 400);
      }
    } else if (evt.type === 'messageRead' && evt.appealId === appealId) {
      setMessagesState((prev) =>
        prev.map((m) =>
          m.id === evt.messageId
            ? {
                ...m,
                isRead: true,
                readBy: [...(m.readBy || []), { userId: evt.userId, readAt: evt.readAt }],
              }
            : m
        )
      );
    } else {
      void load(true);
    }
  }, auth?.profile?.id, auth?.profile?.departmentRoles?.map((d) => d.department.id) ||
    auth?.profile?.employeeProfile?.department?.id);

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
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View
        style={{
          width: '100%',
          maxWidth: 1000,
          alignSelf: 'center',
          paddingHorizontal: 12,
          paddingTop: headerTopInset,
          flex: 1,
        }}
      >
        <AppealHeader
          data={data}
          onChangeStatus={(s) => handleChangeStatus(s)}
          onAssign={() => assignAppeal(appealId, []).then(() => load(true))}
          onWatch={() => updateAppealWatchers(appealId, []).then(() => load(true))}
        />

      <MessagesList
        messages={messages || []}
        currentUserId={auth?.profile?.id}
        bottomInset={inputHeight}
      />
      </View>

      <AppealChatInput
        bottomInset={tabBarHeight}
        onHeightChange={setInputHeight}
        onSend={async ({ text, files }) => {
          const res = await addAppealMessage(appealId, { text, files });
          // Оптимистично добавляем своё сообщение в локальный стор, чтобы не ждать сокет
          upsertMessage(
            appealId,
            {
              id: res.id,
              appealId,
              text: text || '',
              createdAt: res.createdAt || new Date().toISOString(),
              sender: auth?.profile
                ? {
                    id: auth.profile.id,
                    email: auth.profile.email,
                    firstName: auth.profile.firstName || undefined,
                    lastName: auth.profile.lastName || undefined,
                  }
                : undefined,
              attachments: [],
              readBy: [],
              isRead: true,
            },
            auth?.profile?.id
          ).then(() => setMessagesState(getMessages(appealId)));
        }}
      />
    </View>
  );
}
