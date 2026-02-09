// components/Appeals/MessagesList.tsx
import React, { useEffect, useRef, useMemo, useImperativeHandle, useCallback } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { AppealMessage } from '@/types/appealsTypes';
import MessageBubble from './MessageBubble';
import { usePresence } from '@/hooks/usePresence';

type ListItem =
  | { type: 'date'; id: string; label: string }
  | { type: 'message'; id: string; message: AppealMessage; showHeader: boolean; isGrouped: boolean };

const GROUP_GAP_MINUTES = 5;

export type MessagesListHandle = {
  scrollToBottom: (animated?: boolean) => void;
  scrollToIndex: (index: number, viewPosition?: number) => void;
};

type MessagesListProps = {
  messages: AppealMessage[];
  currentUserId?: number;
  bottomInset?: number;
  onAtBottomChange?: (atBottom: boolean) => void;
};

const MessagesList = React.forwardRef<MessagesListHandle, MessagesListProps>(({
  messages,
  currentUserId,
  bottomInset = 0,
  onAtBottomChange,
}, ref) => {
  const listRef = useRef<FlatList<ListItem>>(null);
  const autoScrollRef = useRef(true);
  const userDraggingRef = useRef(false);
  const atBottomRef = useRef(true);
  const layoutHeightRef = useRef(0);
  const contentHeightRef = useRef(0);
  const autoScrollTimers = useRef<number[]>([]);

  const uniqueMessages = useMemo(() => {
    const map = new Map<number, AppealMessage>();
    messages.forEach((m) => map.set(m.id, m));
    return Array.from(map.values()).sort((a, b) => {
      const at = new Date(a.createdAt).getTime();
      const bt = new Date(b.createdAt).getTime();
      return at - bt;
    });
  }, [messages]);

  const senderIds = useMemo(
    () =>
      uniqueMessages
        .map((m) => m.sender?.id)
        .filter((id): id is number => Number.isFinite(id) && id !== currentUserId),
    [uniqueMessages, currentUserId]
  );
  const presenceMap = usePresence(senderIds);

  const items = useMemo(() => {
    const list: ListItem[] = [];
    let prevMsg: AppealMessage | null = null;
    let prevDayKey: string | null = null;

    uniqueMessages.forEach((msg) => {
      const msgDate = new Date(msg.createdAt);
      const dayKey = msgDate.toISOString().slice(0, 10);
      if (prevDayKey !== dayKey) {
        list.push({
          type: 'date',
          id: `date-${dayKey}`,
          label: formatDateLabel(msgDate),
        });
        prevDayKey = dayKey;
        prevMsg = null;
      }

      const prevDate = prevMsg ? new Date(prevMsg.createdAt) : null;
      const sameSender = !!prevMsg && prevMsg.sender?.id === msg.sender?.id;
      const diffMinutes = prevDate ? Math.abs(msgDate.getTime() - prevDate.getTime()) / 60000 : Infinity;
      const isSystem = msg.type === 'SYSTEM';
      const isGrouped = !isSystem && sameSender && diffMinutes <= GROUP_GAP_MINUTES;
      const showHeader = !isSystem && !isGrouped;

      list.push({
        type: 'message',
        id: String(msg.id),
        message: msg,
        showHeader,
        isGrouped,
      });
      prevMsg = msg;
    });

    return list;
  }, [uniqueMessages]);

  const scrollToBottomSafe = useCallback((animated = true) => {
    const contentHeight = contentHeightRef.current;
    const layoutHeight = layoutHeightRef.current;
    if (contentHeight > 0 && layoutHeight > 0) {
      const offset = Math.max(0, contentHeight - layoutHeight);
      listRef.current?.scrollToOffset({ offset, animated });
    } else {
      listRef.current?.scrollToEnd({ animated });
    }
  }, []);

  const scheduleAutoScroll = useCallback(() => {
    if (!autoScrollRef.current) return;
    autoScrollTimers.current.forEach((id) => clearTimeout(id));
    autoScrollTimers.current = [];
    scrollToBottomSafe(false);
    const delays = [120, 360, 800];
    delays.forEach((delay) => {
      const id = setTimeout(() => {
        if (autoScrollRef.current) scrollToBottomSafe(false);
      }, delay);
      autoScrollTimers.current.push(id as unknown as number);
    });
  }, [scrollToBottomSafe]);

  useImperativeHandle(ref, () => ({
    scrollToBottom: (animated = true) => {
      autoScrollRef.current = true;
      scrollToBottomSafe(animated);
    },
    scrollToIndex: (index: number, viewPosition = 0.2) => {
      listRef.current?.scrollToIndex({ index, viewPosition, animated: true });
    },
  }));

  useEffect(() => {
    if (!items.length) return;
    if (autoScrollRef.current) {
      requestAnimationFrame(() => scheduleAutoScroll());
    }
  }, [items.length, scheduleAutoScroll]);

  useEffect(() => {
    if (!items.length) return;
    if (autoScrollRef.current) {
      requestAnimationFrame(() => scheduleAutoScroll());
    }
  }, [bottomInset, items.length, scheduleAutoScroll]);

  useEffect(() => {
    return () => {
      autoScrollTimers.current.forEach((id) => clearTimeout(id));
      autoScrollTimers.current = [];
    };
  }, []);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const paddingToBottom = 40;
    const isAtBottom =
      contentOffset.y + layoutMeasurement.height >= contentSize.height - paddingToBottom;
    if (isAtBottom !== atBottomRef.current) {
      atBottomRef.current = isAtBottom;
      onAtBottomChange?.(isAtBottom);
    }
    if (!isAtBottom && userDraggingRef.current) {
      autoScrollRef.current = false;
    }
    if (isAtBottom) {
      autoScrollRef.current = true;
    }
  };

  const handleLayout = (height: number) => {
    layoutHeightRef.current = height;
    if (autoScrollRef.current) {
      scheduleAutoScroll();
    }
  };

  const handleContentSizeChange = (height: number) => {
    contentHeightRef.current = height;
    if (autoScrollRef.current) {
      scheduleAutoScroll();
    }
  };

  return (
    <FlatList
      ref={listRef}
      data={items}
      keyExtractor={(item) => item.id}
      onLayout={(e) => handleLayout(e.nativeEvent.layout.height)}
      onContentSizeChange={(_, height) => handleContentSizeChange(height)}
      onScroll={handleScroll}
      onScrollBeginDrag={() => { userDraggingRef.current = true; }}
      onScrollEndDrag={() => { userDraggingRef.current = false; }}
      scrollEventThrottle={16}
      onScrollToIndexFailed={(info) => {
        const layoutHeight = layoutHeightRef.current;
        const contentHeight = contentHeightRef.current;
        const avg =
          info.averageItemLength > 0
            ? info.averageItemLength
            : contentHeight && items.length
            ? contentHeight / items.length
            : 0;
        const rawOffset = avg > 0 ? avg * info.index : 0;
        const maxOffset = contentHeight > 0 && layoutHeight > 0 ? contentHeight - layoutHeight : rawOffset;
        const offset = Math.max(0, Math.min(rawOffset, maxOffset));
        listRef.current?.scrollToOffset({ offset, animated: false });
        setTimeout(() => {
          listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.25, animated: false });
        }, 50);
      }}
      renderItem={({ item }) => {
        if (item.type === 'date') {
          return (
            <View style={styles.dateSeparator}>
              <Text style={styles.dateSeparatorText}>{item.label}</Text>
            </View>
          );
        }
        const msg = item.message;
        return (
          <MessageBubble
            message={msg}
            own={msg.sender?.id === currentUserId}
            presence={msg.sender?.id ? presenceMap[msg.sender.id] : undefined}
            showHeader={item.showHeader}
            isGrouped={item.isGrouped}
          />
        );
      }}
      contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}
    />
  );
});

MessagesList.displayName = 'MessagesList';
export default MessagesList;

function formatDateLabel(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

const styles = StyleSheet.create({
  container: { paddingVertical: 2 },
  dateSeparator: {
    alignSelf: 'center',
    marginVertical: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
  },
  dateSeparatorText: { fontSize: 11, fontWeight: '600', color: '#4B5563' },
});
