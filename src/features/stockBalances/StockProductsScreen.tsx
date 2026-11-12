import React from 'react';
import { BackHandler, Modal, Pressable, StyleSheet, View } from 'react-native';
import { StockFlatList as FlatList, StockRefreshControl as RefreshControl } from './StockGestureLists';
import { ActivityIndicator, Appbar, Button, PaperProvider, Text } from 'react-native-paper';
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
import { stockRequest, type StockFilters, type StockProduct } from './products';
import { useStockProducts } from './useStockProducts';
import {StockProductDetails} from './StockProductDetails';
import { StockProductRow } from './StockProductRow';

const emptyFilters: StockFilters = { warehouses: [], organizations: [] };
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
  const [gallery, setGallery] = React.useState<ProductGallery | null>(null);
  const [product, setProduct] = React.useState<StockProduct | null>(null);
  const [cardRevision,resetCard]=React.useReducer(value=>value+1,0);
  const listRef = React.useRef<any>(null);
  React.useEffect(() => { listRef.current?.scrollToOffset?.({ offset: 0, animated: false }); }, [search, warehouseGuids]);
  const stock = useStockProducts<StockProduct>('products', { search, warehouseGuids }, warehouses.ready ? userId : undefined, isReachable);
  const openProduct = React.useCallback((item:StockProduct)=>{resetCard();setProduct(item);},[]);
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
        const data = await stockRequest<StockFilters>('filters', {}, controller.signal,Number(userId));
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
      {!isReachable || error ? <Button onPress={() => stock.refresh()}>Повторить</Button> : null}
    </>}
  </View>;
  const warehouseItems = React.useMemo(() => [{ guid: '', name: 'Все склады' }, ...new Map([...warehouses.items, ...filters.warehouses].map(w => [w.guid, w])).values()], [warehouses.items, filters.warehouses]);
  const warehouseGroups = React.useMemo(() => buildWarehousePickerGroups(warehouseItems.filter(w => !!w.guid)), [warehouseItems]);
  const warehouseLabel = warehouseSelectionLabel(warehouses.items.map(w => filters.warehouses.find(f => f.guid === w.guid) || w));
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
        {product?<StockProductDetails key={`${product.guid}:${cardRevision}`} product={product} userId={userId} warehouses={warehouses} initialFilters={filters}/>:null}
      </View>
    </Modal>
    <Modal visible={!!gallery} animationType="fade" onRequestClose={() => setGallery(null)}>
      <PaperProvider><ProductImageGalleryModal gallery={gallery} onClose={() => setGallery(null)} /></PaperProvider>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  warehouseSelector: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, minWidth: 40, minHeight: 40 },
  warehouseLabel: { flexShrink: 1, color: '#2563EB', fontSize: 13, fontWeight: '700' },
  status: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#F8FAFC' },
  warning: { color: '#92400E', fontSize: 12 },
  empty: { padding: 24, alignItems: 'center', gap: 12 },
});
