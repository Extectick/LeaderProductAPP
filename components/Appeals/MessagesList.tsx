import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from 'react-native';
import { Skeleton } from 'moti/skeleton';
import { AppealMessage } from '@/src/entities/appeal/types';
import MessageBubble from './MessageBubble';
import { usePresence } from '@/hooks/usePresence';

type ListItem =
  | { type: 'date'; id: string; label: string }
  | { type: 'unread'; id: string; label: string }
  | {
      type: 'message';
      id: string;
      message: AppealMessage;
      showHeader: boolean;
      isGrouped: boolean;
    };

type AutoMode = 'initialAnchor' | 'manualBottom' | 'followNew';
type InitialPhase = 'bootstrapping' | 'positioning' | 'ready';
type ReadActivationMode = 'after_user_interaction' | 'immediate';

const GROUP_GAP_MINUTES = 5;

function getMessageSenderGroupKey(message: AppealMessage): string | null {
  if (message.type === 'SYSTEM') return null;

  const senderId = message.sender?.id;
  if (Number.isFinite(senderId)) return `id:${senderId}`;

  const email = (message.sender?.email || '').trim().toLowerCase();
  if (email) return `email:${email}`;

  const firstName = (message.sender?.firstName || '').trim().toLowerCase();
  const lastName = (message.sender?.lastName || '').trim().toLowerCase();
  if (firstName || lastName) return `name:${firstName}:${lastName}`;

  return null;
}

export type MessagesListHandle = {
  scrollToBottom: (animated?: boolean) => void;
  scrollToIndex: (index: number, viewPosition?: number) => void;
  scrollToMessageId: (messageId: number, viewPosition?: number) => void;
};

type MessagesListProps = {
  messages: AppealMessage[];
  currentUserId?: number;
  bottomInset?: number;
  onAtBottomChange?: (atBottom: boolean) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  onVisibleMessageIds?: (ids: number[]) => void;
  enableVisibilityTracking?: boolean;
  initialAnchorMessageId?: number | null;
  isInitialLoading?: boolean;
  onInitialPositioned?: () => void;
  readActivationMode?: ReadActivationMode;
  onUserInteraction?: () => void;
  onRetryLocalMessage?: (message: AppealMessage) => void;
  onCancelLocalMessage?: (message: AppealMessage) => void;
  onSenderPress?: (userId: number) => void;
};

const MessagesList = React.forwardRef<MessagesListHandle, MessagesListProps>(
  (
    {
      messages,
      currentUserId,
      bottomInset = 0,
      onAtBottomChange,
      hasMore = false,
      isLoadingMore = false,
      onLoadMore,
      onVisibleMessageIds,
      enableVisibilityTracking = true,
      initialAnchorMessageId = null,
      isInitialLoading = false,
      onInitialPositioned,
      readActivationMode = 'after_user_interaction',
      onUserInteraction,
      onRetryLocalMessage,
      onCancelLocalMessage,
      onSenderPress,
    },
    ref
  ) => {
    const listRef = useRef<FlatList<ListItem>>(null);
    const userDraggingRef = useRef(false);
    const atBottomRef = useRef(true);
    const layoutHeightRef = useRef(0);
    const contentHeightRef = useRef(0);
    const scrollOffsetRef = useRef(0);
    const loadingMoreRef = useRef(isLoadingMore);
    const prependingRef = useRef(false);
    const preAppendOffsetRef = useRef(0);
    const preAppendHeightRef = useRef(0);
    const onVisibleRef = useRef(onVisibleMessageIds);
    const enableVisibilityTrackingRef = useRef(enableVisibilityTracking);
    const loadMoreLockRef = useRef(false);
    const autoModeRef = useRef<AutoMode>(isInitialLoading ? 'initialAnchor' : 'followNew');
    const initialPositionedRef = useRef(false);
    const pendingInitialAnchorRef = useRef<number | null | undefined>(undefined);
    const initialFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const initialBottomSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const initialBottomFinalizeScheduledRef = useRef(false);
    const initialPhaseRef = useRef<InitialPhase>(isInitialLoading ? 'bootstrapping' : 'ready');
    const lastVisibleIdsRef = useRef<number[]>([]);
    const userInteractionNotifiedRef = useRef(false);

    const devLog = useCallback((stage: string, extra?: Record<string, any>) => {
      if (!__DEV__) return;
      console.log('[messages-list]', { stage, ...(extra || {}) });
    }, []);

    useEffect(() => {
      onVisibleRef.current = onVisibleMessageIds;
    }, [onVisibleMessageIds]);

    useEffect(() => {
      enableVisibilityTrackingRef.current = enableVisibilityTracking;
    }, [enableVisibilityTracking]);

    useEffect(() => {
      loadingMoreRef.current = isLoadingMore;
      if (!isLoadingMore) {
        loadMoreLockRef.current = false;
        if (prependingRef.current) {
          const delta = contentHeightRef.current - preAppendHeightRef.current;
          if (delta <= 0) prependingRef.current = false;
        }
      }
    }, [isLoadingMore]);

    useEffect(() => {
      if (isInitialLoading) {
        initialPhaseRef.current = 'bootstrapping';
        autoModeRef.current = 'initialAnchor';
        initialPositionedRef.current = false;
        pendingInitialAnchorRef.current = undefined;
        initialBottomFinalizeScheduledRef.current = false;
        lastVisibleIdsRef.current = [];
        userInteractionNotifiedRef.current = false;
        devLog('bootstrapping');
        if (initialFallbackTimerRef.current) {
          clearTimeout(initialFallbackTimerRef.current);
          initialFallbackTimerRef.current = null;
        }
        if (initialBottomSettleTimerRef.current) {
          clearTimeout(initialBottomSettleTimerRef.current);
          initialBottomSettleTimerRef.current = null;
        }
        requestAnimationFrame(() => {
          listRef.current?.scrollToOffset({ offset: 0, animated: false });
        });
      } else if (initialPositionedRef.current) {
        initialPhaseRef.current = 'ready';
      }
    }, [devLog, isInitialLoading, initialAnchorMessageId]);

    useEffect(() => {
      return () => {
        if (initialFallbackTimerRef.current) {
          clearTimeout(initialFallbackTimerRef.current);
          initialFallbackTimerRef.current = null;
        }
        if (initialBottomSettleTimerRef.current) {
          clearTimeout(initialBottomSettleTimerRef.current);
          initialBottomSettleTimerRef.current = null;
        }
      };
    }, []);

    const uniqueMessages = useMemo(() => {
      const map = new Map<number, AppealMessage>();
      messages.forEach((m) => map.set(m.id, m));
      return Array.from(map.values()).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
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
      let unreadInserted = false;

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
        const currentSenderKey = getMessageSenderGroupKey(msg);
        const prevSenderKey = prevMsg ? getMessageSenderGroupKey(prevMsg) : null;
        const sameSender =
          !!prevMsg &&
          !!currentSenderKey &&
          !!prevSenderKey &&
          currentSenderKey === prevSenderKey;
        const diffMinutes = prevDate
          ? Math.abs(msgDate.getTime() - prevDate.getTime()) / 60000
          : Infinity;
        const isSystem = msg.type === 'SYSTEM';
        const isGrouped = !isSystem && sameSender && diffMinutes <= GROUP_GAP_MINUTES;
        const showHeader = !isSystem && !isGrouped;

        if (!unreadInserted && initialAnchorMessageId && msg.id === initialAnchorMessageId) {
          list.push({
            type: 'unread',
            id: `unread-${initialAnchorMessageId}`,
            label: 'Непрочитанные',
          });
          unreadInserted = true;
        }

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
    }, [initialAnchorMessageId, uniqueMessages]);

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

    const maybeFollowToBottom = useCallback(() => {
      if (autoModeRef.current !== 'followNew') return;
      if (!atBottomRef.current) return;
      if (prependingRef.current || loadingMoreRef.current) return;
      requestAnimationFrame(() => scrollToBottomSafe(false));
    }, [scrollToBottomSafe]);

    const alignInitialBottom = useCallback(() => {
      const contentHeight = contentHeightRef.current;
      const layoutHeight = layoutHeightRef.current;
      if (!(contentHeight > 0 && layoutHeight > 0)) {
        listRef.current?.scrollToEnd({ animated: false });
        return false;
      }
      const offset = Math.max(0, contentHeight - layoutHeight);
      scrollOffsetRef.current = offset;
      if (!atBottomRef.current) {
        atBottomRef.current = true;
        onAtBottomChange?.(true);
      }
      listRef.current?.scrollToOffset({ offset, animated: false });
      return true;
    }, [onAtBottomChange]);

    const finalizeInitialBottomPosition = useCallback(() => {
      if (initialPositionedRef.current) return;
      if (initialBottomSettleTimerRef.current) {
        clearTimeout(initialBottomSettleTimerRef.current);
      }
      // На web даем чуть больше времени, чтобы скрыть возможную докрутку после виртуализации.
      const settleDelay = Platform.OS === 'web' ? 140 : 70;
      initialBottomSettleTimerRef.current = setTimeout(() => {
        initialBottomSettleTimerRef.current = null;
        requestAnimationFrame(() => {
          alignInitialBottom();
          requestAnimationFrame(() => {
            alignInitialBottom();
            autoModeRef.current = 'followNew';
            completeInitialPositionRef.current();
          });
        });
      }, settleDelay);
    }, [alignInitialBottom]);

    const scheduleInitialBottomFinalize = useCallback(() => {
      if (initialBottomFinalizeScheduledRef.current) return;
      initialBottomFinalizeScheduledRef.current = true;
      requestAnimationFrame(() => {
        alignInitialBottom();
        finalizeInitialBottomPosition();
      });
    }, [alignInitialBottom, finalizeInitialBottomPosition]);

    const completeInitialPosition = useCallback(() => {
      if (initialPositionedRef.current) return;
      initialPositionedRef.current = true;
      initialPhaseRef.current = 'ready';
      pendingInitialAnchorRef.current = undefined;
      if (initialFallbackTimerRef.current) {
        clearTimeout(initialFallbackTimerRef.current);
        initialFallbackTimerRef.current = null;
      }
      if (initialBottomSettleTimerRef.current) {
        clearTimeout(initialBottomSettleTimerRef.current);
        initialBottomSettleTimerRef.current = null;
      }
      devLog('position confirmed', { mode: autoModeRef.current });
      onInitialPositioned?.();
    }, [devLog, onInitialPositioned]);

    const completeInitialPositionRef = useRef(completeInitialPosition);
    useEffect(() => {
      completeInitialPositionRef.current = completeInitialPosition;
    }, [completeInitialPosition]);

    const finalizeInitialAnchorPosition = useCallback(
      (anchorId: number) => {
        if (initialPositionedRef.current) return;
        const idx = items.findIndex((it) => it.type === 'message' && Number(it.id) === anchorId);
        if (idx >= 0) {
          listRef.current?.scrollToIndex({ index: idx, viewPosition: 0.25, animated: false });
        }
        requestAnimationFrame(() => {
          if (idx >= 0) {
            listRef.current?.scrollToIndex({ index: idx, viewPosition: 0.25, animated: false });
          }
          completeInitialPositionRef.current();
        });
      },
      [items]
    );
    const finalizeInitialAnchorPositionRef = useRef(finalizeInitialAnchorPosition);
    useEffect(() => {
      finalizeInitialAnchorPositionRef.current = finalizeInitialAnchorPosition;
    }, [finalizeInitialAnchorPosition]);

    const notifyUserInteraction = useCallback(() => {
      if (readActivationMode !== 'after_user_interaction') return;
      if (userInteractionNotifiedRef.current) return;
      userInteractionNotifiedRef.current = true;
      onUserInteraction?.();
    }, [onUserInteraction, readActivationMode]);

    useImperativeHandle(ref, () => ({
      scrollToBottom: (animated = true) => {
        autoModeRef.current = 'followNew';
        scrollToBottomSafe(animated);
      },
      scrollToIndex: (index: number, viewPosition = 0.2) => {
        listRef.current?.scrollToIndex({ index, viewPosition, animated: true });
      },
      scrollToMessageId: (messageId: number, viewPosition = 0.2) => {
        const idx = items.findIndex((it) => it.type === 'message' && Number(it.id) === messageId);
        if (idx >= 0) {
          listRef.current?.scrollToIndex({ index: idx, viewPosition, animated: false });
        }
      },
    }));

    useEffect(() => {
      if (autoModeRef.current === 'initialAnchor') return;
      maybeFollowToBottom();
    }, [items.length, maybeFollowToBottom]);

    useEffect(() => {
      if (autoModeRef.current === 'initialAnchor') return;
      maybeFollowToBottom();
    }, [bottomInset, maybeFollowToBottom]);

    useEffect(() => {
      if (autoModeRef.current !== 'initialAnchor') return;
      if (initialPositionedRef.current) return;
      if (!items.length) return;
      if (initialPhaseRef.current === 'bootstrapping') {
        initialPhaseRef.current = 'positioning';
        devLog('positioning started', {
          anchorMessageId: initialAnchorMessageId ?? null,
          itemsCount: items.length,
        });
      }

      requestAnimationFrame(() => {
        if (initialAnchorMessageId) {
          const idx = items.findIndex(
            (it) => it.type === 'message' && Number(it.id) === initialAnchorMessageId
          );
          if (idx >= 0) {
            listRef.current?.scrollToIndex({ index: idx, viewPosition: 0.25, animated: false });
            pendingInitialAnchorRef.current = initialAnchorMessageId;
          } else {
            scrollToBottomSafe(false);
            pendingInitialAnchorRef.current = null;
            initialBottomFinalizeScheduledRef.current = false;
          }
          autoModeRef.current = 'manualBottom';
        } else {
          pendingInitialAnchorRef.current = null;
          initialBottomFinalizeScheduledRef.current = false;
          if (alignInitialBottom()) {
            scheduleInitialBottomFinalize();
          }
        }

        if (initialFallbackTimerRef.current) clearTimeout(initialFallbackTimerRef.current);
        initialFallbackTimerRef.current = setTimeout(() => {
          if (pendingInitialAnchorRef.current === null) {
            alignInitialBottom();
            initialBottomFinalizeScheduledRef.current = false;
            scheduleInitialBottomFinalize();
            return;
          } else if (typeof pendingInitialAnchorRef.current === 'number') {
            finalizeInitialAnchorPosition(pendingInitialAnchorRef.current);
            return;
          }
          completeInitialPositionRef.current();
        }, initialAnchorMessageId ? 1400 : 1200);
      });
    }, [
      alignInitialBottom,
      devLog,
      finalizeInitialAnchorPosition,
      initialAnchorMessageId,
      items,
      scheduleInitialBottomFinalize,
      scrollToBottomSafe,
    ]);

    const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const prevOffset = scrollOffsetRef.current;
      scrollOffsetRef.current = contentOffset.y;

      const bottomPadding = 40;
      const isAtBottom =
        contentOffset.y + layoutMeasurement.height >= contentSize.height - bottomPadding;
      if (isAtBottom !== atBottomRef.current) {
        atBottomRef.current = isAtBottom;
        onAtBottomChange?.(isAtBottom);
      }

      if (initialPhaseRef.current === 'ready') {
        if (Math.abs(contentOffset.y - prevOffset) > 1) {
          notifyUserInteraction();
        }
        if (isAtBottom && autoModeRef.current !== 'initialAnchor') {
          autoModeRef.current = 'followNew';
        } else if (
          !isAtBottom &&
          userDraggingRef.current &&
          autoModeRef.current !== 'initialAnchor'
        ) {
          autoModeRef.current = 'manualBottom';
        }
      }

      const nearTop = contentOffset.y <= 80;
      if (
        !isInitialLoading &&
        initialPositionedRef.current &&
        initialPhaseRef.current === 'ready' &&
        autoModeRef.current !== 'initialAnchor' &&
        nearTop &&
        hasMore &&
        !loadingMoreRef.current &&
        !prependingRef.current &&
        !loadMoreLockRef.current &&
        typeof onLoadMore === 'function'
      ) {
        loadMoreLockRef.current = true;
        prependingRef.current = true;
        preAppendOffsetRef.current = contentOffset.y;
        preAppendHeightRef.current = contentHeightRef.current;
        onLoadMore();
      }
    };

    const handleLayout = (height: number) => {
      layoutHeightRef.current = height;
      if (
        autoModeRef.current === 'initialAnchor' &&
        !initialPositionedRef.current &&
        pendingInitialAnchorRef.current === null
      ) {
        if (alignInitialBottom()) {
          scheduleInitialBottomFinalize();
        }
      }
      maybeFollowToBottom();
    };

    const handleContentSizeChange = (height: number) => {
      const prevHeight = contentHeightRef.current;
      contentHeightRef.current = height;

      if (prependingRef.current) {
        const delta = height - preAppendHeightRef.current;
        if (delta !== 0) {
          listRef.current?.scrollToOffset({
            offset: Math.max(0, preAppendOffsetRef.current + delta),
            animated: false,
          });
        }
        prependingRef.current = false;
        return;
      }

      if (
        autoModeRef.current === 'initialAnchor' &&
        !initialPositionedRef.current &&
        pendingInitialAnchorRef.current === null
      ) {
        if (alignInitialBottom()) {
          scheduleInitialBottomFinalize();
          return;
        }
      }

      if (height !== prevHeight) {
        maybeFollowToBottom();
      }
    };

    const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;
    useEffect(() => {
      if (!enableVisibilityTracking) return;
      if (initialPhaseRef.current !== 'ready') return;
      if (!lastVisibleIdsRef.current.length) return;
      onVisibleRef.current?.(lastVisibleIdsRef.current);
    }, [enableVisibilityTracking]);

    const onViewableItemsChanged = useRef(
      ({ viewableItems }: { viewableItems: ViewToken[] }) => {
        const ids = viewableItems
          .filter((v) => v.item?.type === 'message')
          .map((v) => Number(v.item?.id))
          .filter((id) => Number.isFinite(id));
        lastVisibleIdsRef.current = ids;
        if (
          !initialPositionedRef.current &&
          typeof pendingInitialAnchorRef.current === 'number' &&
          ids.includes(pendingInitialAnchorRef.current)
        ) {
          finalizeInitialAnchorPositionRef.current(pendingInitialAnchorRef.current);
        }
        if (
          ids.length &&
          enableVisibilityTrackingRef.current &&
          initialPhaseRef.current === 'ready' &&
          onVisibleRef.current
        ) {
          onVisibleRef.current(ids);
        }
      }
    );

    return (
      <View style={styles.root}>
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(item) => item.id}
          onLayout={(e) => handleLayout(e.nativeEvent.layout.height)}
          onContentSizeChange={(_, height) => handleContentSizeChange(height)}
          onScroll={handleScroll}
          onTouchStart={() => notifyUserInteraction()}
          onScrollBeginDrag={() => {
            userDraggingRef.current = true;
            notifyUserInteraction();
          }}
          onMomentumScrollBegin={() => notifyUserInteraction()}
          onScrollEndDrag={() => {
            userDraggingRef.current = false;
          }}
          scrollEventThrottle={16}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged.current}
          ListHeaderComponent={
            isLoadingMore ? (
              <View style={styles.loadingHeader}>
                <ActivityIndicator size="small" color="#6B7280" />
              </View>
            ) : null
          }
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
            const maxOffset =
              contentHeight > 0 && layoutHeight > 0 ? contentHeight - layoutHeight : rawOffset;
            const offset = Math.max(0, Math.min(rawOffset, maxOffset));
            listRef.current?.scrollToOffset({ offset, animated: false });
            setTimeout(() => {
              listRef.current?.scrollToIndex({
                index: info.index,
                viewPosition: 0.25,
                animated: false,
              });
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
            if (item.type === 'unread') {
              return (
                <View style={styles.unreadSeparator}>
                  <View style={styles.unreadLine} />
                  <Text style={styles.unreadText}>{item.label}</Text>
                  <View style={styles.unreadLine} />
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
                onRetryLocalMessage={onRetryLocalMessage}
                onCancelLocalMessage={onCancelLocalMessage}
                onSenderPress={onSenderPress}
              />
            );
          }}
          style={isInitialLoading ? styles.hiddenList : undefined}
          contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}
        />

        {isInitialLoading ? (
          <View style={styles.initialLoadingOverlay} pointerEvents="none">
            {Array.from({ length: 6 }).map((_, idx) => (
              <View key={`msg-skeleton-${idx}`} style={styles.initialLoadingRow}>
                <Skeleton height={12} width="35%" radius={6} colorMode="light" />
                <Skeleton
                  height={16}
                  width={idx % 2 ? '65%' : '78%'}
                  radius={8}
                  colorMode="light"
                />
                <Skeleton
                  height={16}
                  width={idx % 2 ? '40%' : '55%'}
                  radius={8}
                  colorMode="light"
                />
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  }
);

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
  root: { flex: 1 },
  hiddenList: { opacity: 0 },
  container: { paddingVertical: 2 },
  initialLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: 12,
    paddingHorizontal: 8,
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  initialLoadingRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEF2F7',
    padding: 10,
    gap: 8,
  },
  dateSeparator: {
    alignSelf: 'center',
    marginVertical: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
  },
  dateSeparatorText: { fontSize: 11, fontWeight: '600', color: '#4B5563' },
  loadingHeader: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    marginVertical: 6,
  },
  unreadLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#BFDBFE',
  },
  unreadText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
});

