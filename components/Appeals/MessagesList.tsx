// components/Appeals/MessagesList.tsx
import React, { useEffect, useRef } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { AppealMessage } from '@/types/appealsTypes';
import MessageBubble from './MessageBubble';

export default function MessagesList({
  messages,
  currentUserId,
}: {
  messages: AppealMessage[];
  currentUserId?: number;
}) {
  const listRef = useRef<FlatList<AppealMessage>>(null);
  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  return (
    <FlatList
      ref={listRef}
      data={messages}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <MessageBubble message={item} own={item.sender?.id === currentUserId} />
      )}
      contentContainerStyle={styles.container}
    />
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 8 },
});
