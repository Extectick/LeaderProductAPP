import React from 'react';
import { BackHandler, FlatList, Modal, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
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
import { readStockCache, writeStockCache } from './stockCache';
import { stockRequest, type StockDetail, type StockFilters, type StockMetrics, type StockMovement, type StockProduct } from './products';
import { useStockProducts } from './useStockProducts';
import { StockMovementRow } from './StockMovementRow';
import { StockProductRow, StockThumbnail, productUnit } from './StockProductRow';
import { availableQuantity, incomingCostHint, incomingCostText } from './incomingCost';

const emptyFilters: StockFilters = { warehouses: [], organizations: [] };
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
  const [bySeries, setBySeries] = React.useState(false);
  const [gallery, setGallery] = React.useState<ProductGallery | null>(null);
  const [product, setProduct] = React.useState<StockProduct | null>(null);
  const [detailTab, setDetailTab] = React.useState<'balances' | 'receipt' | 'expense'>('balances');
  const listRef = React.useRef<any>(null);
  React.useEffect(() => { listRef.current?.scrollToOffset?.({ offset: 0, animated: false }); }, [search, warehouseGuids]);
  const stock = useStockProducts<StockProduct>('products', { search, warehouseGuids }, warehouses.ready ? userId : undefined, isReachable);
  const detail = useStockProducts<StockDetail>(product ? `products/${product.guid}/balances` : null, { warehouseGuids, bySeries: bySeries ? '1' : '0', groupByWarehouse: '1' }, warehouses.ready ? userId : undefined, isReachable);
  const history = useStockProducts<StockMovement>(product && detailTab !== 'balances' ? `products/${product.guid}/movements` : null,
    { warehouseGuids, direction: detailTab === 'receipt' ? 'receipt' : 'expense' }, warehouses.ready ? userId : undefined, isReachable);
  const currentCost = detail.page && Object.prototype.hasOwnProperty.call(detail.page, 'incomingCost') ? detail.page.incomingCost : product?.incomingCost;
  const openProduct = React.useCallback((item: StockProduct) => { setDetailTab('balances'); setBySeries(false); setProduct(item); }, []);
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
      const cached = await readStockCache<SelectedWarehouse>(userId, 'warehouse-filters-v1');
      if (controller.signal.aborted) return;
      if (cached) setFilters({ warehouses: cached.items, organizations: [] });
      if (!isReachable) { setFilterLoading(false); return; }
      try {
        const data = await stockRequest<StockFilters>('filters', {}, controller.signal);
        if (controller.signal.aborted) return;
        setFilters(data);
        void writeStockCache(userId, 'warehouse-filters-v1', { items: data.warehouses, offset: 0, nextOffset: data.warehouses.length, hasMore: false });
      } catch { if (!controller.signal.aborted) setFilterError(true); }
      finally { if (!controller.signal.aborted) setFilterLoading(false); }
    })();
    return () => controller.abort();
  }, [userId, isReachable, filterRevision]);
  const empty = (loading: boolean, error: string | null) => <View style={styles.empty}>
    {loading ? <ActivityIndicator /> : <>
      <Text>{!isReachable ? (product && bySeries ? 'Для просмотра серий нужно подключение к сети.' : 'Нет сети. Для этой выборки нет сохранённых остатков.') : error || 'Остатки не найдены'}</Text>
      {isReachable && error ? <Button onPress={() => product ? detail.refresh() : stock.refresh()}>Повторить</Button> : null}
    </>}
  </View>;
  const warehouseItems = React.useMemo(() => [{ guid: '', name: 'Все склады' }, ...new Map([...warehouses.items, ...filters.warehouses].map(w => [w.guid, w])).values()], [warehouses.items, filters.warehouses]);
  const warehouseGroups = React.useMemo(() => buildWarehousePickerGroups(warehouseItems.filter(w => !!w.guid)), [warehouseItems]);
  const warehouseLabel = warehouseSelectionLabel(warehouses.items.map(w => filters.warehouses.find(f => f.guid === w.guid) || w));
  const seriesSwitch = <View style={styles.seriesSwitch}><Switch value={bySeries} onValueChange={setBySeries} accessibilityLabel="По сериям" /><Text style={styles.seriesLabel}>По сериям</Text></View>;
  return <View style={styles.root}>
    <SearchPickerScreen visible pickerKey="stock-products" topInset={insets.top} title="Остатки" titleIcon=""
      titleAccessory={<Pressable accessibilityRole="button" accessibilityLabel={`Выбрать склады: ${warehouseLabel}`} disabled={!warehouses.ready}
        onPress={() => setWarehouseDraft(warehouses.items)} style={styles.warehouseSelector}>
        <Text numberOfLines={1} style={styles.warehouseLabel}>{warehouseLabel}</Text><MaterialCommunityIcons name="chevron-down" size={16} color="#2563EB" />
      </Pressable>}
      closeIcon="arrow-left" onClose={goBack} search={search} onSearchChange={setSearch} autoFocus={false}
      searchPlaceholder="Наименование, код или артикул" searchLoading={stock.busy && !!stock.page}
      listRef={listRef} data={stock.page?.items ?? []} keyExtractor={item => item.guid} renderItem={({ item }) => <StockProductRow item={item} onOpen={openProduct} onOpenImages={openImages} />}
      onEndReached={stock.loadMore}
      listProps={{ refreshControl: <RefreshControl refreshing={stock.refreshing} onRefresh={stock.refresh} enabled={isReachable} /> }}
      ListHeaderComponent={stock.stale || stock.error || warehouses.error ? <View style={styles.status}>
        {warehouses.error ? <Text style={styles.warning}>Не удалось сохранить или прочитать выбор складов</Text> : null}
        {stock.stale ? <Text style={styles.warning}>{!isReachable ? 'Нет сети · показаны ранее загруженные остатки' : 'Данные не обновлены'}</Text> : null}
        {stock.error && stock.page ? <Button compact onPress={stock.refresh}>{stock.error}</Button> : null}
      </View> : null}
      ListEmptyComponent={empty(stock.busy || !warehouses.ready, stock.error)}
      ListFooterComponent={<View style={{ paddingBottom: insets.bottom + 12 }}>{stock.loadingMore ? <ActivityIndicator /> : null}</View>} />
    <Modal visible={warehouseDraft !== null} animationType="slide" onRequestClose={() => setWarehouseDraft(null)}>
      <View style={styles.root}>{warehouseDraft !== null ? <FilterLookupPickerPanel title="Склады" icon="warehouse" topInset={insets.top} bottomInset={insets.bottom} flat groups={warehouseGroups}
        status={filterLoading ? <ActivityIndicator /> : filterError ? <Button onPress={reloadFilters}>Повторить загрузку складов</Button> : null}
        placeholder="Склад или группа" localItems={warehouseItems} selectedGuids={warehouseDraft.map(w => w.guid)}
        onSelect={item => setWarehouseDraft(current => toggleWarehouse(current || [], item))}
        onSelectGroup={items => setWarehouseDraft(current => toggleWarehouseGroup(current || [], items))}
        onReset={() => setWarehouseDraft([])} onClose={() => setWarehouseDraft(null)}
        onApply={() => { warehouses.save(warehouseDraft); setWarehouseDraft(null); }} /> : null}
      </View>
    </Modal>
    <Modal visible={!!product} animationType="slide" onRequestClose={() => setProduct(null)}>
      <View style={styles.root}>
        <Appbar.Header style={{backgroundColor:'#FFFFFF'}}><Appbar.BackAction accessibilityLabel="Назад" color="#2563EB" onPress={() => setProduct(null)} /><Appbar.Content title="Товар" titleStyle={{fontSize:20,fontWeight:'700',color:'#0F172A'}} /></Appbar.Header>
        {product ? <View style={styles.productHero}>
          <View style={styles.heroImage}><StockThumbnail item={product} onOpen={() => openImages(product)} /></View>
          <View style={styles.heroContent}><Text style={styles.title}>{product.name}</Text>
            <Tooltip title={incomingCostHint(currentCost)}><View style={styles.costLine} accessible accessibilityLabel={`Входящая ${incomingCostText(currentCost, productUnit(product))}`}>
              <MaterialCommunityIcons name="chart-bar" size={17} color="#64748B" /><Text style={styles.metricLabel}>Входящая</Text>
              <Text style={styles.costText}>{incomingCostText(currentCost, productUnit(product))}</Text>
            </View></Tooltip>
          </View>
        </View> : null}
        <View style={styles.tabsRow}><View style={styles.tabs}>
          {([{ value: 'balances', label: 'Остатки' }, { value: 'receipt', label: 'Поступления' }, { value: 'expense', label: 'Продажи' }] as const).map(button => <Pressable
            key={button.value} accessibilityRole="tab" accessibilityState={{selected:detailTab===button.value}}
            onPress={()=>setDetailTab(button.value)} style={[styles.tab, detailTab === button.value && styles.selectedTab]}>
            <Text style={[styles.tabLabel, detailTab===button.value && styles.selectedTabLabel]}>{button.label}</Text>
          </Pressable>)}
        </View>{detailTab === 'balances' ? seriesSwitch : null}</View>
        {detailTab === 'balances' ? <>
        <FlatList key="balances" data={detail.page?.items ?? []} keyExtractor={i => i.id} onEndReached={detail.loadMore} onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={detail.refreshing} onRefresh={detail.refresh} enabled={isReachable} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 12, flexGrow: 1 }}
          ListHeaderComponent={detail.stale || detail.error ? <View style={styles.status}>{detail.stale && !bySeries ? <Text style={styles.warning}>Сохранённые данные · нет обновления</Text> : null}{detail.error && detail.page ? <Button onPress={detail.refresh}>{detail.error}</Button> : null}</View> : null}
          ListEmptyComponent={empty(detail.busy, detail.error)} ListFooterComponent={detail.loadingMore ? <ActivityIndicator /> : null}
          renderItem={({ item }) => <View style={styles.balance}>
            <View style={styles.warehouseHeading}><MaterialCommunityIcons name="warehouse" size={25} color="#2563EB" /><Text style={[styles.title, { flex: 1 }]}>{item.warehouse.name}</Text></View>
            {bySeries ? <Text style={styles.hint}>Серия: {item.seriesNumber || 'Без серии'}{item.expiresAt ? ` · годен до ${new Date(item.expiresAt).toLocaleDateString('ru-RU')}` : ''}</Text> : null}
            <Metrics item={item} unit={product?.baseUnit?.symbol || product?.baseUnit?.name || ''} full />
            {(item.myReserved ?? 0) > 0 ? <Text style={styles.hint}>Мой резерв {number(item.myReserved ?? 0)} {productUnit(product)} · учтён в доступном</Text> : null}
            {item.availabilityReason ? <Text style={styles.hint}>{item.availabilityReason}</Text> : null}
          </View>} /></> : <FlatList key={detailTab} data={history.page?.items ?? []} keyExtractor={i => i.id}
            onEndReached={history.loadMore} onEndReachedThreshold={0.5}
            refreshControl={<RefreshControl refreshing={history.refreshing} onRefresh={history.refresh} enabled={isReachable} />}
            contentContainerStyle={{ paddingBottom: insets.bottom + 12, flexGrow: 1 }}
            ListHeaderComponent={history.error && history.page ? <View style={styles.status}><Text style={styles.warning}>{history.error}</Text></View> : null}
            ListEmptyComponent={<View style={styles.empty}>{history.busy ? <ActivityIndicator /> : <Text>
              {!isReachable ? 'История движений доступна при подключении к сети.' : history.error || (detailTab === 'receipt' ? 'Поступлений на выбранных складах нет' : 'Расходных движений на выбранных складах нет')}
            </Text>}</View>}
            ListFooterComponent={history.loadingMore ? <ActivityIndicator /> : null}
            renderItem={({ item }) => <StockMovementRow item={item} unit={product?.baseUnit?.symbol || product?.baseUnit?.name || ''} />} />}
      </View>
    </Modal>
    <Modal visible={!!gallery} animationType="fade" onRequestClose={() => setGallery(null)}>
      <PaperProvider><ProductImageGalleryModal gallery={gallery} onClose={() => setGallery(null)} /></PaperProvider>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  title: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: '#0F172A' },
  metrics: { flexDirection: 'row', paddingTop: 18, paddingBottom: 8 },
  metric: { flex: 1, gap: 3, paddingRight: 6 },
  metricDivider: { borderLeftWidth: 1, borderColor: '#E2E8F0', paddingLeft: 12 },
  metricLabel: { fontSize: 12, color: '#64748B' },
  metricText: { fontSize: 18, lineHeight: 25, color: '#0F172A', fontWeight: '700' },
  availableText: { color: '#2563EB' },
  hint: { fontSize: 11, color: '#64748B', lineHeight: 16 },
  warehouseSelector: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, minWidth: 40, minHeight: 40 },
  warehouseLabel: { flexShrink: 1, color: '#2563EB', fontSize: 13, fontWeight: '700' },
  status: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#F8FAFC' },
  warning: { color: '#92400E', fontSize: 12 },
  empty: { padding: 24, alignItems: 'center', gap: 12 },
  balance: { paddingHorizontal: 16, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  seriesSwitch: { alignItems: 'center', justifyContent: 'center', width: 58 },
  seriesLabel: { fontSize: 10, color: '#64748B' },
  tabsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#E2E8F0' },
  tabs: { flex: 1, flexDirection: 'row', borderRadius: 10, backgroundColor:'#F1F5F9', overflow:'hidden' },
  tab: { flex:1, minHeight:44, paddingHorizontal:2, alignItems:'center', justifyContent:'center' },
  tabLabel: { fontSize:11, fontWeight:'600', color:'#64748B' }, selectedTabLabel:{color:'#2563EB'},
  selectedTab: { backgroundColor: '#DBEAFE' },
  productHero: { flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingVertical: 16 },
  heroImage: { width: 100, minHeight: 100 }, heroContent: { flex: 1, gap: 8 },
  costLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }, costText: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  warehouseHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
