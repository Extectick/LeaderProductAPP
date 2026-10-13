import React from 'react';
import { BackHandler, FlatList, Modal, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, Button, List, Text, Tooltip } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthContext } from '@/context/AuthContext';
import { useServerStatus } from '@/src/shared/network/useServerStatus';
import { ProductListRow } from '@/src/shared/ui/ProductListRow';
import { SearchPickerScreen } from '@/src/features/clientOrders/screen/mobile/SearchPickerScreen';
import { FilterLookupPickerPanel } from '@/src/features/clientOrders/screen/mobile/FilterLookupPickerPanel';
import { useWarehouseSelection, warehouseSelectionLabel, toggleWarehouse, type SelectedWarehouse } from './useWarehouseSelection';
import { stockRequest, type StockDetail, type StockFilters, type StockMetrics, type StockProduct } from './products';
import { useStockProducts } from './useStockProducts';

const emptyFilters: StockFilters = { warehouses: [], organizations: [] };
const number = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
function Metrics({ item, unit, full = false }: { item: StockMetrics; unit: string; full?: boolean }) {
  const metrics = [
    { icon: 'warehouse', title: 'В наличии', value: item.inStock },
    { icon: 'package-variant-closed-check', title: 'Доступно', value: item.available },
    ...(full ? [{ icon: 'truck-outline', title: 'Отгружается', value: item.shipping },
      { icon: 'lock-outline', title: 'Резерв', value: item.reserved },
      { icon: 'account-outline', title: 'Резерв клиентов', value: item.clientReserved },
      { icon: 'account-tie-outline', title: 'Резерв менеджеров', value: item.managerReserved }] : []),
  ];
  return <View style={styles.metrics}>{metrics.map(m => <Tooltip key={m.icon} title={m.title}>
    <View style={styles.metric} accessible accessibilityLabel={`${m.title}: ${number(m.value)} ${unit}`}>
      <MaterialCommunityIcons name={m.icon as any} size={17} color="#64748B" />
      <Text style={styles.metricText}>{full ? `${m.title}: ` : ''}{number(m.value)} {unit}</Text>
    </View>
  </Tooltip>)}</View>;
}
const ProductRow = React.memo(function ProductRow({ item, onOpen }: { item: StockProduct; onOpen: (item: StockProduct) => void }) {
  return <Pressable onPress={() => onOpen(item)} accessibilityRole="button" accessibilityLabel={`Остатки ${item.name}`}>
    <ProductListRow thumbnail={item.imageThumbUrl ? <Image source={{ uri: item.imageThumbUrl, cacheKey: `${item.guid}:${item.imageHash || ''}` }}
      style={styles.image} contentFit="contain" cachePolicy="memory-disk" recyclingKey={item.guid} />
      : <View style={styles.placeholder}><MaterialCommunityIcons name="image-outline" size={32} color="#94A3B8" /></View>}>
      <Text style={styles.title} numberOfLines={3}>{item.name}</Text>
      <Metrics item={item} unit={item.baseUnit?.symbol || item.baseUnit?.name || ''} />
    </ProductListRow>
  </Pressable>;
});

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
  const [organizationGuid, setOrganization] = React.useState('');
  const [filters, setFilters] = React.useState<StockFilters>(emptyFilters);
  const [filterError, setFilterError] = React.useState(false);
  const [filterLoading, setFilterLoading] = React.useState(false);
  const [filterRevision, reloadFilters] = React.useReducer(n => n + 1, 0);
  const [filterPicker, setFilterPicker] = React.useState<'organizations' | 'menu' | null>(null);
  const [filterSearch, setFilterSearch] = React.useState('');
  const [product, setProduct] = React.useState<StockProduct | null>(null);
  const listRef = React.useRef<any>(null);
  React.useEffect(() => { listRef.current?.scrollToOffset?.({ offset: 0, animated: false }); }, [search, warehouseGuids, organizationGuid]);
  const stock = useStockProducts<StockProduct>('products', { search, warehouseGuids, organizationGuid }, warehouses.ready ? userId : undefined, isReachable);
  const detail = useStockProducts<StockDetail>(product ? `products/${product.guid}/balances` : null, { warehouseGuids, organizationGuid }, warehouses.ready ? userId : undefined, isReachable);
  const goBack = React.useCallback(() => { if (router.canGoBack()) router.back(); else router.replace('/services'); }, [router]);
  React.useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => { goBack(); return true; });
    return () => handler.remove();
  }, [goBack]);
  React.useEffect(() => { setFilters(emptyFilters); setProduct(null); setFilterPicker(null); setWarehouseDraft(null); }, [userId]);
  React.useEffect(() => {
    if (!isReachable || !userId) { setFilterLoading(false); return; }
    const controller = new AbortController();
    setFilterLoading(true); setFilterError(false);
    void stockRequest<StockFilters>('filters', {}, controller.signal).then(data => {
      if (!controller.signal.aborted) setFilters(data);
    }).catch(() => { if (!controller.signal.aborted) setFilterError(true); })
      .finally(() => { if (!controller.signal.aborted) setFilterLoading(false); });
    return () => controller.abort();
  }, [userId, isReachable, filterRevision]);
  const empty = (loading: boolean, error: string | null) => <View style={styles.empty}>
    {loading ? <ActivityIndicator /> : <>
      <Text>{!isReachable ? 'Нет сети. Для этой выборки нет сохранённых остатков.' : error || 'Остатки не найдены'}</Text>
      {isReachable && error ? <Button onPress={() => product ? detail.refresh() : stock.refresh()}>Повторить</Button> : null}
    </>}
  </View>;
  const warehouseItems = React.useMemo(() => [{ guid: '', name: 'Все' }, ...new Map([...warehouses.items, ...filters.warehouses].map(w => [w.guid, w])).values()], [warehouses.items, filters.warehouses]);
  const warehouseLabel = warehouseSelectionLabel(warehouses.items.map(w => filters.warehouses.find(f => f.guid === w.guid) || w));
  const organizationName = filters.organizations.find(o => o.guid === organizationGuid)?.name;
  return <View style={styles.root}>
    <SearchPickerScreen visible pickerKey="stock-products" topInset={insets.top} title="Остатки" titleIcon=""
      titleAccessory={<Pressable accessibilityRole="button" accessibilityLabel={`Выбрать склады: ${warehouseLabel}`} disabled={!warehouses.ready}
        onPress={() => setWarehouseDraft(warehouses.items)} style={styles.warehouseSelector}>
        <Text numberOfLines={1} style={styles.warehouseLabel}>{warehouseLabel}</Text><MaterialCommunityIcons name="chevron-down" size={16} color="#2563EB" />
      </Pressable>}
      closeIcon="arrow-left" onClose={goBack} search={search} onSearchChange={setSearch} autoFocus={false}
      searchPlaceholder="Наименование, код или артикул" searchLoading={stock.busy && !!stock.page}
      filters={[
        { key: 'filter', label: 'Организация', selected: !!organizationGuid, icon: 'filter-variant', selectedIcon: 'filter-check', iconOnly: true, onPress: () => setFilterPicker('menu') },
        { key: 'refresh', label: 'Обновить остатки', selected: false, icon: 'refresh', iconOnly: true, disabled: stock.busy || !isReachable, onPress: stock.refresh },
      ]}
      listRef={listRef} data={stock.page?.items ?? []} keyExtractor={item => item.guid} renderItem={({ item }) => <ProductRow item={item} onOpen={setProduct} />}
      onEndReached={stock.loadMore}
      listProps={{ refreshControl: <RefreshControl refreshing={stock.busy && !!stock.page} onRefresh={stock.refresh} enabled={isReachable} /> }}
      ListHeaderComponent={stock.stale || stock.error || warehouses.error ? <View style={styles.status}>
        {warehouses.error ? <Text style={styles.warning}>Не удалось сохранить или прочитать выбор складов</Text> : null}
        {stock.stale ? <Text style={styles.warning}>{!isReachable ? 'Нет сети · показаны ранее загруженные остатки' : 'Данные не обновлены'}</Text> : null}
        {stock.error && stock.page ? <Button compact onPress={stock.refresh}>{stock.error}</Button> : null}
      </View> : null}
      ListEmptyComponent={empty(stock.busy || !warehouses.ready, stock.error)}
      ListFooterComponent={<View style={{ paddingBottom: insets.bottom + 12 }}>{stock.busy && stock.page ? <ActivityIndicator /> : null}</View>} />
    <Modal visible={warehouseDraft !== null} animationType="slide" onRequestClose={() => setWarehouseDraft(null)}>
      <View style={styles.root}>{warehouseDraft !== null ? <FilterLookupPickerPanel title="Склады" icon="warehouse" topInset={insets.top} bottomInset={insets.bottom}
        status={filterLoading ? <ActivityIndicator /> : filterError ? <Button onPress={reloadFilters}>Повторить загрузку складов</Button> : null}
        placeholder="Название склада" localItems={warehouseItems} selectedGuids={warehouseDraft.map(w => w.guid)}
        onSelect={item => setWarehouseDraft(current => toggleWarehouse(current || [], item))}
        onReset={() => setWarehouseDraft([])} onClose={() => setWarehouseDraft(null)}
        onApply={() => { warehouses.save(warehouseDraft); setWarehouseDraft(null); }} /> : null}
      </View>
    </Modal>
    <Modal visible={!!filterPicker} animationType="slide" onRequestClose={() => setFilterPicker(null)}>
      <View style={styles.root}>
        {filterPicker === 'menu' ? <>
          <Appbar.Header><Appbar.BackAction onPress={() => setFilterPicker(null)} /><Appbar.Content title="Фильтры остатков" /></Appbar.Header>
          {filterLoading ? <ActivityIndicator /> : null}
          {filterError ? <Button onPress={reloadFilters}>Повторить загрузку фильтров</Button> : null}
          <List.Item title="Организация" description={organizationName || 'Все организации'} onPress={() => { setFilterSearch(''); setFilterPicker('organizations'); }} right={p => <List.Icon {...p} icon="chevron-right" />} />
          <Button onPress={() => { setOrganization(''); setFilterPicker(null); }}>Сбросить организацию</Button>
        </> : filterPicker ? <SearchPickerScreen visible pickerKey={`stock-filter-${filterPicker}`} topInset={insets.top} title="Организация" titleIcon="filter-variant"
          onClose={() => setFilterPicker('menu')} search={filterSearch} onSearchChange={setFilterSearch} autoFocus={false}
          data={[{ guid: '', name: 'Все' }, ...(filterPicker ? filters[filterPicker] : [])].filter(i => i.name.toLocaleLowerCase('ru').includes(filterSearch.toLocaleLowerCase('ru')))}
          keyExtractor={i => i.guid} renderItem={({ item }) => <List.Item title={item.name} titleNumberOfLines={3}
            right={p => item.guid === organizationGuid ? <List.Icon {...p} icon="check" /> : null}
            onPress={() => { setOrganization(item.guid); setFilterPicker(null); }} />} /> : null}
      </View>
    </Modal>
    <Modal visible={!!product} animationType="slide" onRequestClose={() => setProduct(null)}>
      <View style={styles.root}>
        <Appbar.Header><Appbar.BackAction onPress={() => setProduct(null)} /><Appbar.Content title="Остатки товара" /><Appbar.Action icon="refresh" accessibilityLabel="Обновить детализацию" disabled={detail.busy || !isReachable} onPress={detail.refresh} /></Appbar.Header>
        <FlatList data={detail.page?.items ?? []} keyExtractor={i => i.id} onEndReached={detail.loadMore} onEndReachedThreshold={0.5}
          contentContainerStyle={{ paddingBottom: insets.bottom + 12 }}
          ListHeaderComponent={<View style={styles.status}><Text style={styles.title}>{product?.name}</Text>{detail.stale ? <Text style={styles.warning}>Сохранённые данные · нет обновления</Text> : null}{detail.error && detail.page ? <Button onPress={detail.refresh}>{detail.error}</Button> : null}</View>}
          ListEmptyComponent={empty(detail.busy, detail.error)} ListFooterComponent={detail.busy && detail.page ? <ActivityIndicator /> : null}
          renderItem={({ item }) => <View style={styles.balance}>
            <Text style={styles.title}>{item.warehouse.name}</Text><Text style={styles.hint}>{item.organization?.name || 'Без организации'}</Text>
            <Text style={styles.hint}>Серия: {item.seriesNumber || 'не указана'}{item.expiresAt ? ` · годен до ${new Date(item.expiresAt).toLocaleDateString('ru-RU')}` : ''}</Text>
            <Metrics item={item} unit={product?.baseUnit?.symbol || product?.baseUnit?.name || ''} full />
          </View>} />
      </View>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  image: { width: '100%', height: '100%', minHeight: 80 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  title: { fontSize: 14, lineHeight: 18, fontWeight: '700', color: '#0F172A' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 5 },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metricText: { fontSize: 13, color: '#334155', fontWeight: '600' },
  hint: { fontSize: 11, color: '#64748B', lineHeight: 16 },
  warehouseSelector: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, minWidth: 40, minHeight: 40 },
  warehouseLabel: { flexShrink: 1, color: '#2563EB', fontSize: 13, fontWeight: '700' },
  status: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#F8FAFC' },
  warning: { color: '#92400E', fontSize: 12 },
  empty: { padding: 24, alignItems: 'center', gap: 12 },
  balance: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
});
