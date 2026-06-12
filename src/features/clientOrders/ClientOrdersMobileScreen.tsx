import TabBarSpacer from '@/components/Navigation/TabBarSpacer';
import {
  FLOATING_TAB_BAR_BOTTOM_OFFSET,
  FLOATING_TAB_BAR_HEIGHT,
} from '@/components/Navigation/FloatingTabBar';
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
} from './lib/clientOrdersShared';
import {
  formatDateOnly,
  formatStockLabel,
  getPackageDisplayText,
  getPickerItemMeta,
  getPickerItemTitle,
  getSelectedPickerGuid,
  packageLabel,
  type ClientOrdersPickerKind,
  unitLabel,
} from './lib/clientOrdersUi';
import { hasMorePage } from './lib/clientOrdersPaging';
import { useClientOrdersWorkspace } from './hooks/useClientOrdersWorkspace';
import { getClientOrderReferenceDetails } from '@/utils/clientOrdersService';
import type { ClientOrder, ClientOrderCounterpartyOption, ClientOrderOrganization, ClientOrderPriceTypeOption, ClientOrderProduct, ClientOrderReferenceDetails, ClientOrderReferenceKind, ClientOrderWarehouseOption } from '@/utils/clientOrdersService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Animated, Image, PanResponder, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  ActivityIndicator,
  Button as PaperButton,
  Card,
  IconButton as PaperIconButton,
  List,
  Menu,
  Searchbar,
  Surface,
  Text,
  TextInput as PaperTextInput,
} from 'react-native-paper';
import {
  ActionButton,
  ConfirmDialog,
  InfoText,
  Pill,
  PickerBottomSheet,
  SheetModal,
} from './screen/mobile/ClientOrdersMobileUi';

type ScreenMode = 'orders' | 'editor';
type EditorSection = 'header' | 'items';
type PickerKind = ClientOrdersPickerKind;
type ClientOrdersMobileScreenProps = {
  registerBackOverlayHandler?: (handler: (() => boolean) | null) => void;
};
type ConfirmDialogState = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  alternateLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onAlternate?: () => void | Promise<void>;
} | null;

const PAGE_SIZE = 25;
const ITEMS_SEARCH_PAGE_SIZE = 10;
const IN_STOCK_KEY = 'clientOrders.productPicker.inStockOnly';

function pickerTitle(kind: PickerKind | null) {
  return ({ filterCounterparty: 'Контрагент для фильтра', organization: 'Организация', counterparty: 'Контрагент', agreement: 'Соглашение', contract: 'Договор', warehouse: 'Склад', deliveryAddress: 'Адрес доставки', priceType: 'Вид цены', product: 'Подбор товаров' } as Record<PickerKind, string>)[kind || 'product'];
}
function pickerIcon(kind: PickerKind | null): React.ComponentProps<typeof MaterialCommunityIcons>['name'] {
  return ({
    filterCounterparty: 'account-outline',
    organization: 'office-building-outline',
    counterparty: 'account-outline',
    agreement: 'file-document-outline',
    contract: 'file-sign',
    warehouse: 'warehouse',
    deliveryAddress: 'map-marker-outline',
    priceType: 'tag-outline',
    product: 'cube-outline',
  } as Record<PickerKind, React.ComponentProps<typeof MaterialCommunityIcons>['name']>)[kind || 'product'];
}
function displayedPriceValue(item: any) {
  if ((item?.manualPrice || '').trim()) return item.manualPrice;
  if (item?.basePrice === null || item?.basePrice === undefined || item.basePrice <= 0) return '';
  return String(item.basePrice);
}
function productPickerMeta(item: any) {
  return {
    code: item?.code || 'Без кода',
    receiptPrice: item?.receiptPrice === null || item?.receiptPrice === undefined
      ? '—'
      : formatMoney(item.receiptPrice, item.currency),
    stock: formatStockLabel(item?.stock, item?.baseUnit) || '—',
  };
}
function getDraftItemImageUri(item: any) {
  return item?.imageUrl || item?.pictureUrl || item?.photoUrl || item?.thumbnailUrl || null;
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


export default function ClientOrdersMobileScreen({ registerBackOverlayHandler }: ClientOrdersMobileScreenProps = {}) {
  const [discardConfirm, setDiscardConfirm] = React.useState<{
    open: boolean;
    mode: 'create' | 'edit';
    blockingMessage: string | null;
  }>({ open: false, mode: 'edit', blockingMessage: null });
  const discardConfirmResolveRef = React.useRef<((value: 'save' | 'discard' | 'cancel') => void) | null>(null);
  const requestDiscardConfirm = React.useCallback((context: { draftMode: boolean; hasPersistedDraft: boolean; blockingMessage: string | null }) => (
    new Promise<'save' | 'discard' | 'cancel'>((resolve) => {
      discardConfirmResolveRef.current = resolve;
      setDiscardConfirm({
        open: true,
        mode: context.draftMode && !context.hasPersistedDraft ? 'create' : 'edit',
        blockingMessage: context.blockingMessage,
      });
    })
  ), []);
  const closeDiscardConfirm = React.useCallback((result: 'save' | 'discard' | 'cancel') => {
    const resolve = discardConfirmResolveRef.current;
    discardConfirmResolveRef.current = null;
    setDiscardConfirm((prev) => ({ ...prev, open: false }));
    resolve?.(result);
  }, []);
  const workspace = useClientOrdersWorkspace({ confirmDiscard: requestDiscardConfirm });
  const topInset = useHeaderContentTopInset({ compact: true, hasSubtitle: false, extraGap: 2 });
  const background = useThemeColor({}, 'background');
  const card = useThemeColor({}, 'cardBackground');
  const { width, height } = useWindowDimensions();
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
  const [pickerScrollOffset, setPickerScrollOffset] = React.useState(0);
  const [pickerLoading, setPickerLoading] = React.useState(false);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [inspectorOpen, setInspectorOpen] = React.useState(false);
  const [filterCounterparty, setFilterCounterparty] = React.useState<ClientOrderCounterpartyOption | null>(null);
  const [filterWarehouse, setFilterWarehouse] = React.useState<ClientOrderWarehouseOption | null>(null);
  const [filterPriceType, setFilterPriceType] = React.useState<ClientOrderPriceTypeOption | null>(null);
  const [itemsSearch, setItemsSearch] = React.useState('');
  const [itemsSearchFocused, setItemsSearchFocused] = React.useState(false);
  const [itemsSearchResults, setItemsSearchResults] = React.useState<ClientOrderProduct[]>([]);
  const [itemsSearchLoading, setItemsSearchLoading] = React.useState(false);
  const [itemsSearchLoadingMore, setItemsSearchLoadingMore] = React.useState(false);
  const [itemsSearchHasMore, setItemsSearchHasMore] = React.useState(false);
  const [itemsSearchOffset, setItemsSearchOffset] = React.useState(0);
  const [itemsSearchError, setItemsSearchError] = React.useState<string | null>(null);
  const [inStockOnly, setInStockOnly] = React.useState(false);
  const [linePriceTarget, setLinePriceTarget] = React.useState<string | null>(null);
  const [actionsMenuOpen, setActionsMenuOpen] = React.useState(false);
  const [pendingPriceTypeAction, setPendingPriceTypeAction] = React.useState<{ priceType: any | null } | null>(null);
  const [confirmDialog, setConfirmDialog] = React.useState<ConfirmDialogState>(null);
  const [editingItemKey, setEditingItemKey] = React.useState<string | null>(null);
  const [referenceOpen, setReferenceOpen] = React.useState(false);
  const [referenceLoading, setReferenceLoading] = React.useState(false);
  const [referenceError, setReferenceError] = React.useState<string | null>(null);
  const [referenceDetails, setReferenceDetails] = React.useState<ClientOrderReferenceDetails | null>(null);
  const [referenceScrollOffset, setReferenceScrollOffset] = React.useState(0);
  const pickerRequestIdRef = React.useRef(0);
  const pickerLoadSignatureRef = React.useRef('');
  const pickerAppendLoadingRef = React.useRef(false);
  const itemsSearchRequestIdRef = React.useRef(0);
  const itemsSearchLoadingMoreRef = React.useRef(false);
  const itemsSearchBlurTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
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
  React.useEffect(() => () => {
    if (itemsSearchBlurTimerRef.current) clearTimeout(itemsSearchBlurTimerRef.current);
  }, []);

  const openPicker = React.useCallback((kind: PickerKind, lineKey?: string) => {
    setPickerKind(kind);
    setLinePriceTarget(kind === 'priceType' && lineKey ? lineKey : null);
    setPickerSearch('');
    setPickerItems([]);
    setPickerOffset(0);
    setPickerHasMore(false);
    setPickerScrollOffset(0);
    pickerAppendLoadingRef.current = false;
    pickerLoadSignatureRef.current = '';
  }, []);

  const loadPickerPage = React.useCallback(async (kind: PickerKind, search: string, offset = 0, append = false) => {
    const signature = `${kind}|${search}|${offset}|${append ? 'append' : 'reset'}`;
    if ((append && pickerAppendLoadingRef.current) || pickerLoadSignatureRef.current === signature) return;
    if (append) pickerAppendLoadingRef.current = true;
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
      setPickerItems((prev) => {
        if (!append) return items;
        const known = new Set(prev.map((item) => item?.guid || item?.id || `${item?.name || ''}|${item?.fullAddress || ''}`));
        return [...prev, ...items.filter((item: any) => !known.has(item?.guid || item?.id || `${item?.name || ''}|${item?.fullAddress || ''}`))];
      });
      setPickerOffset(offset + items.length);
      setPickerHasMore(hasMorePage(items.length, PAGE_SIZE, offset, result?.meta?.total));
    } catch {
      if (pickerRequestIdRef.current === requestId) {
        setPickerHasMore(false);
        pickerLoadSignatureRef.current = '';
      }
    } finally {
      if (append) pickerAppendLoadingRef.current = false;
      if (pickerRequestIdRef.current === requestId) setPickerLoading(false);
    }
  }, [
    inStockOnly,
    workspace.draft.agreementGuid,
    workspace.draft.counterpartyGuid,
    workspace.draft.priceTypeGuid,
    workspace.draft.warehouseGuid,
    workspace.searchAgreements,
    workspace.searchContracts,
    workspace.searchCounterparties,
    workspace.searchDeliveryAddresses,
    workspace.searchPriceTypes,
    workspace.searchProducts,
    workspace.searchWarehouses,
    workspace.settings?.organizations,
  ]);

  React.useEffect(() => {
    if (!pickerKind) return;
    const timeout = setTimeout(() => void loadPickerPage(pickerKind, pickerSearch, 0, false), pickerSearch ? 250 : 0);
    return () => clearTimeout(timeout);
  }, [loadPickerPage, pickerKind, pickerSearch]);

  const closePicker = React.useCallback(() => {
    pickerRequestIdRef.current += 1;
    pickerAppendLoadingRef.current = false;
    pickerLoadSignatureRef.current = '';
    setPickerKind(null);
    setLinePriceTarget(null);
  }, []);
  const closeTopOverlay = React.useCallback(() => {
    if (editingItemKey) {
      setEditingItemKey(null);
      return true;
    }
    if (referenceOpen) {
      setReferenceOpen(false);
      return true;
    }
    if (pickerKind) {
      closePicker();
      return true;
    }
    if (filtersOpen) {
      setFiltersOpen(false);
      return true;
    }
    return false;
  }, [closePicker, editingItemKey, filtersOpen, pickerKind, referenceOpen]);

  React.useEffect(() => {
    if (!registerBackOverlayHandler) return undefined;
    registerBackOverlayHandler(closeTopOverlay);
    return () => registerBackOverlayHandler(null);
  }, [closeTopOverlay, registerBackOverlayHandler]);

  const handlePickerScroll = React.useCallback((event: any) => {
    setPickerScrollOffset(event.nativeEvent.contentOffset.y <= 1 ? 0 : 2);
    if (!pickerKind || pickerLoading || !pickerHasMore) return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (contentSize.height <= layoutMeasurement.height + 24) return;
    const remaining = contentSize.height - contentOffset.y - layoutMeasurement.height;
    if (remaining > 320) return;
    void loadPickerPage(pickerKind, pickerSearch, pickerOffset, true);
  }, [loadPickerPage, pickerHasMore, pickerKind, pickerLoading, pickerOffset, pickerSearch]);

  const openReferenceDetails = React.useCallback(async (kind: ClientOrderReferenceKind, guid?: string | null) => {
    if (!guid) return;
    setReferenceScrollOffset(0);
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
    const selectedKind = pickerKind;
    const selectedLinePriceTarget = linePriceTarget;

    if (selectedKind !== 'product') closePicker();

    if (selectedKind === 'filterCounterparty') {
      setFilterCounterparty(item);
      workspace.setFilters((prev) => ({ ...prev, counterpartyGuid: item.guid }));
    } else if (selectedKind === 'organization') await workspace.setOrganization(item);
    else if (selectedKind === 'counterparty') await workspace.setCounterparty(item);
    else if (selectedKind === 'agreement') workspace.setAgreement(item);
    else if (selectedKind === 'contract') workspace.setContract(item);
    else if (selectedKind === 'warehouse') workspace.setWarehouse(item);
    else if (selectedKind === 'deliveryAddress') workspace.setDeliveryAddress(item);
    else if (selectedKind === 'priceType') {
      if (selectedLinePriceTarget) {
        workspace.setItemPriceType(selectedLinePriceTarget, item);
      } else if (workspace.draft.items.length) {
        setPendingPriceTypeAction({ priceType: item });
      } else {
        workspace.setHeaderPriceType(item);
      }
    } else if (selectedKind === 'product') workspace.addProduct(item as ClientOrderProduct);
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
      setConfirmDialog({
        title: 'Удалить черновик?',
        message: 'Черновик будет удален без возможности восстановления.',
        confirmLabel: 'Удалить',
        destructive: true,
        onConfirm: async () => {
          await workspace.deleteDraft();
          setMode('orders');
        },
      });
      return;
    }
    setConfirmDialog({
      title: 'Отменить заказ?',
      message: 'Заказ будет отменен.',
      confirmLabel: 'Отменить',
      destructive: true,
      onConfirm: () => workspace.cancelOrder(),
    });
  }, [workspace]);

  const submitFromMenu = React.useCallback(() => {
    setActionsMenuOpen(false);
    setConfirmDialog({
      title: 'Отправить в 1С?',
      message: 'Документ будет поставлен в очередь обмена.',
      confirmLabel: 'Отправить',
      onConfirm: () => workspace.submitOrder(),
    });
  }, [workspace]);

  const confirmClearItems = React.useCallback(() => {
    setConfirmDialog({
      title: 'Удалить все товары?',
      message: 'Все строки документа будут удалены без возможности восстановления.',
      confirmLabel: 'Удалить',
      destructive: true,
      onConfirm: workspace.clearItems,
    });
  }, [workspace.clearItems]);

  const title = workspace.draftMode ? 'Новый заказ клиента' : workspace.selectedOrder?.number1c ? `Заказ ${workspace.selectedOrder.number1c}` : `Черновик ${workspace.selectedOrder?.guid.slice(0, 8) || ''}`;
  const filteredItems = workspace.draft.items;
  React.useEffect(() => {
    const search = itemsSearch.trim();
    const requestId = ++itemsSearchRequestIdRef.current;
    if (!search) {
      setItemsSearchResults([]);
      setItemsSearchLoading(false);
      setItemsSearchLoadingMore(false);
      itemsSearchLoadingMoreRef.current = false;
      setItemsSearchHasMore(false);
      setItemsSearchOffset(0);
      setItemsSearchError(null);
      return undefined;
    }
    setItemsSearchError(null);
    const loadingTimer = setTimeout(() => {
      if (itemsSearchRequestIdRef.current === requestId) setItemsSearchLoading(true);
    }, 120);
    const requestTimer = setTimeout(() => {
      void workspace.searchProducts({
        search,
        counterpartyGuid: workspace.draft.counterpartyGuid,
        agreementGuid: workspace.draft.agreementGuid || undefined,
        warehouseGuid: workspace.draft.warehouseGuid || undefined,
        priceTypeGuid: workspace.draft.priceTypeGuid || undefined,
        inStockOnly,
        limit: ITEMS_SEARCH_PAGE_SIZE,
        offset: 0,
      }).then((result) => {
        if (itemsSearchRequestIdRef.current !== requestId) return;
        const items = Array.isArray(result.items) ? result.items : [];
        const total = result?.meta?.total;
        setItemsSearchResults(items);
        setItemsSearchOffset(items.length);
        setItemsSearchHasMore(hasMorePage(items.length, ITEMS_SEARCH_PAGE_SIZE, 0, total));
      }).catch((error) => {
        if (itemsSearchRequestIdRef.current !== requestId) return;
        setItemsSearchResults([]);
        setItemsSearchOffset(0);
        setItemsSearchHasMore(false);
        setItemsSearchError(error instanceof Error ? error.message : 'Не удалось выполнить поиск.');
      }).finally(() => {
        if (itemsSearchRequestIdRef.current === requestId) setItemsSearchLoading(false);
      });
    }, 260);
    return () => {
      clearTimeout(loadingTimer);
      clearTimeout(requestTimer);
    };
  }, [
    inStockOnly,
    itemsSearch,
    workspace.draft.agreementGuid,
    workspace.draft.counterpartyGuid,
    workspace.draft.priceTypeGuid,
    workspace.draft.warehouseGuid,
    workspace.searchProducts,
  ]);
  const loadMoreItemsSearchResults = React.useCallback(() => {
    const search = itemsSearch.trim();
    if (!search || itemsSearchLoading || itemsSearchLoadingMore || itemsSearchLoadingMoreRef.current || !itemsSearchHasMore) return;
    const requestId = itemsSearchRequestIdRef.current;
    const offset = itemsSearchOffset;
    itemsSearchLoadingMoreRef.current = true;
    setItemsSearchLoadingMore(true);
    void workspace.searchProducts({
      search,
      counterpartyGuid: workspace.draft.counterpartyGuid,
      agreementGuid: workspace.draft.agreementGuid || undefined,
      warehouseGuid: workspace.draft.warehouseGuid || undefined,
      priceTypeGuid: workspace.draft.priceTypeGuid || undefined,
      inStockOnly,
      limit: ITEMS_SEARCH_PAGE_SIZE,
      offset,
    }).then((result) => {
      if (itemsSearchRequestIdRef.current !== requestId) return;
      const items = Array.isArray(result.items) ? result.items : [];
      const total = result?.meta?.total;
      if (!items.length) {
        setItemsSearchHasMore(false);
        return;
      }
      setItemsSearchResults((prev) => {
        const known = new Set(prev.map((item) => item.guid));
        const merged = [...prev, ...items.filter((item) => !known.has(item.guid))];
        setItemsSearchOffset(offset + items.length);
        setItemsSearchHasMore(hasMorePage(items.length, ITEMS_SEARCH_PAGE_SIZE, offset, total));
        return merged;
      });
    }).catch((error) => {
      if (itemsSearchRequestIdRef.current !== requestId) return;
      setItemsSearchError(error instanceof Error ? error.message : 'Не удалось загрузить ещё товары.');
    }).finally(() => {
      if (itemsSearchRequestIdRef.current === requestId) setItemsSearchLoadingMore(false);
      itemsSearchLoadingMoreRef.current = false;
    });
  }, [
    inStockOnly,
    itemsSearch,
    itemsSearchHasMore,
    itemsSearchLoading,
    itemsSearchLoadingMore,
    itemsSearchOffset,
    workspace.draft.agreementGuid,
    workspace.draft.counterpartyGuid,
    workspace.draft.priceTypeGuid,
    workspace.draft.warehouseGuid,
    workspace.searchProducts,
  ]);
  const addProductFromItemsSearch = React.useCallback((product: ClientOrderProduct) => {
    workspace.addProduct(product);
    setItemsSearch('');
    setItemsSearchResults([]);
    setItemsSearchError(null);
    setItemsSearchLoading(false);
    setItemsSearchLoadingMore(false);
    itemsSearchLoadingMoreRef.current = false;
    setItemsSearchHasMore(false);
    setItemsSearchOffset(0);
  }, [workspace]);
  const editingItem = React.useMemo(() => workspace.draft.items.find((item) => item.key === editingItemKey) || null, [editingItemKey, workspace.draft.items]);
  const editingItemIndex = React.useMemo(() => editingItem ? workspace.draft.items.findIndex((item) => item.key === editingItem.key) : -1, [editingItem, workspace.draft.items]);
  React.useEffect(() => {
    if (editingItemKey && !editingItem) setEditingItemKey(null);
  }, [editingItem, editingItemKey]);
  const pickerContent = (
    <>
      <View style={styles.pickerToolbar}>
        <CompactSearchbar style={styles.pickerSearchFlat} inputStyle={styles.pickerSearchInputFlat} value={pickerSearch} onChangeText={setPickerSearch} placeholder="Поиск" />
        {pickerKind === 'product' ? <ActionButton styles={styles} label={inStockOnly ? 'Только с остатком' : 'Показывать все'} kind={inStockOnly ? 'success' : 'secondary'} onPress={() => setInStockOnly((prev) => !prev)} /> : null}
      </View>
      <ScrollView style={styles.pickerScroll} onScroll={handlePickerScroll} scrollEventThrottle={16} nestedScrollEnabled contentContainerStyle={styles.pickerListContent} keyboardShouldPersistTaps="handled">
        {pickerNeedsCounterparty(pickerKind) && !workspace.draft.counterpartyGuid ? <InfoText styles={styles} text="Сначала выберите контрагента." /> : null}
        {visiblePickerItems.map((item: any) => {
          const disabled = pickerKind === 'product' && workspace.draft.items.some((line) => line.productGuid === item.guid);
          const pickerMeta = pickerKind === 'product' ? productPickerMeta(item) : null;
          const isSelected = !!selectedPickerGuid && selectedPickerGuid === item.guid;
          const description = pickerKind === 'product'
            ? [pickerMeta?.code, pickerMeta?.receiptPrice ? `Цена: ${pickerMeta.receiptPrice}` : '', pickerMeta?.stock ? `Остаток: ${pickerMeta.stock}` : ''].filter(Boolean).join(' • ')
            : getPickerItemMeta(pickerKind, item) || '';
          return (
            <Pressable
              key={`${pickerKind}-${item.guid || item.name || item.fullAddress}`}
              disabled={disabled}
              onPress={() => void selectPickerItem(item)}
              style={({ pressed }) => [styles.pickerFlatRow, disabled && styles.disabled, pressed && styles.flatPressed]}
            >
              <View style={styles.pickerFlatTextWrap}>
                <Text style={styles.pickerFlatTitle} numberOfLines={2}>{pickerKind === 'product' ? (item.name || getPickerItemTitle(item)) : getPickerItemTitle(item)}</Text>
                {description ? <Text style={[styles.pickerFlatMeta, disabled && styles.pickerRowDisabled]} numberOfLines={2}>{description}</Text> : null}
              </View>
              {isSelected
                ? <MaterialCommunityIcons name="check-circle" size={21} color="#16A34A" />
                : <MaterialCommunityIcons name="chevron-right" size={22} color={disabled ? '#CBD5E1' : '#94A3B8'} />}
            </Pressable>
          );
        })}
        {!pickerLoading && !visiblePickerItems.length && !(pickerNeedsCounterparty(pickerKind) && !workspace.draft.counterpartyGuid) ? <InfoText styles={styles} text="Ничего не найдено." /> : null}
        {pickerLoading ? <View style={styles.pickerFooter}><ActivityIndicator size="small" color="#2563EB" /><Text style={styles.pickerFooterText}>Загружаю...</Text></View> : null}
      </ScrollView>
    </>
  );
  const discardConfirmState = React.useMemo<ConfirmDialogState>(() => {
    if (!discardConfirm.open) return null;
    return {
      title: 'Несохраненные изменения',
      message: 'Сохранить изменения перед выходом из документа?',
      cancelLabel: 'Остаться',
      alternateLabel: 'Не сохранять',
      confirmLabel: 'Сохранить',
      onAlternate: () => closeDiscardConfirm('discard'),
      onConfirm: () => closeDiscardConfirm('save'),
    };
  }, [closeDiscardConfirm, discardConfirm.blockingMessage, discardConfirm.mode, discardConfirm.open]);

  const pageTopPadding = Math.max(0, topInset - 18);

  return (
    <View style={[styles.screen, { backgroundColor: background, paddingTop: pageTopPadding }]}>
      {mode === 'orders' ? (
        <ScrollView contentContainerStyle={[styles.ordersContent, width >= 720 && styles.contentTablet, { paddingHorizontal: ui.pageX, paddingTop: 2, maxWidth: layoutTier === 'tablet' ? 760 : undefined }]}>
          <OrdersToolbar
            styles={styles}
            count={workspace.statusCounts.all}
            loading={workspace.loadingOrders}
            search={workspace.filters.search}
            onSearch={(value) => workspace.setFilters((prev) => ({ ...prev, search: value }))}
            onOpenFilters={() => setFiltersOpen(true)}
            onCreate={() => void createDocument()}
          />
          {workspace.orders.map((order) => <OrderCard key={order.guid} order={order} selected={workspace.selectedGuid === order.guid} onPress={() => void selectOrder(order)} />)}
          {!workspace.loadingOrders && !workspace.orders.length ? <InfoText styles={styles} text="Документов пока нет." /> : null}
          {workspace.hasMoreOrders ? (
            <PaperButton
              mode="outlined"
              onPress={() => void workspace.loadMoreOrders()}
              disabled={workspace.loadingMoreOrders}
              loading={workspace.loadingMoreOrders}
              style={styles.loadMoreButton}
              labelStyle={styles.ordersSecondaryButtonLabel}
              contentStyle={styles.ordersButtonContent}
            >
              Показать ещё
            </PaperButton>
          ) : null}
          <TabBarSpacer />
        </ScrollView>
      ) : (
        <ScrollView
          stickyHeaderIndices={section === 'items' ? [0] : undefined}
          contentContainerStyle={[styles.content, section === 'items' && styles.editorItemsContent, width >= 720 && styles.contentTablet, { paddingHorizontal: ui.pageX, paddingTop: 0, gap: 6, maxWidth: layoutTier === 'tablet' ? 760 : undefined }]}
        >
          <View style={styles.documentStickyHeader}>
          <View style={styles.documentHeaderFlat}>
            <View style={styles.documentHeaderTop}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="К списку заказов"
                onPress={() => {
                  void workspace.confirmDiscardIfNeeded().then((canLeave: boolean) => {
                    if (canLeave) setMode('orders');
                  });
                }}
                style={({ pressed }) => [styles.documentHeaderIconButton, pressed && styles.flatPressed]}
              >
                <MaterialCommunityIcons name="arrow-left" size={20} color="#0F172A" />
              </Pressable>
              <View style={styles.documentHeaderTitleWrap}>
                <Text style={styles.documentTitle} numberOfLines={1}>{title}</Text>
                <Text style={styles.documentSubtitle} numberOfLines={1}>{workspace.autosaveLabel}</Text>
              </View>
              <Menu
                visible={actionsMenuOpen}
                onDismiss={() => setActionsMenuOpen(false)}
                anchor={(
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Действия с заказом"
                    onPress={() => setActionsMenuOpen(true)}
                    style={({ pressed }) => [styles.documentHeaderIconButton, pressed && styles.flatPressed]}
                  >
                    <MaterialCommunityIcons name="dots-vertical" size={20} color="#0F172A" />
                  </Pressable>
                )}
                contentStyle={styles.mobileMenuPaper}
              >
                <Menu.Item leadingIcon="content-save-outline" title={workspace.saving ? 'Сохраняю...' : 'Сохранить'} onPress={() => { setActionsMenuOpen(false); void workspace.saveDraft({ reason: 'manual' }); }} disabled={workspace.readOnly || workspace.saving || !workspace.validation.canSave} />
                <Menu.Item leadingIcon="cloud-upload-outline" title={workspace.submitting ? 'Отправляю...' : 'Отправить в 1С'} onPress={submitFromMenu} disabled={workspace.readOnly || workspace.submitting || !workspace.validation.canSubmit} />
                <Menu.Item leadingIcon="information-outline" title="Инспектор" onPress={() => { setActionsMenuOpen(false); setInspectorOpen(true); }} />
                <Menu.Item leadingIcon={workspace.draftMode || workspace.selectedOrder?.status === 'DRAFT' ? 'trash-can-outline' : 'close-circle-outline'} title={workspace.draftMode || workspace.selectedOrder?.status === 'DRAFT' ? 'Удалить черновик' : 'Отменить заказ'} onPress={() => { setActionsMenuOpen(false); removeOrCancel(); }} />
              </Menu>
            </View>
            {workspace.error ? <Text style={styles.error}>{workspace.error}</Text> : null}
            {workspace.validation.blockingMessage ? <Text style={styles.warning}>{workspace.validation.blockingMessage}</Text> : null}
            <View style={styles.documentTabsRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setSection('header')}
                style={({ pressed }) => [styles.documentTab, section === 'header' && styles.documentTabActive, pressed && styles.flatPressed]}
              >
                <Text style={[styles.documentTabText, section === 'header' && styles.documentTabTextActive]}>Шапка</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setSection('items')}
                style={({ pressed }) => [styles.documentTab, section === 'items' && styles.documentTabActive, pressed && styles.flatPressed]}
              >
                <Text style={[styles.documentTabText, section === 'items' && styles.documentTabTextActive]}>Товары</Text>
              </Pressable>
              <View style={styles.documentItemsCount}>
                <MaterialCommunityIcons name="cube-outline" size={16} color="#2563EB" />
                <Text style={styles.documentItemsCountText}>{workspace.draft.items.length}</Text>
              </View>
            </View>
          </View>
          {section === 'items' ? (
            <ItemsToolbar
              workspace={workspace}
              itemsSearch={itemsSearch}
              setItemsSearch={setItemsSearch}
              searchFocused={itemsSearchFocused}
              onSearchFocus={() => {
                if (itemsSearchBlurTimerRef.current) clearTimeout(itemsSearchBlurTimerRef.current);
                setItemsSearchFocused(true);
              }}
              onSearchBlur={() => {
                if (itemsSearchBlurTimerRef.current) clearTimeout(itemsSearchBlurTimerRef.current);
                itemsSearchBlurTimerRef.current = setTimeout(() => setItemsSearchFocused(false), 160);
              }}
              searchResults={itemsSearchResults}
              searchLoading={itemsSearchLoading}
              searchLoadingMore={itemsSearchLoadingMore}
              searchHasMore={itemsSearchHasMore}
              searchError={itemsSearchError}
              onSelectSearchResult={addProductFromItemsSearch}
              onLoadMoreSearchResults={loadMoreItemsSearchResults}
              openPicker={openPicker}
              onClearItems={confirmClearItems}
            />
          ) : null}
          </View>
          {section === 'header' ? <HeaderSection workspace={workspace} openPicker={openPicker} openDetails={openReferenceDetails} /> : <ItemsSection workspace={workspace} filteredItems={filteredItems} ui={ui} onEditItem={setEditingItemKey} onAddItem={() => openPicker('product')} />}
          <TabBarSpacer />
        </ScrollView>
      )}

      <OrdersFiltersBottomSheet
        styles={styles}
        visible={filtersOpen}
        topOffset={Math.max(88, topInset + 12)}
        status={workspace.filters.status}
        amountMin={workspace.filters.amountMin}
        amountMax={workspace.filters.amountMax}
        deliveryDateFrom={workspace.filters.deliveryDateFrom}
        deliveryDateTo={workspace.filters.deliveryDateTo}
        updatedFrom={workspace.filters.updatedFrom}
        updatedTo={workspace.filters.updatedTo}
        itemsMin={workspace.filters.itemsMin}
        itemsMax={workspace.filters.itemsMax}
        syncState={workspace.filters.syncState}
        organizationGuid={workspace.filters.organizationGuid}
        hasNumber1c={workspace.filters.hasNumber1c}
        onlyProblems={workspace.filters.onlyProblems}
        statusLabels={workspace.statusLabels}
        syncLabels={workspace.syncLabels}
        organizations={workspace.settings?.organizations || []}
        filterCounterparty={filterCounterparty}
        filterWarehouse={filterWarehouse}
        filterPriceType={filterPriceType}
        onStatusChange={(status) => workspace.setFilters((prev) => ({ ...prev, status }))}
        onAmountMinChange={(amountMin) => workspace.setFilters((prev) => ({ ...prev, amountMin }))}
        onAmountMaxChange={(amountMax) => workspace.setFilters((prev) => ({ ...prev, amountMax }))}
        onDeliveryDateFromChange={(deliveryDateFrom) => workspace.setFilters((prev) => ({ ...prev, deliveryDateFrom }))}
        onDeliveryDateToChange={(deliveryDateTo) => workspace.setFilters((prev) => ({ ...prev, deliveryDateTo }))}
        onUpdatedFromChange={(updatedFrom) => workspace.setFilters((prev) => ({ ...prev, updatedFrom }))}
        onUpdatedToChange={(updatedTo) => workspace.setFilters((prev) => ({ ...prev, updatedTo }))}
        onItemsMinChange={(itemsMin) => workspace.setFilters((prev) => ({ ...prev, itemsMin }))}
        onItemsMaxChange={(itemsMax) => workspace.setFilters((prev) => ({ ...prev, itemsMax }))}
        onSyncStateChange={(syncState) => workspace.setFilters((prev) => ({ ...prev, syncState }))}
        onOrganizationChange={(organizationGuid) => workspace.setFilters((prev) => ({ ...prev, organizationGuid }))}
        onHasNumber1cChange={(hasNumber1c) => workspace.setFilters((prev) => ({ ...prev, hasNumber1c }))}
        onOnlyProblemsChange={(onlyProblems) => workspace.setFilters((prev) => ({ ...prev, onlyProblems }))}
        onCounterpartyChange={(counterparty) => {
          setFilterCounterparty(counterparty);
          workspace.setFilters((prev) => ({ ...prev, counterpartyGuid: counterparty?.guid || '' }));
        }}
        onWarehouseChange={(warehouse) => {
          setFilterWarehouse(warehouse);
          workspace.setFilters((prev) => ({ ...prev, warehouseGuid: warehouse?.guid || '' }));
        }}
        onPriceTypeChange={(priceType) => {
          setFilterPriceType(priceType);
          workspace.setFilters((prev) => ({ ...prev, priceTypeGuid: priceType?.guid || '' }));
        }}
        searchCounterparties={workspace.searchCounterparties}
        searchWarehouses={workspace.searchWarehouses}
        searchPriceTypes={workspace.searchPriceTypes}
        onReset={() => {
          setFilterCounterparty(null);
          setFilterWarehouse(null);
          setFilterPriceType(null);
          workspace.clearFilters();
        }}
        onClose={() => setFiltersOpen(false)}
      />

      {pickerKind === 'product' ? (
        <SheetModal styles={styles} visible onClose={closePicker} title={pickerTitle(pickerKind)} fullScreen>
          {pickerContent}
        </SheetModal>
      ) : (
        <PickerBottomSheet
          styles={styles}
          visible={!!pickerKind}
          topOffset={Math.max(88, topInset + 12)}
          title={pickerTitle(pickerKind)}
          titleIcon={pickerIcon(pickerKind)}
          onClose={closePicker}
          contentScrollOffset={pickerScrollOffset}
          enableContentDrag
        >
          {pickerContent}
        </PickerBottomSheet>
      )}

      <SheetModal styles={styles} visible={inspectorOpen} onClose={() => setInspectorOpen(false)} title="Инспектор">
        <Text style={styles.orderMeta}>Revision: {workspace.draft.revision || '—'}</Text>
        <Text style={styles.orderMeta}>Статус: {workspace.statusLabels[workspace.selectedOrder?.status || ''] || workspace.selectedOrder?.status || '—'}</Text>
        <Text style={styles.orderMeta}>Sync state: {workspace.syncLabels[workspace.selectedOrder?.syncState || ''] || workspace.selectedOrder?.syncState || '—'}</Text>
        <Text style={styles.orderMeta}>Документ 1С: {workspace.selectedOrder?.number1c || 'Еще не создан'}</Text>
      </SheetModal>
      <PickerBottomSheet
        styles={styles}
        visible={referenceOpen}
        topOffset={Math.max(88, topInset + 12)}
        title={referenceDetails?.title || 'Карточка'}
        titleIcon="information-outline"
        onClose={() => setReferenceOpen(false)}
        contentScrollOffset={referenceScrollOffset}
        enableContentDrag
      >
        <ScrollView
          style={styles.referenceScroll}
          contentContainerStyle={styles.referenceSheetContent}
          onScroll={(event) => setReferenceScrollOffset(event.nativeEvent.contentOffset.y <= 1 ? 0 : 2)}
          scrollEventThrottle={16}
        >
          {referenceLoading ? <InfoText styles={styles} text="Загружаю..." /> : null}
          {referenceError ? <Text style={styles.error}>{referenceError}</Text> : null}
          {referenceDetails?.subtitle ? <Text style={styles.orderMeta}>{referenceDetails.subtitle}</Text> : null}
          {referenceDetails?.sections.map((section) => <View key={section.title} style={styles.referenceSection}><Text style={styles.orderTitle}>{section.title}</Text>{section.rows.map((row) => <View key={`${section.title}-${row.label}`} style={styles.referenceRow}><Text style={styles.referenceLabel}>{row.label}</Text><Text style={styles.referenceValue}>{String(row.value ?? '—')}</Text></View>)}</View>)}
        </ScrollView>
      </PickerBottomSheet>

      <ProductLineEditorSheet
        styles={styles}
        visible={!!editingItem}
        topOffset={Math.max(topInset + 6, Math.round(height * 0.3))}
        item={editingItem}
        rowNumber={editingItemIndex >= 0 ? editingItemIndex + 1 : 0}
        workspace={workspace}
        onClose={() => setEditingItemKey(null)}
      />

      <SheetModal styles={styles} visible={!!pendingPriceTypeAction} onClose={() => setPendingPriceTypeAction(null)} title="Сменить вид цены">
        <InfoText styles={styles} text="Новый вид цены будет применен к строкам документа без ручной цены." />
        <View style={styles.row}>
          <ActionButton styles={styles} label="Отмена" kind="secondary" onPress={() => setPendingPriceTypeAction(null)} />
          <ActionButton styles={styles} label="Применить" kind="primary" onPress={() => {
            if (pendingPriceTypeAction) workspace.setHeaderPriceType(pendingPriceTypeAction.priceType);
            setPendingPriceTypeAction(null);
          }} />
        </View>
      </SheetModal>

      <ConfirmDialog
        styles={styles}
        state={confirmDialog}
        onDismiss={() => setConfirmDialog(null)}
      />
      <ConfirmDialog
        styles={styles}
        state={discardConfirmState}
        onDismiss={() => closeDiscardConfirm('cancel')}
      />
    </View>
  );
}

function HeaderSection({ workspace, openPicker, openDetails }: { workspace: any; openPicker: (kind: PickerKind, lineKey?: string) => void; openDetails: (kind: ClientOrderReferenceKind, guid?: string | null) => void }) {
  const today = React.useMemo(() => new Date(), []);
  const maxDate = React.useMemo(() => { const next = new Date(); next.setMonth(next.getMonth() + 2); return next; }, []);
  const [commentHeight, setCommentHeight] = React.useState(58);
  return <View style={styles.cardStack}>
    <FlatDocumentField label="Организация" value={workspace.selections.organization?.name || 'Выбрать'} icon="office-building-outline" onPress={() => openPicker('organization')} disabled={workspace.readOnly} onDetails={() => openDetails('organization', workspace.draft.organizationGuid)} />
    <FlatDocumentField label="Контрагент" value={workspace.selections.counterparty?.name || 'Выбрать'} icon="account-outline" onPress={() => openPicker('counterparty')} disabled={workspace.readOnly} onDetails={() => openDetails('counterparty', workspace.draft.counterpartyGuid)} />
    <FlatDocumentField label="Соглашение" value={workspace.selections.agreement?.name || 'Выбрать'} icon="file-document-outline" onPress={() => openPicker('agreement')} disabled={workspace.readOnly || !workspace.draft.counterpartyGuid} onDetails={() => openDetails('agreement', workspace.draft.agreementGuid)} />
    <FlatDocumentField label="Договор" value={workspace.selections.contract?.name || workspace.selections.contract?.number || 'Выбрать'} icon="file-sign" onPress={() => openPicker('contract')} disabled={workspace.readOnly || !workspace.draft.counterpartyGuid} onDetails={() => openDetails('contract', workspace.draft.contractGuid)} />
    <FlatDocumentField
      label="Вид цены"
      value={workspace.draft.priceTypeName || workspace.selections.agreement?.priceType?.name || 'Выбрать'}
      icon="tag-outline"
      onPress={() => openPicker('priceType')}
      disabled={workspace.readOnly}
      onDetails={() => openDetails('price-type', workspace.draft.priceTypeGuid || workspace.selections.agreement?.priceType?.guid)}
      onReset={workspace.isHeaderPriceTypeCustom ? () => workspace.resetHeaderPriceTypeToDefault() : undefined}
    />
    <FlatDocumentField label="Склад" value={workspace.selections.warehouse?.name || 'Выбрать'} icon="warehouse" onPress={() => openPicker('warehouse')} disabled={workspace.readOnly} onDetails={() => openDetails('warehouse', workspace.draft.warehouseGuid)} />
    <FlatDocumentField label="Адрес доставки" value={workspace.selections.deliveryAddress?.fullAddress || 'Выбрать'} icon="map-marker-outline" onPress={() => openPicker('deliveryAddress')} disabled={workspace.readOnly || !workspace.draft.counterpartyGuid} onDetails={() => openDetails('delivery-address', workspace.draft.deliveryAddressGuid)} />
    <FlatDateField
      label="Дата отгрузки"
      value={workspace.draft.deliveryDate || undefined}
      disabled={workspace.readOnly}
      minDate={today}
      maxDate={maxDate}
      onChange={(iso) => workspace.patchDraft({ deliveryDate: iso })}
    />
    <PaperTextInput
      mode="outlined"
      label="Комментарий"
      value={workspace.draft.comment || ''}
      onChangeText={(value) => workspace.patchDraft({ comment: value })}
      multiline
      scrollEnabled={false}
      dense
      editable={!workspace.readOnly}
      onContentSizeChange={(event) => {
        const nextHeight = Math.max(58, Math.ceil(event.nativeEvent.contentSize.height));
        setCommentHeight((current) => (nextHeight > current + 2 ? nextHeight : current));
      }}
      style={[styles.flatCommentInput, { height: commentHeight }]}
      contentStyle={styles.flatCommentInputContent}
      outlineStyle={styles.flatInputOutline}
    />
  </View>;
}

function FlatDateField({
  label,
  value,
  disabled,
  minDate,
  maxDate,
  onChange,
}: {
  label: string;
  value?: string;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  onChange: (iso: string) => void;
}) {
  return (
    <DateTimeInput
      value={value}
      includeTime={false}
      disabledPast
      minDate={minDate}
      maxDate={maxDate}
      allowClear={false}
      disabled={disabled}
      onChange={(iso) => onChange(iso)}
      renderTrigger={({ open, displayValue }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          disabled={disabled}
          onPress={open}
          style={({ pressed }) => [styles.flatField, disabled && styles.disabled, pressed && styles.flatPressed]}
        >
          <View style={styles.flatFieldIcon}>
            <MaterialCommunityIcons name="calendar-month-outline" size={20} color="#475569" />
          </View>
          <View style={styles.flatFieldTextWrap}>
            <Text style={styles.flatFieldLabel}>{label}</Text>
            <Text style={styles.flatFieldValue} numberOfLines={1}>{displayValue || 'Выбрать'}</Text>
          </View>
          <View style={styles.flatFieldAction}>
            <MaterialCommunityIcons name="calendar" size={19} color="#475569" />
          </View>
        </Pressable>
      )}
    />
  );
}

function FlatDocumentField({
  label,
  value,
  icon,
  onPress,
  disabled,
  onDetails,
  onReset,
}: {
  label: string;
  value: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  onPress: () => void;
  disabled?: boolean;
  onDetails?: () => void;
  onReset?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.flatField, disabled && styles.disabled, pressed && styles.flatPressed]}
    >
      <View style={styles.flatFieldIcon}>
        <MaterialCommunityIcons name={icon} size={20} color="#475569" />
      </View>
      <View style={styles.flatFieldTextWrap}>
        <Text style={styles.flatFieldLabel}>{label}</Text>
        <Text style={styles.flatFieldValue} numberOfLines={2}>{value}</Text>
      </View>
      {onDetails || onReset ? (
        <View style={styles.flatFieldActions}>
          {onReset ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Вернуть значение по умолчанию"
              disabled={disabled}
              onPress={(event) => {
                event.stopPropagation();
                onReset();
              }}
              hitSlop={8}
              style={({ pressed }) => [styles.flatFieldAction, pressed && styles.flatPressed]}
            >
              <MaterialCommunityIcons name="refresh" size={18} color="#2563EB" />
            </Pressable>
          ) : null}
          {onDetails ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Открыть карточку: ${label}`}
              disabled={disabled}
              onPress={(event) => {
                event.stopPropagation();
                onDetails();
              }}
              hitSlop={8}
              style={({ pressed }) => [styles.flatFieldAction, pressed && styles.flatPressed]}
            >
              <MaterialCommunityIcons name="magnify" size={19} color="#475569" />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function ItemsToolbar({
  workspace,
  itemsSearch,
  setItemsSearch,
  searchFocused,
  onSearchFocus,
  onSearchBlur,
  searchResults,
  searchLoading,
  searchLoadingMore,
  searchHasMore,
  searchError,
  onSelectSearchResult,
  onLoadMoreSearchResults,
  openPicker,
  onClearItems,
}: {
  workspace: any;
  itemsSearch: string;
  setItemsSearch: (value: string) => void;
  searchFocused: boolean;
  onSearchFocus: () => void;
  onSearchBlur: () => void;
  searchResults: ClientOrderProduct[];
  searchLoading: boolean;
  searchLoadingMore: boolean;
  searchHasMore: boolean;
  searchError: string | null;
  onSelectSearchResult: (product: ClientOrderProduct) => void;
  onLoadMoreSearchResults: () => void;
  openPicker: (kind: PickerKind, lineKey?: string) => void;
  onClearItems: () => void;
}) {
  const hasSearch = !!itemsSearch.trim();
  const showSearchResults = hasSearch && searchFocused;
  return <View style={styles.itemsToolbarWrap}>
    <View style={styles.itemsFlatToolbar}>
      <CompactSearchbar
        style={styles.itemsSearchFlat}
        inputStyle={styles.itemsSearchFlatInput}
        value={itemsSearch}
        onChangeText={setItemsSearch}
        placeholder="Поиск товара"
        onFocus={onSearchFocus}
        onBlur={onSearchBlur}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Добавить товар"
        onPress={() => openPicker('product')}
        style={({ pressed }) => [styles.itemsToolbarButton, styles.itemsToolbarButtonSuccess, pressed && styles.flatPressed]}
      >
        <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Очистить товары"
        disabled={!workspace.draft.items.length}
        onPress={onClearItems}
        style={({ pressed }) => [styles.itemsToolbarButton, styles.itemsToolbarButtonDanger, !workspace.draft.items.length && styles.disabled, pressed && styles.flatPressed]}
      >
        <MaterialCommunityIcons name="trash-can-outline" size={17} color="#FFFFFF" />
      </Pressable>
    </View>
    {showSearchResults ? (
      <View style={styles.itemsSearchResults}>
        <ScrollView
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          style={styles.itemsSearchResultsScroll}
          onScroll={(event) => {
            const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
            if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 48) onLoadMoreSearchResults();
          }}
          scrollEventThrottle={16}
        >
          {searchLoading ? (
            <View style={styles.itemsSearchStateRow}>
              <ActivityIndicator size={14} color="#2563EB" />
              <Text style={styles.itemsSearchStateText}>Ищу товары...</Text>
            </View>
          ) : null}
          {searchError ? <Text style={styles.itemsSearchErrorText}>{searchError}</Text> : null}
          {!searchLoading && !searchError && searchResults.map((product) => {
            const disabled = workspace.draft.items.some((line: any) => line.productGuid === product.guid);
            const meta = productPickerMeta(product);
            return (
              <Pressable
                key={product.guid}
                accessibilityRole="button"
                disabled={disabled}
                onPress={() => onSelectSearchResult(product)}
                style={({ pressed }) => [styles.itemsSearchResultRow, disabled && styles.disabled, pressed && styles.flatPressed]}
              >
                <View style={styles.itemsSearchResultIcon}>
                  <MaterialCommunityIcons name={disabled ? 'check-circle-outline' : 'plus-circle-outline'} size={18} color={disabled ? '#16A34A' : '#2563EB'} />
                </View>
                <View style={styles.itemsSearchResultTextWrap}>
                  <Text style={styles.itemsSearchResultTitle} numberOfLines={1}>{product.name || getPickerItemTitle(product)}</Text>
                  <Text style={styles.itemsSearchResultMeta} numberOfLines={1}>
                    {[meta.code, `Цена: ${meta.receiptPrice}`, `Остаток: ${meta.stock}`].filter(Boolean).join(' • ')}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          {!searchLoading && !searchError && !searchResults.length ? <Text style={styles.itemsSearchStateText}>Товары не найдены.</Text> : null}
          {searchLoadingMore ? (
            <View style={styles.itemsSearchStateRow}>
              <ActivityIndicator size={12} color="#2563EB" />
              <Text style={styles.itemsSearchStateText}>Загружаю ещё...</Text>
            </View>
          ) : null}
          {!searchLoading && !searchLoadingMore && searchHasMore ? <View style={styles.itemsSearchLoadMoreSpacer} /> : null}
        </ScrollView>
      </View>
    ) : null}
    <View style={styles.itemsSummaryRow}>
      <Text style={styles.itemsSummaryText}>{workspace.draft.items.length} поз.</Text>
      <Text style={styles.itemsSummaryTotal}>{formatMoney(workspace.localTotal, workspace.draft.currency)}</Text>
    </View>
  </View>;
}

function ItemsSection({ workspace, filteredItems, ui, onEditItem, onAddItem }: { workspace: any; filteredItems: any[]; ui: ReturnType<typeof getClientOrdersResponsiveMetrics>; onEditItem: (key: string) => void; onAddItem: () => void }) {
  return <View style={styles.itemsFlatSection}>
    {filteredItems.length ? (
      <View style={[styles.lineList, { paddingBottom: ui.itemsBottomInset }]}>
        {filteredItems.map((item, index) => <LineItemCard key={item.key} item={item} index={index} workspace={workspace} onPress={() => onEditItem(item.key)} onRemove={() => workspace.removeItem(item.key)} />)}
        <AddProductListCard onPress={onAddItem} />
      </View>
    ) : (
      <View style={[styles.lineList, { paddingBottom: ui.itemsBottomInset }]}>
        <InfoText styles={styles} text="Подходящие строки не найдены." />
        <AddProductListCard onPress={onAddItem} />
      </View>
    )}
  </View>;
}

function AddProductListCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Добавить товар" onPress={onPress} style={({ pressed }) => [styles.addProductListCard, pressed && styles.flatPressed]}>
      <MaterialCommunityIcons name="plus-circle-outline" size={22} color="#2563EB" />
      <Text style={styles.addProductListText}>Добавить товар</Text>
    </Pressable>
  );
}

function LineItemCard({ item, index, workspace, onPress, onRemove }: { item: any; index: number; workspace: any; onPress: () => void; onRemove: () => void }) {
  const displayedPrice = displayedPriceValue(item);
  const lineTotal = formatMoney(computeLineTotal(item, workspace.draft.generalDiscountPercent), workspace.draft.currency);
  const hasErrors = (workspace.validation.itemMessages[item.key] || []).length > 0;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.productPreviewCard, hasErrors && styles.productPreviewCardInvalid, pressed && styles.flatPressed]}>
      <View style={styles.productPreviewMedia}>
        <ProductThumb item={item} style={styles.productPreviewImage} iconSize={34} />
        <View style={styles.productPreviewIndexBadge}>
          <Text style={styles.productPreviewIndex}>{index + 1}</Text>
        </View>
      </View>
      <View style={styles.productPreviewBody}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Удалить товар"
          disabled={workspace.readOnly}
          onPress={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          hitSlop={8}
          style={({ pressed }) => [styles.productPreviewRemoveButton, workspace.readOnly && styles.disabled, pressed && styles.flatPressed]}
        >
          <MaterialCommunityIcons name="close" size={15} color="#64748B" />
        </Pressable>
        <Text style={styles.productPreviewTitle} numberOfLines={2}>{item.productName}</Text>
        <Text style={styles.productPreviewMeta} numberOfLines={1}>{item.productCode ? `Артикул: ${item.productCode}` : 'Без артикула'}</Text>
        <View style={styles.productPreviewBottomRow}>
          <Text style={styles.productPreviewFormula} numberOfLines={1}>
            <Text style={styles.productPreviewFormulaStrong}>{item.quantity}</Text>
            {` × ${displayedPrice || '0'} ₽`}
          </Text>
          <Text style={styles.productPreviewTotal} numberOfLines={1}>{lineTotal}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function ProductThumb({ item, style, iconSize }: { item: any; style: any; iconSize: number }) {
  const imageUri = getDraftItemImageUri(item);
  if (imageUri) {
    return <Image source={{ uri: imageUri }} style={style} resizeMode="cover" />;
  }
  return (
    <View style={[style, styles.productImagePlaceholder]}>
      <MaterialCommunityIcons name="image-outline" size={iconSize} color="#2563EB" />
    </View>
  );
}

function CompactSearchbar({
  style,
  inputStyle,
  value,
  onChangeText,
  placeholder,
  onFocus,
  onBlur,
}: {
  style: any;
  inputStyle: any;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  return (
    <Searchbar
      style={style}
      inputStyle={inputStyle}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      onFocus={onFocus}
      onBlur={onBlur}
      icon={({ color }) => <MaterialCommunityIcons name="magnify" size={18} color={color} />}
      right={({ color }) => value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Очистить поиск"
          hitSlop={4}
          onPress={() => onChangeText('')}
          style={({ pressed }) => [styles.compactSearchClear, pressed && styles.flatPressed]}
        >
          <MaterialCommunityIcons name="close" size={16} color={color} />
        </Pressable>
      ) : null}
      iconColor="#475569"
      placeholderTextColor="#64748B"
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      keyboardType="web-search"
      inputMode="search"
      autoComplete="new-password"
      textContentType="oneTimeCode"
      importantForAutofill="noExcludeDescendants"
    />
  );
}

function ProductLineEditorSheet({
  styles,
  visible,
  topOffset,
  item,
  rowNumber,
  workspace,
  onClose,
}: {
  styles: any;
  visible: boolean;
  topOffset: number;
  item: any | null;
  rowNumber: number;
  workspace: any;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const lastItemRef = React.useRef(item);
  const lastRowNumberRef = React.useRef(rowNumber);
  if (item) lastItemRef.current = item;
  if (rowNumber > 0) lastRowNumberRef.current = rowNumber;
  const displayedItem = item || lastItemRef.current;
  const [scrollOffset, setScrollOffset] = React.useState(0);
  const [priceInputValue, setPriceInputValue] = React.useState('');
  const [priceFocused, setPriceFocused] = React.useState(false);
  const [headerHeight, setHeaderHeight] = React.useState(0);
  const [scrollViewportHeight, setScrollViewportHeight] = React.useState(0);
  const [scrollContentHeight, setScrollContentHeight] = React.useState(0);
  const [footerHeight, setFooterHeight] = React.useState(0);
  const currentDisplayedPrice = displayedPriceValue(displayedItem);
  React.useEffect(() => {
    if (visible) setScrollOffset(0);
  }, [visible]);
  React.useEffect(() => {
    if (!priceFocused) setPriceInputValue(currentDisplayedPrice);
  }, [currentDisplayedPrice, priceFocused]);

  if (!displayedItem) return null;

  const qtyValid = isValidQuantityValue(displayedItem);
  const currentManualPrice = displayedItem.manualPrice || '';
  const priceValid = !currentManualPrice || isValidManualPriceValue(currentManualPrice);
  const displayedPrice = currentDisplayedPrice;
  const lineTotal = formatMoney(
    computeLineTotal(displayedItem, workspace.draft.generalDiscountPercent),
    displayedItem.currency || workspace.draft.currency
  );
  const article = displayedItem.productArticle || displayedItem.productSku || displayedItem.productCode || '—';
  const stock = formatStockLabel(displayedItem.stock, displayedItem.baseUnit) || '—';
  const receiptPrice = displayedItem.receiptPrice === null || displayedItem.receiptPrice === undefined
    ? '—'
    : formatMoney(displayedItem.receiptPrice, displayedItem.currency || workspace.draft.currency);
  const basePackageOption = { guid: null as string | null, label: unitLabel(displayedItem.baseUnit) || 'шт' };
  const packageOptions = [
    basePackageOption,
    ...(displayedItem.packages || []).map((pack: any) => ({ guid: pack.guid as string, label: packageLabel(pack, displayedItem) })),
  ];
  const selectedPackageGuid = displayedItem.packageGuid || null;
  const halfControlWidth = Math.max(120, (width - 32) / 2);
  const contentNeedsScroll = scrollViewportHeight > 0 && scrollContentHeight > scrollViewportHeight + 2;
  const measuredContentHeight = headerHeight && scrollContentHeight && footerHeight
    ? headerHeight + scrollContentHeight + footerHeight + FLOATING_TAB_BAR_HEIGHT + FLOATING_TAB_BAR_BOTTOM_OFFSET + 8
    : undefined;
  const preferredSheetHeight = measuredContentHeight
    ? Math.min(Math.round(height * 0.7), measuredContentHeight)
    : undefined;

  return (
    <PickerBottomSheet
      styles={styles}
      visible={visible}
      topOffset={topOffset}
      title="Позиция"
      onClose={onClose}
      showHeader={false}
      sheetStyle={styles.productEditorSheet}
      overlayHandle
      preferredHeight={preferredSheetHeight}
      minHeight={0}
      headerContent={(closeSheet) => (
        <View style={styles.productEditorHeaderBlock} onLayout={(event) => setHeaderHeight(Math.ceil(event.nativeEvent.layout.height))}>
          <View style={styles.productEditorMediaRow}>
            <View style={styles.productEditorImageWrap}>
              <ProductThumb item={displayedItem} style={styles.productEditorImage} iconSize={40} />
              <View style={styles.productPreviewIndexBadge}>
                <Text style={styles.productPreviewIndex}>{lastRowNumberRef.current}</Text>
              </View>
            </View>
            <View style={styles.productEditorInfo}>
              <View style={styles.productEditorInfoRow}>
                <Text style={styles.productEditorInfoLabel}>Артикул</Text>
                <Text style={styles.productEditorInfoValue} numberOfLines={1}>{article}</Text>
              </View>
              <View style={styles.productEditorInfoRow}>
                <Text style={styles.productEditorInfoLabel}>Остаток</Text>
                <Text style={styles.productEditorInfoValue} numberOfLines={1}>{stock}</Text>
              </View>
              <View style={styles.productEditorInfoRow}>
                <Text style={styles.productEditorInfoLabel}>Цена поступления</Text>
                <Text style={styles.productEditorInfoValue} numberOfLines={1}>{receiptPrice}</Text>
              </View>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Закрыть" onPress={closeSheet} style={({ pressed }) => [styles.productEditorCloseButton, pressed && styles.flatPressed]}>
              <MaterialCommunityIcons name="close" size={22} color="#475569" />
            </Pressable>
          </View>
          <Text style={styles.productEditorTitle}>{displayedItem.productName}</Text>
        </View>
      )}
      contentScrollOffset={scrollOffset}
      enableContentDrag
    >
      <ScrollView
        style={styles.productEditorScroll}
        contentContainerStyle={styles.productEditorContent}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={contentNeedsScroll}
        bounces={contentNeedsScroll}
        overScrollMode={contentNeedsScroll ? 'auto' : 'never'}
        onLayout={(event) => setScrollViewportHeight(Math.ceil(event.nativeEvent.layout.height))}
        onContentSizeChange={(_width, contentHeight) => setScrollContentHeight(Math.ceil(contentHeight))}
        onScroll={(event) => setScrollOffset(event.nativeEvent.contentOffset.y <= 1 ? 0 : 2)}
        scrollEventThrottle={16}
      >
        <View style={styles.productEditorFieldsRow}>
          <View style={[styles.productEditorAdaptiveField, { width: halfControlWidth }]}>
            <Text style={styles.productEditorLabel}>Упаковка</Text>
            {packageOptions.length === 1 ? (
              <View style={styles.productEditorPackageReadonly}>
                <Text style={styles.productEditorPackageReadonlyText} numberOfLines={1}>{packageOptions[0].label}</Text>
              </View>
            ) : (
              <View style={styles.productEditorPackageRow}>
                {packageOptions.map((option) => {
                  const selected = selectedPackageGuid === option.guid;
                  return (
                    <Pressable
                      key={option.guid || '__base__'}
                      disabled={workspace.readOnly}
                      onPress={() => workspace.setItemPatch(displayedItem.key, { packageGuid: option.guid })}
                      style={({ pressed }) => [styles.productEditorPackageButton, selected && styles.productEditorPackageButtonActive, pressed && styles.flatPressed]}
                    >
                      <Text style={[styles.productEditorPackageText, selected && styles.productEditorPackageTextActive]} numberOfLines={1}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
          <View style={[styles.productEditorAdaptiveField, { width: halfControlWidth }]}>
            <Text style={styles.productEditorLabel}>Цена за единицу</Text>
            <View style={[styles.productEditorPriceBox, !priceValid && styles.productEditorPriceBoxInvalid]}>
              <PaperTextInput
                mode="flat"
                dense
                value={priceFocused ? priceInputValue : displayedPrice}
                placeholder="0"
                keyboardType="decimal-pad"
                selectTextOnFocus
                onFocus={() => {
                  setPriceInputValue(displayedPrice);
                  setPriceFocused(true);
                }}
                onBlur={() => {
                  setPriceFocused(false);
                  if (!priceInputValue.trim()) setPriceInputValue('0');
                }}
                disabled={workspace.readOnly}
                underlineColor="transparent"
                activeUnderlineColor="transparent"
                onChangeText={(value) => {
                  const nextValue = normalizePriceInput(value, priceInputValue);
                  setPriceInputValue(nextValue);
                  const manualPrice = nextValue === '' ? '0' : nextValue;
                  workspace.setItemPatch(displayedItem.key, {
                    manualPrice,
                    priceTypeGuid: manualPrice.trim() ? null : workspace.draft.priceTypeGuid ?? null,
                    priceTypeName: manualPrice.trim() ? 'Произвольный' : workspace.draft.priceTypeName ?? null,
                  });
                }}
                style={styles.productEditorPriceInput}
                contentStyle={styles.productEditorPriceInputContent}
              />
              <Text style={styles.productEditorCurrency}>₽</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Вернуть цену из прайса документа"
                disabled={workspace.readOnly}
                onPress={() => workspace.resetItemPriceType(displayedItem.key)}
                hitSlop={6}
                style={({ pressed }) => [styles.productEditorPriceReset, pressed && styles.flatPressed]}
              >
                <MaterialCommunityIcons name="refresh" size={18} color="#2563EB" />
              </Pressable>
            </View>
          </View>
        </View>

      </ScrollView>

      <View style={styles.productEditorFooter} onLayout={(event) => setFooterHeight(Math.ceil(event.nativeEvent.layout.height))}>
        <View style={styles.productEditorFooterTotalWrap}>
          <Text style={styles.productEditorFooterTotalLabel}>Сумма позиции</Text>
          <View style={styles.productEditorFooterTotalRow}>
            <Text style={styles.productEditorFooterTotal}>{lineTotal}</Text>
          </View>
        </View>
        <View style={[styles.productEditorFooterQuantity, { width: halfControlWidth }]}>
          <Text style={styles.productEditorLabel}>Количество</Text>
          <View style={styles.productEditorQtyStepper}>
            <Pressable disabled={workspace.readOnly} onPress={() => workspace.setItemPatch(displayedItem.key, { quantity: quantityStep(displayedItem, -1) })} style={({ pressed }) => [styles.productEditorQtyButton, pressed && styles.flatPressed]}>
              <MaterialCommunityIcons name="minus" size={21} color="#2563EB" />
            </Pressable>
            <PaperTextInput
              mode="outlined"
              dense
              value={String(displayedItem.quantity)}
              keyboardType="decimal-pad"
              selectTextOnFocus
              disabled={workspace.readOnly}
              onChangeText={(value) => workspace.setItemPatch(displayedItem.key, { quantity: normalizeQuantityInput(displayedItem, value) })}
              style={styles.productEditorQtyInput}
              contentStyle={styles.productEditorQtyInputContent}
              outlineStyle={[styles.productEditorInputOutline, !qtyValid && styles.invalidInputOutline]}
            />
            <Pressable disabled={workspace.readOnly} onPress={() => workspace.setItemPatch(displayedItem.key, { quantity: quantityStep(displayedItem, 1) })} style={({ pressed }) => [styles.productEditorQtyButton, pressed && styles.flatPressed]}>
              <MaterialCommunityIcons name="plus" size={22} color="#2563EB" />
            </Pressable>
          </View>
        </View>
      </View>
    </PickerBottomSheet>
  );
}

function orderStatusTone(status: string) {
  if (status === 'CANCELLED') return styles.orderStatusDanger;
  if (status === 'SENT' || status === 'POSTED' || status === 'COMPLETED') return styles.orderStatusSuccess;
  if (status === 'QUEUED') return styles.orderStatusInfo;
  return styles.orderStatusNeutral;
}

function orderStatusIcon(status: string) {
  if (status === 'CANCELLED') return { name: 'close-circle', color: '#B91C1C' };
  if (status === 'QUEUED') return { name: 'clock-outline', color: '#1D4ED8' };
  if (status === 'SENT' || status === 'SENT_TO_1C') return { name: 'cloud-upload-outline', color: '#166534' };
  if (status === 'POSTED' || status === 'COMPLETED') return { name: 'check-circle', color: '#166534' };
  return { name: 'file-document-edit-outline', color: '#334155' };
}

function filterStatusIcon(status: string) {
  if (!status) return { name: 'filter-variant', color: '#2563EB' };
  return orderStatusIcon(status);
}

type FilterSelectOption = { value: string; label: string; icon?: string; color?: string };

function FilterFieldFrame({
  styles,
  icon,
  children,
  right,
  onPress,
}: {
  styles: any;
  icon: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  const content = (
    <>
      <View style={styles.filtersFieldIconSlot}>
        <MaterialCommunityIcons name={icon as any} size={18} color="#475569" />
      </View>
      <View style={styles.filtersFieldContent}>{children}</View>
      {right ? <View style={styles.filtersFieldRightSlot}>{right}</View> : null}
    </>
  );
  if (onPress) {
    return <Pressable onPress={onPress} style={styles.filtersUnifiedField}>{content}</Pressable>;
  }
  return <View style={styles.filtersUnifiedField}>{content}</View>;
}

function FilterSelectField({
  styles,
  label,
  value,
  options,
  onChange,
}: {
  styles: any;
  label: string;
  value: string;
  options: FilterSelectOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((item) => item.value === value) || options[0];
  const filled = !!value;
  return (
    <View>
      <Text style={styles.filtersFieldLabel}>{label}</Text>
      <FilterFieldFrame
        styles={styles}
        icon={selected.icon || 'filter-variant'}
        onPress={() => setOpen((prev) => !prev)}
        right={filled ? (
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              onChange('');
              setOpen(false);
            }}
            hitSlop={8}
            style={styles.filtersInlineClear}
          >
            <MaterialCommunityIcons name="close" size={18} color="#475569" />
          </Pressable>
        ) : (
          <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#64748B" />
        )}
      >
        <Text style={styles.filtersSelectText} numberOfLines={1}>{selected.label}</Text>
      </FilterFieldFrame>
      {open ? (
        <Surface mode="flat" style={styles.filtersSelectMenu}>
          {options.map((item) => {
            const optionSelected = item.value === value;
            return (
              <Pressable
                key={item.value || 'all'}
                onPress={() => {
                  onChange(item.value);
                  setOpen(false);
                }}
                style={[styles.filtersSelectOption, optionSelected && styles.filtersSelectOptionSelected]}
              >
                <MaterialCommunityIcons name={(item.icon || 'filter-variant') as any} size={16} color={item.color || '#64748B'} />
                <Text style={[styles.filtersSelectOptionText, optionSelected && styles.filtersSelectOptionTextSelected]} numberOfLines={1}>
                  {item.label}
                </Text>
                {optionSelected ? <MaterialCommunityIcons name="check" size={16} color="#2563EB" /> : null}
              </Pressable>
            );
          })}
        </Surface>
      ) : null}
    </View>
  );
}

function FilterLookupField<T extends { guid: string; name: string }>({
  styles,
  label,
  icon,
  selected,
  placeholder,
  search,
  onChange,
}: {
  styles: any;
  label: string;
  icon: string;
  selected: T | null;
  placeholder: string;
  search: (args: { search: string; limit: number; offset: number }) => Promise<{ items: T[] }>;
  onChange: (value: T | null) => void;
}) {
  const [query, setQuery] = React.useState(selected?.name || '');
  const [items, setItems] = React.useState<T[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setQuery(selected?.name || '');
  }, [selected?.guid, selected?.name]);

  React.useEffect(() => {
    const normalized = query.trim();
    if (!normalized || normalized === (selected?.name || '')) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) setLoading(true);
    }, 120);
    const requestTimer = setTimeout(() => {
      void search({ search: normalized, limit: 8, offset: 0 })
        .then((result) => {
          if (!cancelled) setItems(Array.isArray(result.items) ? result.items : []);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(requestTimer);
      setLoading(false);
    };
  }, [query, search, selected?.name]);

  return (
    <View>
      <Text style={styles.filtersFieldLabel}>{label}</Text>
      <FilterFieldFrame
        styles={styles}
        icon={icon}
        right={
          selected || query.trim()
            ? (
              <Pressable hitSlop={8} style={styles.filtersInlineClear} onPress={() => { setQuery(''); setItems([]); onChange(null); }}>
                <MaterialCommunityIcons name="close" size={18} color="#475569" />
              </Pressable>
            )
            : loading
              ? <ActivityIndicator size={14} color="#64748B" />
              : undefined
        }
      >
        <PaperTextInput
          mode="flat"
          dense
          value={query}
          onChangeText={(value) => {
            setQuery(value);
            if (!value.trim()) onChange(null);
          }}
          placeholder={placeholder}
          underlineColor="transparent"
          activeUnderlineColor="transparent"
          style={styles.filtersInnerTextInput}
          contentStyle={styles.filtersInnerTextInputContent}
        />
      </FilterFieldFrame>
      {items.length ? (
        <Surface mode="flat" style={styles.filtersSuggestions}>
          {items.map((item) => (
            <List.Item
              key={item.guid}
              title={item.name}
              titleNumberOfLines={1}
              titleStyle={styles.filtersSuggestionTitle}
              onPress={() => {
                onChange(item);
                setItems([]);
              }}
              style={styles.filtersSuggestionItem}
            />
          ))}
        </Surface>
      ) : null}
    </View>
  );
}

function FilterInputField({
  styles,
  label,
  value,
  onChange,
  placeholder,
  icon,
  keyboardType,
}: {
  styles: any;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  icon: string;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
}) {
  return (
    <View style={styles.filtersInputWrap}>
      <Text style={styles.filtersFieldLabel}>{label}</Text>
      <FilterFieldFrame
        styles={styles}
        icon={icon}
        right={value ? (
          <Pressable hitSlop={8} style={styles.filtersInlineClear} onPress={() => onChange('')}>
            <MaterialCommunityIcons name="close" size={18} color="#475569" />
          </Pressable>
        ) : null}
      >
        <PaperTextInput
          mode="flat"
          dense
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          keyboardType={keyboardType}
          underlineColor="transparent"
          activeUnderlineColor="transparent"
          style={styles.filtersInnerTextInput}
          contentStyle={styles.filtersInnerTextInputContent}
        />
      </FilterFieldFrame>
    </View>
  );
}

function OrdersToolbar({
  styles,
  count,
  loading,
  search,
  onSearch,
  onOpenFilters,
  onCreate,
}: {
  styles: any;
  count: number;
  loading: boolean;
  search: string;
  onSearch: (value: string) => void;
  onOpenFilters: () => void;
  onCreate: () => void;
}) {
  return (
    <Surface mode="flat" style={styles.ordersToolbar}>
        <View style={styles.ordersCompactToolbarRow}>
          <CompactSearchbar
            style={styles.ordersSearchbar}
            inputStyle={styles.ordersSearchbarInput}
            value={search}
            onChangeText={onSearch}
            placeholder="Поиск"
          />
          <PaperIconButton
            icon="filter-variant"
            size={17}
            onPress={onOpenFilters}
            iconColor="#2563EB"
            style={styles.ordersIconButton}
          />
          <PaperIconButton
            icon="file-document-plus-outline"
            size={17}
            onPress={onCreate}
            iconColor="#FFFFFF"
            style={[styles.ordersIconButton, styles.ordersIconButtonPrimary]}
          />
        </View>
        <View style={styles.ordersTotalRow}>
          <Text style={styles.ordersTotalText}>Всего {count}</Text>
          {loading ? <ActivityIndicator size={12} /> : null}
        </View>
    </Surface>
  );
}

function OrdersFiltersBottomSheet({
  styles,
  visible,
  topOffset,
  status,
  amountMin,
  amountMax,
  deliveryDateFrom,
  deliveryDateTo,
  updatedFrom,
  updatedTo,
  itemsMin,
  itemsMax,
  syncState,
  organizationGuid,
  hasNumber1c,
  onlyProblems,
  statusLabels,
  syncLabels,
  organizations,
  filterCounterparty,
  filterWarehouse,
  filterPriceType,
  onStatusChange,
  onAmountMinChange,
  onAmountMaxChange,
  onDeliveryDateFromChange,
  onDeliveryDateToChange,
  onUpdatedFromChange,
  onUpdatedToChange,
  onItemsMinChange,
  onItemsMaxChange,
  onSyncStateChange,
  onOrganizationChange,
  onHasNumber1cChange,
  onOnlyProblemsChange,
  onCounterpartyChange,
  onWarehouseChange,
  onPriceTypeChange,
  searchCounterparties,
  searchWarehouses,
  searchPriceTypes,
  onReset,
  onClose,
}: {
  styles: any;
  visible: boolean;
  topOffset: number;
  status: string;
  amountMin: string;
  amountMax: string;
  deliveryDateFrom: string;
  deliveryDateTo: string;
  updatedFrom: string;
  updatedTo: string;
  itemsMin: string;
  itemsMax: string;
  syncState: string;
  organizationGuid: string;
  hasNumber1c: string;
  onlyProblems: boolean;
  statusLabels: Record<string, string>;
  syncLabels: Record<string, string>;
  organizations: ClientOrderOrganization[];
  filterCounterparty: ClientOrderCounterpartyOption | null;
  filterWarehouse: ClientOrderWarehouseOption | null;
  filterPriceType: ClientOrderPriceTypeOption | null;
  onStatusChange: (status: string) => void;
  onAmountMinChange: (value: string) => void;
  onAmountMaxChange: (value: string) => void;
  onDeliveryDateFromChange: (value: string) => void;
  onDeliveryDateToChange: (value: string) => void;
  onUpdatedFromChange: (value: string) => void;
  onUpdatedToChange: (value: string) => void;
  onItemsMinChange: (value: string) => void;
  onItemsMaxChange: (value: string) => void;
  onSyncStateChange: (value: string) => void;
  onOrganizationChange: (value: string) => void;
  onHasNumber1cChange: (value: string) => void;
  onOnlyProblemsChange: (value: boolean) => void;
  onCounterpartyChange: (counterparty: ClientOrderCounterpartyOption | null) => void;
  onWarehouseChange: (warehouse: ClientOrderWarehouseOption | null) => void;
  onPriceTypeChange: (priceType: ClientOrderPriceTypeOption | null) => void;
  searchCounterparties: (args: { search: string; limit: number; offset: number }) => Promise<{ items: ClientOrderCounterpartyOption[] }>;
  searchWarehouses: (args: { search: string; limit: number; offset: number }) => Promise<{ items: ClientOrderWarehouseOption[] }>;
  searchPriceTypes: (args: { search: string; limit: number; offset: number }) => Promise<{ items: ClientOrderPriceTypeOption[] }>;
  onReset: () => void;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const anim = React.useRef(new Animated.Value(0)).current;
  const dragStartValueRef = React.useRef(1);
  const sheetWidth = Math.min(520, Math.max(280, width - 16));
  const sheetHeight = Math.max(360, height - topOffset);
  const [rendered, setRendered] = React.useState(visible);

  const closeWithAnimation = React.useCallback(() => {
    Animated.spring(anim, {
      toValue: 0,
      damping: 24,
      stiffness: 260,
      mass: 0.9,
      useNativeDriver: false,
    }).start(() => {
      setRendered(false);
      onClose();
    });
  }, [anim, onClose]);

  React.useEffect(() => {
    if (visible) {
      setRendered(true);
    }
  }, [visible]);

  React.useEffect(() => {
    if (!rendered) return;
    Animated.spring(anim, {
      toValue: visible ? 1 : 0,
      damping: 22,
      stiffness: 240,
      mass: 0.9,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !visible) setRendered(false);
    });
  }, [anim, rendered, visible]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_evt, gestureState) =>
          visible && Math.abs(gestureState.dy) > 5 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderGrant: () => {
          dragStartValueRef.current = 1;
        },
        onPanResponderMove: (_evt, gestureState) => {
          const next = dragStartValueRef.current - Math.max(0, gestureState.dy) / sheetHeight;
          anim.setValue(Math.max(0, Math.min(1, next)));
        },
        onPanResponderRelease: (_evt, gestureState) => {
          if (gestureState.dy > 48 || gestureState.vy > 0.5) {
            closeWithAnimation();
            return;
          }
          Animated.spring(anim, {
            toValue: 1,
            damping: 22,
            stiffness: 240,
            mass: 0.9,
            useNativeDriver: false,
          }).start();
        },
      }),
    [anim, closeWithAnimation, sheetHeight, visible]
  );

  const statusOptions = React.useMemo<FilterSelectOption[]>(() => [
    { value: '', label: 'Все статусы', icon: 'filter-variant', color: '#2563EB' },
    ...Object.entries(statusLabels).map(([value, label]) => ({ value, label: String(label), icon: filterStatusIcon(value).name, color: filterStatusIcon(value).color })),
  ], [statusLabels]);
  const syncOptions = React.useMemo<FilterSelectOption[]>(() => [
    { value: '', label: 'Любая синхронизация', icon: 'sync', color: '#2563EB' },
    ...Object.entries(syncLabels).map(([value, label]) => ({ value, label: String(label), icon: value === 'ERROR' || value === 'FAILED' ? 'alert-circle-outline' : 'sync', color: value === 'ERROR' || value === 'FAILED' ? '#B91C1C' : '#64748B' })),
  ], [syncLabels]);
  const organizationOptions = React.useMemo<FilterSelectOption[]>(() => [
    { value: '', label: 'Все организации', icon: 'office-building-outline', color: '#2563EB' },
    ...organizations.map((item) => ({ value: item.guid, label: item.name, icon: 'office-building-outline', color: '#64748B' })),
  ], [organizations]);
  const numberOptions = React.useMemo<FilterSelectOption[]>(() => [
    { value: '', label: 'Любой номер 1С', icon: 'numeric', color: '#2563EB' },
    { value: 'yes', label: 'Есть номер 1С', icon: 'check-circle-outline', color: '#166534' },
    { value: 'no', label: 'Без номера 1С', icon: 'minus-circle-outline', color: '#B91C1C' },
  ], []);

  if (!rendered) return null;

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetHeight + 24, 0],
  });

  return (
    <Animated.View
      style={[
        styles.filtersSheetWrap,
        {
          width: sheetWidth,
          height: sheetHeight,
          left: (width - sheetWidth) / 2,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={styles.filtersSheet} {...panResponder.panHandlers}>
        <View style={styles.filtersSheetHandle} />
        <View style={styles.filtersSheetHeader}>
          <Text style={styles.filtersSheetTitle}>Фильтры</Text>
          <PaperIconButton icon="close" size={16} onPress={closeWithAnimation} style={styles.filtersSheetIconButton} />
        </View>
        <ScrollView style={styles.filtersScroll} contentContainerStyle={styles.filtersForm} keyboardShouldPersistTaps="handled">
          <FilterSelectField styles={styles} label="Статус" value={status} options={statusOptions} onChange={onStatusChange} />
          <FilterSelectField styles={styles} label="Синхронизация" value={syncState} options={syncOptions} onChange={onSyncStateChange} />
          <FilterSelectField styles={styles} label="Номер 1С" value={hasNumber1c} options={numberOptions} onChange={onHasNumber1cChange} />
          <FilterFieldFrame
            styles={styles}
            icon="alert-circle-outline"
            onPress={() => onOnlyProblemsChange(!onlyProblems)}
            right={onlyProblems ? (
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  onOnlyProblemsChange(false);
                }}
                hitSlop={8}
                style={styles.filtersInlineClear}
              >
                <MaterialCommunityIcons name="close" size={18} color="#475569" />
              </Pressable>
            ) : (
              <MaterialCommunityIcons name="chevron-right" size={18} color="#94A3B8" />
            )}
          >
            <Text style={[styles.filtersToggleText, onlyProblems && styles.filtersToggleTextActive]}>Только проблемные</Text>
          </FilterFieldFrame>
          <View style={styles.filtersAmountRow}>
            <FilterInputField styles={styles} label="Дата отгрузки от" value={deliveryDateFrom} onChange={onDeliveryDateFromChange} placeholder="От" icon="calendar-outline" />
            <FilterInputField styles={styles} label="Дата отгрузки до" value={deliveryDateTo} onChange={onDeliveryDateToChange} placeholder="До" icon="calendar-outline" />
          </View>
          <View style={styles.filtersAmountRow}>
            <FilterInputField styles={styles} label="Дата изменения от" value={updatedFrom} onChange={onUpdatedFromChange} placeholder="От" icon="calendar-clock-outline" />
            <FilterInputField styles={styles} label="Дата изменения до" value={updatedTo} onChange={onUpdatedToChange} placeholder="До" icon="calendar-clock-outline" />
          </View>
          <View style={styles.filtersAmountRow}>
            <FilterInputField styles={styles} label="Сумма от" value={amountMin} onChange={onAmountMinChange} placeholder="От" icon="cash" keyboardType="decimal-pad" />
            <FilterInputField styles={styles} label="Сумма до" value={amountMax} onChange={onAmountMaxChange} placeholder="До" icon="cash" keyboardType="decimal-pad" />
          </View>
          <View style={styles.filtersAmountRow}>
            <FilterInputField styles={styles} label="Позиций от" value={itemsMin} onChange={onItemsMinChange} placeholder="От" icon="format-list-numbered" keyboardType="number-pad" />
            <FilterInputField styles={styles} label="Позиций до" value={itemsMax} onChange={onItemsMaxChange} placeholder="До" icon="format-list-numbered" keyboardType="number-pad" />
          </View>
          <FilterLookupField styles={styles} label="Контрагент" icon="account-outline" selected={filterCounterparty} placeholder="Начните вводить название" search={searchCounterparties} onChange={onCounterpartyChange} />
          <FilterSelectField styles={styles} label="Организация" value={organizationGuid} options={organizationOptions} onChange={onOrganizationChange} />
          <FilterLookupField styles={styles} label="Склад" icon="warehouse" selected={filterWarehouse} placeholder="Начните вводить склад" search={searchWarehouses} onChange={onWarehouseChange} />
          <FilterLookupField styles={styles} label="Вид цены" icon="tag-outline" selected={filterPriceType} placeholder="Начните вводить вид цены" search={searchPriceTypes} onChange={onPriceTypeChange} />
        </ScrollView>
        <View style={styles.filtersSheetActions}>
          <PaperButton mode="outlined" onPress={onReset} style={styles.filtersSheetActionButton} labelStyle={styles.filtersSheetActionLabel} contentStyle={styles.filtersSheetActionContent}>
            Сбросить
          </PaperButton>
          <PaperButton mode="contained" onPress={closeWithAnimation} buttonColor="#0F172A" textColor="#FFFFFF" style={styles.filtersSheetActionButton} labelStyle={styles.filtersSheetActionLabel} contentStyle={styles.filtersSheetActionContent}>
            Готово
          </PaperButton>
        </View>
      </View>
    </Animated.View>
  );
}

function OrderCard({ order, selected, onPress }: { order: ClientOrder; selected: boolean; onPress: () => void }) {
  const activityAt = order.updatedAt || order.queuedAt || order.sentTo1cAt;
  return (
    <Card mode="outlined" onPress={onPress} style={[styles.orderCardPaper, selected && styles.orderCardSelected]}>
      <Card.Content style={styles.orderCardContentPaper}>
        <View style={[styles.orderStatusRail, selected && styles.orderStatusRailSelected]} />
        <View style={styles.orderCardBody}>
          <View style={styles.orderCardHeader}>
            <Text style={styles.orderTitle} numberOfLines={1}>{orderTitle(order)}</Text>
            <Text style={styles.orderAmount} numberOfLines={1}>{formatMoney(order.totalAmount || 0, order.currency)}</Text>
            <View style={[styles.orderStatusBadge, orderStatusTone(order.status)]}>
              <MaterialCommunityIcons name={orderStatusIcon(order.status).name as any} size={13} color={orderStatusIcon(order.status).color} />
            </View>
          </View>
          <Text style={styles.orderCounterparty} numberOfLines={1}>{order.counterparty?.name || 'Контрагент не выбран'}</Text>
          <View style={styles.orderMetaRow}>
            <Text style={styles.orderMetaCompact} numberOfLines={1}>{order.itemsCount ?? order.items.length ?? 0} поз.</Text>
            <Text style={styles.orderMetaCompact} numberOfLines={1}>Отгр. {formatDateOnly(order.deliveryDate)}</Text>
            <Text style={styles.orderUpdated} numberOfLines={1}>Изм. {formatDateTime(activityAt)}</Text>
          </View>
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 12, gap: 10, paddingBottom: 110 },
  editorItemsContent: { flexGrow: 1 },
  ordersContent: { padding: 8, gap: 0, paddingBottom: 150 },
  contentTablet: { maxWidth: 760, alignSelf: 'center', width: '100%' },
  panelCard: { borderColor: '#DBEAFE', overflow: 'hidden' },
  cardContent: { paddingTop: 0, paddingBottom: 0 },
  panel: { borderRadius: 18, borderWidth: 1, borderColor: '#DBEAFE', padding: 12, gap: 10, shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },
  cardStack: { gap: 4 },
  documentStickyHeader: { backgroundColor: '#FFFFFF', gap: 4, zIndex: 20, elevation: 8 },
  documentHeaderFlat: { backgroundColor: '#FFFFFF', gap: 4 },
  documentHeaderTop: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6 },
  documentHeaderIconButton: { width: 34, height: 34, borderRadius: 5, borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  documentHeaderTitleWrap: { flex: 1, minWidth: 0 },
  documentTitle: { fontSize: 16, fontWeight: '900', color: '#0F172A', lineHeight: 19 },
  documentSubtitle: { marginTop: 0, fontSize: 10.5, fontWeight: '800', color: '#64748B', lineHeight: 13 },
  documentTabsRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  documentTab: { flex: 1, minHeight: 32, borderRadius: 4, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  documentTabActive: { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' },
  documentTabText: { fontSize: 12.5, fontWeight: '800', color: '#334155' },
  documentTabTextActive: { color: '#1D4ED8', fontWeight: '900' },
  documentItemsCount: { minWidth: 58, height: 32, borderRadius: 4, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF', paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  documentItemsCountText: { fontSize: 13, fontWeight: '900', color: '#2563EB' },
  flatPressed: { opacity: 0.78 },
  compactSearchClear: { width: 28, height: 28, marginRight: 2, alignItems: 'center', justifyContent: 'center' },
  flatField: { minHeight: 48, borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: '#FFFFFF', borderRadius: 4, paddingLeft: 8, paddingRight: 5, paddingVertical: 5, flexDirection: 'row', alignItems: 'center' },
  flatFieldIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', marginRight: 7 },
  flatFieldTextWrap: { flex: 1, minWidth: 0, justifyContent: 'center' },
  flatFieldLabel: { marginBottom: 1, fontSize: 10.5, color: '#64748B', fontWeight: '900', textTransform: 'uppercase' },
  flatFieldValue: { fontSize: 13, lineHeight: 16, color: '#0F172A', fontWeight: '900' },
  flatFieldActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  flatFieldAction: { width: 30, height: 30, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  flatResetButton: { width: 42, alignSelf: 'stretch', minHeight: 48, borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: '#FFFFFF', borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  flatDateInput: { borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: '#FFFFFF', borderRadius: 4, paddingHorizontal: 8, paddingTop: 5, paddingBottom: 6, gap: 3 },
  flatCommentInput: { minHeight: 58, backgroundColor: '#FFFFFF', fontSize: 13 },
  flatCommentInputContent: { minHeight: 58, paddingTop: 8, paddingBottom: 8, textAlignVertical: 'top' },
  flatInputOutline: { borderRadius: 4, borderColor: '#D8E2F0' },
  title: { fontSize: 19, fontWeight: '900', color: '#1F2937' },
  subtitle: { color: '#64748B', fontSize: 12, fontWeight: '700' },
  input: { minHeight: 42, borderRadius: 9, borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 12, color: '#0F172A', fontWeight: '800', backgroundColor: '#FFFFFF' },
  comment: { minHeight: 86, textAlignVertical: 'top', paddingTop: 10 },
  commentInputPaper: { minHeight: 86, backgroundColor: '#FFFFFF' },
  inputOutlinePaper: { borderRadius: 8, borderColor: '#CBD5E1' },
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
  iconButtonPaper: { margin: 0, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DBEAFE' },
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
  segmentedPaper: { flex: 1 },
  segmentRow: { flex: 1, flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: '#EEF2FF', gap: 4 },
  segment: { flex: 1, minHeight: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: '#FFFFFF' },
  segmentText: { color: '#64748B', fontWeight: '900' },
  segmentTextActive: { color: '#2563EB' },
  itemCountBadge: { minHeight: 34, borderRadius: 12, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  itemCountChip: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  itemCountBadgeText: { color: '#2563EB', fontWeight: '900', fontSize: 13 },
  filterGroup: { gap: 8 },
  statusChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { backgroundColor: '#F8FAFC' },
  ordersToolbar: { backgroundColor: '#FFFFFF', marginBottom: 4 },
  filtersSheetWrap: { position: 'absolute', zIndex: 12, bottom: 0 },
  filtersSheet: { width: '100%', height: '100%', borderTopLeftRadius: 8, borderTopRightRadius: 8, borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: '#FFFFFF', paddingHorizontal: 8, paddingTop: 5, paddingBottom: FLOATING_TAB_BAR_HEIGHT + FLOATING_TAB_BAR_BOTTOM_OFFSET + 8, gap: 8, shadowColor: '#0F172A', shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: -6 }, elevation: 14 },
  filtersSheetHandle: { alignSelf: 'center', width: 34, height: 3, borderRadius: 999, backgroundColor: '#CBD5E1' },
  filtersSheetHeader: { height: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  filtersSheetTitle: { fontSize: 13, fontWeight: '900', color: '#0F172A', textTransform: 'uppercase' },
  filtersSheetIconButton: { width: 28, height: 28, margin: 0, borderRadius: 4, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' },
  filtersScroll: { flex: 1, minHeight: 0 },
  filtersForm: { gap: 7, paddingBottom: 8 },
  filtersSection: { gap: 7 },
  filtersSectionTitle: { display: 'none' },
  filtersFieldLabel: { marginBottom: 3, fontSize: 10.5, color: '#64748B', fontWeight: '800', textTransform: 'uppercase' },
  filtersUnifiedField: { height: 42, borderRadius: 4, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', paddingLeft: 8, paddingRight: 8, flexDirection: 'row', alignItems: 'center' },
  filtersFieldIconSlot: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  filtersFieldContent: { flex: 1, minWidth: 0, justifyContent: 'center' },
  filtersFieldRightSlot: { width: 24, height: 28, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  filtersSelectField: { height: 42, borderRadius: 4, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  filtersSelectText: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: '800', color: '#0F172A' },
  filtersSelectMenu: { marginTop: 3, borderRadius: 4, borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: '#FFFFFF', overflow: 'hidden' },
  filtersSelectOption: { minHeight: 34, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' },
  filtersSelectOptionSelected: { backgroundColor: '#EFF6FF' },
  filtersSelectOptionText: { flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: '800', color: '#334155' },
  filtersSelectOptionTextSelected: { color: '#1D4ED8', fontWeight: '900' },
  filtersInlineClear: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  filtersInputWrap: { flex: 1, minWidth: 0 },
  filtersTextInput: { height: 42, backgroundColor: '#FFFFFF', fontSize: 12 },
  filtersTextInputContent: { fontSize: 12, fontWeight: '800', color: '#0F172A' },
  filtersInnerTextInput: { height: 40, minHeight: 40, backgroundColor: 'transparent', margin: 0, padding: 0 },
  filtersInnerTextInputContent: { minHeight: 40, height: 40, paddingHorizontal: 0, paddingVertical: 0, fontSize: 12, fontWeight: '800', color: '#0F172A' },
  filtersInputOutline: { borderRadius: 4, borderColor: '#CBD5E1' },
  filtersSuggestions: { marginTop: 3, borderWidth: 1, borderColor: '#D8E2F0', borderRadius: 4, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  filtersSuggestionItem: { minHeight: 34, paddingVertical: 0 },
  filtersSuggestionTitle: { fontSize: 11.5, fontWeight: '800', color: '#0F172A' },
  filtersAmountRow: { flexDirection: 'row', gap: 6 },
  filtersAmountInput: { flex: 1 },
  filtersToggle: { height: 42, borderRadius: 4, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  filtersToggleActive: { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' },
  filtersToggleText: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: '800', color: '#334155' },
  filtersToggleTextActive: { color: '#1D4ED8' },
  filtersSheetSpacer: { flex: 1 },
  filtersSheetActions: { flexDirection: 'row', gap: 6 },
  filtersSheetActionButton: { flex: 1, borderRadius: 4, borderColor: '#CBD5E1' },
  filtersSheetActionContent: { height: 34 },
  filtersSheetActionLabel: { fontSize: 12, fontWeight: '900', marginVertical: 0 },
  ordersTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ordersTitle: { fontSize: 16, fontWeight: '900', color: '#0F172A' },
  ordersSubtitle: { marginTop: 1, fontSize: 10.5, fontWeight: '700', color: '#64748B' },
  ordersCompactToolbarRow: { minHeight: 34, flexDirection: 'row', gap: 4, alignItems: 'center' },
  ordersSearchbar: { flex: 1, height: 34, backgroundColor: '#FFFFFF', borderRadius: 4, borderWidth: 1, borderColor: '#CBD5E1', elevation: 0 },
  ordersSearchbarInput: { minHeight: 0, marginLeft: -8, paddingLeft: 0, fontSize: 13, color: '#0F172A', fontWeight: '700' },
  ordersActionRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  ordersIconButton: { width: 34, height: 34, margin: 0, borderRadius: 4, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' },
  ordersIconButtonPrimary: { borderColor: '#16A34A', backgroundColor: '#16A34A' },
  ordersPrimaryButton: { width: 30, minWidth: 30, borderRadius: 4 },
  ordersSecondaryButton: { width: 30, minWidth: 30, borderRadius: 4, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' },
  ordersButtonContent: { width: 30, height: 30, paddingHorizontal: 0 },
  ordersPrimaryButtonLabel: { fontSize: 10.5, fontWeight: '900', marginVertical: 0, marginHorizontal: 0 },
  ordersSecondaryButtonLabel: { fontSize: 10.5, fontWeight: '900', marginVertical: 0, marginHorizontal: 0, color: '#2563EB' },
  ordersTotalRow: { minHeight: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  ordersTotalText: { fontSize: 9.5, color: '#64748B', fontWeight: '900', textTransform: 'uppercase' },
  ordersStatsRow: { flexDirection: 'row', gap: 5 },
  orderStat: { flex: 1, minHeight: 28, borderRadius: 4, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderStatValue: { fontSize: 13, fontWeight: '900', color: '#0F172A', lineHeight: 15 },
  orderStatLabel: { fontSize: 9.5, fontWeight: '800', color: '#64748B', textTransform: 'uppercase' },
  orderCardPaper: { borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', borderRadius: 0, overflow: 'hidden', borderTopWidth: 0 },
  orderCardContentPaper: { padding: 0, paddingHorizontal: 0, paddingVertical: 0, flexDirection: 'row' },
  orderStatusRail: { width: 3, backgroundColor: '#E2E8F0' },
  orderStatusRailSelected: { backgroundColor: '#2563EB' },
  orderCardBody: { flex: 1, minWidth: 0, paddingLeft: 6, paddingRight: 5, paddingVertical: 5, gap: 2 },
  orderCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  orderCard: { borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', padding: 12, gap: 7 },
  orderCardSelected: { borderColor: '#BFDBFE', backgroundColor: '#F8FBFF' },
  orderTitle: { flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: '900', color: '#0F172A', lineHeight: 15 },
  orderAmount: { maxWidth: 94, fontSize: 10.8, fontWeight: '900', color: '#2563EB' },
  orderStatusBadge: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 999, paddingHorizontal: 0, paddingVertical: 0 },
  orderStatusText: { fontSize: 9.5, fontWeight: '900' },
  orderStatusNeutral: { backgroundColor: '#F1F5F9' },
  orderStatusNeutralText: { color: '#334155' },
  orderStatusInfo: { backgroundColor: '#DBEAFE' },
  orderStatusInfoText: { color: '#1D4ED8' },
  orderStatusSuccess: { backgroundColor: '#DCFCE7' },
  orderStatusSuccessText: { color: '#166534' },
  orderStatusDanger: { backgroundColor: '#FEE2E2' },
  orderStatusDangerText: { color: '#B91C1C' },
  orderCounterparty: { fontSize: 10.5, color: '#334155', fontWeight: '800', lineHeight: 12.5 },
  orderMetaRow: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  orderMetaCompact: { fontSize: 9, color: '#64748B', fontWeight: '800' },
  orderMetricsRow: { flexDirection: 'row', gap: 6 },
  orderMetric: { flex: 1, minWidth: 0, borderRadius: 6, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 7, paddingVertical: 5 },
  orderMetricLabel: { fontSize: 9, fontWeight: '900', color: '#64748B', textTransform: 'uppercase' },
  orderMetricValue: { marginTop: 2, fontSize: 11.5, fontWeight: '900', color: '#0F172A' },
  orderUpdated: { flex: 1, minWidth: 0, fontSize: 9, color: '#94A3B8', fontWeight: '700' },
  orderMeta: { fontSize: 12, color: '#64748B', fontWeight: '700' },
  loadMoreButton: { marginTop: 8, borderRadius: 4, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' },
  pillPaper: { backgroundColor: '#F1F5F9' },
  pill: { borderRadius: 999, backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 4 },
  pillText: { fontSize: 11, color: '#334155', fontWeight: '800' },
  pillSuccess: { backgroundColor: '#DCFCE7' },
  pillDanger: { backgroundColor: '#FEE2E2' },
  pillSuccessText: { color: '#166534' },
  pillDangerText: { color: '#B91C1C' },
  selection: { borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', overflow: 'hidden' },
  selectionCompact: { paddingVertical: 7 },
  selectionContentPaper: { padding: 12, gap: 4 },
  selectionRipple: { paddingHorizontal: 12, paddingVertical: 10 },
  selectionLabel: { fontSize: 10, color: '#64748B', fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.4 },
  selectionValue: { fontSize: 14, color: '#0F172A', fontWeight: '900' },
  selectionValueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailsButton: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  detailsButtonPaper: { margin: 0 },
  lineList: { flex: 1, backgroundColor: '#F8FAFC', paddingTop: 4, gap: 4 },
  productPreviewCard: { minHeight: 86, borderTopLeftRadius: 14, borderBottomLeftRadius: 14, borderTopRightRadius: 0, borderBottomRightRadius: 0, backgroundColor: '#FFFFFF', overflow: 'hidden', flexDirection: 'row', alignItems: 'stretch', borderWidth: 0 },
  productPreviewCardInvalid: { borderWidth: 1, borderColor: '#EF4444', backgroundColor: '#FFF7F7' },
  productPreviewMedia: { width: 96, alignSelf: 'stretch', backgroundColor: '#F3F4F6', borderTopLeftRadius: 14, borderBottomLeftRadius: 14, overflow: 'hidden', borderRightWidth: 1, borderRightColor: '#E2E8F0' },
  productPreviewIndexBadge: { position: 'absolute', top: 3, left: 3, minWidth: 32, height: 30, borderRadius: 6, backgroundColor: 'rgba(243,244,246,0.82)', alignItems: 'center', justifyContent: 'center' },
  productPreviewIndex: { color: 'rgba(37,99,235,0.78)', fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 18 },
  productPreviewImage: { width: 96, height: '100%', backgroundColor: '#F3F4F6' },
  productImagePlaceholder: { borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  productPreviewBody: { flex: 1, minWidth: 0, justifyContent: 'center', paddingLeft: 12, paddingRight: 10, paddingVertical: 8, gap: 3 },
  productPreviewTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  productPreviewTitle: { color: '#001333', fontSize: 14, fontWeight: '500', lineHeight: 18, paddingRight: 28 },
  productPreviewRemoveButton: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  productPreviewMeta: { color: '#64748B', fontSize: 11.5, fontWeight: '400', lineHeight: 15, paddingRight: 2 },
  productPreviewBottomRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  productPreviewFormula: { flex: 1, minWidth: 0, color: '#64748B', fontSize: 11.5, fontWeight: '400', lineHeight: 15 },
  productPreviewFormulaStrong: { color: '#475569', fontSize: 11.5, fontWeight: '600', lineHeight: 15 },
  productPreviewTotal: { maxWidth: 96, color: '#001333', fontSize: 11.5, fontWeight: '600', lineHeight: 15, textAlign: 'right' },
  addProductListCard: { minHeight: 72, borderTopLeftRadius: 14, borderBottomLeftRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: '#93C5FD', backgroundColor: '#F8FBFF', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  addProductListText: { color: '#2563EB', fontSize: 13, fontWeight: '800' },
  productEditorSheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 0, paddingTop: 0, overflow: 'hidden', shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: -4 } },
  productEditorScroll: { flex: 1, minHeight: 0 },
  productEditorContent: { paddingTop: 8, paddingBottom: 10, gap: 10 },
  productEditorHeaderBlock: { borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  productEditorMediaRow: { minHeight: 126, flexDirection: 'row', alignItems: 'stretch', paddingRight: 8 },
  productEditorImageWrap: { width: 126, minHeight: 126, position: 'relative', overflow: 'hidden', backgroundColor: '#F3F4F6', borderTopLeftRadius: 18, borderRightWidth: 1, borderRightColor: '#E2E8F0' },
  productEditorImage: { width: '100%', height: '100%', minHeight: 126, borderRadius: 0, backgroundColor: '#F3F4F6' },
  productEditorCloseButton: { position: 'absolute', top: 5, right: 5, width: 28, height: 28, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  productEditorInfo: { flex: 1, minWidth: 0, paddingLeft: 11, paddingRight: 30, paddingVertical: 11, justifyContent: 'center', gap: 9 },
  productEditorInfoRow: { gap: 1 },
  productEditorInfoLabel: { color: '#64748B', fontSize: 9.5, lineHeight: 12, fontWeight: '800', textTransform: 'uppercase' },
  productEditorInfoValue: { color: '#0F172A', fontSize: 12, lineHeight: 15, fontWeight: '800' },
  productEditorTitle: { color: '#0F172A', fontSize: 15, fontWeight: '800', lineHeight: 19, paddingHorizontal: 12, paddingVertical: 9 },
  productEditorLabel: { color: '#64748B', fontSize: 11, lineHeight: 14, fontWeight: '800', textTransform: 'uppercase' },
  productEditorFieldsRow: { paddingHorizontal: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  productEditorAdaptiveField: { flexGrow: 0, flexShrink: 0, gap: 5 },
  productEditorQtyStepper: { width: '100%', height: 44, borderRadius: 5, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  productEditorQtyButton: { width: 36, height: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  productEditorQtyInput: { flex: 1, height: 42, minHeight: 42, backgroundColor: '#FFFFFF', textAlign: 'center' },
  productEditorQtyInputContent: { height: 42, paddingHorizontal: 0, fontSize: 18, color: '#0F172A', fontWeight: '800', textAlign: 'center' },
  productEditorInputOutline: { borderWidth: 0, borderRadius: 0, borderColor: 'transparent' },
  productEditorPackageRow: { width: '100%', height: 44, borderRadius: 5, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', flexDirection: 'row', overflow: 'hidden', padding: 2 },
  productEditorPackageReadonly: { width: '100%', height: 44, borderRadius: 5, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  productEditorPackageReadonlyText: { color: '#64748B', fontSize: 11, fontWeight: '800' },
  productEditorPackageButton: { flex: 1, minWidth: 0, height: 38, borderRadius: 3, borderWidth: 1, borderColor: 'transparent', backgroundColor: 'transparent', paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  productEditorPackageButtonActive: { borderColor: '#2563EB', backgroundColor: '#FFFFFF' },
  productEditorPackageText: { color: '#64748B', fontSize: 11, fontWeight: '700' },
  productEditorPackageTextActive: { color: '#2563EB', fontWeight: '900' },
  productEditorPriceBox: { height: 44, borderRadius: 5, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', paddingRight: 3 },
  productEditorPriceBoxInvalid: { borderColor: '#DC2626', backgroundColor: '#FEF2F2' },
  productEditorPriceInput: { flex: 1, height: 42, minHeight: 42, backgroundColor: 'transparent' },
  productEditorPriceInputContent: { height: 42, paddingHorizontal: 7, fontSize: 17, color: '#0F172A', fontWeight: '800', textAlign: 'center' },
  productEditorCurrency: { marginRight: 7, color: '#64748B', fontSize: 16, fontWeight: '700' },
  productEditorPriceReset: { width: 32, height: 36, borderLeftWidth: 1, borderLeftColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  productEditorFooter: { borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingTop: 9, paddingBottom: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  productEditorFooterTotalWrap: { flex: 1, minWidth: 0, gap: 4 },
  productEditorFooterTotalLabel: { color: '#2563EB', fontSize: 11, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase' },
  productEditorFooterTotalRow: { height: 44, justifyContent: 'center' },
  productEditorFooterTotal: { color: '#0F172A', fontSize: 24, lineHeight: 28, fontWeight: '900' },
  productEditorFooterQuantity: { flexGrow: 0, flexShrink: 0, marginLeft: 'auto', gap: 4 },
  lineHeaderRow: { minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6, paddingVertical: 4, backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  lineHeaderText: { fontSize: 9, color: '#64748B', fontWeight: '900', textTransform: 'uppercase' },
  lineHeaderNo: { width: 36 },
  lineHeaderTitle: { flex: 1 },
  lineHeaderQty: { width: 74, textAlign: 'center' },
  lineHeaderTotal: { width: 90, textAlign: 'right' },
  lineHeaderPack: { width: 82, textAlign: 'center' },
  lineHeaderPriceType: { flex: 1, textAlign: 'left' },
  lineHeaderPrice: { width: 84, textAlign: 'center' },
  lineCardPaper: { borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  productFlatCard: { marginHorizontal: 4, marginTop: 4, borderWidth: 1, borderColor: '#D8E2F0', borderRadius: 5, backgroundColor: '#FFFFFF', padding: 7, gap: 8 },
  productCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  productTitleBlock: { flex: 1, minWidth: 0 },
  productTitleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  productCardTitle: { flex: 1, minWidth: 0, color: '#0F172A', fontWeight: '900', fontSize: 12, lineHeight: 15 },
  productCardMeta: { marginTop: 2, marginLeft: 21, fontSize: 10, color: '#64748B', fontWeight: '800', lineHeight: 12 },
  productTotalBlock: { maxWidth: 112, alignItems: 'flex-end', paddingTop: 1 },
  productTotalLabel: { fontSize: 8.5, color: '#64748B', fontWeight: '900', textTransform: 'uppercase' },
  productTotalValue: { marginTop: 2, color: '#2563EB', fontWeight: '900', fontSize: 12, lineHeight: 14 },
  productDeleteButton: { width: 24, height: 24, borderRadius: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  lineCardContentPaper: { paddingHorizontal: 6, paddingVertical: 6 },
  lineRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  lineTopCompact: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  lineDeletePaper: { width: 20, height: 20, margin: 0, marginLeft: -2 },
  lineDeleteFlat: { width: 22, height: 28, alignItems: 'center', justifyContent: 'center' },
  lineDeleteCompact: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', marginLeft: -2 },
  lineNoCompact: { width: 15, color: '#64748B', fontWeight: '900', fontSize: 10.5, textAlign: 'center' },
  productFlatIndex: { minWidth: 16, height: 16, borderRadius: 4, backgroundColor: '#EFF6FF', color: '#2563EB', fontSize: 9.5, fontWeight: '900', textAlign: 'center', lineHeight: 16 },
  lineTitleCompact: { color: '#111827', fontWeight: '900', fontSize: 11.5, lineHeight: 14 },
  lineMetaCompact: { marginTop: 1, fontSize: 10, color: '#64748B', fontWeight: '700' },
  lineTotalCompact: { width: 88, color: '#2563EB', fontWeight: '900', fontSize: 11.5, paddingLeft: 4, textAlign: 'right' },
  lineControlsRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 42, paddingTop: 6 },
  lineControlsGrid: { marginTop: 6, paddingLeft: 42, flexDirection: 'row', alignItems: 'flex-start', gap: 5, flexWrap: 'wrap' },
  productControlsGrid: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 7 },
  productControl: { width: '31%', minWidth: 82, gap: 3 },
  productControlWide: { width: '44%', minWidth: 126, gap: 3 },
  productControlFull: { flex: 1, minWidth: 148, gap: 3 },
  productQtyStepper: { height: 32, flexDirection: 'row', alignItems: 'center', gap: 2 },
  productStepperButton: { width: 27, height: 30, borderRadius: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  productQtyInput: { backgroundColor: '#FFFFFF', textAlign: 'center', fontSize: 11.5 },
  productPriceInput: { height: 32, backgroundColor: '#FFFFFF', fontSize: 11.5 },
  productInputOutline: { borderRadius: 4, borderColor: '#CBD5E1' },
  productStaticField: { height: 32, borderRadius: 4, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  productSelectField: { height: 32, borderRadius: 4, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', paddingHorizontal: 8, justifyContent: 'center' },
  productPriceTypeRow: { height: 32, flexDirection: 'row', alignItems: 'center', gap: 4 },
  productPriceTypeField: { flex: 1, minWidth: 0 },
  productResetButton: { width: 30, height: 32, borderRadius: 4, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  productFieldText: { color: '#0F172A', fontSize: 10.5, fontWeight: '900' },
  lineControlCell: { gap: 2 },
  lineControlCellPack: { minWidth: 56 },
  lineControlCellPriceType: { flex: 1, minWidth: 118 },
  lineControlCellPrice: { minWidth: 74 },
  lineControlLabel: { fontSize: 8.5, color: '#64748B', fontWeight: '900', textTransform: 'uppercase' },
  stepperCompact: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  stepButtonPaper: { margin: 0, borderWidth: 0, backgroundColor: '#FFFFFF' },
  stepButtonCompact: { borderRadius: 7, borderWidth: 1, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  stepTextCompact: { fontSize: 15, color: '#334155', fontWeight: '900' },
  smallInputPaper: { backgroundColor: '#FFFFFF', textAlign: 'center', fontSize: 11.5 },
  smallInputOutlinePaper: { borderRadius: 4, borderColor: '#CBD5E1' },
  invalidInputOutline: { borderColor: '#DC2626' },
  smallInputCompact: { flex: 1, borderRadius: 7, borderWidth: 1, borderColor: '#CBD5E1', textAlign: 'center', fontWeight: '900', fontSize: 12, color: '#0F172A', backgroundColor: '#FFFFFF', paddingHorizontal: 4, paddingVertical: 0 },
  compactField: { borderRadius: 4, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 4 },
  compactStaticField: { backgroundColor: '#F8FAFC', alignSelf: 'flex-start' },
  compactButtonPaper: { borderRadius: 4, justifyContent: 'center' },
  compactButtonContent: { paddingHorizontal: 6 },
  compactButtonLabel: { fontSize: 10, fontWeight: '800', marginHorizontal: 0, marginVertical: 0 },
  compactPackField: { justifyContent: 'space-between' },
  compactPriceTypeField: { flex: 1, justifyContent: 'space-between' },
  compactFieldText: { flex: 1, fontSize: 10.5, color: '#0F172A', fontWeight: '800' },
  priceTypeButtonWrap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  priceTypeButtonPaper: { flex: 1, minWidth: 0, borderRadius: 4 },
  compactResetButton: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  compactResetButtonPaper: { width: 24, height: 24, margin: 0, marginLeft: 2 },
  smallPriceInputPaper: { backgroundColor: '#FFFFFF', fontSize: 11.5 },
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
  itemsFlatSection: { flex: 1, backgroundColor: '#FFFFFF' },
  itemsToolbarWrap: { position: 'relative', backgroundColor: '#FFFFFF', zIndex: 30 },
  itemsFlatToolbar: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFFFFF', zIndex: 2 },
  itemsSearchFlat: { flex: 1, height: 34, backgroundColor: '#FFFFFF', borderRadius: 4, borderWidth: 1, borderColor: '#CBD5E1', elevation: 0 },
  itemsSearchFlatInput: { minHeight: 0, marginLeft: -8, paddingLeft: 0, fontSize: 13, color: '#0F172A', fontWeight: '800' },
  itemsToolbarButton: { width: 34, height: 34, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  itemsToolbarButtonSuccess: { backgroundColor: '#16A34A' },
  itemsToolbarButtonDanger: { backgroundColor: '#DC2626' },
  itemsSearchResults: { position: 'absolute', top: 38, left: 0, right: 0, zIndex: 30, elevation: 12, maxHeight: 224, borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: 'rgba(255,255,255,0.94)', overflow: 'hidden', shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  itemsSearchResultsScroll: { maxHeight: 224 },
  itemsSearchStateRow: { minHeight: 34, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemsSearchStateText: { paddingHorizontal: 8, paddingVertical: 8, color: '#64748B', fontSize: 11.5, fontWeight: '800' },
  itemsSearchErrorText: { paddingHorizontal: 8, paddingVertical: 8, color: '#B91C1C', fontSize: 11.5, fontWeight: '800' },
  itemsSearchResultRow: { minHeight: 42, paddingHorizontal: 8, paddingVertical: 5, borderTopWidth: 1, borderTopColor: '#EEF2F7', flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemsSearchResultIcon: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  itemsSearchResultTextWrap: { flex: 1, minWidth: 0 },
  itemsSearchResultTitle: { color: '#0F172A', fontSize: 12, fontWeight: '900', lineHeight: 15 },
  itemsSearchResultMeta: { marginTop: 1, color: '#64748B', fontSize: 10.5, fontWeight: '700', lineHeight: 13 },
  itemsSearchLoadMoreSpacer: { height: 8 },
  itemsSummaryRow: { minHeight: 24, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  itemsSummaryText: { fontSize: 10, fontWeight: '900', color: '#64748B', textTransform: 'uppercase' },
  itemsSummaryTotal: { fontSize: 12, fontWeight: '900', color: '#2563EB' },
  searchbar: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', elevation: 0 },
  searchbarInput: { minHeight: 0, fontSize: 14, color: '#0F172A' },
  pickerToolbar: { paddingHorizontal: 8, paddingTop: 6, paddingBottom: 4, gap: 6 },
  pickerBottomSheetWrap: { position: 'absolute', zIndex: 14, bottom: 0 },
  pickerBottomSheet: { width: '100%', height: '100%', borderTopLeftRadius: 8, borderTopRightRadius: 8, borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: '#FFFFFF', paddingTop: 5, paddingBottom: FLOATING_TAB_BAR_HEIGHT + FLOATING_TAB_BAR_BOTTOM_OFFSET + 8, gap: 0, shadowColor: '#0F172A', shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: -6 }, elevation: 14 },
  pickerBottomSheetHandle: { alignSelf: 'center', width: 34, height: 3, borderRadius: 999, backgroundColor: '#CBD5E1', marginBottom: 5 },
  pickerBottomSheetHeader: { height: 34, paddingLeft: 10, paddingRight: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  pickerBottomSheetTitleRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 },
  pickerBottomSheetTitle: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '900', color: '#0F172A', textTransform: 'uppercase' },
  pickerBottomSheetClose: { width: 28, height: 28, borderRadius: 4, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  pickerBottomSheetBody: { flex: 1, minHeight: 0, gap: 0 },
  pickerSearchInput: {},
  pickerScroll: { flex: 1, minHeight: 0 },
  pickerSearchFlat: { height: 34, backgroundColor: '#FFFFFF', borderRadius: 4, borderWidth: 1, borderColor: '#CBD5E1', elevation: 0 },
  pickerSearchInputFlat: { minHeight: 0, marginLeft: -8, paddingLeft: 0, fontSize: 13, color: '#0F172A', fontWeight: '800' },
  pickerListContent: { paddingBottom: 20, flexGrow: 1 },
  pickerFlatRow: { minHeight: 54, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#FFFFFF', paddingLeft: 10, paddingRight: 8, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickerFlatTextWrap: { flex: 1, minWidth: 0 },
  pickerFlatTitle: { color: '#0F172A', fontSize: 12.5, fontWeight: '900', lineHeight: 15 },
  pickerFlatMeta: { marginTop: 1, color: '#64748B', fontSize: 10.5, fontWeight: '800', lineHeight: 12.5 },
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
  referenceScroll: { flex: 1, minHeight: 0 },
  referenceSheetContent: { gap: 8, paddingBottom: 10 },
  referenceRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  referenceLabel: { width: 120, color: '#64748B', fontWeight: '900', fontSize: 12 },
  referenceValue: { flex: 1, color: '#0F172A', fontWeight: '700', fontSize: 12 },
  error: { color: '#B91C1C', backgroundColor: '#FEE2E2', borderRadius: 10, padding: 10, fontWeight: '800' },
  warning: { color: '#92400E', backgroundColor: '#FEF3C7', borderRadius: 10, padding: 10, fontWeight: '800' },
  dialogPaper: { borderRadius: 16, backgroundColor: '#FFFFFF' },
  modalBackdropPaper: { flex: 1, margin: 0, justifyContent: 'flex-end' },
  modalBackdropPaperFull: { justifyContent: 'flex-end' },
  modalSheetPaper: { maxHeight: '86%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  modalSheetPaperFull: { height: '100%', borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  sheetHeader: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 8 },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: '#111827' },
  sheetCloseButton: { margin: 0 },
  sheetBody: { flex: 1, minHeight: 0, padding: 14, gap: 12 },
});
