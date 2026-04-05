import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';
import { useThemeColor } from '@/hooks/useThemeColor';
import MobileStockBalancesScreen from '@/src/features/stockBalances/MobileStockBalancesScreen';
import type { StockLeafRow, StockRootGroup, StockSecondLevelGroup } from '@/src/features/stockBalances/types';
import { useStockBalances } from '@/src/features/stockBalances/useStockBalances';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { MaterialReactTable, type MRT_ColumnDef } from 'material-react-table';
import React from 'react';
import { useWindowDimensions } from 'react-native';

type FlatRow =
  | {
      id: string;
      kind: 'root' | 'group' | 'leaf';
      depth: 0 | 1 | 2;
      title: string;
      subtitle: string;
      code: string | null;
      unit: string;
      organization: string;
      seriesNumber: string;
      productionDate: string;
      expiresAt: string;
      quantity: number;
      reserved: number;
      inStock: number;
      shipping: number;
      clientReserved: number;
      managerReserved: number;
      available: number;
      updatedAt: string;
      expandable: boolean;
      expanded: boolean;
      loading?: boolean;
      nodeId?: string;
      rootGuid?: string;
      itemCount?: number;
    }
  | {
      id: string;
      kind: 'children-more' | 'leaves-more';
      depth: 1 | 2;
      title: string;
      subtitle: string;
      code: null;
      unit: '';
      organization: '';
      seriesNumber: '';
      productionDate: '';
      expiresAt: '';
      quantity: 0;
      reserved: 0;
      inStock: 0;
      shipping: 0;
      clientReserved: 0;
      managerReserved: 0;
      available: 0;
      updatedAt: '';
      expandable: false;
      expanded: false;
      loading?: boolean;
      nodeId?: string;
      rootGuid?: string;
      itemCount?: number;
    };

function formatNumber(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleDateString('ru-RU');
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatUnit(item: StockLeafRow) {
  return item.product.unit?.symbol || item.product.unit?.name || '-';
}

function makeLeafRow(item: StockLeafRow, rootGuid: string): FlatRow {
  return {
    id: item.id,
    kind: 'leaf',
    depth: 2,
    title: item.product.name,
    subtitle: item.warehouse.name,
    code: item.product.code || item.warehouse.code || null,
    unit: formatUnit(item),
    organization: item.organization?.name || 'Без организации',
    seriesNumber: item.series?.number || 'Без серии',
    productionDate: formatDate(item.series?.productionDate),
    expiresAt: formatDate(item.series?.expiresAt),
    quantity: item.quantity,
    reserved: item.reserved,
    inStock: item.inStock,
    shipping: item.shipping,
    clientReserved: item.clientReserved,
    managerReserved: item.managerReserved,
    available: item.available,
    updatedAt: formatDateTime(item.updatedAt),
    expandable: false,
    expanded: false,
    rootGuid,
  };
}

function makeGroupRow(
  item: StockSecondLevelGroup,
  rootGuid: string,
  expanded: boolean,
  loading: boolean
): FlatRow {
  return {
    id: item.id,
    kind: 'group',
    depth: 1,
    title: item.name,
    subtitle: `${item.leafCount || 0} строк`,
    code: item.code,
    unit: '',
    organization: '',
    seriesNumber: '',
    productionDate: '',
    expiresAt: '',
    quantity: item.quantity,
    reserved: item.reserved,
    inStock: item.inStock,
    shipping: item.shipping,
    clientReserved: item.clientReserved,
    managerReserved: item.managerReserved,
    available: item.available,
    updatedAt: '',
    expandable: (item.leafCount || 0) > 0,
    expanded,
    loading,
    nodeId: item.guid,
    rootGuid,
    itemCount: item.leafCount || 0,
  };
}

function makeRootRow(item: StockRootGroup, expanded: boolean, loading: boolean): FlatRow {
  return {
    id: item.id,
    kind: 'root',
    depth: 0,
    title: item.name,
    subtitle: `${item.childCount || item.children.length} групп`,
    code: item.code,
    unit: '',
    organization: '',
    seriesNumber: '',
    productionDate: '',
    expiresAt: '',
    quantity: item.quantity,
    reserved: item.reserved,
    inStock: item.inStock,
    shipping: item.shipping,
    clientReserved: item.clientReserved,
    managerReserved: item.managerReserved,
    available: item.available,
    updatedAt: '',
    expandable: (item.childCount || item.children.length) > 0,
    expanded,
    loading,
    nodeId: item.guid,
    rootGuid: item.guid,
    itemCount: item.childCount || item.children.length,
  };
}

export default function StockBalancesWebScreen() {
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const stock = useStockBalances({ compact: width >= 960 });
  const topInset = useHeaderContentTopInset({ hasSubtitle: false });
  const background = useThemeColor({}, 'background');
  const [isFullScreen, setIsFullScreen] = React.useState(false);
  const [expandedRoots, setExpandedRoots] = React.useState<Record<string, boolean>>({});
  const [expandedGroups, setExpandedGroups] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    navigation.setOptions?.({ headerShown: !isFullScreen });
    return () => {
      navigation.setOptions?.({ headerShown: true });
    };
  }, [isFullScreen, navigation]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFullScreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  React.useEffect(() => {
    setExpandedRoots({});
    setExpandedGroups({});
  }, [stock.hierarchy, stock.organizationGuid, stock.searchInput, stock.tree?.roots.length]);

  const toggleRoot = React.useCallback(
    async (root: StockRootGroup) => {
      const nextExpanded = !(expandedRoots[root.id] ?? false);
      setExpandedRoots((prev) => ({ ...prev, [root.id]: nextExpanded }));
      if (nextExpanded) {
        await stock.loadRootChildren(root.guid);
      }
    },
    [expandedRoots, stock]
  );

  const toggleGroup = React.useCallback(
    async (rootGuid: string, group: StockSecondLevelGroup) => {
      const key = `${rootGuid}:${group.guid}`;
      const nextExpanded = !(expandedGroups[key] ?? false);
      setExpandedGroups((prev) => ({ ...prev, [key]: nextExpanded }));
      if (nextExpanded) {
        await stock.loadGroupLeaves(rootGuid, group.guid);
      }
    },
    [expandedGroups, stock]
  );

  const rows = React.useMemo<FlatRow[]>(() => {
    const result: FlatRow[] = [];

    for (const root of stock.tree?.roots || []) {
      const rootExpanded = expandedRoots[root.id] ?? false;
      const rootState = stock.childrenByRootGuid[root.guid];
      const rootLoading = !!stock.loadingNodeIds[`root:${root.guid}`];
      result.push(makeRootRow(root, rootExpanded, rootLoading));

      if (!rootExpanded) continue;

      for (const child of rootState?.items || []) {
        const key = `${root.guid}:${child.guid}`;
        const groupExpanded = expandedGroups[key] ?? false;
        const groupState = stock.leavesByGroupKey[key];
        const groupLoading = !!stock.loadingNodeIds[`group:${key}`];

        result.push(makeGroupRow(child, root.guid, groupExpanded, groupLoading));

        if (!groupExpanded) continue;

        for (const leaf of groupState?.items || []) {
          result.push(makeLeafRow(leaf, root.guid));
        }

        if (groupState?.hasMore) {
          result.push({
            id: `more-leaves:${key}`,
            kind: 'leaves-more',
            depth: 2,
            title: groupLoading ? 'Подгружаем строки...' : 'Показать еще строки',
            subtitle: `${groupState.items.length} из ${groupState.total}`,
            code: null,
            unit: '',
            organization: '',
            seriesNumber: '',
            productionDate: '',
            expiresAt: '',
            quantity: 0,
            reserved: 0,
            inStock: 0,
            shipping: 0,
            clientReserved: 0,
            managerReserved: 0,
            available: 0,
            updatedAt: '',
            expandable: false,
            expanded: false,
            loading: groupLoading,
            nodeId: child.guid,
            rootGuid: root.guid,
          });
        }
      }

      if (rootState?.hasMore) {
        result.push({
          id: `more-children:${root.guid}`,
          kind: 'children-more',
          depth: 1,
          title: rootLoading ? 'Подгружаем группы...' : 'Показать еще группы',
          subtitle: `${rootState.items.length} из ${rootState.total}`,
          code: null,
          unit: '',
          organization: '',
          seriesNumber: '',
          productionDate: '',
          expiresAt: '',
          quantity: 0,
          reserved: 0,
          inStock: 0,
          shipping: 0,
          clientReserved: 0,
          managerReserved: 0,
          available: 0,
          updatedAt: '',
          expandable: false,
          expanded: false,
          loading: rootLoading,
          nodeId: root.guid,
          rootGuid: root.guid,
        });
      }
    }

    return result;
  }, [
    expandedGroups,
    expandedRoots,
    stock.childrenByRootGuid,
    stock.leavesByGroupKey,
    stock.loadingNodeIds,
    stock.tree?.roots,
  ]);

  const handleTableScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (!stock.canLoadMore || stock.loadingMore || stock.loading) return;
      const target = event.currentTarget;
      const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
      if (remaining < 480) {
        stock.loadMore();
      }
    },
    [stock]
  );

  const columns = React.useMemo<MRT_ColumnDef<FlatRow>[]>(
    () => [
      {
        accessorKey: 'title',
        header: stock.hierarchy === 'warehouse-product' ? 'Склад / Номенклатура' : 'Номенклатура / Склад',
        size: 380,
        grow: true,
        Cell: ({ row, cell }) => {
          const item = row.original;

          if (item.kind === 'children-more' || item.kind === 'leaves-more') {
            const isLeaves = item.kind === 'leaves-more';
            return (
              <Box sx={{ pl: `${item.depth * 16}px`, py: 0.5 }}>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={item.loading}
                  onClick={() => {
                    if (!item.rootGuid || !item.nodeId) return;
                    if (isLeaves) {
                      void stock.loadMoreGroupLeaves(item.rootGuid, item.nodeId);
                    } else {
                      void stock.loadMoreRootChildren(item.nodeId);
                    }
                  }}
                  sx={{ textTransform: 'none', borderRadius: '999px' }}
                >
                  {item.loading ? 'Загрузка...' : item.title}
                </Button>
                <Typography sx={{ mt: 0.5, fontSize: 12, color: '#64748B' }}>{item.subtitle}</Typography>
              </Box>
            );
          }

          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, pl: `${item.depth * 16}px` }}>
              {item.expandable ? (
                <Box
                  component="button"
                  type="button"
                  onClick={() => {
                    if (item.kind === 'root') {
                      const root = stock.tree?.roots.find((candidate) => candidate.guid === item.nodeId);
                      if (root) void toggleRoot(root);
                    } else if (item.kind === 'group' && item.rootGuid) {
                      const group = (stock.childrenByRootGuid[item.rootGuid]?.items || []).find(
                        (candidate) => candidate.guid === item.nodeId
                      );
                      if (group) void toggleGroup(item.rootGuid, group);
                    }
                  }}
                  sx={{
                    width: 18,
                    height: 18,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    p: 0,
                    m: 0,
                    color: '#475569',
                  }}
                >
                  {item.loading ? (
                    <CircularProgress size={12} />
                  ) : (
                    <Ionicons name={item.expanded ? 'chevron-down' : 'chevron-forward'} size={14} color="currentColor" />
                  )}
                </Box>
              ) : (
                <Box sx={{ width: 18, height: 18 }} />
              )}
              <Ionicons
                name={item.kind === 'leaf' ? 'cube-outline' : item.kind === 'root' ? 'folder-open-outline' : 'folder-outline'}
                size={18}
                color={item.kind === 'leaf' ? '#0F766E' : '#64748B'}
              />
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box component="span" sx={{ fontWeight: item.kind === 'leaf' ? 600 : 800 }}>
                    {String(cell.getValue<string>() || '')}
                  </Box>
                  {item.itemCount ? (
                    <Chip label={item.itemCount} size="small" sx={{ height: 20, fontSize: 11, fontWeight: 700 }} />
                  ) : null}
                </Stack>
                {item.subtitle ? (
                  <Typography sx={{ fontSize: 12, color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.subtitle}
                  </Typography>
                ) : null}
              </Box>
            </Box>
          );
        },
      },
      { accessorKey: 'code', header: 'Код', size: 120 },
      { accessorKey: 'unit', header: 'Ед.', size: 80 },
      { accessorKey: 'organization', header: 'Организация', size: 180 },
      { accessorKey: 'seriesNumber', header: 'Серия', size: 160 },
      { accessorKey: 'productionDate', header: 'Дата произв.', size: 120 },
      { accessorKey: 'expiresAt', header: 'Годен до', size: 120 },
      {
        accessorKey: 'inStock',
        header: 'В наличии',
        size: 110,
        Cell: ({ cell, row }) => (row.original.kind === 'children-more' || row.original.kind === 'leaves-more' ? '' : formatNumber(Number(cell.getValue<number>() || 0))),
      },
      {
        accessorKey: 'shipping',
        header: 'Отгружается',
        size: 110,
        Cell: ({ cell, row }) => (row.original.kind === 'children-more' || row.original.kind === 'leaves-more' ? '' : formatNumber(Number(cell.getValue<number>() || 0))),
      },
      {
        accessorKey: 'clientReserved',
        header: 'В резерве клиентов',
        size: 140,
        Cell: ({ cell, row }) => (row.original.kind === 'children-more' || row.original.kind === 'leaves-more' ? '' : formatNumber(Number(cell.getValue<number>() || 0))),
      },
      {
        accessorKey: 'managerReserved',
        header: 'В резерве менеджеров',
        size: 150,
        Cell: ({ cell, row }) => (row.original.kind === 'children-more' || row.original.kind === 'leaves-more' ? '' : formatNumber(Number(cell.getValue<number>() || 0))),
      },
      {
        accessorKey: 'available',
        header: 'Доступно',
        size: 110,
        Cell: ({ cell, row }) => (row.original.kind === 'children-more' || row.original.kind === 'leaves-more' ? '' : formatNumber(Number(cell.getValue<number>() || 0))),
      },
      { accessorKey: 'updatedAt', header: 'Обновлено', size: 140 },
    ],
    [stock, toggleGroup, toggleRoot]
  );

  if (width < 960) {
    return (
      <MobileStockBalancesScreen
        roots={stock.tree?.roots || []}
        organizations={stock.meta?.organizations || []}
        hierarchy={stock.hierarchy}
        onChangeHierarchy={stock.setHierarchy}
        organizationGuid={stock.organizationGuid}
        onChangeOrganization={stock.setOrganizationGuid}
        search={stock.searchInput}
        onChangeSearch={stock.setSearchInput}
        loading={stock.loading}
        refreshing={stock.refreshing}
      error={stock.error}
      onRefresh={stock.refresh}
      onLoadMore={stock.loadMore}
      canLoadMore={stock.canLoadMore}
      lastStockSyncedAt={stock.meta?.lastStockSyncedAt || null}
      childrenByRootGuid={stock.childrenByRootGuid}
      leavesByGroupKey={stock.leavesByGroupKey}
      loadingNodeIds={stock.loadingNodeIds}
      onToggleRoot={stock.loadRootChildren}
      onLoadMoreRootChildren={stock.loadMoreRootChildren}
      onToggleGroup={stock.loadGroupLeaves}
      onLoadMoreGroupLeaves={stock.loadMoreGroupLeaves}
    />
  );
}

  return (
    <Box
      sx={{
        height: isFullScreen ? '100vh' : `calc(100vh - ${topInset + 10}px)`,
        backgroundColor: background,
        px: isFullScreen ? 0 : 2,
        pb: isFullScreen ? 0 : 2,
        pt: isFullScreen ? 0 : `${topInset + 10}px`,
      }}
    >
      <MaterialReactTable
        columns={columns}
        data={rows}
        enablePagination={false}
        enableRowVirtualization
        enableDensityToggle={false}
        enableColumnOrdering
        enableColumnFilters={false}
        enableGlobalFilter={false}
        enableExpanding={false}
        enableFullScreenToggle
        enableStickyHeader
        layoutMode="grid"
        rowVirtualizerOptions={{ overscan: 20 }}
        onIsFullScreenChange={setIsFullScreen}
        initialState={{ density: 'compact' }}
        state={{
          isLoading: stock.loading,
          isFullScreen,
          showProgressBars: stock.refreshing || stock.loadingMore,
        }}
        muiTablePaperProps={{
          elevation: 0,
          sx: {
            height: '100%',
            borderRadius: isFullScreen ? 0 : '24px',
            overflow: 'hidden',
            border: isFullScreen ? 'none' : '1px solid #D5E0F1',
          },
        }}
        muiTableContainerProps={{
          onScroll: handleTableScroll,
          sx: {
            height: 'calc(100% - 116px)',
          },
        }}
        muiTableBodyRowProps={({ row }) => ({
          sx: {
            backgroundColor:
              row.original.kind === 'root'
                ? '#F0FDFA'
                : row.original.kind === 'group'
                  ? '#F8FAFC'
                  : row.original.kind === 'leaf'
                    ? '#FFFFFF'
                    : '#F8FAFC',
          },
        })}
        renderTopToolbarCustomActions={() => (
          <Stack spacing={1.25} sx={{ p: 1.5, width: '100%' }}>
            <Stack direction="row" spacing={1.25} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
              <TextField
                size="small"
                label="Поиск"
                value={stock.searchInput}
                onChange={(event) => stock.setSearchInput(event.target.value)}
                placeholder="Склад, товар, организация, серия"
                sx={{ minWidth: 300 }}
              />
              <TextField
                select
                size="small"
                label="Иерархия"
                value={stock.hierarchy}
                onChange={(event) => stock.setHierarchy(event.target.value as typeof stock.hierarchy)}
                sx={{ minWidth: 220 }}
              >
                <MenuItem value="warehouse-product">Склад -> Номенклатура</MenuItem>
                <MenuItem value="product-warehouse">Номенклатура -> Склад</MenuItem>
              </TextField>
              <TextField
                select
                size="small"
                label="Организация"
                value={stock.organizationGuid}
                onChange={(event) => stock.setOrganizationGuid(event.target.value)}
                sx={{ minWidth: 240 }}
              >
                <MenuItem value="">Все организации</MenuItem>
                {(stock.meta?.organizations || []).map((item) => (
                  <MenuItem key={item.guid} value={item.guid}>
                    {item.name}
                  </MenuItem>
                ))}
              </TextField>
              <Button variant="contained" onClick={stock.refresh} sx={{ textTransform: 'none', fontWeight: 700 }}>
                Обновить
              </Button>
            </Stack>

            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
              <Chip
                size="small"
                label={`Корневых групп: ${stock.tree?.totalRoots || 0}`}
                sx={{ fontWeight: 700 }}
              />
              <Chip
                size="small"
                label={`Строк остатков: ${stock.tree?.totalLeaves || 0}`}
                sx={{ fontWeight: 700 }}
              />
              <Chip
                size="small"
                label={`Синхронизация: ${formatDateTime(stock.meta?.lastStockSyncedAt)}`}
                sx={{ fontWeight: 700 }}
              />
              {stock.error ? (
                <Typography sx={{ color: '#B91C1C', fontWeight: 700, ml: 1 }}>{stock.error}</Typography>
              ) : null}
            </Stack>
          </Stack>
        )}
        renderBottomToolbarCustomActions={() =>
          stock.loadingMore ? (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 2 }}>
              <CircularProgress size={16} />
              <Typography sx={{ fontSize: 13, color: '#64748B' }}>Подгружаем еще корневые группы...</Typography>
            </Stack>
          ) : stock.canLoadMore ? (
            <Typography sx={{ px: 2, fontSize: 13, color: '#64748B' }}>
              Прокрутите вниз для подгрузки следующих корневых групп
            </Typography>
          ) : null
        }
      />
    </Box>
  );
}



