// components/Appeals/MessagesList.tsx
import React, { useEffect, useRef, useMemo } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { AppealMessage } from '@/types/appealsTypes';
import MessageBubble from './MessageBubble';

export default function MessagesList({
  messages,
  currentUserId,
  bottomInset = 0,
}: {
  messages: AppealMessage[];
  currentUserId?: number;
  bottomInset?: number;
}) {
  const listRef = useRef<FlatList<AppealMessage>>(null);
  const tempId = useRef(-1);
  const uniqueMessages = useMemo(() => {
    const map = new Map<number, AppealMessage>();
    messages.forEach((m) => {
      let id = Number((m as any).id);
      if (!Number.isFinite(id)) {
        id = tempId.current--;
      }
      map.set(id, { ...m, id });
    });
    return Array.from(map.values());
  }, [messages]);

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [uniqueMessages]);

  return (
    <FlatList
      ref={listRef}
      data={uniqueMessages}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <MessageBubble message={item} own={item.sender?.id === currentUserId} />
      )}
      contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}
      style={{ flex: 1 }}
    />
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 8 },
});
