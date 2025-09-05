// components/Appeals/MessagesList.tsx
import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { FlatList, StyleSheet, Text } from 'react-native';
import { AppealMessage } from '@/types/appealsTypes';
import MessageBubble from './MessageBubble';
import { MotiView, AnimatePresence } from 'moti';

interface DateItem {
  type: 'date';
  id: string; // formatted date
  date: string;
}
interface MsgItem {
  type: 'msg';
  id: number;
  message: AppealMessage;
}

type ChatItem = DateItem | MsgItem;

export default function MessagesList({
  messages,
  currentUserId,
  bottomInset = 0,
}: {
  messages: AppealMessage[];
  currentUserId?: number;
  bottomInset?: number;
}) {
  const listRef = useRef<FlatList<ChatItem>>(null);
  const items = useMemo(() => {
    const map = new Map<number, AppealMessage>();
    messages.forEach((m) => map.set(m.id, m));
    const arr = Array.from(map.values()).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const result: ChatItem[] = [];
    let lastDay = '';
    arr.forEach((m) => {
      const d = new Date(m.createdAt);
      const dayKey = d.toDateString();
      if (dayKey !== lastDay) {
        const date = d
          .toLocaleDateString('ru-RU', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })
          .replaceAll('.', '')
          .replace(',', '');
        result.push({ type: 'date', id: dayKey, date });
        lastDay = dayKey;
      }
      result.push({ type: 'msg', id: m.id, message: m });
    });
    return result;
  }, [messages]);

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [items]);

  const renderItem = useCallback(
    ({ item }: { item: ChatItem }) => {
      if (item.type === 'date') {
        return (
          <MotiView
            from={{ opacity: 0, translateY: 10 }}
            animate={{ opacity: 1, translateY: 0 }}
            style={styles.dateWrap}
          >
            <Text style={styles.dateText}>{item.date}</Text>
          </MotiView>
        );
      }
      return (
        <MessageBubble
          message={item.message}
          own={item.message.sender?.id === currentUserId}
        />
      );
    },
    [currentUserId]
  );

  return (
    <FlatList
      ref={listRef}
      data={items}
      keyExtractor={(item) => `${item.type}-${item.id}`}
      renderItem={renderItem}
      style={styles.list}
      contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, width: '100%' },
  container: { paddingVertical: 8 },
  dateWrap: {
    alignSelf: 'center',
    backgroundColor: '#2F2F37',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    marginVertical: 8,
  },
  dateText: { color: '#fff', fontSize: 12 },
});
