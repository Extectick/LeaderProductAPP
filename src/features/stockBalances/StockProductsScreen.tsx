import React from 'react';
import { BackHandler, Modal, Pressable, StyleSheet, View } from 'react-native';
import { StockFlatList as FlatList, StockRefreshControl as RefreshControl } from './StockGestureLists';
import { ActivityIndicator, Appbar, Button, PaperProvider, Switch, Text, Tooltip } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthContext } from '@/context/AuthContext';
import { useServerStatus } from '@/src/shared/network/useServerStatus';
import { SearchPickerScreen } from '@/src/features/clientOrders/screen/mobile/SearchPickerScreen';
import { FilterLookupPickerPanel } from '@/src/features/clientOrders/screen/mobile/FilterLookupPickerPanel';
import { buildWarehousePickerGroups } from '@/src/features/clientOrders/lib/clientOrdersUi';
import { ProductImageGalleryModal, getProductGalleryImages, type ProductGallery } from '@/src/features/clientOrders/screen/mobile/ProductImageGalleryModal';
import { useWarehouseSelection, warehouseSelectionLabel, toggleWarehouse, toggleWarehouseGroup, type SelectedWarehouse } from './useWarehouseSelection';
import { stockRequest, type StockDetail, type StockFilters, type StockMetrics, type StockMovement, type StockPage, type StockProduct } from './products';
import { useStockProducts } from './useStockProducts';
import { StockMovementRow } from './StockMovementRow';
import { isVisibleStockReceipt, movementDay, movementDayLabel } from './receiptPresentation';
import { StockTabsPager } from './StockTabsPager';
import type { StockTab } from './stockTabs';
import { StockProductRow, StockThumbnail, productUnit } from './StockProductRow';
import { availableQuantity, incomingCostHint, incomingCostText } from './incomingCost';
import { selectedWarehouseRows, warehouseBalanceRows } from './warehouseBalances';

const emptyFilters: StockFilters = { warehouses: [], organizations: [] };
// Temporarily disabled: do not show the control or issue live series requests.
const SERIES_BALANCES_ENABLED = false;
const number = (value: number | null | undefined) => typeof value !== 'number' || !Number.isFinite(value) ? '—' : value.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
function Metrics({ item, unit, full = false }: { item: StockMetrics; unit: string; full?: boolean }) {
  const metrics = [
    { icon: 'warehouse', title: full ? 'В наличии' : 'Остаток', value: item.inStock },
    { icon: 'lock-outline', title: 'В резерве', value: item.reserved },
    { icon: 'package-variant-closed-check', title: 'Доступно', value: availableQuantity(item) },
  ];
  return <View style={styles.metrics} pointerEvents={full ? 'auto' : 'none'}>{metrics.map((m, index) => <View key={m.icon} style={[styles.metric, index > 0 && styles.metricDivider]}>
    <Tooltip title={m.title === 'Доступно' && item.availabilityReason ? item.availabilityReason : m.title}><View accessible accessibilityLabel={`${m.title}: ${number(m.value)} ${unit}`}>
      <Text style={styles.metricLabel}>{m.title}</Text><Text style={[styles.metricText, m.title === 'Доступно' && styles.availableText]}>{number(m.value)}{m.value === null ? '' : ` ${unit}`}</Text>
    </View></Tooltip>
  </View>)}</View>;
}

export default function StockProductsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = React.useContext(AuthContext);
  const userId = auth?.profile?.id == null ? undefined : String(auth.profile.id);
  const { isReachable } = useServerStatus();
  const [search, setSearch] = React.useState('');
  const warehouses = useWarehouseSelection(userId);
  const warehouseGuids = warehouses.items.map(w => w.guid).sort().join(',');
  const [warehouseDraft, setWarehouseDraft] = React.useState<SelectedWarehouse[] | null>(null);
  const [filters, setFilters] = React.useState<StockFilters>(emptyFilters);
  const [filterError, setFilterError] = React.useState(false);
  const [filterLoading, setFilterLoading] = React.useState(false);
  const [filterRevision, reloadFilters] = React.useReducer(n => n + 1, 0);
  const [seriesSelected, setBySeries] = React.useState(false);
  const bySeries = SERIES_BALANCES_ENABLED && seriesSelected;
  const [gallery, setGallery] = React.useState<ProductGallery | null>(null);
  const [product, setProduct] = React.useState<StockProduct | null>(null);
  const [detailTab, setDetailTab] = React.useState<StockTab>('balances');
  const [visitedTabs, setVisitedTabs] = React.useState<ReadonlySet<StockTab>>(new Set());
  const changeTab = React.useCallback((tab: StockTab) => {
    setDetailTab(tab);
    setVisitedTabs(current => current.has(tab) ? current : new Set([...current, tab]));
  }, []);
  const [collapsedFolders, setCollapsedFolders] = React.useState<Set<string>>(new Set());
  const listRef = React.useRef<any>(null);
  React.useEffect(() => { listRef.current?.scrollToOffset?.({ offset: 0, animated: false }); }, [search, warehouseGuids]);
  const stock = useStockProducts<StockProduct>('products', { search, warehouseGuids }, warehouses.ready ? userId : undefined, isReachable);
  const detail = useStockProducts<StockDetail>(product ? `products/${product.guid}/balances` : null, { warehouseGuids, bySeries: bySeries ? '1' : '0', groupByWarehouse: '1' }, warehouses.ready ? userId : undefined, isReachable);
  const receipts = useStockProducts<StockMovement>(product && visitedTabs.has('receipt') ? `products/${product.guid}/movements` : null,
    { warehouseGuids, direction: 'receipt' }, warehouses.ready ? userId : undefined, isReachable);
  const expenses = useStockProducts<StockMovement>(product && visitedTabs.has('expense') ? `products/${product.guid}/movements` : null,
    { warehouseGuids, direction: 'expense' }, warehouses.ready ? userId : undefined, isReachable);
  const currentCost = !isReachable ? null : detail.page && Object.prototype.hasOwnProperty.call(detail.page, 'incomingCost') ? detail.page.incomingCost : product?.incomingCost;
  React.useEffect(() => { setCollapsedFolders(new Set()); }, [product?.guid, warehouseGuids]);
  const openProduct = React.useCallback((item: StockProduct) => { setDetailTab('balances'); setVisitedTabs(new Set()); setBySeries(false); setProduct(item); }, []);
  const openImages = React.useCallback((item: StockProduct) => {
    const images = getProductGalleryImages(item);
    if (images.length) setGallery({ title: item.name, images, index: 0 });
  }, []);
  const goBack = React.useCallback(() => { if (router.canGoBack()) router.back(); else router.replace('/services'); }, [router]);
  React.useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => { goBack(); return true; });
    return () => handler.remove();
  }, [goBack]);
  React.useEffect(() => { setFilters(emptyFilters); setProduct(null); setGallery(null); setWarehouseDraft(null); }, [userId]);
  React.useEffect(() => {
    if (!userId) { setFilterLoading(false); return; }
    const controller = new AbortController();
    setFilterLoading(isReachable); setFilterError(false);
    void (async () => {
      if (!isReachable) { setFilters(emptyFilters); setWarehouseDraft(null); setFilterLoading(false); return; }
      try {
        const data = await stockRequest<StockFilters>('filters', {}, controller.signal);
        if (controller.signal.aborted) return;
        setFilters(data);
      } catch { if (!controller.signal.aborted) setFilterError(true); }
      finally { if (!controller.signal.aborted) setFilterLoading(false); }
    })();
    return () => controller.abort();
  }, [userId, isReachable, filterRevision]);
  const empty = (loading: boolean, error: string | null) => <View style={styles.empty}>
    {loading ? <ActivityIndicator /> : <>
      <Text>{!isReachable ? 'Для работы сервиса нужно подключение к сети.' : error || 'Остатки не найдены'}</Text>
      {!isReachable || error ? <Button onPress={() => product ? detail.refresh() : stock.refresh()}>Повторить</Button> : null}
    </>}
  </View>;
  const warehouseItems = React.useMemo(() => [{ guid: '', name: 'Все склады' }, ...new Map([...warehouses.items, ...filters.warehouses].map(w => [w.guid, w])).values()], [warehouses.items, filters.warehouses]);
  const warehouseGroups = React.useMemo(() => buildWarehousePickerGroups(warehouseItems.filter(w => !!w.guid)), [warehouseItems]);
  const warehouseLabel = warehouseSelectionLabel(warehouses.items.map(w => filters.warehouses.find(f => f.guid === w.guid) || w));
  const balanceRows = React.useMemo(() => warehouseBalanceRows(detail.page?.items ?? [], warehouses.items, warehouseGroups, collapsedFolders), [detail.page, warehouses.items, warehouseGroups, collapsedFolders]);
  const receiptRows = React.useMemo(() => selectedWarehouseRows(receipts.page?.items ?? [], warehouses.items).filter(isVisibleStockReceipt), [receipts.page, warehouses.items]);
  // Analytics is paused: keep the complete document history and lazy pagination.
  const expenseRows = React.useMemo(() => selectedWarehouseRows(expenses.page?.items ?? [], warehouses.items), [expenses.page, warehouses.items]);
  const lastReceiptPage = React.useRef<{scope: string; page: StockPage<StockMovement>; visible: number} | null>(null);
  // Excluded-only first AND middle pages must not stall FlatList: its visible
  // content length stays unchanged, so onEndReached need not fire again.
  React.useEffect(() => {
    const page = receipts.page;
    if (!product || !page) { lastReceiptPage.current = null; return; }
    if (detailTab !== 'receipt' || receipts.busy || receipts.error) return;
    const scope = JSON.stringify([userId, product.guid, warehouseGuids]);
    const previous = lastReceiptPage.current?.scope === scope ? lastReceiptPage.current : null;
    if (previous?.page === page) return;
    const excludedAppend = previous && page.items.length > previous.page.items.length && receiptRows.length === previous.visible;
    lastReceiptPage.current = {scope, page, visible: receiptRows.length};
    if (page.hasMore && (!receiptRows.length || excludedAppend)) void receipts.loadMore();
  }, [product, userId, warehouseGuids, detailTab, receipts.busy, receipts.error, receipts.page, receipts.loadMore, receiptRows.length]);
  const warehouseTrigger = (testID: string) => <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={`Выбрать склады: ${warehouseLabel}`} disabled={!warehouses.ready || !isReachable}
    onPress={() => setWarehouseDraft(warehouses.items)} style={styles.warehouseSelector}>
    <Text numberOfLines={1} style={styles.warehouseLabel}>{warehouseLabel}</Text><MaterialCommunityIcons name="chevron-down" size={16} color="#2563EB" />
  </Pressable>;
  const warehousePicker = <Modal visible={warehouseDraft !== null} animationType="slide" onRequestClose={() => setWarehouseDraft(null)}>
    <View style={styles.root}>{warehouseDraft !== null ? <FilterLookupPickerPanel title="Склады" icon="warehouse" topInset={insets.top} bottomInset={insets.bottom} flat groups={warehouseGroups}
      status={filterLoading ? <ActivityIndicator /> : filterError ? <Button onPress={reloadFilters}>Повторить загрузку складов</Button> : null}
      placeholder="Склад или группа" localItems={warehouseItems} selectedGuids={warehouseDraft.map(w => w.guid)}
      onSelect={item => setWarehouseDraft(current => toggleWarehouse(current || [], item))}
      onSelectGroup={items => setWarehouseDraft(current => toggleWarehouseGroup(current || [], items))}
      onReset={() => setWarehouseDraft([])} onClose={() => setWarehouseDraft(null)}
      onApply={() => { warehouses.save(warehouseDraft); setWarehouseDraft(null); }} /> : null}
    </View>
  </Modal>;
  const seriesSwitch = <View style={styles.seriesSwitch}><Switch value={bySeries} onValueChange={setBySeries} accessibilityLabel="По сериям" /><Text style={styles.seriesLabel}>По сериям</Text></View>;
  const renderHistory = (direction: 'receipt' | 'expense') => {
    const history = direction === 'receipt' ? receipts : expenses;
    const rows = direction === 'receipt' ? receiptRows : expenseRows;
    const loading = history.busy || !visitedTabs.has(direction) || (direction === 'receipt' && !rows.length && !history.error && !!history.page?.hasMore);
    return <FlatList testID={`stock-${direction}-list`} data={rows} keyExtractor={i => i.id}
      onEndReached={detailTab === direction ? history.loadMore : undefined} onEndReachedThreshold={0.5}
      refreshControl={<RefreshControl refreshing={history.refreshing} onRefresh={history.refresh} />}
      contentContainerStyle={{paddingBottom: insets.bottom + 12, flexGrow: 1}}
      ListHeaderComponent={history.error && history.page ? <View style={styles.status}><Text style={styles.warning}>{history.error}</Text></View> : null}
      ListEmptyComponent={<View style={styles.empty}>{loading ? <ActivityIndicator /> : <Text>
        {!isReachable ? 'Для работы сервиса нужно подключение к сети.' : history.error || (direction === 'receipt' ? 'Поступлений на выбранных складах нет' : 'Движений на выбранных складах нет')}
      </Text>}{!loading && (!isReachable || history.error) ? <Button onPress={history.refresh}>Повторить</Button> : null}</View>}
      ListFooterComponent={history.loadingMore && rows.length > 0 ? <ActivityIndicator /> : null}
      renderItem={({item, index}) => <>
        {index === 0 || movementDay(item) !== movementDay(rows[index - 1]) ?
          <View style={styles.movementDay}><Text style={styles.movementDayText}>{movementDayLabel(movementDay(item))}</Text></View> : null}
        <StockMovementRow item={item} unit={productUnit(product)} />
      </>} />;
  };
  return <View style={styles.root}>
    <SearchPickerScreen visible pickerKey="stock-products" topInset={insets.top} title="Остатки" titleIcon=""
      titleAccessory={warehouseTrigger('stock-list-warehouses')}
      closeIcon="arrow-left" onClose={goBack} search={search} onSearchChange={setSearch} autoFocus={false}
      searchPlaceholder="Наименование, код или артикул" searchLoading={stock.busy && !!stock.page}
      listRef={listRef} data={stock.page?.items ?? []} keyExtractor={item => item.guid} renderItem={({ item }) => <StockProductRow item={item} onOpen={openProduct} onOpenImages={openImages} />}
      onEndReached={stock.loadMore}
      listProps={{ refreshControl: <RefreshControl refreshing={stock.refreshing} onRefresh={stock.refresh} /> }}
      ListHeaderComponent={stock.error || warehouses.error ? <View style={styles.status}>
        {warehouses.error ? <Text style={styles.warning}>Не удалось сохранить или прочитать выбор складов</Text> : null}
        {stock.error && stock.page ? <Button compact onPress={stock.refresh}>{stock.error}</Button> : null}
      </View> : null}
      ListEmptyComponent={empty(stock.busy || !warehouses.ready, stock.error)}
      ListFooterComponent={<View style={{ paddingBottom: insets.bottom + 12 }}>{stock.loadingMore ? <ActivityIndicator /> : null}</View>} />
    {!product ? warehousePicker : null}
    <Modal visible={!!product} animationType="slide" onRequestClose={() => setProduct(null)}>
      <View style={styles.root}>
        <Appbar.Header style={{backgroundColor:'#FFFFFF'}}><Appbar.BackAction accessibilityLabel="Назад" color="#2563EB" onPress={() => setProduct(null)} /><Appbar.Content title="Товар" titleStyle={{fontSize:20,fontWeight:'700',color:'#0F172A'}} /></Appbar.Header>
        {product ? <View style={styles.productHero}>
          <View style={styles.heroImage}><StockThumbnail item={product} compact onOpen={() => openImages(product)} /></View>
          <View style={styles.heroContent}><Text style={styles.title}>{product.name}</Text>
            <Tooltip title={incomingCostHint(currentCost)}><View style={styles.costLine} accessible accessibilityLabel={`Входящая ${incomingCostText(currentCost, productUnit(product))}`}>
              <MaterialCommunityIcons name="chart-bar" size={17} color="#64748B" /><Text style={styles.metricLabel}>Входящая</Text>
              <Text style={styles.costText}>{incomingCostText(currentCost, productUnit(product))}</Text>
            </View></Tooltip>
            {warehouseTrigger('stock-product-warehouses')}
          </View>
        </View> : null}
        {product ? <StockTabsPager key={product.guid} value={detailTab} onChange={changeTab} enabled={!warehouseDraft && !gallery}
          tabsAccessory={SERIES_BALANCES_ENABLED && detailTab === 'balances' ? seriesSwitch : null}>
        <FlatList testID="stock-balances-list" data={balanceRows} keyExtractor={i => i.id} onEndReached={detailTab === 'balances' ? detail.loadMore : undefined} onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={detail.refreshing} onRefresh={detail.refresh} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 12, flexGrow: 1 }}
          ListHeaderComponent={detail.error && detail.page ? <View style={styles.status}><Button onPress={detail.refresh}>{detail.error}</Button></View> : null}
          ListEmptyComponent={empty(detail.busy, detail.error)} ListFooterComponent={detail.loadingMore ? <ActivityIndicator /> : null}
          renderItem={({ item: row }) => {
            if (row.kind === 'folder') return <Pressable accessibilityRole="button" accessibilityLabel={`Папка складов ${row.name}`} accessibilityState={{expanded:row.expanded}}
              onPress={() => setCollapsedFolders(current => { const next = new Set(current); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; })} style={styles.folder}>
              <MaterialCommunityIcons name={row.expanded ? 'folder-open-outline' : 'folder-outline'} size={21} color="#2563EB" /><Text style={[styles.title,{flex:1}]}>{row.name}</Text>
              <Text style={styles.metricLabel}>{row.count}</Text><MaterialCommunityIcons name={row.expanded ? 'chevron-up' : 'chevron-down'} size={20} color="#64748B" />
            </Pressable>;
            const item = row.item;
            return <View style={[styles.balance, row.indented && styles.indentedBalance]}>
            <View style={styles.warehouseHeading}><MaterialCommunityIcons name="warehouse" size={25} color="#2563EB" /><Text style={[styles.title, { flex: 1 }]}>{item.warehouse.name}</Text></View>
            {bySeries ? <Text style={styles.hint}>Серия: {item.seriesNumber || 'Без серии'}{item.expiresAt ? ` · годен до ${new Date(item.expiresAt).toLocaleDateString('ru-RU')}` : ''}</Text> : null}
            <Metrics item={item} unit={product?.baseUnit?.symbol || product?.baseUnit?.name || ''} full />
            {(item.myReserved ?? 0) > 0 ? <Text style={styles.hint}>Мой резерв {number(item.myReserved ?? 0)} {productUnit(product)} · учтён в доступном</Text> : null}
            {item.availabilityReason ? <Text style={styles.hint}>{item.availabilityReason}</Text> : null}
          </View>;
          }} />
        {renderHistory('receipt')}
        {renderHistory('expense')}
        </StockTabsPager> : null}
        {product ? warehousePicker : null}
      </View>
    </Modal>
    <Modal visible={!!gallery} animationType="fade" onRequestClose={() => setGallery(null)}>
      <PaperProvider><ProductImageGalleryModal gallery={gallery} onClose={() => setGallery(null)} /></PaperProvider>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  movementDay: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#EDF2F7' },
  movementDayText: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: '#0F172A' },
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  title: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: '#0F172A' },
  metrics: { flexDirection: 'row', paddingTop: 8, paddingBottom: 2 },
  metric: { flex: 1, gap: 3, paddingRight: 6 },
  metricDivider: { borderLeftWidth: 1, borderColor: '#E2E8F0', paddingLeft: 12 },
  metricLabel: { fontSize: 12, color: '#64748B' },
  metricText: { fontSize: 18, lineHeight: 25, color: '#0F172A', fontWeight: '700' },
  availableText: { color: '#2563EB' },
  hint: { fontSize: 11, color: '#64748B', lineHeight: 16 },
  warehouseSelector: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, minWidth: 40, minHeight: 40 },
  productWarehouseSelector: {flex:1,minWidth:0,paddingRight:12},
  warehouseLabel: { flexShrink: 1, color: '#2563EB', fontSize: 13, fontWeight: '700' },
  status: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#F8FAFC' },
  warning: { color: '#92400E', fontSize: 12 },
  empty: { padding: 24, alignItems: 'center', gap: 12 },
  balance: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  indentedBalance: {paddingLeft:28},
  folder: {flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:12,minHeight:44,backgroundColor:'#F8FAFC',borderBottomWidth:1,borderColor:'#E2E8F0'},
  seriesSwitch: { alignItems: 'center', justifyContent: 'center', width: 58 },
  seriesLabel: { fontSize: 10, color: '#64748B' },
  productHero: { flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingVertical: 6 },
  heroImage: { width: 80, minHeight: 80 }, heroContent: { flex: 1, gap: 4 },
  costLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }, costText: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  warehouseHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
