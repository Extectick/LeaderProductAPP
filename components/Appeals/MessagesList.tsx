// components/Appeals/MessagesList.tsx
import React, { useEffect, useRef, useMemo } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { AppealMessage } from '@/types/appealsTypes';
import MessageBubble from './MessageBubble';

export default function MessagesList({
  messages,
  currentUserId,
  bottomInset = 0,
  onRetry,
}: {
  messages: AppealMessage[];
  currentUserId?: number;
  bottomInset?: number;
  onRetry?: (m: AppealMessage) => void;
}) {
  const listRef = useRef<FlatList<AppealMessage>>(null);
  const uniqueMessages = useMemo(() => {
    const map = new Map<string | number, AppealMessage>();
    messages.forEach((m) => map.set(m.tempId || m.id, m));
    return Array.from(map.values());
  }, [messages]);

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [uniqueMessages]);

  return (
    <FlatList
      ref={listRef}
      data={uniqueMessages}
      keyExtractor={(item) => String(item.tempId || item.id)}
      renderItem={({ item }) => (
        <MessageBubble
          message={item}
          own={item.sender?.id === currentUserId}
          onRetry={onRetry ? () => onRetry(item) : undefined}
        />
      )}
      contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}
    />
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 8 },
});
