import TabBarSpacer from '@/components/Navigation/TabBarSpacer';
import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';
import DateTimeInput from '@/components/ui/DateTimeInput';
import { useThemeColor } from '@/hooks/useThemeColor';
import {
  computeLineTotal,
  formatDateTime,
  formatMoney,
  getClientOrdersResponsiveMetrics,
  isValidManualPriceValue,
  isValidQuantityValue,
  isWeightDraftItem,
  normalizePriceInput,
  normalizeQuantityInput,
  resolveClientOrdersEditorTier,
  resolveClientOrdersLayoutTier,
} from '@/src/features/clientOrders/clientOrdersShared';
import { useClientOrdersWorkspace } from '@/src/features/clientOrders/useClientOrdersWorkspace';
import { getClientOrderReferenceDetails } from '@/utils/clientOrdersService';
import type { ClientOrder, ClientOrderCounterpartyOption, ClientOrderProduct, ClientOrderReferenceDetails, ClientOrderReferenceKind } from '@/utils/clientOrdersService';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import {
  ActivityIndicator,
  Button as PaperButton,
  Chip,
  Divider,
  IconButton as PaperIconButton,
  List,
  Menu,
  Modal as PaperModal,
  Portal,
  Searchbar,
  Surface,
  Text as PaperText,
  TouchableRipple,
} from 'react-native-paper';

type ScreenMode = 'orders' | 'editor';
type EditorSection = 'header' | 'items';
type PickerKind = 'filterCounterparty' | 'organization' | 'counterparty' | 'agreement' | 'contract' | 'warehouse' | 'deliveryAddress' | 'priceType' | 'product';

const PAGE_SIZE = 25;
const IN_STOCK_KEY = 'clientOrders.productPicker.inStockOnly';

function titleOf(item: any) {
  return item?.name || item?.fullAddress || item?.number || item?.code || 'Без названия';
}
function metaOf(item: any) {
  return item?.fullName || item?.fullAddress || item?.number || item?.code || item?.article || item?.inn || '';
}
function dateOnly(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function pickerTitle(kind: PickerKind | null) {
  return ({ filterCounterparty: 'Контрагент для фильтра', organization: 'Организация', counterparty: 'Контрагент', agreement: 'Соглашение', contract: 'Договор', warehouse: 'Склад', deliveryAddress: 'Адрес доставки', priceType: 'Вид цены', product: 'Подбор товаров' } as Record<PickerKind, string>)[kind || 'product'];
}
function stockText(stock: any, baseUnit?: any) {
  const value = stock?.available ?? stock?.quantity;
  if (value === undefined || value === null) return '';
  const unit = baseUnit?.symbol || baseUnit?.name || 'шт';
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(Number(value) || 0)} ${unit}`;
}

function quantityInputWidthPx(value: unknown, minWidth: number, maxWidth: number) {
  const length = String(value ?? '').trim().length;
  const estimated = 18 + Math.max(3, length + 1) * 8;
  return Math.min(maxWidth, Math.max(minWidth, estimated));
}
function displayedPriceValue(item: any) {
  if ((item?.manualPrice || '').trim()) return item.manualPrice;
  if (item?.basePrice === null || item?.basePrice === undefined || item.basePrice <= 0) return '';
  return String(item.basePrice);
}
function receiptPriceText(item: any) {
  return item?.receiptPrice === null || item?.receiptPrice === undefined
    ? 'Цена поступления —'
    : `Цена поступления ${formatMoney(item.receiptPrice, item.currency)}`;
}
function productPickerMeta(item: any) {
  return {
    code: item?.code || 'Без кода',
    receiptPrice: item?.receiptPrice === null || item?.receiptPrice === undefined
      ? '—'
      : formatMoney(item.receiptPrice, item.currency),
    stock: stockText(item?.stock, item?.baseUnit) || '—',
  };
}
function unitLabel(unit: any) {
  return unit?.symbol || unit?.name || 'шт';
}
function packageLabel(pack: any, item?: any) {
  return [pack?.name, pack?.unit?.symbol || pack?.unit?.name].filter(Boolean).join(' / ') || unitLabel(item?.baseUnit) || 'Упаковка';
}
function hasSinglePackage(item: any) {
  return !item?.packages?.length || item.packages.length === 1;
}
function getPackageDisplayText(item: any) {
  if (!item?.packages?.length) return unitLabel(item?.baseUnit);
  if (item.packages.length === 1) return packageLabel(item.packages[0], item);
  const selectedPack = item.packageGuid ? item.packages.find((pack: any) => pack.guid === item.packageGuid) : null;
  return selectedPack ? packageLabel(selectedPack, item) : unitLabel(item.baseUnit);
}
function quantityStep(item: any, direction: 1 | -1) {
  const weight = isWeightDraftItem(item);
  const current = Number(String(item.quantity || '').replace(',', '.')) || 0;
  const min = weight ? 0.001 : 1;
  return String(Math.max(min, current + direction * 1)).replace(/\.0+$/, '');
}
function orderTitle(order: ClientOrder) {
  return order.number1c ? `Заказ ${order.number1c}` : `Черновик ${order.guid.slice(0, 8)}`;
}

function pickerNeedsCounterparty(kind: PickerKind | null) {
  return kind === 'agreement' || kind === 'contract' || kind === 'deliveryAddress';
}

function getSelectedPickerGuid(args: {
  pickerKind: PickerKind | null;
  workspace: any;
  filterCounterparty: ClientOrderCounterpartyOption | null;
  linePriceTarget: string | null;
}) {
  const { pickerKind, workspace, filterCounterparty, linePriceTarget } = args;
  if (!pickerKind) return null;
  switch (pickerKind) {
    case 'filterCounterparty':
      return filterCounterparty?.guid || null;
    case 'organization':
      return workspace.draft.organizationGuid || null;
    case 'counterparty':
      return workspace.draft.counterpartyGuid || null;
    case 'agreement':
      return workspace.draft.agreementGuid || null;
    case 'contract':
      return workspace.draft.contractGuid || null;
    case 'warehouse':
      return workspace.draft.warehouseGuid || null;
    case 'deliveryAddress':
      return workspace.draft.deliveryAddressGuid || null;
    case 'priceType':
      if (linePriceTarget) {
        const line = workspace.draft.items.find((item: any) => item.key === linePriceTarget);
        return line?.priceTypeGuid || workspace.defaultLinePriceType?.guid || null;
      }
      return workspace.draft.priceTypeGuid || workspace.selections.agreement?.priceType?.guid || null;
    default:
      return null;
  }
}

export default function ClientOrdersMobileScreen() {
  const [discardConfirm, setDiscardConfirm] = React.useState<{
    open: boolean;
    mode: 'create' | 'edit';
    blockingMessage: string | null;
  }>({ open: false, mode: 'edit', blockingMessage: null });
  const discardConfirmResolveRef = React.useRef<((value: boolean) => void) | null>(null);
  const requestDiscardConfirm = React.useCallback((context: { draftMode: boolean; hasPersistedDraft: boolean; blockingMessage: string | null }) => (
    new Promise<boolean>((resolve) => {
      discardConfirmResolveRef.current = resolve;
      setDiscardConfirm({
        open: true,
        mode: context.draftMode && !context.hasPersistedDraft ? 'create' : 'edit',
        blockingMessage: context.blockingMessage,
      });
    })
  ), []);
  const closeDiscardConfirm = React.useCallback((result: boolean) => {
    const resolve = discardConfirmResolveRef.current;
    discardConfirmResolveRef.current = null;
    setDiscardConfirm((prev) => ({ ...prev, open: false }));
    resolve?.(result);
  }, []);
  const workspace = useClientOrdersWorkspace({ confirmDiscard: requestDiscardConfirm });
  const topInset = useHeaderContentTopInset({ hasSubtitle: true });
  const background = useThemeColor({}, 'background');
  const card = useThemeColor({}, 'cardBackground');
  const { width } = useWindowDimensions();
  const layoutTier = resolveClientOrdersLayoutTier(width);
  const editorTier = resolveClientOrdersEditorTier(width);
  const ui = getClientOrdersResponsiveMetrics(layoutTier, editorTier);
  const [mode, setMode] = React.useState<ScreenMode>('orders');
  const [section, setSection] = React.useState<EditorSection>('header');
  const [pickerKind, setPickerKind] = React.useState<PickerKind | null>(null);
  const [pickerSearch, setPickerSearch] = React.useState('');
  const [pickerItems, setPickerItems] = React.useState<any[]>([]);
  const [pickerOffset, setPickerOffset] = React.useState(0);
  const [pickerHasMore, setPickerHasMore] = React.useState(false);
  const [pickerLoading, setPickerLoading] = React.useState(false);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [inspectorOpen, setInspectorOpen] = React.useState(false);
  const [filterCounterparty, setFilterCounterparty] = React.useState<ClientOrderCounterpartyOption | null>(null);
  const [itemsSearch, setItemsSearch] = React.useState('');
  const [inStockOnly, setInStockOnly] = React.useState(false);
  const [linePriceTarget, setLinePriceTarget] = React.useState<string | null>(null);
  const [actionsMenuOpen, setActionsMenuOpen] = React.useState(false);
  const [pendingPriceTypeAction, setPendingPriceTypeAction] = React.useState<{ priceType: any | null } | null>(null);
  const [referenceOpen, setReferenceOpen] = React.useState(false);
  const [referenceLoading, setReferenceLoading] = React.useState(false);
  const [referenceError, setReferenceError] = React.useState<string | null>(null);
  const [referenceDetails, setReferenceDetails] = React.useState<ClientOrderReferenceDetails | null>(null);
  const pickerRequestIdRef = React.useRef(0);
  const pickerLoadSignatureRef = React.useRef('');
  const selectedPickerGuid = React.useMemo(() => getSelectedPickerGuid({
    pickerKind,
    workspace,
    filterCounterparty,
    linePriceTarget,
  }), [filterCounterparty, linePriceTarget, pickerKind, workspace]);
  const visiblePickerItems = React.useMemo(() => {
    if (!pickerItems.length || !selectedPickerGuid) return pickerItems;
    const selectedItem = pickerItems.find((item) => item?.guid === selectedPickerGuid);
    if (!selectedItem) return pickerItems;
    return [selectedItem, ...pickerItems.filter((item) => item?.guid !== selectedPickerGuid)];
  }, [pickerItems, selectedPickerGuid]);

  React.useEffect(() => { AsyncStorage.getItem(IN_STOCK_KEY).then((v) => setInStockOnly(v === '1')).catch(() => undefined); }, []);
  React.useEffect(() => { void AsyncStorage.setItem(IN_STOCK_KEY, inStockOnly ? '1' : '0'); }, [inStockOnly]);

  const openPicker = React.useCallback((kind: PickerKind, lineKey?: string) => {
    setPickerKind(kind);
    setLinePriceTarget(kind === 'priceType' && lineKey ? lineKey : null);
    setPickerSearch('');
    setPickerItems([]);
    setPickerOffset(0);
    setPickerHasMore(false);
    pickerLoadSignatureRef.current = '';
  }, []);

  const loadPickerPage = React.useCallback(async (kind: PickerKind, search: string, offset = 0, append = false) => {
    const signature = `${kind}|${search}|${offset}|${append ? 'append' : 'reset'}`;
    if (append && pickerLoadSignatureRef.current === signature) return;
    pickerLoadSignatureRef.current = signature;
    const requestId = ++pickerRequestIdRef.current;
    setPickerLoading(true);
    try {
      if (pickerNeedsCounterparty(kind) && !workspace.draft.counterpartyGuid) {
        if (pickerRequestIdRef.current !== requestId) return;
        setPickerItems([]);
        setPickerOffset(offset);
        setPickerHasMore(false);
        return;
      }
      let result: any;
      if (kind === 'organization') {
        const all = workspace.settings?.organizations || [];
        const needle = search.trim().toLowerCase();
        const filtered = all.filter((item) => !needle || item.name.toLowerCase().includes(needle) || (item.code || '').toLowerCase().includes(needle));
        result = { items: filtered.slice(offset, offset + PAGE_SIZE), meta: { total: filtered.length } };
      } else if (kind === 'filterCounterparty' || kind === 'counterparty') result = await workspace.searchCounterparties({ search, limit: PAGE_SIZE, offset });
      else if (kind === 'agreement') result = await workspace.searchAgreements({ counterpartyGuid: workspace.draft.counterpartyGuid || undefined, search, limit: PAGE_SIZE, offset });
      else if (kind === 'contract') result = await workspace.searchContracts({ counterpartyGuid: workspace.draft.counterpartyGuid || undefined, search, limit: PAGE_SIZE, offset });
      else if (kind === 'warehouse') result = await workspace.searchWarehouses({ search, limit: PAGE_SIZE, offset });
      else if (kind === 'deliveryAddress') result = await workspace.searchDeliveryAddresses({ counterpartyGuid: workspace.draft.counterpartyGuid || undefined, search, limit: PAGE_SIZE, offset });
      else if (kind === 'priceType') result = await workspace.searchPriceTypes({ search, limit: PAGE_SIZE, offset });
      else result = await workspace.searchProducts({ search, counterpartyGuid: workspace.draft.counterpartyGuid, agreementGuid: workspace.draft.agreementGuid || undefined, warehouseGuid: workspace.draft.warehouseGuid || undefined, priceTypeGuid: workspace.draft.priceTypeGuid || undefined, inStockOnly, limit: PAGE_SIZE, offset });
      if (pickerRequestIdRef.current !== requestId) return;
      const items = result?.items || [];
      if (append && items.length === 0) {
        setPickerHasMore(false);
        return;
      }
      setPickerItems((prev) => append ? [...prev, ...items] : items);
      setPickerOffset(offset);
      setPickerHasMore(offset + items.length < (result?.meta?.total || 0));
    } finally {
      if (pickerRequestIdRef.current === requestId) setPickerLoading(false);
    }
  }, [inStockOnly, workspace]);

  React.useEffect(() => {
    if (!pickerKind) return;
    const timeout = setTimeout(() => void loadPickerPage(pickerKind, pickerSearch, 0, false), pickerSearch ? 250 : 0);
    return () => clearTimeout(timeout);
  }, [loadPickerPage, pickerKind, pickerSearch]);

  const closePicker = React.useCallback(() => {
    pickerRequestIdRef.current += 1;
    pickerLoadSignatureRef.current = '';
    setPickerKind(null);
    setLinePriceTarget(null);
  }, []);

  const handlePickerScroll = React.useCallback((event: any) => {
    if (!pickerKind || pickerLoading || !pickerHasMore) return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (contentSize.height <= layoutMeasurement.height + 24) return;
    const remaining = contentSize.height - contentOffset.y - layoutMeasurement.height;
    if (remaining > 320) return;
    void loadPickerPage(pickerKind, pickerSearch, pickerOffset + PAGE_SIZE, true);
  }, [loadPickerPage, pickerHasMore, pickerKind, pickerLoading, pickerOffset, pickerSearch]);

  const openReferenceDetails = React.useCallback(async (kind: ClientOrderReferenceKind, guid?: string | null) => {
    if (!guid) return;
    setReferenceOpen(true);
    setReferenceLoading(true);
    setReferenceError(null);
    setReferenceDetails(null);
    try {
      setReferenceDetails(await getClientOrderReferenceDetails(kind, guid));
    } catch (error: any) {
      setReferenceError(error?.message || 'Не удалось загрузить карточку.');
    } finally {
      setReferenceLoading(false);
    }
  }, []);

  const selectPickerItem = React.useCallback(async (item: any) => {
    if (pickerKind === 'filterCounterparty') {
      setFilterCounterparty(item);
      workspace.setFilters((prev) => ({ ...prev, counterpartyGuid: item.guid }));
      closePicker();
    } else if (pickerKind === 'organization') { await workspace.setOrganization(item); closePicker(); }
    else if (pickerKind === 'counterparty') { await workspace.setCounterparty(item); closePicker(); }
    else if (pickerKind === 'agreement') { workspace.setAgreement(item); closePicker(); }
    else if (pickerKind === 'contract') { workspace.setContract(item); closePicker(); }
    else if (pickerKind === 'warehouse') { workspace.setWarehouse(item); closePicker(); }
    else if (pickerKind === 'deliveryAddress') { workspace.setDeliveryAddress(item); closePicker(); }
    else if (pickerKind === 'priceType') {
      if (linePriceTarget) {
        workspace.setItemPriceType(linePriceTarget, item);
      } else if (workspace.draft.items.length) {
        setPendingPriceTypeAction({ priceType: item });
      } else {
        workspace.setHeaderPriceType(item);
      }
      closePicker();
    } else if (pickerKind === 'product') workspace.addProduct(item as ClientOrderProduct);
  }, [closePicker, linePriceTarget, pickerKind, workspace]);

  const createDocument = React.useCallback(async () => {
    await workspace.createDocument();
    setSection('header');
    setMode('editor');
  }, [workspace]);

  const selectOrder = React.useCallback(async (order: ClientOrder) => {
    if (await workspace.selectOrder(order.guid)) {
      setSection('items');
      setMode('editor');
    }
  }, [workspace]);

  const removeOrCancel = React.useCallback(() => {
    if (workspace.draftMode || workspace.selectedOrder?.status === 'DRAFT') {
      void workspace.deleteDraft();
      setMode('orders');
      return;
    }
    Alert.alert('Отменить заказ?', 'Заказ будет отменен.', [
      { text: 'Нет', style: 'cancel' },
      { text: 'Отменить', style: 'destructive', onPress: () => void workspace.cancelOrder() },
    ]);
  }, [workspace]);

  const submitFromMenu = React.useCallback(() => {
    setActionsMenuOpen(false);
    Alert.alert('Отправить в 1С?', 'Документ будет поставлен в очередь обмена.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Отправить', onPress: () => void workspace.submitOrder() },
    ]);
  }, [workspace]);

  const title = workspace.draftMode ? 'Новый заказ клиента' : workspace.selectedOrder?.number1c ? `Заказ ${workspace.selectedOrder.number1c}` : `Черновик ${workspace.selectedOrder?.guid.slice(0, 8) || ''}`;
  const filteredItems = React.useMemo(() => {
    const q = itemsSearch.trim().toLowerCase();
    return q ? workspace.draft.items.filter((item) => [item.productName, item.productCode, item.productArticle, item.productSku].some((v) => (v || '').toLowerCase().includes(q))) : workspace.draft.items;
  }, [itemsSearch, workspace.draft.items]);

  return (
    <View style={[styles.screen, { backgroundColor: background, paddingTop: Math.max(0, topInset - 8) }]}>
      {mode === 'orders' ? (
        <ScrollView contentContainerStyle={[styles.content, width >= 720 && styles.contentTablet, { paddingHorizontal: ui.pageX, paddingTop: ui.pageY, gap: ui.stackGap, maxWidth: layoutTier === 'tablet' ? 760 : undefined }]}>
          <View style={[styles.panel, { backgroundColor: card, borderRadius: ui.panelRadius, padding: ui.panelPadding, gap: ui.stackGap }]}>
            <Text style={styles.title}>Заказы клиентов</Text>
            <Searchbar style={styles.searchbar} inputStyle={styles.searchbarInput} value={workspace.filters.search} onChangeText={(value) => workspace.setFilters((prev) => ({ ...prev, search: value }))} placeholder="Поиск" />
            <View style={styles.row}><ActionButton label="Фильтры" icon="options-outline" kind="secondary" onPress={() => setFiltersOpen(true)} /><ActionButton label="Новый заказ" icon="document-text-outline" kind="primary" onPress={() => void createDocument()} /></View>
            <View style={styles.statsRow}><Pill text={`Всего ${workspace.statusCounts.all}`} /><Pill text={`Черновики ${workspace.statusCounts.draft}`} /><Pill text={`В очереди ${workspace.statusCounts.queued}`} /></View>
          </View>
          {workspace.orders.map((order) => <OrderCard key={order.guid} order={order} workspace={workspace} selected={workspace.selectedGuid === order.guid} onPress={() => void selectOrder(order)} />)}
          {workspace.hasMoreOrders ? <ActionButton label={workspace.loadingMoreOrders ? 'Загружаю...' : 'Показать ещё'} kind="secondary" onPress={() => void workspace.loadMoreOrders()} disabled={workspace.loadingMoreOrders} /> : null}
          <TabBarSpacer />
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, width >= 720 && styles.contentTablet, { paddingHorizontal: ui.pageX, paddingTop: ui.pageY, gap: ui.stackGap, maxWidth: layoutTier === 'tablet' ? 760 : undefined }]}>
          <View style={[styles.panel, { backgroundColor: card, borderRadius: ui.panelRadius, padding: ui.panelPadding, gap: ui.stackGap }]}>
            <View style={styles.headerRow}>
              <Pressable onPress={() => setMode('orders')} style={[styles.iconButton, { width: ui.actionButtonSize + 2, height: ui.actionButtonSize + 2 }]}><Ionicons name="arrow-back-outline" size={ui.actionIconSize} color="#0F172A" /></Pressable>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { fontSize: ui.titleSize }]}>{title}</Text>
                <Text style={[styles.subtitle, { fontSize: ui.subtitleSize }]}>{workspace.autosaveLabel}</Text>
              </View>
              <Menu
                visible={actionsMenuOpen}
                onDismiss={() => setActionsMenuOpen(false)}
                anchor={<PaperIconButton icon="dots-vertical" size={22} onPress={() => setActionsMenuOpen(true)} style={styles.menuAnchorButton} />}
                contentStyle={styles.mobileMenuPaper}
              >
                <Menu.Item leadingIcon="content-save-outline" title={workspace.saving ? 'Сохраняю...' : 'Сохранить'} onPress={() => { setActionsMenuOpen(false); void workspace.saveDraft({ reason: 'manual' }); }} disabled={workspace.readOnly || workspace.saving || !workspace.validation.canSave} />
                <Menu.Item leadingIcon="cloud-upload-outline" title={workspace.submitting ? 'Отправляю...' : 'Отправить в 1С'} onPress={submitFromMenu} disabled={workspace.readOnly || workspace.submitting || !workspace.validation.canSave} />
                <Menu.Item leadingIcon="information-outline" title="Инспектор" onPress={() => { setActionsMenuOpen(false); setInspectorOpen(true); }} />
                <Menu.Item leadingIcon={workspace.draftMode || workspace.selectedOrder?.status === 'DRAFT' ? 'trash-can-outline' : 'close-circle-outline'} title={workspace.draftMode || workspace.selectedOrder?.status === 'DRAFT' ? 'Удалить черновик' : 'Отменить заказ'} onPress={() => { setActionsMenuOpen(false); removeOrCancel(); }} />
              </Menu>
            </View>
            {workspace.error ? <Text style={styles.error}>{workspace.error}</Text> : null}
            {workspace.validation.blockingMessage ? <Text style={styles.warning}>{workspace.validation.blockingMessage}</Text> : null}
            <View style={styles.sectionRow}>
              <View style={styles.segmentRow}>
                <SegmentButton label="Шапка" active={section === 'header'} onPress={() => setSection('header')} />
                <SegmentButton label="Товары" active={section === 'items'} onPress={() => setSection('items')} />
              </View>
              <View style={styles.itemCountBadge}>
                <Ionicons name="cube-outline" size={13} color="#2563EB" />
                <Text style={styles.itemCountBadgeText}>{workspace.draft.items.length}</Text>
              </View>
            </View>
          </View>
          {section === 'header' ? <HeaderSection workspace={workspace} openPicker={openPicker} openDetails={openReferenceDetails} /> : <ItemsSection workspace={workspace} filteredItems={filteredItems} itemsSearch={itemsSearch} setItemsSearch={setItemsSearch} openPicker={openPicker} ui={ui} editorTier={editorTier} />}
          <TabBarSpacer />
        </ScrollView>
      )}

      <SheetModal visible={filtersOpen} onClose={() => setFiltersOpen(false)} title="Фильтры">
        <Searchbar style={styles.searchbar} inputStyle={styles.searchbarInput} value={workspace.filters.search} onChangeText={(value) => workspace.setFilters((prev) => ({ ...prev, search: value }))} placeholder="Поиск" />
        <SelectionCard label="Статус" value={workspace.filters.status ? workspace.statusLabels[workspace.filters.status] || workspace.filters.status : 'Все статусы'} onPress={() => undefined} />
        <SelectionCard label="Контрагент" value={filterCounterparty?.name || 'Все контрагенты'} onPress={() => openPicker('filterCounterparty')} />
        <View style={styles.row}><ActionButton label="Сбросить" kind="secondary" onPress={() => { setFilterCounterparty(null); workspace.clearFilters(); }} /><ActionButton label="Закрыть" kind="primary" onPress={() => setFiltersOpen(false)} /></View>
      </SheetModal>

      <SheetModal visible={!!pickerKind} onClose={closePicker} title={pickerTitle(pickerKind)} fullScreen>
        <View style={styles.pickerToolbar}>
          <Searchbar style={[styles.searchbar, styles.pickerSearchInput]} inputStyle={styles.searchbarInput} value={pickerSearch} onChangeText={setPickerSearch} placeholder="Поиск" />
          {pickerKind === 'product' ? <ActionButton label={inStockOnly ? 'Только с остатком' : 'Показывать все'} kind={inStockOnly ? 'success' : 'secondary'} onPress={() => setInStockOnly((prev) => !prev)} /> : null}
        </View>
        <ScrollView style={styles.pickerScroll} onScroll={handlePickerScroll} scrollEventThrottle={16} nestedScrollEnabled contentContainerStyle={styles.pickerListContent}>
          {pickerNeedsCounterparty(pickerKind) && !workspace.draft.counterpartyGuid ? <InfoText text="Сначала выберите контрагента." /> : null}
          {visiblePickerItems.map((item: any) => {
            const disabled = pickerKind === 'product' && workspace.draft.items.some((line) => line.productGuid === item.guid);
            const pickerMeta = pickerKind === 'product' ? productPickerMeta(item) : null;
            const isSelected = !!selectedPickerGuid && selectedPickerGuid === item.guid;
            return (
              <Surface key={`${pickerKind}-${item.guid || item.name || item.fullAddress}`} style={[styles.pickerRowSurface, disabled && styles.disabled]} elevation={0}>
                <List.Item
                  title={pickerKind === 'product' ? (item.name || titleOf(item)) : titleOf(item)}
                  description={pickerKind === 'product'
                    ? [pickerMeta?.code, pickerMeta?.receiptPrice ? `Цена: ${pickerMeta.receiptPrice}` : '', pickerMeta?.stock ? `Остаток: ${pickerMeta.stock}` : ''].filter(Boolean).join(' • ')
                    : metaOf(item) || undefined}
                  onPress={() => void selectPickerItem(item)}
                  disabled={disabled}
                  titleNumberOfLines={2}
                  descriptionNumberOfLines={3}
                  titleStyle={styles.pickerRowTitle}
                  descriptionStyle={[styles.pickerRowMeta, disabled ? styles.pickerRowDisabled : null]}
                  right={() => (
                    isSelected
                      ? <List.Icon icon="check-circle" color="#16A34A" style={styles.pickerRowChevron} />
                      : <List.Icon icon="chevron-right" color={disabled ? '#CBD5E1' : '#94A3B8'} style={styles.pickerRowChevron} />
                  )}
                />
                <Divider />
              </Surface>
            );
          })}
          {!pickerLoading && !visiblePickerItems.length && !(pickerNeedsCounterparty(pickerKind) && !workspace.draft.counterpartyGuid) ? <InfoText text="Ничего не найдено." /> : null}
          {pickerLoading ? <View style={styles.pickerFooter}><ActivityIndicator size="small" color="#2563EB" /><Text style={styles.pickerFooterText}>Загружаю…</Text></View> : null}
        </ScrollView>
      </SheetModal>

      <SheetModal visible={inspectorOpen} onClose={() => setInspectorOpen(false)} title="Инспектор">
        <Text style={styles.orderMeta}>Revision: {workspace.draft.revision || '—'}</Text>
        <Text style={styles.orderMeta}>Статус: {workspace.statusLabels[workspace.selectedOrder?.status || ''] || workspace.selectedOrder?.status || '—'}</Text>
        <Text style={styles.orderMeta}>Sync state: {workspace.syncLabels[workspace.selectedOrder?.syncState || ''] || workspace.selectedOrder?.syncState || '—'}</Text>
        <Text style={styles.orderMeta}>Документ 1С: {workspace.selectedOrder?.number1c || 'Еще не создан'}</Text>
      </SheetModal>
      <SheetModal visible={referenceOpen} onClose={() => setReferenceOpen(false)} title={referenceDetails?.title || 'Карточка'}>
        {referenceLoading ? <InfoText text="Загружаю..." /> : null}
        {referenceError ? <Text style={styles.error}>{referenceError}</Text> : null}
        {referenceDetails?.subtitle ? <Text style={styles.orderMeta}>{referenceDetails.subtitle}</Text> : null}
        {referenceDetails?.sections.map((section) => <View key={section.title} style={styles.referenceSection}><Text style={styles.orderTitle}>{section.title}</Text>{section.rows.map((row) => <View key={`${section.title}-${row.label}`} style={styles.referenceRow}><Text style={styles.referenceLabel}>{row.label}</Text><Text style={styles.referenceValue}>{String(row.value ?? '—')}</Text></View>)}</View>)}
      </SheetModal>

      <SheetModal visible={!!pendingPriceTypeAction} onClose={() => setPendingPriceTypeAction(null)} title="Сменить вид цены">
        <InfoText text="Новый вид цены будет применен к строкам документа без ручной цены." />
        <View style={styles.row}>
          <ActionButton label="Отмена" kind="secondary" onPress={() => setPendingPriceTypeAction(null)} />
          <ActionButton label="Применить" kind="primary" onPress={() => {
            if (pendingPriceTypeAction) workspace.setHeaderPriceType(pendingPriceTypeAction.priceType);
            setPendingPriceTypeAction(null);
          }} />
        </View>
      </SheetModal>

      <SheetModal visible={discardConfirm.open} onClose={() => closeDiscardConfirm(false)} title={discardConfirm.mode === 'create' ? 'Закрыть новый документ?' : 'Открыть другой документ?'}>
        <InfoText text={discardConfirm.mode === 'create' ? 'Несохраненные изменения будут потеряны.' : 'Текущие изменения нужно сохранить или отбросить.'} />
        {discardConfirm.blockingMessage ? <Text style={styles.warning}>{discardConfirm.blockingMessage}</Text> : null}
        <View style={styles.row}>
          <ActionButton label="Остаться" kind="secondary" onPress={() => closeDiscardConfirm(false)} />
          <ActionButton label="Продолжить" kind="primary" onPress={() => closeDiscardConfirm(true)} />
        </View>
      </SheetModal>
    </View>
  );
}

function HeaderSection({ workspace, openPicker, openDetails }: { workspace: any; openPicker: (kind: PickerKind, lineKey?: string) => void; openDetails: (kind: ClientOrderReferenceKind, guid?: string | null) => void }) {
  const today = React.useMemo(() => new Date(), []);
  const maxDate = React.useMemo(() => { const next = new Date(); next.setMonth(next.getMonth() + 2); return next; }, []);
  return <View style={styles.cardStack}>
    <SelectionCard label="Организация" value={workspace.selections.organization?.name || 'Выбрать'} onPress={() => openPicker('organization')} disabled={workspace.readOnly} onDetails={() => openDetails('organization', workspace.draft.organizationGuid)} />
    <SelectionCard label="Контрагент" value={workspace.selections.counterparty?.name || 'Выбрать'} onPress={() => openPicker('counterparty')} disabled={workspace.readOnly} onDetails={() => openDetails('counterparty', workspace.draft.counterpartyGuid)} />
    <SelectionCard label="Соглашение" value={workspace.selections.agreement?.name || 'Выбрать'} onPress={() => openPicker('agreement')} disabled={workspace.readOnly || !workspace.draft.counterpartyGuid} onDetails={() => openDetails('agreement', workspace.draft.agreementGuid)} />
    <SelectionCard label="Договор" value={workspace.selections.contract?.name || workspace.selections.contract?.number || 'Выбрать'} onPress={() => openPicker('contract')} disabled={workspace.readOnly || !workspace.draft.counterpartyGuid} onDetails={() => openDetails('contract', workspace.draft.contractGuid)} />
    <View style={styles.inlineRow}><View style={{ flex: 1 }}><SelectionCard label="Вид цены" value={workspace.draft.priceTypeName || workspace.selections.agreement?.priceType?.name || 'Выбрать'} onPress={() => openPicker('priceType')} disabled={workspace.readOnly} onDetails={() => openDetails('price-type', workspace.draft.priceTypeGuid || workspace.selections.agreement?.priceType?.guid)} /></View>{workspace.isHeaderPriceTypeCustom ? <Pressable style={styles.iconButton} onPress={() => workspace.resetHeaderPriceTypeToDefault()}><Ionicons name="refresh-outline" size={18} color="#2563EB" /></Pressable> : null}</View>
    <SelectionCard label="Склад" value={workspace.selections.warehouse?.name || 'Выбрать'} onPress={() => openPicker('warehouse')} disabled={workspace.readOnly} onDetails={() => openDetails('warehouse', workspace.draft.warehouseGuid)} />
    <SelectionCard label="Адрес доставки" value={workspace.selections.deliveryAddress?.fullAddress || 'Выбрать'} onPress={() => openPicker('deliveryAddress')} disabled={workspace.readOnly || !workspace.draft.counterpartyGuid} onDetails={() => openDetails('delivery-address', workspace.draft.deliveryAddressGuid)} />
    <DateTimeInput label="Дата отгрузки" value={workspace.draft.deliveryDate || undefined} includeTime={false} disabledPast minDate={today} maxDate={maxDate} allowClear={false} disabled={workspace.readOnly} onChange={(iso) => workspace.patchDraft({ deliveryDate: iso })} />
    <TextInput style={[styles.input, styles.comment]} value={workspace.draft.comment || ''} onChangeText={(value) => workspace.patchDraft({ comment: value })} placeholder="Комментарий" multiline editable={!workspace.readOnly} placeholderTextColor="#94A3B8" />
  </View>;
}

function ItemsSection({ workspace, filteredItems, itemsSearch, setItemsSearch, openPicker, ui, editorTier }: { workspace: any; filteredItems: any[]; itemsSearch: string; setItemsSearch: (value: string) => void; openPicker: (kind: PickerKind, lineKey?: string) => void; ui: ReturnType<typeof getClientOrdersResponsiveMetrics>; editorTier: ReturnType<typeof resolveClientOrdersEditorTier> }) {
  const compactActions = editorTier === 'cards';
  const controlHeight = ui.fieldHeight + 8;
  return <View style={styles.cardStack}>
    <View style={styles.panelHeader}><Text style={styles.title}>Товары</Text><Text style={styles.total}>{formatMoney(workspace.localTotal, workspace.draft.currency)}</Text></View>
    <View style={[styles.row, { gap: ui.actionGap + (compactActions ? 0 : 0) }]}>
      <Searchbar style={[styles.searchbar, styles.itemsSearchPaper, { flex: 1, minHeight: controlHeight, height: controlHeight }]} inputStyle={styles.searchbarInput} value={itemsSearch} onChangeText={setItemsSearch} placeholder="Поиск в строках" />
      <ActionButton label="Добавить" icon="add-outline" kind="success" onPress={() => openPicker('product')} height={controlHeight} />
      <ActionButton label="Удалить" icon="trash-outline" kind="danger" onPress={() => Alert.alert('Удалить все товары', 'Все строки документа будут удалены без возможности восстановления.', [{ text: 'Отмена', style: 'cancel' }, { text: 'Удалить', style: 'destructive', onPress: workspace.clearItems }])} disabled={!workspace.draft.items.length} height={controlHeight} />
    </View>
    {filteredItems.length ? (
      <View style={[styles.lineList, { paddingBottom: ui.itemsBottomInset }]}>
        <View style={styles.lineHeaderRow}>
          <Text style={[styles.lineHeaderText, styles.lineHeaderNo]}>№</Text>
          <Text style={[styles.lineHeaderText, styles.lineHeaderTitle]}>Товар</Text>
          <Text style={[styles.lineHeaderText, styles.lineHeaderQty]}>Кол-во</Text>
          <Text style={[styles.lineHeaderText, styles.lineHeaderPack]}>Упак.</Text>
          <Text style={[styles.lineHeaderText, styles.lineHeaderPriceType]}>Вид</Text>
          <Text style={[styles.lineHeaderText, styles.lineHeaderPrice]}>Цена</Text>
        </View>
        {filteredItems.map((item, index) => <LineItemCard key={item.key} item={item} index={index} workspace={workspace} openPicker={openPicker} ui={ui} />)}
      </View>
    ) : null}
    {!filteredItems.length ? <InfoText text="Подходящие строки не найдены." /> : null}
  </View>;
}

function LineItemCard({ item, index, workspace, openPicker, ui }: { item: any; index: number; workspace: any; openPicker: (kind: PickerKind, lineKey?: string) => void; ui: ReturnType<typeof getClientOrdersResponsiveMetrics> }) {
  const qtyValid = isValidQuantityValue(item);
  const currentManualPrice = item.manualPrice || '';
  const priceValid = !currentManualPrice || isValidManualPriceValue(currentManualPrice);
  const qtyInputWidth = quantityInputWidthPx(item.quantity, 40, 92);
  const qtyControlWidth = qtyInputWidth + ui.narrowControlHeight * 2 + 8;
  const displayedPrice = displayedPriceValue(item);
  const openPackagePicker = React.useCallback(() => {
    if (hasSinglePackage(item)) return;
    const options = [
      { text: unitLabel(item.baseUnit), onPress: () => workspace.setItemPatch(item.key, { packageGuid: null }) },
      ...item.packages.map((pack: any) => ({
        text: packageLabel(pack, item),
        onPress: () => workspace.setItemPatch(item.key, { packageGuid: pack.guid }),
      })),
      { text: 'Отмена', style: 'cancel' as const },
    ];
    Alert.alert('Выбор упаковки', undefined, options);
  }, [item, workspace]);
  return <View style={styles.lineRow}>
    <View style={styles.lineTopCompact}><Pressable onPress={() => workspace.removeItem(item.key)} style={styles.lineDeleteCompact}><Ionicons name="close-outline" size={16} color="#0F172A" /></Pressable><Text style={styles.lineNoCompact}>{index + 1}</Text><View style={{ flex: 1, minWidth: 0 }}><Text style={styles.lineTitleCompact}>{item.productName}</Text><Text style={styles.lineMetaCompact} numberOfLines={1}>{[item.productCode, item.productArticle, item.productSku].filter(Boolean).join(' • ')}</Text></View><Text style={styles.lineTotalCompact}>{formatMoney(computeLineTotal(item, workspace.draft.generalDiscountPercent), workspace.draft.currency)}</Text></View>
    <View style={[styles.lineControlsRow, { gap: ui.narrowRowGap }]}>
      <View style={[styles.stepperCompact, { width: qtyControlWidth }]}><Pressable style={[styles.stepButtonCompact, { width: ui.narrowControlHeight, height: ui.narrowControlHeight }]} onPress={() => workspace.setItemPatch(item.key, { quantity: quantityStep(item, -1) })}><Text style={styles.stepTextCompact}>?</Text></Pressable><TextInput style={[styles.smallInputCompact, { width: qtyInputWidth, height: ui.narrowControlHeight, flexGrow: 0, flexShrink: 0 }, !qtyValid && styles.invalidInput]} value={String(item.quantity)} keyboardType="decimal-pad" onChangeText={(value) => workspace.setItemPatch(item.key, { quantity: normalizeQuantityInput(item, value) })} /><Pressable style={[styles.stepButtonCompact, { width: ui.narrowControlHeight, height: ui.narrowControlHeight }]} onPress={() => workspace.setItemPatch(item.key, { quantity: quantityStep(item, 1) })}><Text style={styles.stepTextCompact}>+</Text></Pressable></View>
      {hasSinglePackage(item)
        ? <View style={[styles.compactField, styles.compactStaticField, { minHeight: ui.narrowControlHeight, paddingHorizontal: ui.compactStaticFieldHorizontalPadding }]}><Text style={styles.compactFieldText} numberOfLines={1}>{getPackageDisplayText(item)}</Text></View>
        : <Pressable style={[styles.compactField, styles.compactPackField, { width: ui.narrowPackageWidth, height: ui.narrowControlHeight }]} onPress={openPackagePicker}><Text style={styles.compactFieldText} numberOfLines={1}>{getPackageDisplayText(item)}</Text><Ionicons name="chevron-down-outline" size={14} color="#64748B" /></Pressable>}
      <Pressable style={[styles.compactField, styles.compactPriceTypeField, { height: ui.narrowControlHeight }]} onPress={() => openPicker('priceType', item.key)}><Text style={styles.compactFieldText} numberOfLines={1}>{currentManualPrice.trim() ? 'Произвольный' : item.priceTypeName || workspace.defaultLinePriceType?.name || 'Выбрать'}</Text>{workspace.isItemPriceTypeCustom(item.key) ? <Pressable style={styles.compactResetButton} onPress={() => workspace.resetItemPriceType(item.key)}><Ionicons name="refresh-outline" size={14} color="#2563EB" /></Pressable> : <Ionicons name="chevron-down-outline" size={14} color="#64748B" />}</Pressable>
      <TextInput style={[styles.smallPriceInputCompact, { width: ui.narrowPriceWidth, height: ui.narrowControlHeight }, !priceValid && styles.invalidInput]} value={displayedPrice} keyboardType="decimal-pad" onChangeText={(value) => { const manualPrice = normalizePriceInput(value); workspace.setItemPatch(item.key, { manualPrice, priceTypeGuid: manualPrice.trim() ? null : workspace.draft.priceTypeGuid ?? null, priceTypeName: manualPrice.trim() ? 'Произвольный' : workspace.draft.priceTypeName ?? null }); }} placeholder="0" placeholderTextColor="#94A3B8" />
    </View>
    {(workspace.validation.itemMessages[item.key] || []).length ? <Text style={styles.lineErrorCompact}>{(workspace.validation.itemMessages[item.key] || []).join(' ')}</Text> : null}
  </View>;
}

function OrderCard({ order, workspace, selected, onPress }: { order: ClientOrder; workspace: any; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.orderCard, selected && styles.orderCardSelected]}>
    <View style={styles.panelHeader}><Text style={styles.orderTitle}>{orderTitle(order)}</Text><Pill text={workspace.statusLabels[order.status] || order.status} tone={order.status === 'CANCELLED' ? 'danger' : undefined} /></View>
    <Text style={styles.orderMeta}>{order.counterparty?.name || 'Контрагент не выбран'}</Text>
    <View style={styles.statsRow}><Pill text={formatMoney(order.totalAmount, order.currency)} /><Pill text={`${order.items.length || 0} поз.`} /><Pill text={`Отгр. ${dateOnly(order.deliveryDate)}`} /></View>
    <Text style={styles.orderMeta}>Изм. {formatDateTime(order.updatedAt)}</Text>
  </Pressable>;
}

function SelectionCard({ label, value, onPress, disabled, compact, onDetails }: { label: string; value: string; onPress: () => void; disabled?: boolean; compact?: boolean; onDetails?: () => void }) {
  return (
    <Surface style={[styles.selection, compact && styles.selectionCompact, disabled && styles.disabled]} elevation={1}>
      <TouchableRipple disabled={disabled} onPress={onPress} borderless={false} style={styles.selectionRipple}>
        <View>
          <PaperText style={styles.selectionLabel}>{label}</PaperText>
          <View style={styles.selectionValueRow}>
            <PaperText style={[styles.selectionValue, { flex: 1 }]} numberOfLines={2}>{value}</PaperText>
            {onDetails ? <PaperIconButton icon="magnify" size={18} onPress={onDetails} style={styles.detailsButtonPaper} /> : null}
          </View>
        </View>
      </TouchableRipple>
    </Surface>
  );
}

function ActionButton({ label, icon, kind = 'secondary', onPress, disabled, height }: { label: string; icon?: keyof typeof Ionicons.glyphMap; kind?: 'primary' | 'secondary' | 'danger' | 'success'; onPress: () => void; disabled?: boolean; height?: number }) {
  const mode = kind === 'secondary' ? 'outlined' : 'contained';
  const buttonColor = kind === 'danger' ? '#DC2626' : kind === 'success' ? '#16A34A' : kind === 'primary' ? '#0F172A' : '#FFFFFF';
  const textColor = kind === 'secondary' ? '#2563EB' : '#FFFFFF';
  return (
    <PaperButton
      mode={mode}
      disabled={disabled}
      onPress={onPress}
      icon={icon ? (() => <Ionicons name={icon} size={17} color={textColor} />) : undefined}
      buttonColor={buttonColor}
      textColor={textColor}
      contentStyle={height ? { minHeight: height, height } : undefined}
      style={[styles.actionPaper, disabled && styles.disabled]}
      labelStyle={styles.actionPaperLabel}
    >
      {label}
    </PaperButton>
  );
}

function MobileMenuItem({ label, icon, onPress, disabled, tone }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled?: boolean; tone?: 'danger' }) {
  const color = disabled ? '#94A3B8' : tone === 'danger' ? '#DC2626' : '#0F172A';
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.mobileMenuItem, disabled && styles.disabled]}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.mobileMenuItemText, { color }]}>{label}</Text>
    </Pressable>
  );
}

function SegmentButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.segment, active && styles.segmentActive]}><Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text></Pressable>;
}

function Pill({ text, tone }: { text: string; tone?: 'success' | 'danger' }) {
  return <Chip compact style={[styles.pillPaper, tone === 'success' && styles.pillSuccess, tone === 'danger' && styles.pillDanger]} textStyle={[styles.pillText, tone === 'success' && styles.pillSuccessText, tone === 'danger' && styles.pillDangerText]}>{text}</Chip>;
}

function InfoText({ text }: { text: string }) {
  return <PaperText style={styles.infoText}>{text}</PaperText>;
}

function SheetModal({ visible, title, onClose, children, fullScreen }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode; fullScreen?: boolean }) {
  return (
    <Portal>
      <PaperModal visible={visible} onDismiss={onClose} contentContainerStyle={[styles.modalBackdropPaper, fullScreen ? styles.modalBackdropPaperFull : null]}>
        <Surface style={[styles.modalSheetPaper, fullScreen && styles.modalSheetPaperFull]} elevation={2}>
          <View style={styles.sheetHeader}>
            <PaperText style={styles.sheetTitle}>{title}</PaperText>
            <PaperIconButton icon="close" size={22} onPress={onClose} style={styles.sheetCloseButton} />
          </View>
          <Divider />
          <View style={styles.sheetBody}>
            {children}
          </View>
        </Surface>
      </PaperModal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 12, gap: 10, paddingBottom: 110 },
  contentTablet: { maxWidth: 760, alignSelf: 'center', width: '100%' },
  panel: { borderRadius: 18, borderWidth: 1, borderColor: '#DBEAFE', padding: 12, gap: 10, shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },
  cardStack: { gap: 10 },
  title: { fontSize: 19, fontWeight: '900', color: '#1F2937' },
  subtitle: { color: '#64748B', fontSize: 12, fontWeight: '700' },
  input: { minHeight: 42, borderRadius: 9, borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 12, color: '#0F172A', fontWeight: '800', backgroundColor: '#FFFFFF' },
  comment: { minHeight: 86, textAlignVertical: 'top', paddingTop: 10 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  inlineRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mobileMenuWrap: { position: 'relative' },
  mobileMenuPaper: { borderRadius: 16, backgroundColor: '#FFFFFF' },
  menuAnchorButton: { margin: 0, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DBEAFE' },
  mobileMenuItem: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  mobileMenuItemText: { fontSize: 14, fontWeight: '800' },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  iconButton: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, borderColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  iconButtonDanger: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, borderColor: '#FECACA', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  action: { minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: '#BFDBFE', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FFFFFF' },
  actionPaper: { borderRadius: 12 },
  actionPaperLabel: { fontSize: 13, fontWeight: '900' },
  actionPrimary: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  actionDanger: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  actionSuccess: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  actionText: { color: '#2563EB', fontWeight: '900', fontSize: 13 },
  actionTextOnDark: { color: '#FFFFFF' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  segmentRow: { flex: 1, flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: '#EEF2FF', gap: 4 },
  segment: { flex: 1, minHeight: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: '#FFFFFF' },
  segmentText: { color: '#64748B', fontWeight: '900' },
  segmentTextActive: { color: '#2563EB' },
  itemCountBadge: { minHeight: 34, borderRadius: 12, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  itemCountBadgeText: { color: '#2563EB', fontWeight: '900', fontSize: 13 },
  orderCard: { borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', padding: 12, gap: 7 },
  orderCardSelected: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  orderTitle: { fontSize: 16, fontWeight: '900', color: '#111827' },
  orderMeta: { fontSize: 12, color: '#64748B', fontWeight: '700' },
  pillPaper: { backgroundColor: '#F1F5F9' },
  pill: { borderRadius: 999, backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 4 },
  pillText: { fontSize: 11, color: '#334155', fontWeight: '800' },
  pillSuccess: { backgroundColor: '#DCFCE7' },
  pillDanger: { backgroundColor: '#FEE2E2' },
  pillSuccessText: { color: '#166534' },
  pillDangerText: { color: '#B91C1C' },
  selection: { borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', overflow: 'hidden' },
  selectionCompact: { paddingVertical: 7 },
  selectionRipple: { paddingHorizontal: 12, paddingVertical: 10 },
  selectionLabel: { fontSize: 10, color: '#64748B', fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.4 },
  selectionValue: { fontSize: 14, color: '#0F172A', fontWeight: '900' },
  selectionValueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailsButton: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  detailsButtonPaper: { margin: 0 },
  lineList: { borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  lineHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5 },
  lineHeaderText: { fontSize: 9, color: '#64748B', fontWeight: '900', textTransform: 'uppercase' },
  lineHeaderNo: { width: 36 },
  lineHeaderTitle: { flex: 1 },
  lineHeaderQty: { width: 122, textAlign: 'center' },
  lineHeaderPack: { width: 82, textAlign: 'center' },
  lineHeaderPriceType: { flex: 1, textAlign: 'left' },
  lineHeaderPrice: { width: 84, textAlign: 'center' },
  lineRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  lineTopCompact: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  lineDeleteCompact: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', marginLeft: -2 },
  lineNoCompact: { width: 16, color: '#64748B', fontWeight: '900', fontSize: 11, paddingTop: 1 },
  lineTitleCompact: { color: '#111827', fontWeight: '900', fontSize: 12, lineHeight: 14 },
  lineMetaCompact: { marginTop: 1, fontSize: 10, color: '#64748B', fontWeight: '700' },
  lineTotalCompact: { color: '#111827', fontWeight: '900', fontSize: 12, paddingLeft: 4 },
  lineControlsRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 42, paddingTop: 6 },
  stepperCompact: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepButtonCompact: { borderRadius: 7, borderWidth: 1, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  stepTextCompact: { fontSize: 15, color: '#334155', fontWeight: '900' },
  smallInputCompact: { flex: 1, borderRadius: 7, borderWidth: 1, borderColor: '#CBD5E1', textAlign: 'center', fontWeight: '900', fontSize: 12, color: '#0F172A', backgroundColor: '#FFFFFF', paddingHorizontal: 4, paddingVertical: 0 },
  compactField: { borderRadius: 7, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  compactStaticField: { backgroundColor: '#F8FAFC', alignSelf: 'flex-start' },
  compactPackField: { justifyContent: 'space-between' },
  compactPriceTypeField: { flex: 1, justifyContent: 'space-between' },
  compactFieldText: { flex: 1, fontSize: 11, color: '#0F172A', fontWeight: '800' },
  compactResetButton: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  smallPriceInputCompact: { borderRadius: 7, borderWidth: 1, borderColor: '#CBD5E1', fontWeight: '800', fontSize: 11.5, color: '#0F172A', backgroundColor: '#FFFFFF', paddingHorizontal: 8, paddingVertical: 0, textAlign: 'left' },
  lineErrorCompact: { paddingLeft: 42, paddingTop: 4, fontSize: 10, lineHeight: 12, color: '#B91C1C', fontWeight: '700' },
  lineCard: { borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', padding: 10, gap: 10 },
  lineTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  lineDelete: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  lineNo: { width: 28, color: '#64748B', fontWeight: '900', paddingTop: 4 },
  lineTitle: { color: '#111827', fontWeight: '900', fontSize: 14 },
  lineTotal: { color: '#111827', fontWeight: '900', fontSize: 15 },
  lineGrid: { gap: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepButton: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  stepText: { fontSize: 18, color: '#2563EB', fontWeight: '900' },
  smallInput: { flex: 1, height: 36, borderRadius: 8, borderWidth: 1, borderColor: '#CBD5E1', textAlign: 'center', fontWeight: '900', color: '#0F172A', backgroundColor: '#FFFFFF' },
  priceInput: { height: 42 },
  invalidInput: { borderColor: '#DC2626', backgroundColor: '#FEF2F2' },
  total: { fontSize: 18, color: '#111827', fontWeight: '900' },
  itemsSearchInput: { paddingVertical: 0 },
  itemsSearchPaper: {},
  searchbar: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', elevation: 0 },
  searchbarInput: { minHeight: 0, fontSize: 14, color: '#0F172A' },
  pickerToolbar: { gap: 10, paddingBottom: 8 },
  pickerSearchInput: {},
  pickerScroll: { flex: 1, minHeight: 0 },
  pickerListContent: { paddingBottom: 20, flexGrow: 1 },
  pickerRowSurface: { backgroundColor: '#FFFFFF' },
  pickerRowTitle: { color: '#111827', fontSize: 15, fontWeight: '800' },
  pickerRowMeta: { color: '#64748B', fontSize: 12, fontWeight: '600' },
  pickerRowDisabled: { color: '#B91C1C' },
  pickerRowChevron: { alignSelf: 'center', marginVertical: 10 },
  pickerFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  pickerFooterText: { color: '#64748B', fontSize: 12, fontWeight: '700' },
  productCard: { borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', padding: 12, gap: 7 },
  disabled: { opacity: 0.55 },
  infoText: { color: '#64748B', fontWeight: '700', textAlign: 'center', padding: 16 },
  referenceSection: { borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', padding: 12, gap: 8 },
  referenceRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  referenceLabel: { width: 120, color: '#64748B', fontWeight: '900', fontSize: 12 },
  referenceValue: { flex: 1, color: '#0F172A', fontWeight: '700', fontSize: 12 },
  error: { color: '#B91C1C', backgroundColor: '#FEE2E2', borderRadius: 10, padding: 10, fontWeight: '800' },
  warning: { color: '#92400E', backgroundColor: '#FEF3C7', borderRadius: 10, padding: 10, fontWeight: '800' },
  modalBackdropPaper: { flex: 1, margin: 0, justifyContent: 'flex-end' },
  modalBackdropPaperFull: { justifyContent: 'flex-end' },
  modalSheetPaper: { maxHeight: '86%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  modalSheetPaperFull: { height: '100%', borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  sheetHeader: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 8 },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: '#111827' },
  sheetCloseButton: { margin: 0 },
  sheetBody: { flex: 1, minHeight: 0, padding: 14, gap: 12 },
});
