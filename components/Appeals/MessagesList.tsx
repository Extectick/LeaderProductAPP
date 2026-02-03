// components/Appeals/MessagesList.tsx
import React, { useEffect, useRef, useMemo } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { AppealMessage } from '@/types/appealsTypes';
import MessageBubble from './MessageBubble';
import { usePresence } from '@/hooks/usePresence';

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
  const senderIds = useMemo(
    () =>
      uniqueMessages
        .map((m) => m.sender?.id)
        .filter((id): id is number => Number.isFinite(id) && id !== currentUserId),
    [uniqueMessages, currentUserId]
  );
  const presenceMap = usePresence(senderIds);

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [uniqueMessages]);

  return (
    <FlatList
      ref={listRef}
      data={uniqueMessages}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <MessageBubble
          message={item}
          own={item.sender?.id === currentUserId}
          presence={item.sender?.id ? presenceMap[item.sender.id] : undefined}
        />
      )}
      contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}
    />
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 8 },
});
