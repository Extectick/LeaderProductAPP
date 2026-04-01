import TabBarSpacer from '@/components/Navigation/TabBarSpacer';
import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';
import { useThemeColor } from '@/hooks/useThemeColor';
import type { StockHierarchy, StockLeafRow, StockRootGroup, StockSecondLevelGroup } from './types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type ChildrenPageState = {
  items: StockSecondLevelGroup[];
  total: number;
  hasMore: boolean;
  nextOffset: number;
};

type LeavesPageState = {
  items: StockLeafRow[];
  total: number;
  hasMore: boolean;
  nextOffset: number;
};

type Props = {
  roots: StockRootGroup[];
  organizations: Array<{ guid: string; name: string }>;
  hierarchy: StockHierarchy;
  onChangeHierarchy: (value: StockHierarchy) => void;
  organizationGuid: string;
  onChangeOrganization: (value: string) => void;
  search: string;
  onChangeSearch: (value: string) => void;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  onRefresh: () => void;
  onLoadMore: () => void;
  canLoadMore: boolean;
  lastStockSyncedAt: string | null;
  childrenByRootGuid: Record<string, ChildrenPageState>;
  leavesByGroupKey: Record<string, LeavesPageState>;
  loadingNodeIds: Record<string, boolean>;
  onToggleRoot: (rootGuid: string, options?: { reset?: boolean }) => Promise<void>;
  onLoadMoreRootChildren: (rootGuid: string) => Promise<void>;
  onToggleGroup: (rootGuid: string, groupGuid: string, options?: { reset?: boolean }) => Promise<void>;
  onLoadMoreGroupLeaves: (rootGuid: string, groupGuid: string) => Promise<void>;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('ru-RU');
}

function formatUnit(item: StockLeafRow) {
  return item.product.unit?.symbol || item.product.unit?.name || '—';
}

function StockLeafCard({ item }: { item: StockLeafRow }) {
  const unit = formatUnit(item);

  return (
    <View style={styles.leafCard}>
      <View style={styles.titleRow}>
        <Ionicons name="cube-outline" size={18} color="#0F766E" />
        <Text style={styles.leafTitle}>{item.product.name}</Text>
      </View>
      <Text style={styles.leafSubtitle}>
        {item.warehouse.name} • {unit}
      </Text>
      <View style={styles.badgesRow}>
        <View style={[styles.badge, styles.badgeTeal]}>
          <Text style={styles.badgeText}>{item.organization?.name || 'Без организации'}</Text>
        </View>
        <View style={[styles.badge, styles.badgeAmber]}>
          <Text style={styles.badgeText}>{item.series?.number || 'Без серии'}</Text>
        </View>
      </View>
      <View style={styles.metricsRow}>
        <Text style={styles.metricText}>
          Остаток: {formatNumber(item.quantity)} {unit}
        </Text>
        <Text style={styles.metricText}>
          Резерв: {formatNumber(item.reserved)} {unit}
        </Text>
        <Text style={styles.metricText}>
          Доступно: {formatNumber(item.available)} {unit}
        </Text>
      </View>
      <Text style={styles.leafMeta}>
        Произв.: {formatDate(item.series?.productionDate)} • Годен до: {formatDate(item.series?.expiresAt)}
      </Text>
      <Text style={styles.leafMeta}>Обновлено: {formatDate(item.updatedAt)}</Text>
    </View>
  );
}

export default function MobileStockBalancesScreen(props: Props) {
  const topInset = useHeaderContentTopInset({ hasSubtitle: true });
  const background = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const [expandedRoots, setExpandedRoots] = React.useState<Record<string, boolean>>({});
  const [expandedChildren, setExpandedChildren] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    setExpandedRoots({});
    setExpandedChildren({});
  }, [props.hierarchy, props.organizationGuid, props.search, props.roots.length]);

  const toggleRoot = React.useCallback(
    async (item: StockRootGroup) => {
      const nextExpanded = !(expandedRoots[item.id] ?? false);
      setExpandedRoots((prev) => ({ ...prev, [item.id]: nextExpanded }));
      if (nextExpanded) {
        await props.onToggleRoot(item.guid);
      }
    },
    [expandedRoots, props]
  );

  const toggleChild = React.useCallback(
    async (rootGuid: string, child: StockSecondLevelGroup) => {
      const key = `${rootGuid}:${child.guid}`;
      const nextExpanded = !(expandedChildren[key] ?? false);
      setExpandedChildren((prev) => ({ ...prev, [key]: nextExpanded }));
      if (nextExpanded) {
        await props.onToggleGroup(rootGuid, child.guid);
      }
    },
    [expandedChildren, props]
  );

  return (
    <FlatList
      data={props.roots}
      keyExtractor={(item) => item.id}
      style={{ flex: 1, backgroundColor: background }}
      refreshControl={<RefreshControl refreshing={props.refreshing} onRefresh={props.onRefresh} />}
      ListHeaderComponent={
        <View style={[styles.headerWrap, { paddingTop: topInset + 16 }]}>
          <Text style={[styles.headerTitle, { color: textColor }]}>Остатки</Text>
          <Text style={styles.headerSubtitle}>Синхронизация: {formatDate(props.lastStockSyncedAt)}</Text>

          <TextInput
            value={props.search}
            onChangeText={props.onChangeSearch}
            placeholder="Поиск по складу, товару, организации, серии"
            placeholderTextColor="#94A3B8"
            style={[styles.searchInput, { backgroundColor: cardBackground, color: textColor }]}
          />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.controlsRow}>
            <Pressable
              onPress={() => props.onChangeHierarchy('warehouse-product')}
              style={[styles.toggleChip, props.hierarchy === 'warehouse-product' && styles.toggleChipActive]}
            >
              <Text style={[styles.toggleChipText, props.hierarchy === 'warehouse-product' && styles.toggleChipTextActive]}>
                Склад → Номенклатура
              </Text>
            </Pressable>
            <Pressable
              onPress={() => props.onChangeHierarchy('product-warehouse')}
              style={[styles.toggleChip, props.hierarchy === 'product-warehouse' && styles.toggleChipActive]}
            >
              <Text style={[styles.toggleChipText, props.hierarchy === 'product-warehouse' && styles.toggleChipTextActive]}>
                Номенклатура → Склад
              </Text>
            </Pressable>
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.controlsRow}>
            <Pressable
              onPress={() => props.onChangeOrganization('')}
              style={[styles.orgChip, !props.organizationGuid && styles.orgChipActive]}
            >
              <Text style={styles.orgChipText}>Все организации</Text>
            </Pressable>
            {props.organizations.map((item) => (
              <Pressable
                key={item.guid}
                onPress={() => props.onChangeOrganization(item.guid)}
                style={[styles.orgChip, props.organizationGuid === item.guid && styles.orgChipActive]}
              >
                <Text style={styles.orgChipText}>{item.name}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {props.error ? <Text style={styles.errorText}>{props.error}</Text> : null}
        </View>
      }
      contentContainerStyle={{ paddingBottom: 16 }}
      ListFooterComponent={
        <View style={styles.footerWrap}>
          {props.canLoadMore ? (
            <Pressable onPress={props.onLoadMore} style={styles.loadMoreBtn}>
              <Ionicons name="chevron-down-outline" size={18} color="#0F172A" />
              <Text style={styles.loadMoreText}>Показать ещё группы</Text>
            </Pressable>
          ) : null}
          <TabBarSpacer />
        </View>
      }
      renderItem={({ item }) => {
        const rootExpanded = expandedRoots[item.id] ?? false;
        const rootState = props.childrenByRootGuid[item.guid];
        const rootLoading = !!props.loadingNodeIds[`root:${item.guid}`];

        return (
          <View style={[styles.rootCard, { backgroundColor: cardBackground }]}>
            <Pressable onPress={() => void toggleRoot(item)} style={styles.rootHeader}>
              <Ionicons name="folder-open-outline" size={20} color="#64748B" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rootTitle, { color: textColor }]}>{item.name}</Text>
                <Text style={styles.rootMeta}>
                  Групп: {item.childCount || item.children.length} • Остаток {formatNumber(item.quantity)} • Доступно {formatNumber(item.available)}
                </Text>
              </View>
              {rootLoading ? (
                <Ionicons name="reload-outline" size={20} color="#0F172A" />
              ) : (
                <Ionicons name={rootExpanded ? 'chevron-up' : 'chevron-down'} size={20} color="#0F172A" />
              )}
            </Pressable>

            {rootExpanded
              ? (rootState?.items || []).map((child) => {
                  const groupKey = `${item.guid}:${child.guid}`;
                  const childExpanded = expandedChildren[groupKey] ?? false;
                  const leafState = props.leavesByGroupKey[groupKey];
                  const groupLoading = !!props.loadingNodeIds[`group:${groupKey}`];

                  return (
                    <View key={child.id} style={styles.childWrap}>
                      <Pressable onPress={() => void toggleChild(item.guid, child)} style={styles.childHeader}>
                        <Ionicons name="folder-outline" size={18} color="#64748B" />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.childTitle, { color: textColor }]}>{child.name}</Text>
                          <Text style={styles.rootMeta}>
                            Строк: {child.leafCount || 0} • Остаток {formatNumber(child.quantity)} • Доступно {formatNumber(child.available)}
                          </Text>
                        </View>
                        {groupLoading ? (
                          <Ionicons name="reload-outline" size={20} color="#0F172A" />
                        ) : (
                          <Ionicons name={childExpanded ? 'remove-outline' : 'add-outline'} size={20} color="#0F172A" />
                        )}
                      </Pressable>

                      {childExpanded ? (
                        <>
                          {(leafState?.items || []).map((leaf) => (
                            <StockLeafCard key={leaf.id} item={leaf} />
                          ))}

                          {leafState?.hasMore ? (
                            <Pressable
                              onPress={() => void props.onLoadMoreGroupLeaves(item.guid, child.guid)}
                              style={[styles.loadInsideBtn, groupLoading && styles.loadInsideBtnDisabled]}
                            >
                              <Text style={styles.loadInsideText}>
                                {groupLoading
                                  ? 'Загрузка строк...'
                                  : `Показать ещё строки (${leafState.items.length} из ${leafState.total})`}
                              </Text>
                            </Pressable>
                          ) : null}
                        </>
                      ) : null}
                    </View>
                  );
                })
              : null}

            {rootExpanded && rootState?.hasMore ? (
              <Pressable
                onPress={() => void props.onLoadMoreRootChildren(item.guid)}
                style={[styles.loadInsideBtn, rootLoading && styles.loadInsideBtnDisabled]}
              >
                <Text style={styles.loadInsideText}>
                  {rootLoading
                    ? 'Загрузка групп...'
                    : `Показать ещё группы (${rootState.items.length} из ${rootState.total})`}
                </Text>
              </Pressable>
            ) : null}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    paddingHorizontal: 16,
    gap: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: '#64748B',
    fontSize: 13,
  },
  searchInput: {
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#D5E0F1',
  },
  controlsRow: {
    gap: 8,
    paddingRight: 12,
  },
  toggleChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  toggleChipActive: {
    backgroundColor: '#0F766E',
    borderColor: '#0F766E',
  },
  toggleChipText: {
    color: '#0F172A',
    fontWeight: '700',
  },
  toggleChipTextActive: {
    color: '#FFFFFF',
  },
  orgChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  orgChipActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#22C55E',
  },
  orgChipText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    color: '#B91C1C',
    fontWeight: '700',
  },
  rootCard: {
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#D5E0F1',
  },
  rootHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rootTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  rootMeta: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 4,
  },
  childWrap: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  childHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  childTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  leafCard: {
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCE7F3',
    backgroundColor: Platform.OS === 'web' ? '#FFFFFF' : '#F8FAFC',
    padding: 12,
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  leafTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  leafSubtitle: {
    color: '#334155',
    fontSize: 13,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeTeal: {
    backgroundColor: '#CCFBF1',
  },
  badgeAmber: {
    backgroundColor: '#FEF3C7',
  },
  badgeText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
  },
  metricsRow: {
    gap: 4,
  },
  metricText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
  },
  leafMeta: {
    color: '#64748B',
    fontSize: 12,
  },
  footerWrap: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  loadMoreBtn: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  loadMoreText: {
    color: '#0F172A',
    fontWeight: '700',
  },
  loadInsideBtn: {
    minHeight: 40,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  loadInsideBtnDisabled: {
    opacity: 0.7,
  },
  loadInsideText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 13,
  },
});
