import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  ActivityIndicator,
  ViewStyle,
  StyleProp,
  View,
  StyleSheet,
} from 'react-native';
import { Skeleton } from 'moti/skeleton';
import { getAppealsList } from '@/utils/appealsService';
import {
  AppealListItem,
  AppealPriority,
  AppealStatus,
  Scope,
} from '@/src/entities/appeal/types';
import AppealListItemForm from './AppealListItemForm';
import EmptyState from '@/components/ui/EmptyState';
import {
  appendListPage,
  getListSnapshot,
  setListPage,
  subscribe as subscribeStore,
} from '@/utils/appealsStore';

type AppealsListProps = {
  scope?: Scope;                         // 'my' | 'department' | 'assigned'
  status?: AppealStatus;                 // фильтр статуса
  priority?: AppealPriority;             // фильтр приоритета
  pageSize?: number;                     // размер страницы (default 20)
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  ListHeaderComponent?: React.ComponentType<any> | React.ReactElement | null;
  ListEmptyComponent?: React.ComponentType<any> | React.ReactElement | null;
  onLoadError?: (e: unknown) => void;    // ошибка первичной загрузки/refresh
  onLoadMoreError?: (e: unknown) => void;// ошибка догрузки
  onLoadedMeta?: (meta: { total: number; limit: number; offset: number }) => void; // коллбэк с метаданными
  onItemsChange?: (items: AppealListItem[]) => void; // коллбэк при изменении данных
  onRefreshDone?: () => void;
  renderItem?: (item: AppealListItem) => React.ReactElement | null; // кастомный рендер; по умолчанию AppealCard
  refreshKey?: string | number | boolean; // при изменении - принудительный refresh с нуля
  endReachedThreshold?: number;          // порог срабатывания onEndReached
  filterItems?: (items: AppealListItem[]) => AppealListItem[]; // пост-фильтрация на клиенте
  currentUserId?: number;
  incomingMessage?: { appealId: number; id: number; senderId?: number; createdAt: string; text?: string };
  initialItems?: AppealListItem[];
  listKey?: string; // уникальный ключ списка для локального стора
  displayFilter?: (item: AppealListItem) => boolean;
};

const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export default function AppealsList({
  scope = 'my',
  status,
  priority,
  pageSize = 20,
  style,
  contentContainerStyle,
  ListHeaderComponent,
  ListEmptyComponent,
  onLoadError,
  onLoadMoreError,
  onLoadedMeta,
  onItemsChange,
  onRefreshDone,
  renderItem,
  refreshKey,
  endReachedThreshold = 0.2,
  filterItems,
  currentUserId,
  incomingMessage,
  initialItems,
  listKey,
  displayFilter,
}: AppealsListProps) {
  const cacheKey = useMemo(
    () =>
      listKey ??
      `scope:${scope}-status:${status || 'any'}-priority:${priority || 'any'}`,
    [listKey, priority, scope, status]
  );
  const [items, setItems] = useState<AppealListItem[]>([]);
  const [meta, setMeta] = useState<{ total: number; limit: number; offset: number }>({
    total: 0,
    limit: pageSize,
    offset: 0,
  });
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const emptyText = scope === 'department' ? 'Задач отдела пока нет' : 'Обращений пока нет';
  const showSkeleton = loading && items.length === 0;
  const displayItems = useMemo(
    () => (displayFilter ? items.filter(displayFilter) : items),
    [items, displayFilter]
  );

  const filters = useMemo(() => ({ status, priority }), [status, priority]);

  const hasMore = useMemo(() => {
    const total = toNum(meta.total);
    const limit = toNum(meta.limit, pageSize);
    const offset = toNum(meta.offset);
    return offset + limit < total;
  }, [meta, pageSize]);

  async function load(initial = false, retry = true) {
    if (initial) setLoading(true);
    try {
      const res = await getAppealsList(scope, pageSize, initial ? 0 : meta.offset, {
        ...filters,
        forceRefresh: initial,
      });

      const normMeta = {
        total: toNum(res.meta?.total, 0),
        limit: toNum(res.meta?.limit, pageSize),
        offset: toNum(res.meta?.offset, initial ? 0 : meta.offset),
      };

      const nextData = filterItems ? filterItems(res.data) : res.data;
      await setListPage(cacheKey, nextData, normMeta, initial);
      const snap = getListSnapshot(cacheKey);
      setItems(snap.items);
      setMeta({
        total: toNum(snap.meta?.total, normMeta.total),
        limit: toNum(snap.meta?.limit, normMeta.limit),
        offset: toNum(snap.meta?.offset, normMeta.offset),
      });
      // debug: показать сколько элементов пришло
      console.log('[AppealsList] loaded', nextData.length, 'items; scope=', scope);

      onLoadedMeta?.(normMeta);
      onItemsChange?.(snap.items);
    } catch (e: any) {
      const msg = e?.message || '';
      if (retry && /Unauthorized/i.test(msg)) {
        return load(initial, false);
      }
      if (initial) onLoadError?.(e);
      else onLoadMoreError?.(e);
      // можно также повесить тост
      console.warn('AppealsList load error:', e);
    } finally {
      if (initial) setLoading(false);
      setLoadingMore(false);
      if (initial) onRefreshDone?.();
    }
  }

  // первичная загрузка и реакции на изменения параметров
  useEffect(() => {
    if (initialItems && initialItems.length > 0) {
      setItems(initialItems);
      setMeta((m) => ({ ...m, limit: pageSize, offset: 0 }));
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialItems]);

  useEffect(() => {
    if (!ready) return;
    // сбрасываем оффсет и данные при смене параметров и делаем загрузку
    setMeta((m) => ({ ...m, limit: pageSize, offset: 0 }));
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, status, priority, pageSize, refreshKey, ready]);

  // Подписка на локальный стор — обновляем список при любом изменении (новые сообщения, локальный кэш и т.п.)
  useEffect(() => {
    // первичный слепок
    const snap = getListSnapshot(cacheKey);
    if (snap.items.length) {
      setItems(snap.items);
      setMeta((m) => ({
        total: toNum(snap.meta?.total, m.total),
        limit: toNum(snap.meta?.limit, pageSize),
        offset: toNum(snap.meta?.offset, m.offset),
      }));
    }

    const unsub = subscribeStore(() => {
      const next = getListSnapshot(cacheKey);
      setItems(next.items);
      setMeta((m) => ({
        total: toNum(next.meta?.total, m.total),
        limit: toNum(next.meta?.limit, pageSize),
        offset: toNum(next.meta?.offset, m.offset),
      }));
      onItemsChange?.(next.items);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  // Если пришло событие по сокету — просто берём актуальный слепок из стора (его обновляет upsertMessage)
  useEffect(() => {
    if (!incomingMessage) return;
    const snap = getListSnapshot(cacheKey);
    setItems(snap.items);
    setMeta((m) => ({
      total: toNum(snap.meta?.total, m.total),
      limit: toNum(snap.meta?.limit, m.limit),
      offset: toNum(snap.meta?.offset, m.offset),
    }));
  }, [incomingMessage, cacheKey]);

  function handleEndReached() {
    if (!hasMore || loadingMore || loading) return;

    const nextOffset = toNum(meta.offset) + toNum(meta.limit, pageSize);
    setLoadingMore(true);

    // Можно предварительно подвинуть offset для отзывчивости UI
    setMeta((m) => ({ ...m, offset: nextOffset }));

    getAppealsList(scope, pageSize, nextOffset, filters)
      .then((res) => {
        const normMeta = {
          total: toNum(res.meta?.total, meta.total),
          limit: toNum(res.meta?.limit, pageSize),
          offset: toNum(res.meta?.offset, nextOffset),
        };
        const nextData = filterItems ? filterItems(res.data) : res.data;
        appendListPage(cacheKey, nextData, normMeta).then(() => {
          const snap = getListSnapshot(cacheKey);
          setItems(snap.items);
          setMeta((m) => ({
            total: toNum(snap.meta?.total, normMeta.total),
            limit: toNum(snap.meta?.limit, normMeta.limit),
            offset: toNum(snap.meta?.offset, normMeta.offset),
          }));
          console.log('[AppealsList] load more', nextData.length, 'items; scope=', scope);
          onLoadedMeta?.(normMeta);
          onItemsChange?.(snap.items);
        });
      })
      .catch((e) => {
        onLoadMoreError?.(e);
        console.warn('AppealsList pagination error:', e);
      })
      .finally(() => setLoadingMore(false));
  }

  return (
    <View style={[{ flex: 1, minHeight: 0 }, style]}>
      <FlatList
        style={{ flex: 1, minHeight: 0 }}
        data={displayItems}
        keyExtractor={(it) => String(it.id)}
        renderItem={({ item }) =>
          renderItem ? (
            renderItem(item)
          ) : (
            <AppealListItemForm
              item={item}
              currentUserId={currentUserId}
              listContext={scope}
            />
          )
        }
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={
          showSkeleton
            ? <AppealsListSkeleton />
            : !loading
            ? ListEmptyComponent ?? <EmptyState text={emptyText} />
            : null
        }
        contentContainerStyle={[
          { paddingBottom: 12, flexGrow: 1 },
          contentContainerStyle as any,
        ]}
        onEndReached={handleEndReached}
        onEndReachedThreshold={endReachedThreshold}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => load(true)} />
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null
        }
      />
    </View>
  );
}

function AppealsListSkeleton() {
  const rows = Array.from({ length: 6 }, (_, i) => i);
  return (
    <View style={styles.skeletonWrapper}>
      {rows.map((idx) => (
        <View key={`appeal-skeleton-${idx}`} style={styles.skeletonCard}>
          <Skeleton height={16} width="70%" radius={6} colorMode="light" />
          <View style={styles.skeletonRow}>
            <Skeleton height={18} width={90} radius={9} colorMode="light" />
            <Skeleton height={18} width={80} radius={9} colorMode="light" />
            <Skeleton height={18} width={120} radius={9} colorMode="light" />
          </View>
          <View style={styles.skeletonRow}>
            <Skeleton height={12} width={60} radius={6} colorMode="light" />
            <Skeleton height={12} width="65%" radius={6} colorMode="light" />
          </View>
          <Skeleton height={4} width="100%" radius={4} colorMode="light" />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonWrapper: { paddingVertical: 6 },
  skeletonCard: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderColor: '#EEF2F7',
    gap: 8,
  },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});

