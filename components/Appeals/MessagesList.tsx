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
  const uniqueMessages = useMemo(() => {
    const map = new Map<number, AppealMessage>();
    messages.forEach((m) => map.set(m.id, m));
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
      style={styles.list}
      contentContainerStyle={[
        styles.container,
        { paddingBottom: bottomInset, flexGrow: 1 },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, width: '100%' },
  container: { paddingVertical: 8 },
});
