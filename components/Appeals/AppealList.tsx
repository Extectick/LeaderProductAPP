import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  ActivityIndicator,
  ViewStyle,
  StyleProp,
  View,
} from 'react-native';
import { getAppealsList } from '@/utils/appealsService';
import {
  AppealListItem,
  AppealPriority,
  AppealStatus,
  Scope,
} from '@/types/appealsTypes';
import AppealListItemForm from './AppealListItemForm';
import EmptyState from '@/components/ui/EmptyState';

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
  renderItem?: (item: AppealListItem) => React.ReactElement | null; // кастомный рендер; по умолчанию AppealCard
  refreshKey?: string | number | boolean; // при изменении — принудительный refresh с нуля
  endReachedThreshold?: number;          // порог срабатывания onEndReached
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
  renderItem,
  refreshKey,
  endReachedThreshold = 0.2,
}: AppealsListProps) {
  const [items, setItems] = useState<AppealListItem[]>([]);
  const [meta, setMeta] = useState<{ total: number; limit: number; offset: number }>({
    total: 0,
    limit: pageSize,
    offset: 0,
  });
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const filters = useMemo(() => ({ status, priority }), [status, priority]);

  const hasMore = useMemo(() => {
    const total = toNum(meta.total);
    const limit = toNum(meta.limit, pageSize);
    const offset = toNum(meta.offset);
    return offset + limit < total;
  }, [meta, pageSize]);

  async function load(initial = false) {
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

      setItems((prev) => (initial ? res.data : [...prev, ...res.data]));
      setMeta(normMeta);

      onLoadedMeta?.(normMeta);
      onItemsChange?.(initial ? res.data : [...items, ...res.data]);
    } catch (e) {
      if (initial) onLoadError?.(e);
      else onLoadMoreError?.(e);
      // можно также повесить тост
      console.warn('AppealsList load error:', e);
    } finally {
      if (initial) setLoading(false);
      setLoadingMore(false);
    }
  }

  // первичная загрузка и реакции на изменения параметров
  useEffect(() => {
    // сбрасываем оффсет и данные при смене параметров
    setMeta((m) => ({ ...m, limit: pageSize, offset: 0 }));
    setItems([]);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, status, priority, pageSize, refreshKey]);

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
        setItems((prev) => [...prev, ...res.data]);
        setMeta(normMeta);
        onLoadedMeta?.(normMeta);
        onItemsChange?.([...items, ...res.data]);
      })
      .catch((e) => {
        onLoadMoreError?.(e);
        console.warn('AppealsList pagination error:', e);
      })
      .finally(() => setLoadingMore(false));
  }

  return (
    <View style={[{ flex: 1 }, style]}>
      <FlatList
        data={items}
        keyExtractor={(it) => String(it.id)}
        renderItem={({ item }) =>
          renderItem ? renderItem(item) : <AppealListItemForm item={item} />
        }
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={
          !loading
            ? ListEmptyComponent ?? <EmptyState text="Обращения не найдены" />
            : null
        }
        contentContainerStyle={contentContainerStyle}
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
