import TabBarSpacer from '@/components/Navigation/TabBarSpacer';
import {
  FLOATING_TAB_BAR_BOTTOM_OFFSET,
  FLOATING_TAB_BAR_HEIGHT,
} from '@/components/Navigation/FloatingTabBar';
import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';
import { useOptionalTabBarVisibility } from '@/components/Navigation/TabBarVisibilityContext';
import { useNotificationViewport } from '@/context/NotificationViewportContext';
import DateTimeInput from '@/components/ui/DateTimeInput';
import { LiquidGlassSurface } from '@/components/ui/LiquidGlassSurface';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useServicesHeaderSlot } from '@/src/features/services/headerSlotContext';
import {
  computeLineTotal,
  formatDateTime,
  formatMoney,
  getClientOrdersResponsiveMetrics,
  buildNewItem,
  isValidManualPriceValue,
  isValidQuantityValue,
  isWeightDraftItem,
  normalizePriceInput,
  normalizeQuantityInput,
  resolveClientOrdersEditorTier,
  resolveClientOrdersLayoutTier,
  STATUS_LABELS,
  type DraftItem,
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
import { Animated, findNodeHandle, Image, Keyboard, LayoutAnimation, PanResponder, Platform, Pressable, ScrollView, StyleSheet, TextInput, UIManager, useWindowDimensions, View } from 'react-native';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Button as PaperButton,
  Checkbox,
  IconButton as PaperIconButton,
  List,
  Menu,
  Portal,
  Surface,
  Text,
  TextInput as PaperTextInput,
} from 'react-native-paper';
import {
  ConfirmDialog,
  InfoText,
  Pill,
  PickerBottomSheet,
  PickerBottomSheetScrollView,
  PickerBottomSheetTextInput,
  SheetModal,
} from './screen/mobile/ClientOrdersMobileUi';

type ScreenMode = 'orders' | 'editor';
type EditorSection = 'header' | 'items';
type DocumentOpeningState = 'new' | 'existing' | null;
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
  hideCancel?: boolean;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onAlternate?: () => void | Promise<void>;
} | null;

const PAGE_SIZE = 25;
const ITEMS_SEARCH_PAGE_SIZE = 10;
const IN_STOCK_KEY = 'clientOrders.productPicker.inStockOnly';
const SheetScrollView = (PickerBottomSheetScrollView || ScrollView) as any;
const SheetTextInput = (PickerBottomSheetTextInput || TextInput) as any;
const DOCUMENT_HEADER_TRANSITION = {
  duration: 320,
  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  update: { type: LayoutAnimation.Types.easeInEaseOut },
  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
};
const DOCUMENT_ITEMS_TOOLBAR_HEIGHT_DELTA = 51;
const LINE_ITEM_SCROLL_ESTIMATE = 116;
const IS_NEW_ARCHITECTURE = !!(globalThis as any).nativeFabricUIManager;
type FilterKeyboardFieldKey = 'deliveryDates' | 'updatedDates' | 'amount' | 'items' | 'counterparty' | 'warehouse' | 'priceType';
type FilterKeyboardInputRef = React.RefObject<any>;
type WindowRect = { x: number; y: number; width: number; height: number };

const withColorOpacity = (color: string, opacity: number) => {
  if (!color.startsWith('#')) return color;
  const hex = color.replace('#', '');
  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((part) => part + part)
          .join('')
      : hex;
  const int = Number.parseInt(normalized, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

function measureTargetInWindow(target: unknown, onMeasured: (rect: WindowRect) => void) {
  if (!target) return;
  const maybeNode = typeof target === 'number' ? target : findNodeHandle(target as any);
  const targetWithMeasure = target as { measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void };
  if (typeof targetWithMeasure.measureInWindow === 'function') {
    try {
      targetWithMeasure.measureInWindow((x, y, width, height) => onMeasured({ x, y, width, height }));
      return;
    } catch {
      // Fabric requires measureInWindow to keep its native receiver; fall back to UIManager below.
    }
  }
  if (!maybeNode) return;
  try {
    UIManager.measureInWindow(maybeNode, (x, y, width, height) => onMeasured({ x, y, width, height }));
  } catch {
    return;
  }
}

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
function linePackageShortLabel(item: any) {
  const selectedPack = item?.packageGuid
    ? (item?.packages || []).find((pack: any) => pack.guid === item.packageGuid)
    : null;
  if (selectedPack) {
    return selectedPack.name || selectedPack.unit?.symbol || selectedPack.unit?.name || unitLabel(item?.baseUnit);
  }
  return unitLabel(item?.baseUnit);
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
function hasPositiveQuantity(item: any) {
  const quantity = Number(String(item?.quantity || '').replace(',', '.'));
  return Number.isFinite(quantity) && quantity > 0;
}
function orderTitle(order: ClientOrder) {
  return order.number1c || order.guid.slice(0, 8);
}

function runDocumentHeaderTransition() {
  LayoutAnimation.configureNext(DOCUMENT_HEADER_TRANSITION);
}

function pickerNeedsCounterparty(kind: PickerKind | null) {
  return kind === 'agreement' || kind === 'contract' || kind === 'deliveryAddress';
}

function pickerShouldAutofocusSearch(kind: PickerKind | null) {
  return kind === 'organization' || kind === 'counterparty' || kind === 'priceType' || kind === 'product';
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
  const { headerBottomOffset, setHeaderBottomOffset } = useNotificationViewport();
  const { setHeaderOverride } = useServicesHeaderSlot();
  const tabBarVisibility = useOptionalTabBarVisibility();
  const setTabBarHidden = tabBarVisibility?.setHidden;
  const background = useThemeColor({}, 'background');
  const card = useThemeColor({}, 'cardBackground');
  const { width, height } = useWindowDimensions();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const layoutTier = resolveClientOrdersLayoutTier(width);
  const editorTier = resolveClientOrdersEditorTier(width);
  const ui = getClientOrdersResponsiveMetrics(layoutTier, editorTier);
  const [mode, setMode] = React.useState<ScreenMode>('orders');
  const [section, setSection] = React.useState<EditorSection>('header');
  const [openingDocument, setOpeningDocument] = React.useState<DocumentOpeningState>(null);
  const [openingOrderGuid, setOpeningOrderGuid] = React.useState<string | null>(null);
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
  const [confirmDialog, setConfirmDialog] = React.useState<ConfirmDialogState>(null);
  const [editingItemKey, setEditingItemKey] = React.useState<string | null>(null);
  const [pendingProductItem, setPendingProductItem] = React.useState<DraftItem | null>(null);
  const [referenceOpen, setReferenceOpen] = React.useState(false);
  const [referenceLoading, setReferenceLoading] = React.useState(false);
  const [referenceError, setReferenceError] = React.useState<string | null>(null);
  const [referenceDetails, setReferenceDetails] = React.useState<ClientOrderReferenceDetails | null>(null);
  const [referenceScrollOffset, setReferenceScrollOffset] = React.useState(0);
  const [editorKeyboardVisible, setEditorKeyboardVisible] = React.useState(false);
  const editorScrollRef = React.useRef<any>(null);
  const editorKeyboardTopRef = React.useRef<number | null>(null);
  const editorFocusedTargetRef = React.useRef<unknown>(null);
  const editorFocusTimersRef = React.useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const pickerRequestIdRef = React.useRef(0);
  const pickerLoadSignatureRef = React.useRef('');
  const pickerAppendLoadingRef = React.useRef(false);
  const pickerSearchInputRef = React.useRef<any>(null);
  const pickerListRef = React.useRef<any>(null);
  const itemsSearchRequestIdRef = React.useRef(0);
  const itemsSearchLoadingMoreRef = React.useRef(false);
  const itemsSearchBlurTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lineItemLayoutYRef = React.useRef<Record<string, number>>({});
  const pendingScrollItemKeyRef = React.useRef<string | null>(null);
  const openingOrderRequestIdRef = React.useRef(0);
  const ordersEntrance = React.useRef(new Animated.Value(0)).current;
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
  const editorKeyboardPadding = Math.min(460, Math.max(320, Math.round(height * 0.42)));
  const activeOrderFilterCount = countActiveOrderFilters(workspace.filters);
  const showEmptyOrdersLoading = workspace.loadingOrders && !workspace.orders.length;
  const showInitialOrdersSkeleton = showEmptyOrdersLoading && activeOrderFilterCount === 0;
  const ordersEntranceStyle = React.useMemo(
    () => ({
      opacity: ordersEntrance,
      transform: [
        {
          translateY: ordersEntrance.interpolate({
            inputRange: [0, 1],
            outputRange: [8, 0],
          }),
        },
      ],
    }),
    [ordersEntrance]
  );

  React.useEffect(() => {
    if (mode !== 'orders') return;
    ordersEntrance.setValue(0);
    Animated.timing(ordersEntrance, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [mode, ordersEntrance]);
  React.useEffect(() => {
    setTabBarHidden?.(mode === 'editor');
    return () => setTabBarHidden?.(false);
  }, [mode, setTabBarHidden]);
  React.useEffect(() => {
    if (Platform.OS === 'android' && !IS_NEW_ARCHITECTURE) {
      UIManager.setLayoutAnimationEnabledExperimental?.(true);
    }
  }, []);
  React.useEffect(() => {
    if (!openingDocument) return undefined;
    if (openingDocument === 'new') {
      if (mode !== 'editor' || workspace.loadingSettings || workspace.loadingDefaults) return undefined;
      const timer = setTimeout(() => setOpeningDocument(null), 180);
      return () => clearTimeout(timer);
    }
    if (
      mode === 'editor' &&
      !workspace.loadingDetail &&
      (!workspace.selectedGuid || workspace.selectedOrder?.guid === workspace.selectedGuid)
    ) {
      setOpeningDocument(null);
    }
    return undefined;
  }, [
    mode,
    openingDocument,
    workspace.loadingDefaults,
    workspace.loadingDetail,
    workspace.loadingSettings,
    workspace.selectedGuid,
    workspace.selectedOrder?.guid,
  ]);

  const clearEditorFocusTimers = React.useCallback(() => {
    editorFocusTimersRef.current.forEach((timer) => clearTimeout(timer));
    editorFocusTimersRef.current = [];
  }, []);

  const scrollEditorInputIntoView = React.useCallback((target: unknown) => {
    const keyboardTop = editorKeyboardTopRef.current;
    if (keyboardTop === null) return;
    const scrollView = editorScrollRef.current;
    const scrollResponder = scrollView?.getScrollResponder?.() || scrollView;
    measureTargetInWindow(target, (rect) => {
      const fieldBottom = rect.y + rect.height;
      const visibleBottom = keyboardTop - 24;
      if (fieldBottom <= visibleBottom) return;
      setEditorKeyboardVisible(true);
      if (scrollResponder?.scrollResponderScrollNativeHandleToKeyboard && target) {
        try {
          scrollResponder.scrollResponderScrollNativeHandleToKeyboard(target, 180, true);
        } catch {
          scrollView?.scrollToEnd?.({ animated: true });
        }
        return;
      }
      scrollView?.scrollToEnd?.({ animated: true });
    });
  }, []);

  const scheduleEditorInputScroll = React.useCallback((target: unknown) => {
    editorFocusedTargetRef.current = target;
    clearEditorFocusTimers();
    [0, 80, 180, 320, 520, 760].forEach((delay) => {
      const timer = setTimeout(() => scrollEditorInputIntoView(target), delay);
      editorFocusTimersRef.current.push(timer);
    });
  }, [clearEditorFocusTimers, scrollEditorInputIntoView]);

  const handleHeaderCommentFocus = React.useCallback((targetOrEvent: any) => {
    const target = targetOrEvent?.nativeEvent?.target ?? targetOrEvent;
    scheduleEditorInputScroll(target);
  }, [scheduleEditorInputScroll]);

  React.useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
      editorKeyboardTopRef.current = event.endCoordinates?.screenY ?? null;
      const target = editorFocusedTargetRef.current;
      if (target) {
        scheduleEditorInputScroll(target);
      }
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      editorKeyboardTopRef.current = null;
      editorFocusedTargetRef.current = null;
      setEditorKeyboardVisible(false);
      clearEditorFocusTimers();
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
      clearEditorFocusTimers();
    };
  }, [clearEditorFocusTimers, scheduleEditorInputScroll]);

  React.useEffect(() => { AsyncStorage.getItem(IN_STOCK_KEY).then((v) => setInStockOnly(v === '1')).catch(() => undefined); }, []);
  React.useEffect(() => { void AsyncStorage.setItem(IN_STOCK_KEY, inStockOnly ? '1' : '0'); }, [inStockOnly]);
  React.useEffect(() => () => {
    if (itemsSearchBlurTimerRef.current) clearTimeout(itemsSearchBlurTimerRef.current);
  }, []);

  const scrollPickerListToTop = React.useCallback((animated = false) => {
    const list = pickerListRef.current;
    try {
      if (typeof list?.scrollTo === 'function') {
        list.scrollTo({ y: 0, animated });
      } else if (typeof list?.scrollToOffset === 'function') {
        list.scrollToOffset({ offset: 0, animated });
      }
    } catch {
      return;
    }
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
    requestAnimationFrame(() => scrollPickerListToTop(false));
  }, [scrollPickerListToTop]);

  const handlePickerSearchChange = React.useCallback((value: string) => {
    setPickerSearch(value);
    setPickerScrollOffset(0);
    pickerAppendLoadingRef.current = false;
    requestAnimationFrame(() => scrollPickerListToTop(false));
  }, [scrollPickerListToTop]);

  const loadPickerPage = React.useCallback(async (kind: PickerKind, search: string, offset = 0, append = false) => {
    const signature = `${kind}|${search}|${offset}|${append ? 'append' : 'reset'}|${kind === 'product' && inStockOnly ? 'stock' : 'all'}`;
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
      if (!append) {
        setPickerScrollOffset(0);
        requestAnimationFrame(() => scrollPickerListToTop(false));
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
    scrollPickerListToTop,
  ]);

  React.useEffect(() => {
    if (!pickerKind) return;
    const timeout = setTimeout(() => void loadPickerPage(pickerKind, pickerSearch, 0, false), pickerSearch ? 250 : 0);
    return () => clearTimeout(timeout);
  }, [loadPickerPage, pickerKind, pickerSearch]);
  React.useEffect(() => {
    if (!pickerKind) return undefined;
    if (!pickerShouldAutofocusSearch(pickerKind)) return undefined;
    if (pickerNeedsCounterparty(pickerKind) && !workspace.draft.counterpartyGuid) return undefined;

    const focusSearch = () => {
      pickerSearchInputRef.current?.focus?.();
    };
    const timers = [120, 260, 420, 700].map((delay) => setTimeout(focusSearch, delay));
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, [pickerKind, pickerLoading, workspace.draft.counterpartyGuid]);

  const closePicker = React.useCallback(() => {
    pickerRequestIdRef.current += 1;
    pickerAppendLoadingRef.current = false;
    pickerLoadSignatureRef.current = '';
    setPickerKind(null);
    setLinePriceTarget(null);
  }, []);
  const cancelOpeningOrder = React.useCallback(() => {
    if (!openingOrderGuid) return false;
    openingOrderRequestIdRef.current += 1;
    workspace.cancelDetailLoading?.();
    setOpeningOrderGuid(null);
    setOpeningDocument(null);
    return true;
  }, [openingOrderGuid, workspace]);
  const closeDocumentToOrders = React.useCallback(() => {
    void workspace.confirmDiscardIfNeeded().then((canLeave: boolean) => {
      if (!canLeave) return;
      setOpeningDocument(null);
      runDocumentHeaderTransition();
      setMode('orders');
      setTimeout(() => {
        void workspace.refreshOrders?.();
      }, 0);
    });
  }, [workspace]);
  const closeTopOverlay = React.useCallback(() => {
    if (cancelOpeningOrder()) {
      return true;
    }
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
    if (mode === 'editor') {
      closeDocumentToOrders();
      return true;
    }
    return false;
  }, [cancelOpeningOrder, closeDocumentToOrders, closePicker, editingItemKey, filtersOpen, mode, pickerKind, referenceOpen]);

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

  const scrollToLineItem = React.useCallback((key: string, fallbackIndex?: number) => {
    const measuredY = lineItemLayoutYRef.current[key];
    const fallbackY = typeof fallbackIndex === 'number' ? fallbackIndex * LINE_ITEM_SCROLL_ESTIMATE : 0;
    const targetY = typeof measuredY === 'number' ? measuredY : fallbackY;
    editorScrollRef.current?.scrollTo?.({ y: Math.max(0, targetY - 8), animated: true });
  }, []);

  const requestScrollToLineItem = React.useCallback((key: string, fallbackIndex?: number) => {
    pendingScrollItemKeyRef.current = key;
    requestAnimationFrame(() => scrollToLineItem(key, fallbackIndex));
    setTimeout(() => scrollToLineItem(key, fallbackIndex), 140);
  }, [scrollToLineItem]);

  const handleLineItemLayout = React.useCallback((key: string, y: number) => {
    lineItemLayoutYRef.current[key] = y;
    if (pendingScrollItemKeyRef.current !== key) return;
    pendingScrollItemKeyRef.current = null;
    requestAnimationFrame(() => scrollToLineItem(key));
  }, [scrollToLineItem]);

  const openProductEditorForProduct = React.useCallback((product: ClientOrderProduct) => {
    if (workspace.readOnly) return;
    const existingIndex = workspace.draft.items.findIndex((line: any) => line.productGuid === product.guid);
    const existingKey = existingIndex >= 0 ? workspace.draft.items[existingIndex]?.key : null;
    setSection('items');
    if (existingKey) {
      setPendingProductItem(null);
      setEditingItemKey(existingKey);
      requestScrollToLineItem(existingKey, existingIndex);
      return;
    }
    setEditingItemKey(null);
    setPendingProductItem({ ...buildNewItem(product), quantity: '0' });
  }, [requestScrollToLineItem, workspace]);

  React.useEffect(() => {
    if (!pendingProductItem || !hasPositiveQuantity(pendingProductItem)) return;
    const targetIndex = workspace.draft.items.length;
    const nextKey = workspace.addDraftItem(pendingProductItem);
    setPendingProductItem(null);
    setEditingItemKey(nextKey);
    requestScrollToLineItem(nextKey, targetIndex);
  }, [pendingProductItem, requestScrollToLineItem, workspace]);

  const productEditorWorkspace = React.useMemo(() => {
    if (!pendingProductItem) return workspace;
    return {
      ...workspace,
      readOnly: false,
      setItemPatch: (lineKey: string, patch: Partial<DraftItem>) => {
        setPendingProductItem((prev) => {
          if (!prev || prev.key !== lineKey) return prev;
          return { ...prev, ...patch };
        });
      },
      resetItemPriceType: (lineKey: string) => {
        setPendingProductItem((prev) => {
          if (!prev || prev.key !== lineKey) return prev;
          return {
            ...prev,
            manualPrice: '',
            priceTypeGuid: workspace.draft.priceTypeGuid ?? null,
            priceTypeName: workspace.draft.priceTypeName ?? null,
          };
        });
      },
    };
  }, [pendingProductItem, workspace]);

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
        setConfirmDialog({
          title: 'Сменить вид цены?',
          message: '',
          confirmLabel: 'Применить',
          onConfirm: () => workspace.setHeaderPriceType(item),
        });
      } else {
        workspace.setHeaderPriceType(item);
      }
    } else if (selectedKind === 'product' && !workspace.readOnly) {
      closePicker();
      openProductEditorForProduct(item as ClientOrderProduct);
    }
  }, [closePicker, linePriceTarget, openProductEditorForProduct, pickerKind, workspace]);

  const createDocument = React.useCallback(async () => {
    setOpeningDocument('new');
    try {
      const opened = await workspace.createDocument();
      if (!opened) {
        setOpeningDocument(null);
        return;
      }
      runDocumentHeaderTransition();
      setSection('header');
      setMode('editor');
    } catch (error) {
      setOpeningDocument(null);
      throw error;
    }
  }, [workspace]);

  const selectOrder = React.useCallback(async (order: ClientOrder) => {
    if (openingOrderGuid) return;
    const requestId = ++openingOrderRequestIdRef.current;
    setOpeningOrderGuid(order.guid);
    try {
      const opened = await workspace.selectOrder(order.guid);
      if (openingOrderRequestIdRef.current !== requestId) return;
      if (!opened) {
        setOpeningOrderGuid(null);
        return;
      }
      runDocumentHeaderTransition();
      setSection('items');
      setMode('editor');
      setOpeningOrderGuid(null);
    } catch (error) {
      if (openingOrderRequestIdRef.current === requestId) {
        setOpeningOrderGuid(null);
      }
      throw error;
    }
  }, [openingOrderGuid, workspace]);

  const removeOrCancel = React.useCallback(() => {
    if (workspace.draftMode || workspace.selectedOrder?.status === 'DRAFT') {
      setConfirmDialog({
        title: 'Удалить черновик?',
        message: '',
        confirmLabel: 'Удалить',
        destructive: true,
        onConfirm: async () => {
          await workspace.deleteDraft();
          setOpeningDocument(null);
          runDocumentHeaderTransition();
          setMode('orders');
        },
      });
      return;
    }
    setConfirmDialog({
      title: 'Отменить заказ?',
      message: '',
      confirmLabel: 'Отменить',
      destructive: true,
      onConfirm: () => workspace.cancelOrderConfirmed(),
    });
  }, [workspace]);

  const submitFromMenu = React.useCallback(() => {
    setActionsMenuOpen(false);
    setConfirmDialog({
      title: 'Отправить в 1С?',
      message: '',
      confirmLabel: 'Отправить',
      onConfirm: () => workspace.submitOrder(),
    });
  }, [workspace]);
  const handleDocumentPrimaryAction = React.useCallback(() => {
    if (workspace.dirty) {
      void workspace.saveDraft({ reason: 'manual' });
      return;
    }
    submitFromMenu();
  }, [submitFromMenu, workspace]);

  const confirmClearItems = React.useCallback(() => {
    if (workspace.readOnly) return;
    setConfirmDialog({
      title: 'Удалить все товары?',
      message: '',
      confirmLabel: 'Удалить',
      destructive: true,
      onConfirm: workspace.clearItems,
    });
  }, [workspace.clearItems, workspace.readOnly]);
  const confirmResetHeaderPriceType = React.useCallback(() => {
    if (workspace.readOnly) return;
    setConfirmDialog({
      title: 'Сбросить вид цены?',
      message: '',
      confirmLabel: 'Сбросить',
      onConfirm: () => workspace.resetHeaderPriceTypeToDefault(),
    });
  }, [workspace]);

  const documentNumber = workspace.draftMode
    ? 'Новый заказ'
    : workspace.selectedOrder?.number1c || workspace.selectedOrder?.guid.slice(0, 8) || workspace.draft.guid?.slice(0, 8) || 'Без номера';
  const documentStatusText = workspace.draftMode ? 'Черновик' : orderStatusLabel(workspace.selectedOrder?.status || 'DRAFT');
  const filteredItems = workspace.draft.items;
  const handleItemsSearchFocus = React.useCallback(() => {
    if (itemsSearchBlurTimerRef.current) clearTimeout(itemsSearchBlurTimerRef.current);
    setItemsSearchFocused(true);
  }, []);
  const handleItemsSearchBlur = React.useCallback(() => {
    if (itemsSearchBlurTimerRef.current) clearTimeout(itemsSearchBlurTimerRef.current);
    itemsSearchBlurTimerRef.current = setTimeout(() => setItemsSearchFocused(false), 160);
  }, []);
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
  const resetItemsSearch = React.useCallback(() => {
    itemsSearchRequestIdRef.current += 1;
    if (itemsSearchBlurTimerRef.current) {
      clearTimeout(itemsSearchBlurTimerRef.current);
      itemsSearchBlurTimerRef.current = null;
    }
    setItemsSearch('');
    setItemsSearchFocused(false);
    setItemsSearchResults([]);
    setItemsSearchError(null);
    setItemsSearchLoading(false);
    setItemsSearchLoadingMore(false);
    itemsSearchLoadingMoreRef.current = false;
    setItemsSearchHasMore(false);
    setItemsSearchOffset(0);
  }, []);
  const addProductFromItemsSearch = React.useCallback((product: ClientOrderProduct) => {
    if (workspace.readOnly) return;
    Keyboard.dismiss();
    resetItemsSearch();
    openProductEditorForProduct(product);
  }, [openProductEditorForProduct, resetItemsSearch, workspace.readOnly]);
  const editingItem = React.useMemo(() => workspace.draft.items.find((item) => item.key === editingItemKey) || null, [editingItemKey, workspace.draft.items]);
  const editingItemIndex = React.useMemo(() => editingItem ? workspace.draft.items.findIndex((item) => item.key === editingItem.key) : -1, [editingItem, workspace.draft.items]);
  React.useEffect(() => {
    if (editingItemKey && !editingItem && !pendingProductItem) setEditingItemKey(null);
  }, [editingItem, editingItemKey, pendingProductItem]);
  const documentHeaderRightSlot = React.useMemo(() => {
    if (mode !== 'editor') return undefined;
    return (
      <DocumentActionsMenu
        styles={styles}
        workspace={workspace}
        actionsMenuOpen={actionsMenuOpen}
        setActionsMenuOpen={setActionsMenuOpen}
        setInspectorOpen={setInspectorOpen}
        submitFromMenu={submitFromMenu}
        removeOrCancel={removeOrCancel}
        compact
      />
    );
  }, [actionsMenuOpen, mode, removeOrCancel, submitFromMenu, workspace]);
  const handleEditorSectionChange = React.useCallback((nextSection: EditorSection) => {
    if (nextSection === section) return;
    runDocumentHeaderTransition();

    const currentHasToolbar = section === 'items' && !workspace.readOnly;
    const nextHasToolbar = nextSection === 'items' && !workspace.readOnly;
    if (currentHasToolbar !== nextHasToolbar && headerBottomOffset > 0) {
      const delta = nextHasToolbar ? DOCUMENT_ITEMS_TOOLBAR_HEIGHT_DELTA : -DOCUMENT_ITEMS_TOOLBAR_HEIGHT_DELTA;
      setHeaderBottomOffset(Math.max(topInset, headerBottomOffset + delta));
    }

    setSection(nextSection);
  }, [headerBottomOffset, section, setHeaderBottomOffset, topInset, workspace.readOnly]);
  const documentHeaderSlot = React.useMemo(() => {
    if (mode !== 'editor') return null;
    return (
      <DocumentHeaderSlot
        styles={styles}
        workspace={workspace}
        section={section}
        setSection={handleEditorSectionChange}
        documentNumber={documentNumber}
        documentStatusText={documentStatusText}
        itemsSearch={itemsSearch}
        setItemsSearch={setItemsSearch}
        searchFocused={itemsSearchFocused}
        onSearchFocus={handleItemsSearchFocus}
        onSearchBlur={handleItemsSearchBlur}
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
    );
  }, [
    addProductFromItemsSearch,
    confirmClearItems,
    documentNumber,
    documentStatusText,
    handleItemsSearchBlur,
    handleItemsSearchFocus,
    handleEditorSectionChange,
    itemsSearch,
    itemsSearchError,
    itemsSearchFocused,
    itemsSearchHasMore,
    itemsSearchLoading,
    itemsSearchLoadingMore,
    itemsSearchResults,
    loadMoreItemsSearchResults,
    mode,
    openPicker,
    section,
    workspace,
  ]);
  const documentHeaderOverride = React.useMemo(() => {
    if (mode !== 'editor') return null;
    return {
      title: 'Заказы клиентов',
      icon: 'receipt-outline',
      showBack: true,
      onBack: closeDocumentToOrders,
      compact: true,
      dense: true,
      horizontalPadding: 6,
      rightSlot: documentHeaderRightSlot,
      bottomSlot: documentHeaderSlot,
      surfaceVisible: true,
      entranceMotion: 'none' as const,
      variant: 'document' as const,
      showServerStatus: false,
    };
  }, [closeDocumentToOrders, documentHeaderRightSlot, documentHeaderSlot, mode]);
  const previousHeaderModeRef = React.useRef(mode);
  React.useEffect(() => {
    if (previousHeaderModeRef.current === mode) return;
    previousHeaderModeRef.current = mode;
    runDocumentHeaderTransition();
  }, [mode]);
  React.useEffect(() => {
    setHeaderOverride(documentHeaderOverride);
  }, [documentHeaderOverride, setHeaderOverride]);
  React.useEffect(() => () => setHeaderOverride(null), [setHeaderOverride]);
  const PickerContentScrollView = SheetScrollView;
  const isProductPicker = pickerKind === 'product';
  const pickerContent = (
    <>
      <View style={styles.pickerToolbar}>
        <View style={styles.pickerSearchRow}>
          <CompactSearchbar
            inputRef={pickerSearchInputRef}
            style={[styles.pickerSearchFlat, isProductPicker && styles.productPickerSearchFlat]}
            inputStyle={styles.pickerSearchInputFlat}
            value={pickerSearch}
            onChangeText={handlePickerSearchChange}
            placeholder={isProductPicker ? 'Поиск товара' : 'Поиск'}
            inputComponent={SheetTextInput}
            autoFocus={pickerShouldAutofocusSearch(pickerKind)}
          />
          {isProductPicker ? (
            <View
              accessibilityRole="checkbox"
              accessibilityState={{ checked: inStockOnly }}
              accessibilityLabel="Показывать только товары с остатком"
              style={[
                styles.productStockToggle,
                inStockOnly && styles.productStockToggleActive,
              ]}
            >
              <Checkbox.Android
                status={inStockOnly ? 'checked' : 'unchecked'}
                onPress={() => setInStockOnly((prev) => !prev)}
                color="#16A34A"
                uncheckedColor="#64748B"
                rippleColor="rgba(22, 163, 74, 0.12)"
              />
            </View>
          ) : null}
        </View>
      </View>
      <PickerContentScrollView ref={pickerListRef} style={styles.pickerScroll} onScroll={handlePickerScroll} scrollEventThrottle={16} nestedScrollEnabled contentContainerStyle={styles.pickerListContent} keyboardShouldPersistTaps="handled">
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
      </PickerContentScrollView>
    </>
  );
  const discardConfirmState = React.useMemo<ConfirmDialogState>(() => {
    if (!discardConfirm.open) return null;
    return {
      title: 'Несохраненные изменения',
      message: '',
      alternateLabel: 'Не сохранять',
      confirmLabel: 'Сохранить',
      hideCancel: true,
      onAlternate: () => closeDiscardConfirm('discard'),
      onConfirm: () => closeDiscardConfirm('save'),
    };
  }, [closeDiscardConfirm, discardConfirm.blockingMessage, discardConfirm.mode, discardConfirm.open]);

  const editorTopPadding = Math.max(topInset, headerBottomOffset || 0);
  const pageTopPadding = mode === 'editor' ? editorTopPadding : Math.max(0, topInset - 18);
  const showItemsSearchOverlay = mode === 'editor' && !workspace.readOnly && section === 'items' && !!itemsSearch.trim() && itemsSearchFocused;
  const itemsSearchOverlayTop = Math.max(topInset + 96, headerBottomOffset + 6);
  const showDocumentOpenLoader = mode === 'editor' && (!!openingDocument || workspace.loadingDetail);
  const documentOpenLabel = openingDocument === 'new' ? 'Готовлю новый документ' : 'Открываю документ';

  return (
    <View style={[styles.screen, { backgroundColor: background, paddingTop: pageTopPadding }]}>
      {mode === 'orders' ? (
        <Animated.View style={[styles.ordersStage, ordersEntranceStyle]}>
          <ScrollView contentContainerStyle={[styles.ordersContent, width >= 720 && styles.contentTablet, { paddingHorizontal: ui.pageX, paddingTop: 2, maxWidth: layoutTier === 'tablet' ? 760 : undefined }]}>
            {showInitialOrdersSkeleton ? (
              <OrdersScreenSkeleton styles={styles} />
            ) : (
              <>
                <OrdersToolbar
                  styles={styles}
                  workspace={workspace}
                  onOpenFilters={() => setFiltersOpen(true)}
                  onCreate={() => void createDocument()}
                />
                {showEmptyOrdersLoading ? (
                  <OrdersListSkeleton styles={styles} />
                ) : (
                  workspace.orders.map((order) => (
                    <OrderCard
                      key={order.guid}
                      order={order}
                      loading={openingOrderGuid === order.guid}
                      disabled={!!openingOrderGuid}
                      onPress={() => void selectOrder(order)}
                    />
                  ))
                )}
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
              </>
            )}
            <TabBarSpacer />
          </ScrollView>
        </Animated.View>
      ) : (
        <ScrollView
          ref={editorScrollRef}
          contentContainerStyle={[
            styles.content,
            section === 'items' && styles.editorItemsContent,
            width >= 720 && styles.contentTablet,
            { paddingHorizontal: ui.pageX, paddingTop: 0, gap: 6, maxWidth: layoutTier === 'tablet' ? 760 : undefined },
            section === 'header' && editorKeyboardVisible && { paddingBottom: editorKeyboardPadding },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {showDocumentOpenLoader ? (
            <DocumentOpenLoader styles={styles} label={documentOpenLabel} />
          ) : (
            <>
              <View style={[styles.editorPane, styles.editorHeaderPane, section !== 'header' && styles.editorPaneHidden]}>
                <HeaderSection workspace={workspace} openPicker={openPicker} openDetails={openReferenceDetails} onCommentFocus={handleHeaderCommentFocus} onResetHeaderPriceType={confirmResetHeaderPriceType} />
              </View>
              <View style={[styles.editorPane, section !== 'items' && styles.editorPaneHidden]}>
                <ItemsSection workspace={workspace} filteredItems={filteredItems} ui={ui} onEditItem={setEditingItemKey} onAddItem={() => openPicker('product')} onItemLayout={handleLineItemLayout} />
              </View>
            </>
          )}
          <TabBarSpacer extra={54} />
        </ScrollView>
      )}

      <ItemsSearchResultsOverlay
        styles={styles}
        visible={showItemsSearchOverlay}
        topOffset={itemsSearchOverlayTop}
        sideOffset={Math.max(12, ui.pageX + 6)}
        workspace={workspace}
        searchResults={itemsSearchResults}
        searchLoading={itemsSearchLoading}
        searchLoadingMore={itemsSearchLoadingMore}
        searchHasMore={itemsSearchHasMore}
        searchError={itemsSearchError}
        onSelectSearchResult={addProductFromItemsSearch}
        onLoadMoreSearchResults={loadMoreItemsSearchResults}
      />

      {mode === 'editor' && !showDocumentOpenLoader ? (
        <DocumentBottomBar
          styles={styles}
          workspace={workspace}
          safeBottom={safeBottom}
          onPrimaryAction={handleDocumentPrimaryAction}
        />
      ) : null}

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
        <ProductPickerBottomSheet
          styles={styles}
          visible
          topOffset={Math.max(88, topInset + 12)}
          onClose={closePicker}
          contentScrollOffset={pickerScrollOffset}
          keyboardTopInset={Math.max(88, topInset + 12)}
        >
          {pickerContent}
        </ProductPickerBottomSheet>
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
          keyboardTopInset={Math.max(88, topInset + 12)}
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
        <SheetScrollView
          style={styles.referenceScroll}
          contentContainerStyle={styles.referenceSheetContent}
          onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => setReferenceScrollOffset(event.nativeEvent.contentOffset.y <= 1 ? 0 : 2)}
          scrollEventThrottle={16}
        >
          {referenceLoading ? <InfoText styles={styles} text="Загружаю..." /> : null}
          {referenceError ? <Text style={styles.error}>{referenceError}</Text> : null}
          {referenceDetails?.subtitle ? <Text style={styles.orderMeta}>{referenceDetails.subtitle}</Text> : null}
          {referenceDetails?.sections.map((section) => <View key={section.title} style={styles.referenceSection}><Text style={styles.orderTitle}>{section.title}</Text>{section.rows.map((row) => <View key={`${section.title}-${row.label}`} style={styles.referenceRow}><Text style={styles.referenceLabel}>{row.label}</Text><Text style={styles.referenceValue}>{String(row.value ?? '—')}</Text></View>)}</View>)}
        </SheetScrollView>
      </PickerBottomSheet>

      <ProductLineEditorSheet
        styles={styles}
        visible={!!(pendingProductItem || editingItem)}
        topOffset={Math.max(topInset + 6, Math.round(height * 0.3))}
        item={pendingProductItem || editingItem}
        rowNumber={pendingProductItem ? workspace.draft.items.length + 1 : editingItemIndex >= 0 ? editingItemIndex + 1 : 0}
        workspace={productEditorWorkspace}
        allowZeroQuantity={!!pendingProductItem}
        onClose={() => {
          setPendingProductItem(null);
          setEditingItemKey(null);
        }}
      />

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

function HeaderSection({
  workspace,
  openPicker,
  openDetails,
  onCommentFocus,
  onResetHeaderPriceType,
}: {
  workspace: any;
  openPicker: (kind: PickerKind, lineKey?: string) => void;
  openDetails: (kind: ClientOrderReferenceKind, guid?: string | null) => void;
  onCommentFocus: (targetOrEvent: any) => void;
  onResetHeaderPriceType: () => void;
}) {
  const today = React.useMemo(() => new Date(), []);
  const maxDate = React.useMemo(() => { const next = new Date(); next.setMonth(next.getMonth() + 2); return next; }, []);
  const [commentHeight, setCommentHeight] = React.useState(58);
  const commentFocusedRef = React.useRef(false);
  const commentTargetRef = React.useRef<unknown>(null);
  const readOnly = !!workspace.readOnly;
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
      onReset={workspace.isHeaderPriceTypeCustom ? onResetHeaderPriceType : undefined}
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
      onFocus={(event) => {
        commentFocusedRef.current = true;
        commentTargetRef.current = event.nativeEvent.target;
        onCommentFocus(event.nativeEvent.target);
      }}
      onBlur={() => {
        commentFocusedRef.current = false;
      }}
      onContentSizeChange={(event) => {
        const nextHeight = Math.max(58, Math.ceil(event.nativeEvent.contentSize.height));
        setCommentHeight((current) => (nextHeight > current + 2 ? nextHeight : current));
        if (commentFocusedRef.current && commentTargetRef.current) {
          onCommentFocus(commentTargetRef.current);
        }
      }}
      style={[styles.flatCommentInput, readOnly && styles.readOnlyFieldSurface, { height: commentHeight }]}
      contentStyle={[styles.flatCommentInputContent, readOnly && styles.readOnlyInputContent]}
      outlineStyle={[styles.flatInputOutline, readOnly && styles.readOnlyInputOutline]}
      textColor={readOnly ? 'rgba(15, 23, 42, 0.62)' : '#0F172A'}
      outlineColor={readOnly ? 'rgba(216, 226, 240, 0.7)' : '#D8E2F0'}
      activeOutlineColor={readOnly ? 'rgba(216, 226, 240, 0.7)' : '#D8E2F0'}
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
          style={({ pressed }) => [styles.flatField, disabled && styles.readOnlyFieldSurface, pressed && !disabled && styles.flatPressed]}
        >
          <View style={styles.flatFieldIcon}>
            <MaterialCommunityIcons name="calendar-month-outline" size={20} color={disabled ? 'rgba(71, 85, 105, 0.48)' : '#475569'} />
          </View>
          <View style={styles.flatFieldTextWrap}>
            <Text style={[styles.flatFieldLabel, disabled && styles.readOnlyFieldLabel]}>{label}</Text>
            <Text style={[styles.flatFieldValue, disabled && styles.readOnlyFieldValue]} numberOfLines={1}>{displayValue || 'Выбрать'}</Text>
          </View>
          <View style={styles.flatFieldAction}>
            <MaterialCommunityIcons name="calendar" size={19} color={disabled ? 'rgba(71, 85, 105, 0.48)' : '#475569'} />
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
      style={({ pressed }) => [styles.flatField, disabled && styles.readOnlyFieldSurface, pressed && !disabled && styles.flatPressed]}
    >
      <View style={styles.flatFieldIcon}>
        <MaterialCommunityIcons name={icon} size={20} color={disabled ? 'rgba(71, 85, 105, 0.48)' : '#475569'} />
      </View>
      <View style={styles.flatFieldTextWrap}>
        <Text style={[styles.flatFieldLabel, disabled && styles.readOnlyFieldLabel]}>{label}</Text>
        <Text style={[styles.flatFieldValue, disabled && styles.readOnlyFieldValue]} numberOfLines={2}>{value}</Text>
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
              style={({ pressed }) => [styles.flatFieldAction, pressed && !disabled && styles.flatPressed]}
            >
              <MaterialCommunityIcons name="refresh" size={18} color={disabled ? 'rgba(37, 99, 235, 0.42)' : '#2563EB'} />
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
              style={({ pressed }) => [styles.flatFieldAction, pressed && !disabled && styles.flatPressed]}
            >
              <MaterialCommunityIcons name="magnify" size={19} color={disabled ? 'rgba(71, 85, 105, 0.48)' : '#475569'} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function DocumentActionsMenu({
  styles,
  workspace,
  actionsMenuOpen,
  setActionsMenuOpen,
  setInspectorOpen,
  submitFromMenu,
  removeOrCancel,
  compact = false,
}: {
  styles: any;
  workspace: any;
  actionsMenuOpen: boolean;
  setActionsMenuOpen: (open: boolean) => void;
  setInspectorOpen: (open: boolean) => void;
  submitFromMenu: () => void;
  removeOrCancel: () => void;
  compact?: boolean;
}) {
  return (
    <Menu
      visible={actionsMenuOpen}
      onDismiss={() => setActionsMenuOpen(false)}
      anchor={(
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Действия с заказом"
          onPress={() => setActionsMenuOpen(true)}
          style={({ pressed }) => [
            compact ? styles.documentHeaderTopMoreButton : styles.documentHeaderMoreButton,
            pressed && styles.flatPressed,
          ]}
        >
          <MaterialCommunityIcons name="dots-horizontal" size={compact ? 18 : 22} color="#0F172A" />
        </Pressable>
      )}
      contentStyle={styles.mobileMenuPaper}
    >
      <Menu.Item leadingIcon="content-save-outline" title={workspace.saving ? 'Сохраняю...' : 'Сохранить'} onPress={() => { setActionsMenuOpen(false); void workspace.saveDraft({ reason: 'manual' }); }} disabled={workspace.readOnly || workspace.saving || !workspace.validation.canSave} />
      <Menu.Item leadingIcon="cloud-upload-outline" title={workspace.submitting ? 'Отправляю...' : 'Отправить в 1С'} onPress={submitFromMenu} disabled={workspace.readOnly || workspace.submitting || !workspace.validation.canSubmit} />
      <Menu.Item leadingIcon="information-outline" title="Инспектор" onPress={() => { setActionsMenuOpen(false); setInspectorOpen(true); }} />
      <Menu.Item leadingIcon={workspace.draftMode || workspace.selectedOrder?.status === 'DRAFT' ? 'trash-can-outline' : 'close-circle-outline'} title={workspace.draftMode || workspace.selectedOrder?.status === 'DRAFT' ? 'Удалить черновик' : 'Отменить заказ'} onPress={() => { setActionsMenuOpen(false); removeOrCancel(); }} />
    </Menu>
  );
}

function DocumentHeaderSlot({
  styles,
  workspace,
  section,
  setSection,
  documentNumber,
  documentStatusText,
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
  styles: any;
  workspace: any;
  section: EditorSection;
  setSection: (section: EditorSection) => void;
  documentNumber: string;
  documentStatusText: string;
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
  return (
    <View style={styles.documentHeaderSlot}>
      <View style={styles.documentHeaderDocumentRow}>
        <View style={styles.documentStatusPill}>
          <MaterialCommunityIcons name="file-document-edit-outline" size={13} color="#2563EB" />
          <Text style={styles.documentStatusText} numberOfLines={1}>{documentStatusText}</Text>
        </View>
        <Text style={styles.documentTitle} numberOfLines={1}>{documentNumber}</Text>
        <View style={styles.documentSavePill}>
            <MaterialCommunityIcons name="content-save-outline" size={13} color="#64748B" />
            <Text style={styles.documentSubtitle} numberOfLines={1}>{workspace.autosaveLabel}</Text>
        </View>
      </View>
      {workspace.error ? <Text style={styles.error}>{workspace.error}</Text> : null}
      <View style={styles.documentTabsRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setSection('header')}
          style={({ pressed }) => [styles.documentTab, section === 'header' && styles.documentTabActive, pressed && styles.flatPressed]}
        >
          <MaterialCommunityIcons name="clipboard-text-outline" size={16} color={section === 'header' ? '#1D4ED8' : '#64748B'} />
          <Text style={[styles.documentTabText, section === 'header' && styles.documentTabTextActive]}>Шапка</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setSection('items')}
          style={({ pressed }) => [styles.documentTab, section === 'items' && styles.documentTabActive, pressed && styles.flatPressed]}
        >
          <MaterialCommunityIcons name="cube-outline" size={16} color={section === 'items' ? '#1D4ED8' : '#64748B'} />
          <Text style={[styles.documentTabText, section === 'items' && styles.documentTabTextActive]}>Товары</Text>
          <View style={[styles.documentTabCountBadge, section === 'items' && styles.documentTabCountBadgeActive]}>
            <Text style={[styles.documentTabCountText, section === 'items' && styles.documentTabCountTextActive]}>{workspace.draft.items.length}</Text>
          </View>
        </Pressable>
      </View>
      {section === 'items' && !workspace.readOnly ? (
        <>
          <View style={styles.documentHeaderDivider} />
          <ItemsToolbar
            workspace={workspace}
            itemsSearch={itemsSearch}
            setItemsSearch={setItemsSearch}
            searchFocused={searchFocused}
            onSearchFocus={onSearchFocus}
            onSearchBlur={onSearchBlur}
            searchResults={searchResults}
            searchLoading={searchLoading}
            searchLoadingMore={searchLoadingMore}
            searchHasMore={searchHasMore}
            searchError={searchError}
            onSelectSearchResult={onSelectSearchResult}
            onLoadMoreSearchResults={onLoadMoreSearchResults}
            openPicker={openPicker}
            onClearItems={onClearItems}
            embedded
          />
        </>
      ) : null}
    </View>
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
  embedded = false,
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
  embedded?: boolean;
}) {
  const hasSearch = !!itemsSearch.trim();
  const showSearchResults = hasSearch && searchFocused;
  const renderInlineResults = !embedded && showSearchResults;
  const handleSearchChange = React.useCallback((value: string) => {
    setItemsSearch(value);
    if (value.trim()) onSearchFocus();
  }, [onSearchFocus, setItemsSearch]);

  return <View style={embedded ? styles.itemsToolbarHeaderWrap : styles.itemsToolbarWrap}>
    <View style={styles.itemsFlatToolbar}>
      <CompactSearchbar
        style={styles.itemsSearchFlat}
        inputStyle={styles.itemsSearchFlatInput}
        value={itemsSearch}
        onChangeText={handleSearchChange}
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
    {renderInlineResults ? (
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
  </View>;
}

function ItemsSearchResultsOverlay({
  styles,
  visible,
  topOffset,
  sideOffset,
  workspace,
  searchResults,
  searchLoading,
  searchLoadingMore,
  searchHasMore,
  searchError,
  onSelectSearchResult,
  onLoadMoreSearchResults,
}: {
  styles: any;
  visible: boolean;
  topOffset: number;
  sideOffset: number;
  workspace: any;
  searchResults: ClientOrderProduct[];
  searchLoading: boolean;
  searchLoadingMore: boolean;
  searchHasMore: boolean;
  searchError: string | null;
  onSelectSearchResult: (product: ClientOrderProduct) => void;
  onLoadMoreSearchResults: () => void;
}) {
  if (!visible) return null;
  return (
    <Portal>
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <View style={[styles.itemsSearchResultsPortal, { top: topOffset, left: sideOffset, right: sideOffset }]}>
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
      </View>
    </Portal>
  );
}

function ProductPickerBottomSheet({
  styles,
  visible,
  topOffset,
  onClose,
  contentScrollOffset,
  keyboardTopInset,
  children,
}: {
  styles: any;
  visible: boolean;
  topOffset: number;
  onClose: () => void;
  contentScrollOffset: number;
  keyboardTopInset: number;
  children: React.ReactNode;
}) {
  return (
    <PickerBottomSheet
      styles={styles}
      visible={visible}
      topOffset={topOffset}
      title="Подбор товаров"
      titleIcon="cube-outline"
      onClose={onClose}
      contentScrollOffset={contentScrollOffset}
      enableContentDrag
      keyboardTopInset={keyboardTopInset}
      minHeight={420}
      initialSnapIndex={1}
    >
      {children}
    </PickerBottomSheet>
  );
}

function DocumentBottomBar({
  styles,
  workspace,
  safeBottom,
  onPrimaryAction,
}: {
  styles: any;
  workspace: any;
  safeBottom: number;
  onPrimaryAction: () => void;
}) {
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const surfaceColor = withColorOpacity(backgroundColor, 0.9);
  const borderColor = withColorOpacity(textColor, 0.18);
  const shouldSave = !!workspace.dirty;
  const busy = !!workspace.saving || !!workspace.submitting;
  const disabled = workspace.readOnly || busy || (shouldSave ? !workspace.validation.canSave : !workspace.validation.canSubmit);
  const label = workspace.saving
    ? 'Сохраняю'
    : workspace.submitting
      ? 'Отправляю'
      : shouldSave
        ? 'Сохранить'
        : 'Отправить';
  const deliveryDate = workspace.draft.deliveryDate ? formatDateOnly(workspace.draft.deliveryDate) : 'Дата не выбрана';
  const counterparty = workspace.selections.counterparty?.name || 'Контрагент не выбран';

  return (
    <View style={styles.documentBottomBar}>
      <LiquidGlassSurface
        borderColor={borderColor}
        overlayColor={surfaceColor}
        blurTint="light"
        blurIntensity={36}
        webBackdropFilter="blur(22px) saturate(160%)"
        style={[styles.documentBottomGlass, { paddingBottom: Math.max(safeBottom, 8) + 8 }]}
      >
        <View style={styles.documentBottomContent}>
          <View style={styles.documentBottomInfo}>
            <View style={styles.documentBottomMetaRow}>
              <View style={styles.documentBottomTotalPill}>
                <MaterialCommunityIcons name="cash-multiple" size={13} color="#2563EB" />
                <Text style={styles.documentBottomTotalText} numberOfLines={1}>{formatMoney(workspace.localTotal, workspace.draft.currency)}</Text>
              </View>
              <View style={styles.documentBottomDatePill}>
                <MaterialCommunityIcons name="truck-outline" size={13} color="#64748B" />
                <Text style={styles.documentBottomDateText} numberOfLines={1}>{deliveryDate}</Text>
              </View>
            </View>
            <View style={styles.documentBottomCounterpartyRow}>
              <MaterialCommunityIcons name="account-outline" size={13} color="#64748B" />
              <Text style={styles.documentBottomCounterpartyText} numberOfLines={1}>{counterparty}</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            disabled={disabled}
            onPress={onPrimaryAction}
            style={({ pressed }) => [
              styles.documentBottomPrimaryButton,
              !shouldSave && styles.documentBottomPrimaryButtonSubmit,
              disabled && styles.disabled,
              pressed && !disabled && styles.flatPressed,
            ]}
          >
            {busy ? (
              <ActivityIndicator size={18} color="#FFFFFF" />
            ) : (
              <Text style={styles.documentBottomPrimaryText} numberOfLines={1}>{label}</Text>
            )}
          </Pressable>
        </View>
      </LiquidGlassSurface>
    </View>
  );
}

function ItemsSection({
  workspace,
  filteredItems,
  ui,
  onEditItem,
  onAddItem,
  onItemLayout,
}: {
  workspace: any;
  filteredItems: any[];
  ui: ReturnType<typeof getClientOrdersResponsiveMetrics>;
  onEditItem: (key: string) => void;
  onAddItem: () => void;
  onItemLayout: (key: string, y: number) => void;
}) {
  return <View style={styles.itemsFlatSection}>
    {filteredItems.length ? (
      <View style={[styles.lineList, { paddingBottom: ui.itemsBottomInset }]}>
        {filteredItems.map((item, index) => (
          <View key={item.key} onLayout={(event) => onItemLayout(item.key, event.nativeEvent.layout.y)}>
            <LineItemCard item={item} index={index} workspace={workspace} onPress={() => onEditItem(item.key)} onRemove={() => workspace.removeItem(item.key)} />
          </View>
        ))}
        {!workspace.readOnly ? <AddProductListCard onPress={onAddItem} /> : null}
      </View>
    ) : (
      <View style={[styles.lineList, { paddingBottom: ui.itemsBottomInset }]}>
        {!workspace.readOnly ? <AddProductListCard onPress={onAddItem} /> : null}
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
  const packageLabelText = linePackageShortLabel(item);
  const hasErrors = (workspace.validation.itemMessages[item.key] || []).length > 0;
  const readOnly = !!workspace.readOnly;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.productPreviewCard, hasErrors && styles.productPreviewCardInvalid, readOnly && styles.productPreviewCardReadOnly, pressed && styles.flatPressed]}>
      <View style={[styles.productPreviewMedia, readOnly && styles.productPreviewMediaReadOnly]}>
        <ProductThumb
          item={item}
          style={[styles.productPreviewImage, readOnly && styles.productPreviewImageReadOnly]}
          iconSize={34}
          iconColor={readOnly ? 'rgba(37, 99, 235, 0.42)' : '#2563EB'}
        />
        <View style={[styles.productPreviewIndexBadge, readOnly && styles.productPreviewIndexBadgeReadOnly]}>
          <Text style={[styles.productPreviewIndex, readOnly && styles.productPreviewIndexReadOnly]}>{index + 1}</Text>
        </View>
      </View>
      <View style={styles.productPreviewBody}>
        {!readOnly ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Удалить товар"
            onPress={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            hitSlop={8}
            style={({ pressed }) => [styles.productPreviewRemoveButton, pressed && styles.flatPressed]}
          >
            <MaterialCommunityIcons name="close" size={15} color="#64748B" />
          </Pressable>
        ) : null}
        <Text style={[styles.productPreviewTitle, readOnly && styles.productPreviewTitleReadOnly]} numberOfLines={2}>{item.productName}</Text>
        <Text style={[styles.productPreviewMeta, readOnly && styles.productPreviewMetaReadOnly]} numberOfLines={1}>{item.productCode ? `Артикул: ${item.productCode}` : 'Без артикула'}</Text>
        <View style={styles.productPreviewBottomRow}>
          <View style={styles.productPreviewFormulaRow}>
            <Text style={[styles.productPreviewQuantity, readOnly && styles.productPreviewQuantityReadOnly]} numberOfLines={1}>{item.quantity}</Text>
            <Text style={[styles.productPreviewPackage, readOnly && styles.productPreviewMetaReadOnly]} numberOfLines={1}>{packageLabelText}</Text>
            <Text style={[styles.productPreviewFormulaSeparator, readOnly && styles.productPreviewFormulaSeparatorReadOnly]}>×</Text>
            <Text style={[styles.productPreviewPrice, readOnly && styles.productPreviewPriceReadOnly]} numberOfLines={1}>{displayedPrice || '0'} ₽</Text>
          </View>
          <Text style={[styles.productPreviewTotal, readOnly && styles.productPreviewTotalReadOnly]} numberOfLines={1}>{lineTotal}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function ProductThumb({ item, style, iconSize, iconColor = '#2563EB' }: { item: any; style: any; iconSize: number; iconColor?: string }) {
  const imageUri = getDraftItemImageUri(item);
  if (imageUri) {
    return <Image source={{ uri: imageUri }} style={style} resizeMode="cover" />;
  }
  return (
    <View style={[style, styles.productImagePlaceholder]}>
      <MaterialCommunityIcons name="image-outline" size={iconSize} color={iconColor} />
    </View>
  );
}

function CompactSearchbar({
  inputRef,
  style,
  inputStyle,
  value,
  onChangeText,
  placeholder,
  onFocus,
  onBlur,
  inputComponent,
  autoFocus,
}: {
  inputRef?: React.Ref<any>;
  style: any;
  inputStyle: any;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  onFocus?: () => void;
  onBlur?: () => void;
  inputComponent?: React.ComponentType<any>;
  autoFocus?: boolean;
}) {
  const InputComponent = (inputComponent || TextInput) as any;
  return (
    <View style={[styles.compactSearchShell, style]}>
      <MaterialCommunityIcons name="magnify" size={18} color="#475569" />
      <InputComponent
        ref={inputRef}
        style={[styles.compactSearchInputBase, inputStyle]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholderTextColor="#64748B"
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        keyboardType="web-search"
        returnKeyType="search"
        inputMode="search"
        autoComplete="new-password"
        textContentType="oneTimeCode"
        importantForAutofill="noExcludeDescendants"
        autoFocus={autoFocus}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Очистить поиск"
          hitSlop={4}
          onPress={() => onChangeText('')}
          style={({ pressed }) => [styles.compactSearchClear, pressed && styles.flatPressed]}
        >
          <MaterialCommunityIcons name="close" size={16} color="#475569" />
        </Pressable>
      ) : null}
    </View>
  );
}

function ProductLineEditorSheet({
  styles,
  visible,
  topOffset,
  item,
  rowNumber,
  workspace,
  allowZeroQuantity = false,
  onClose,
}: {
  styles: any;
  visible: boolean;
  topOffset: number;
  item: any | null;
  rowNumber: number;
  workspace: any;
  allowZeroQuantity?: boolean;
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
  const [keyboardVisible, setKeyboardVisible] = React.useState(false);
  const currentDisplayedPrice = displayedPriceValue(displayedItem);
  React.useEffect(() => {
    if (visible) setScrollOffset(0);
  }, [visible]);
  React.useEffect(() => {
    if (!visible) {
      setKeyboardVisible(false);
      return undefined;
    }
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [visible]);
  React.useEffect(() => {
    if (!priceFocused) setPriceInputValue(currentDisplayedPrice);
  }, [currentDisplayedPrice, priceFocused]);

  if (!displayedItem) return null;

  const readOnly = !!workspace.readOnly;
  const qtyValid = allowZeroQuantity && !hasPositiveQuantity(displayedItem)
    ? true
    : isValidQuantityValue(displayedItem);
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
  const bottomReserve = keyboardVisible ? 0 : FLOATING_TAB_BAR_HEIGHT + FLOATING_TAB_BAR_BOTTOM_OFFSET + 8;
  const measuredContentHeight = headerHeight && scrollContentHeight && footerHeight
    ? headerHeight + scrollContentHeight + footerHeight + bottomReserve
    : undefined;
  const preferredSheetHeight = Math.min(
    Math.round(height * 0.62),
    Math.max(keyboardVisible ? 360 : 420, measuredContentHeight || (keyboardVisible ? 380 : 420))
  );

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
          <Text style={styles.productEditorTitle} numberOfLines={2}>{displayedItem.productName}</Text>
        </View>
      )}
      contentScrollOffset={scrollOffset}
      enableContentDrag
    >
      <View
        style={styles.productEditorContent}
        onLayout={(event: LayoutChangeEvent) => {
          const nextHeight = Math.ceil(event.nativeEvent.layout.height);
          setScrollViewportHeight(nextHeight);
          setScrollContentHeight(nextHeight);
        }}
      >
        <View style={styles.productEditorFieldsRow}>
          <View style={[styles.productEditorAdaptiveField, { width: halfControlWidth }]}>
            <Text style={[styles.productEditorLabel, readOnly && styles.productEditorLabelReadOnly]}>Упаковка</Text>
            {packageOptions.length === 1 ? (
              <View style={[styles.productEditorPackageReadonly, readOnly && styles.productEditorReadOnlySoftSurface]}>
                <Text style={[styles.productEditorPackageReadonlyText, readOnly && styles.productEditorReadOnlyMutedText]} numberOfLines={1}>{packageOptions[0].label}</Text>
              </View>
            ) : (
              <View style={[styles.productEditorPackageRow, readOnly && styles.productEditorReadOnlySurface]}>
                {packageOptions.map((option) => {
                  const selected = selectedPackageGuid === option.guid;
                  return (
                    <Pressable
                      key={option.guid || '__base__'}
                      disabled={readOnly}
                      onPress={() => workspace.setItemPatch(displayedItem.key, { packageGuid: option.guid })}
                      style={({ pressed }) => [
                        styles.productEditorPackageButton,
                        selected && styles.productEditorPackageButtonActive,
                        readOnly && styles.productEditorReadOnlyButton,
                        selected && readOnly && styles.productEditorReadOnlyButtonActive,
                        pressed && !readOnly && styles.flatPressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.productEditorPackageText,
                          selected && styles.productEditorPackageTextActive,
                          readOnly && styles.productEditorReadOnlyText,
                        ]}
                        numberOfLines={1}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
          <View style={[styles.productEditorAdaptiveField, { width: halfControlWidth }]}>
            <Text style={[styles.productEditorLabel, readOnly && styles.productEditorLabelReadOnly]}>Цена за единицу</Text>
            <View style={[styles.productEditorPriceBox, !priceValid && styles.productEditorPriceBoxInvalid, readOnly && styles.productEditorReadOnlySurface]}>
              <SheetTextInput
                value={priceFocused ? priceInputValue : displayedPrice}
                placeholder="0"
                placeholderTextColor="#94A3B8"
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
                editable={!readOnly}
                onChangeText={(value: string) => {
                  const nextValue = normalizePriceInput(value, priceInputValue);
                  setPriceInputValue(nextValue);
                  const manualPrice = nextValue === '' ? '0' : nextValue;
                  workspace.setItemPatch(displayedItem.key, {
                    manualPrice,
                    priceTypeGuid: manualPrice.trim() ? null : workspace.draft.priceTypeGuid ?? null,
                    priceTypeName: manualPrice.trim() ? 'Произвольный' : workspace.draft.priceTypeName ?? null,
                  });
                }}
                style={[styles.productEditorPriceInput, styles.productEditorPriceInputContent, readOnly && styles.productEditorReadOnlyInputText]}
              />
              <Text style={[styles.productEditorCurrency, readOnly && styles.productEditorReadOnlyMutedText]}>₽</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Вернуть цену из прайса документа"
                disabled={readOnly}
                onPress={() => workspace.resetItemPriceType(displayedItem.key)}
                hitSlop={6}
                style={({ pressed }) => [styles.productEditorPriceReset, readOnly && styles.productEditorReadOnlyIconButton, pressed && !readOnly && styles.flatPressed]}
              >
                <MaterialCommunityIcons name="refresh" size={18} color={readOnly ? 'rgba(37, 99, 235, 0.42)' : '#2563EB'} />
              </Pressable>
            </View>
          </View>
        </View>

      </View>

      <View style={styles.productEditorFooter} onLayout={(event) => setFooterHeight(Math.ceil(event.nativeEvent.layout.height))}>
        <View style={styles.productEditorFooterTotalWrap}>
          <Text style={styles.productEditorFooterTotalLabel}>Сумма позиции</Text>
          <View style={styles.productEditorFooterTotalRow}>
            <Text style={styles.productEditorFooterTotal}>{lineTotal}</Text>
          </View>
        </View>
        <View style={[styles.productEditorFooterQuantity, { width: halfControlWidth }]}>
          <Text style={[styles.productEditorLabel, readOnly && styles.productEditorLabelReadOnly]}>Количество</Text>
          <View style={[styles.productEditorQtyStepper, !qtyValid && styles.invalidInputOutline, readOnly && styles.productEditorReadOnlySurface]}>
            <Pressable disabled={readOnly} onPress={() => workspace.setItemPatch(displayedItem.key, { quantity: quantityStep(displayedItem, -1) })} style={({ pressed }) => [styles.productEditorQtyButton, readOnly && styles.productEditorReadOnlyStepButton, pressed && !readOnly && styles.flatPressed]}>
              <MaterialCommunityIcons name="minus" size={21} color={readOnly ? 'rgba(37, 99, 235, 0.42)' : '#2563EB'} />
            </Pressable>
            <SheetTextInput
              value={String(displayedItem.quantity)}
              keyboardType="decimal-pad"
              selectTextOnFocus
              editable={!readOnly}
              onChangeText={(value: string) => workspace.setItemPatch(displayedItem.key, { quantity: normalizeQuantityInput(displayedItem, value) })}
              style={[styles.productEditorQtyInput, styles.productEditorQtyInputContent, readOnly && styles.productEditorReadOnlyInputSurface, readOnly && styles.productEditorReadOnlyInputText]}
            />
            <Pressable disabled={readOnly} onPress={() => workspace.setItemPatch(displayedItem.key, { quantity: quantityStep(displayedItem, 1) })} style={({ pressed }) => [styles.productEditorQtyButton, readOnly && styles.productEditorReadOnlyStepButton, pressed && !readOnly && styles.flatPressed]}>
              <MaterialCommunityIcons name="plus" size={22} color={readOnly ? 'rgba(37, 99, 235, 0.42)' : '#2563EB'} />
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

function orderStatusLabel(status: string) {
  return STATUS_LABELS[status] || status || 'Черновик';
}

function orderHasVisibleProblem(order: ClientOrder) {
  return Boolean(
    order.lastExportError ||
      order.last1cError ||
      order.syncState === 'ERROR' ||
      order.syncState === 'CONFLICT' ||
      order.status === 'CANCELLED' ||
      order.status === 'REJECTED'
  );
}

function countActiveOrderFilters(filters: any) {
  return [
    filters.status,
    filters.counterpartyGuid,
    filters.amountMin,
    filters.amountMax,
    filters.deliveryDateFrom,
    filters.deliveryDateTo,
    filters.updatedFrom,
    filters.updatedTo,
    filters.itemsMin,
    filters.itemsMax,
    filters.syncState,
    filters.organizationGuid,
    filters.warehouseGuid,
    filters.priceTypeGuid,
    filters.hasNumber1c,
    filters.onlyProblems ? 'onlyProblems' : '',
  ].filter(Boolean).length;
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
  onInputFocus,
  onFieldLayout,
}: {
  styles: any;
  label: string;
  icon: string;
  selected: T | null;
  placeholder: string;
  search: (args: { search: string; limit: number; offset: number }) => Promise<{ items: T[] }>;
  onChange: (value: T | null) => void;
  onInputFocus?: (inputRef: FilterKeyboardInputRef) => void;
  onFieldLayout?: (event: LayoutChangeEvent) => void;
}) {
  const inputRef = React.useRef<any>(null);
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
    <View onLayout={onFieldLayout}>
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
        <SheetTextInput
          ref={inputRef}
          value={query}
          onChangeText={(value: string) => {
            setQuery(value);
            if (!value.trim()) onChange(null);
          }}
          placeholder={placeholder}
          placeholderTextColor="#64748B"
          style={styles.filtersInnerTextInputContent}
          autoCorrect={false}
          returnKeyType="search"
          onFocus={() => onInputFocus?.(inputRef)}
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
  onInputFocus,
}: {
  styles: any;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  icon: string;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  onInputFocus?: (inputRef: FilterKeyboardInputRef) => void;
}) {
  const inputRef = React.useRef<any>(null);
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
        <SheetTextInput
          ref={inputRef}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          keyboardType={keyboardType}
          placeholderTextColor="#64748B"
          style={styles.filtersInnerTextInputContent}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onFocus={() => onInputFocus?.(inputRef)}
        />
      </FilterFieldFrame>
    </View>
  );
}

function OrdersScreenSkeleton({ styles }: { styles: any }) {
  const pulse = React.useRef(new Animated.Value(0)).current;
  const pulseStyle = React.useMemo(
    () => ({
      opacity: pulse.interpolate({
        inputRange: [0, 1],
        outputRange: [0.72, 1],
      }),
    }),
    [pulse]
  );

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 720,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 720,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View style={[styles.ordersScreenSkeleton, pulseStyle]}>
      <View style={styles.ordersSkeletonToolbar}>
        <View style={styles.ordersSkeletonSearch} />
        <View style={styles.ordersSkeletonAction} />
        <View style={[styles.ordersSkeletonAction, styles.ordersSkeletonActionPrimary]} />
      </View>
      <OrdersListSkeleton styles={styles} />
    </Animated.View>
  );
}

function OrdersListSkeleton({ styles }: { styles: any }) {
  return (
    <View style={styles.ordersSkeletonList}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Surface key={index} mode="flat" style={styles.ordersSkeletonCard}>
          <View style={styles.ordersSkeletonTopRow}>
            <View style={styles.ordersSkeletonTitleBlock}>
              <View style={styles.ordersSkeletonDocument} />
              <View style={styles.ordersSkeletonCounterparty} />
            </View>
            <View style={styles.ordersSkeletonAmount} />
            <View style={styles.ordersSkeletonChevron} />
          </View>
          <View style={styles.ordersSkeletonMetaRow}>
            <View style={styles.ordersSkeletonPill} />
            <View style={styles.ordersSkeletonMeta} />
            <View style={styles.ordersSkeletonMetaShort} />
          </View>
        </Surface>
      ))}
    </View>
  );
}

function DocumentOpenLoader({ styles, label }: { styles: any; label: string }) {
  return (
    <View style={styles.documentOpenLoader}>
      <Surface mode="flat" style={styles.documentOpenLoaderCard}>
        <View style={styles.documentOpenLoaderHeader}>
          <ActivityIndicator size={18} color="#2563EB" />
          <Text style={styles.documentOpenLoaderTitle}>{label}</Text>
        </View>
        <View style={styles.documentOpenLoaderLine} />
        <View style={[styles.documentOpenLoaderLine, styles.documentOpenLoaderLineShort]} />
        <View style={styles.documentOpenLoaderGrid}>
          <View style={styles.documentOpenLoaderField} />
          <View style={styles.documentOpenLoaderField} />
          <View style={styles.documentOpenLoaderFieldWide} />
        </View>
      </Surface>
    </View>
  );
}

function OrdersToolbar({
  styles,
  workspace,
  onOpenFilters,
  onCreate,
}: {
  styles: any;
  workspace: any;
  onOpenFilters: () => void;
  onCreate: () => void;
}) {
  const filters = workspace.filters;
  const activeFilters = countActiveOrderFilters(filters);

  return (
    <Surface mode="flat" style={styles.ordersToolbar}>
      <View style={styles.ordersCompactToolbarRow}>
        <CompactSearchbar
          style={styles.ordersSearchbar}
          inputStyle={styles.ordersSearchbarInput}
          value={filters.search}
          onChangeText={(value) => workspace.setFilters((prev: any) => ({ ...prev, search: value }))}
          placeholder="Поиск по номеру или клиенту"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Открыть фильтры"
          onPress={onOpenFilters}
          style={({ pressed }) => [styles.ordersFilterButton, pressed && styles.flatPressed]}
        >
          <MaterialCommunityIcons name="filter-variant" size={19} color="#2563EB" />
          {activeFilters ? (
            <View style={styles.ordersFilterBadge}>
              <Text style={styles.ordersFilterBadgeText}>{activeFilters}</Text>
            </View>
          ) : null}
        </Pressable>
        {workspace.loadingOrders && workspace.orders.length ? (
          <View style={styles.ordersToolbarLoading}>
            <ActivityIndicator size={13} color="#2563EB" />
          </View>
        ) : null}
        <PaperIconButton
          icon="file-document-plus-outline"
          size={19}
          onPress={onCreate}
          iconColor="#FFFFFF"
          style={[styles.ordersIconButton, styles.ordersIconButtonPrimary]}
        />
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
  const [filtersScrollOffset, setFiltersScrollOffset] = React.useState(0);
  const [keyboardVisible, setKeyboardVisible] = React.useState(false);
  const { height: windowHeight } = useWindowDimensions();
  const filtersScrollRef = React.useRef<any>(null);
  const filtersKeyboardTopRef = React.useRef<number | null>(null);
  const filtersFocusedFieldRef = React.useRef<FilterKeyboardFieldKey | null>(null);
  const filtersFocusedInputRef = React.useRef<FilterKeyboardInputRef | null>(null);
  const filtersFieldLayoutsRef = React.useRef<Partial<Record<FilterKeyboardFieldKey, { y: number; height: number }>>>({});
  const filtersFocusTimersRef = React.useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const insets = useSafeAreaInsets();
  const filtersFooterBottomPadding = Math.max(insets.bottom, 10) + 8;
  const filtersKeyboardPadding = Math.min(420, Math.max(280, Math.round(windowHeight * 0.36)));
  const filtersContentBottomPadding = keyboardVisible ? filtersKeyboardPadding : 10;

  const clearFiltersFocusTimers = React.useCallback(() => {
    filtersFocusTimersRef.current.forEach((timer) => clearTimeout(timer));
    filtersFocusTimersRef.current = [];
  }, []);

  const scrollFilterFieldIntoView = React.useCallback((key: FilterKeyboardFieldKey, inputRef?: FilterKeyboardInputRef | null) => {
    const keyboardTop = filtersKeyboardTopRef.current;
    if (keyboardTop === null) return;
    const field = filtersFieldLayoutsRef.current[key];
    const scrollView = filtersScrollRef.current;
    const scrollResponder = scrollView?.getScrollResponder?.() || scrollView;
    const inputNode = inputRef?.current;

    const liftField = () => {
      setKeyboardVisible(true);
      if (inputNode && scrollResponder?.scrollResponderScrollNativeHandleToKeyboard) {
        try {
          scrollResponder.scrollResponderScrollNativeHandleToKeyboard(inputNode, 112, true);
          return;
        } catch {
          // Fallback ниже использует сохранённую позицию поля.
        }
      }
      if (field) {
        scrollView?.scrollTo?.({
          y: Math.max(0, field.y - 72),
          animated: true,
        });
      }
    };

    if (!inputNode) {
      if (field) liftField();
      return;
    }
    measureTargetInWindow(inputNode, (rect) => {
      const fieldBottom = rect.y + rect.height;
      const visibleBottom = keyboardTop - 24;
      if (fieldBottom <= visibleBottom) return;
      liftField();
    });
  }, []);

  const scheduleFilterFieldScroll = React.useCallback((key: FilterKeyboardFieldKey, inputRef?: FilterKeyboardInputRef) => {
    filtersFocusedFieldRef.current = key;
    filtersFocusedInputRef.current = inputRef || null;
    clearFiltersFocusTimers();
    [0, 80, 180, 320, 520, 760].forEach((delay) => {
      const timer = setTimeout(() => scrollFilterFieldIntoView(key, inputRef || filtersFocusedInputRef.current), delay);
      filtersFocusTimersRef.current.push(timer);
    });
  }, [clearFiltersFocusTimers, scrollFilterFieldIntoView]);

  const handleFilterFieldLayout = React.useCallback((key: FilterKeyboardFieldKey, event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    filtersFieldLayoutsRef.current[key] = { y, height };
  }, []);

  React.useEffect(() => {
    if (visible) {
      setFiltersScrollOffset(0);
      filtersFocusedFieldRef.current = null;
      filtersFocusedInputRef.current = null;
    } else {
      setKeyboardVisible(false);
      filtersKeyboardTopRef.current = null;
      clearFiltersFocusTimers();
    }
  }, [clearFiltersFocusTimers, visible]);

  React.useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
      filtersKeyboardTopRef.current = event.endCoordinates?.screenY ?? null;
      const focusedField = filtersFocusedFieldRef.current;
      if (focusedField) {
        scheduleFilterFieldScroll(focusedField, filtersFocusedInputRef.current || undefined);
      }
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
      filtersKeyboardTopRef.current = null;
      filtersFocusedFieldRef.current = null;
      filtersFocusedInputRef.current = null;
      clearFiltersFocusTimers();
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
      clearFiltersFocusTimers();
    };
  }, [clearFiltersFocusTimers, scheduleFilterFieldScroll]);

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

  return (
    <PickerBottomSheet
      styles={styles}
      visible={visible}
      topOffset={topOffset}
      title="Фильтры"
      onClose={onClose}
      minHeight={360}
      sheetStyle={styles.filtersPickerSheet}
      contentScrollOffset={filtersScrollOffset}
      enableContentDrag
      closeDragDistance={8}
      closeOnDragMove
      initialSnapIndex={1}
      keyboardTopInset={topOffset}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      androidKeyboardInputMode="adjustPan"
      enableBlurKeyboardOnGesture
    >
      <SheetScrollView
        ref={filtersScrollRef}
        style={styles.filtersScroll}
        contentContainerStyle={[styles.filtersForm, { paddingBottom: filtersContentBottomPadding }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        nestedScrollEnabled
        scrollEventThrottle={16}
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => setFiltersScrollOffset(event.nativeEvent.contentOffset.y <= 1 ? 0 : 2)}
      >
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
        <View style={styles.filtersAmountRow} onLayout={(event) => handleFilterFieldLayout('deliveryDates', event)}>
          <FilterInputField styles={styles} label="Дата отгрузки от" value={deliveryDateFrom} onChange={onDeliveryDateFromChange} placeholder="От" icon="calendar-outline" onInputFocus={(inputRef) => scheduleFilterFieldScroll('deliveryDates', inputRef)} />
          <FilterInputField styles={styles} label="Дата отгрузки до" value={deliveryDateTo} onChange={onDeliveryDateToChange} placeholder="До" icon="calendar-outline" onInputFocus={(inputRef) => scheduleFilterFieldScroll('deliveryDates', inputRef)} />
        </View>
        <View style={styles.filtersAmountRow} onLayout={(event) => handleFilterFieldLayout('updatedDates', event)}>
          <FilterInputField styles={styles} label="Дата изменения от" value={updatedFrom} onChange={onUpdatedFromChange} placeholder="От" icon="calendar-clock-outline" onInputFocus={(inputRef) => scheduleFilterFieldScroll('updatedDates', inputRef)} />
          <FilterInputField styles={styles} label="Дата изменения до" value={updatedTo} onChange={onUpdatedToChange} placeholder="До" icon="calendar-clock-outline" onInputFocus={(inputRef) => scheduleFilterFieldScroll('updatedDates', inputRef)} />
        </View>
        <View style={styles.filtersAmountRow} onLayout={(event) => handleFilterFieldLayout('amount', event)}>
          <FilterInputField styles={styles} label="Сумма от" value={amountMin} onChange={onAmountMinChange} placeholder="От" icon="cash" keyboardType="decimal-pad" onInputFocus={(inputRef) => scheduleFilterFieldScroll('amount', inputRef)} />
          <FilterInputField styles={styles} label="Сумма до" value={amountMax} onChange={onAmountMaxChange} placeholder="До" icon="cash" keyboardType="decimal-pad" onInputFocus={(inputRef) => scheduleFilterFieldScroll('amount', inputRef)} />
        </View>
        <View style={styles.filtersAmountRow} onLayout={(event) => handleFilterFieldLayout('items', event)}>
          <FilterInputField styles={styles} label="Позиций от" value={itemsMin} onChange={onItemsMinChange} placeholder="От" icon="format-list-numbered" keyboardType="number-pad" onInputFocus={(inputRef) => scheduleFilterFieldScroll('items', inputRef)} />
          <FilterInputField styles={styles} label="Позиций до" value={itemsMax} onChange={onItemsMaxChange} placeholder="До" icon="format-list-numbered" keyboardType="number-pad" onInputFocus={(inputRef) => scheduleFilterFieldScroll('items', inputRef)} />
        </View>
        <FilterLookupField styles={styles} label="Контрагент" icon="account-outline" selected={filterCounterparty} placeholder="Начните вводить название" search={searchCounterparties} onChange={onCounterpartyChange} onFieldLayout={(event) => handleFilterFieldLayout('counterparty', event)} onInputFocus={(inputRef) => scheduleFilterFieldScroll('counterparty', inputRef)} />
        <FilterSelectField styles={styles} label="Организация" value={organizationGuid} options={organizationOptions} onChange={onOrganizationChange} />
        <FilterLookupField styles={styles} label="Склад" icon="warehouse" selected={filterWarehouse} placeholder="Начните вводить склад" search={searchWarehouses} onChange={onWarehouseChange} onFieldLayout={(event) => handleFilterFieldLayout('warehouse', event)} onInputFocus={(inputRef) => scheduleFilterFieldScroll('warehouse', inputRef)} />
        <FilterLookupField styles={styles} label="Вид цены" icon="tag-outline" selected={filterPriceType} placeholder="Начните вводить вид цены" search={searchPriceTypes} onChange={onPriceTypeChange} onFieldLayout={(event) => handleFilterFieldLayout('priceType', event)} onInputFocus={(inputRef) => scheduleFilterFieldScroll('priceType', inputRef)} />
      </SheetScrollView>
      <View style={[styles.filtersSheetActions, { paddingBottom: filtersFooterBottomPadding }]}>
        <PaperButton mode="outlined" onPress={onReset} style={styles.filtersSheetActionButton} labelStyle={styles.filtersSheetActionLabel} contentStyle={styles.filtersSheetActionContent}>
          Сбросить
        </PaperButton>
        <PaperButton mode="contained" onPress={onClose} buttonColor="#0F172A" textColor="#FFFFFF" style={styles.filtersSheetActionButton} labelStyle={styles.filtersSheetActionLabel} contentStyle={styles.filtersSheetActionContent}>
          Готово
        </PaperButton>
      </View>
    </PickerBottomSheet>
  );
}

function OrderCard({
  order,
  onPress,
  loading = false,
  disabled = false,
}: {
  order: ClientOrder;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const scale = React.useRef(new Animated.Value(1)).current;
  const activityAt = order.updatedAt || order.queuedAt || order.sentTo1cAt;
  const statusIcon = orderStatusIcon(order.status);
  const hasProblem = orderHasVisibleProblem(order);
  const itemsCount = order.itemsCount ?? order.items.length ?? 0;
  const interactionDisabled = disabled || loading;
  const animateScale = React.useCallback((value: number) => {
    Animated.spring(scale, {
      toValue: value,
      speed: 42,
      bounciness: 0,
      useNativeDriver: true,
    }).start();
  }, [scale]);
  return (
    <Animated.View style={[styles.orderCardPressable, { transform: [{ scale }] }]}>
      <Pressable
        accessibilityRole="button"
        disabled={interactionDisabled}
        onPress={onPress}
        onPressIn={() => {
          if (!interactionDisabled) animateScale(0.986);
        }}
        onPressOut={() => animateScale(1)}
        style={({ pressed }) => [pressed && !interactionDisabled && styles.orderCardPressed]}
      >
        <Surface mode="flat" style={[styles.orderCardPaper, loading && styles.orderCardPaperLoading]}>
          <View style={styles.orderCardContentPaper}>
        <View style={styles.orderCardBody}>
          <View style={styles.orderCardTopRow}>
            <View style={styles.orderTitleWrap}>
              <View style={styles.orderDocumentRow}>
                <MaterialCommunityIcons name="file-document-outline" size={13} color="#2563EB" />
                <Text style={styles.orderTitle} numberOfLines={1}>{orderTitle(order)}</Text>
              </View>
              <View style={styles.orderCounterpartyRow}>
                <View style={styles.orderCounterpartyIcon}>
                  <MaterialCommunityIcons name="account-outline" size={12} color="#64748B" />
                </View>
                <Text style={styles.orderCounterparty} numberOfLines={1}>{order.counterparty?.name || 'Контрагент не выбран'}</Text>
              </View>
            </View>
            <View style={styles.orderAmountWrap}>
              <Text style={styles.orderAmount} numberOfLines={1}>{formatMoney(order.totalAmount || 0, order.currency)}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color="#94A3B8" />
          </View>
          <View style={styles.orderCardBottomRow}>
            <View style={[styles.orderStatusPill, orderStatusTone(order.status), hasProblem && styles.orderStatusProblem]}>
              <MaterialCommunityIcons name={statusIcon.name as any} size={14} color={statusIcon.color} />
              <Text style={[styles.orderStatusText, { color: statusIcon.color }]} numberOfLines={1}>
                {orderStatusLabel(order.status)}
              </Text>
            </View>
            <View style={styles.orderMetaRow}>
              <View style={styles.orderMetaItem}>
                <MaterialCommunityIcons name="format-list-numbered" size={13} color="#64748B" />
                <Text style={styles.orderMetaCompact} numberOfLines={1}>{itemsCount} поз.</Text>
              </View>
              <View style={styles.orderMetaItem}>
                <MaterialCommunityIcons name="truck-outline" size={13} color="#64748B" />
                <Text style={styles.orderMetaCompact} numberOfLines={1}>{formatDateOnly(order.deliveryDate)}</Text>
              </View>
              <View style={styles.orderMetaItemWide}>
                <MaterialCommunityIcons name="clock-outline" size={13} color="#94A3B8" />
                <Text style={styles.orderUpdated} numberOfLines={1}>{formatDateTime(activityAt)}</Text>
              </View>
            </View>
          </View>
          {hasProblem ? (
            <View style={styles.orderProblemRow}>
              <MaterialCommunityIcons name="alert-circle-outline" size={14} color="#B91C1C" />
              <Text style={styles.orderProblemText} numberOfLines={1}>
                {order.lastExportError || order.last1cError || 'Требуется внимание'}
              </Text>
            </View>
          ) : null}
        </View>
          </View>
          {loading ? (
            <View pointerEvents="none" style={styles.orderCardLoadingOverlay}>
              <View style={styles.orderCardLoadingScrim} />
              <ActivityIndicator size={22} color="#2563EB" />
            </View>
          ) : null}
        </Surface>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 12, gap: 10, paddingBottom: 110 },
  editorPane: { width: '100%' },
  editorPaneHidden: { display: 'none' },
  editorHeaderPane: { paddingTop: 8 },
  editorItemsContent: { flexGrow: 1 },
  ordersStage: { flex: 1 },
  ordersContent: { padding: 8, gap: 7, paddingBottom: 150 },
  contentTablet: { maxWidth: 760, alignSelf: 'center', width: '100%' },
  panelCard: { borderColor: '#DBEAFE', overflow: 'hidden' },
  cardContent: { paddingTop: 0, paddingBottom: 0 },
  panel: { borderRadius: 18, borderWidth: 1, borderColor: '#DBEAFE', padding: 12, gap: 10, shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },
  cardStack: { gap: 4 },
  documentHeaderSlot: { gap: 7 },
  documentHeaderDocumentRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6 },
  documentHeaderMoreButton: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  documentHeaderTopMoreButton: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  documentStatusPill: { flexShrink: 0, maxWidth: 112, minHeight: 24, borderRadius: 999, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF', paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  documentStatusText: { color: '#1D4ED8', fontSize: 12, lineHeight: 15, fontWeight: '900', includeFontPadding: false },
  documentTitle: { flex: 1, minWidth: 58, fontSize: 18, fontWeight: '900', color: '#0F172A', lineHeight: 22, includeFontPadding: false },
  documentSavePill: { flexShrink: 1, maxWidth: 116, minHeight: 24, borderRadius: 999, backgroundColor: '#F8FAFC', paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  documentSubtitle: { minWidth: 0, fontSize: 11, fontWeight: '800', color: '#64748B', lineHeight: 14, includeFontPadding: false },
  documentTabsRow: { minHeight: 38, borderRadius: 12, borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: '#F8FAFC', padding: 3, flexDirection: 'row', alignItems: 'center', gap: 3 },
  documentTab: { flex: 1, minHeight: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5, position: 'relative' },
  documentTabActive: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#BFDBFE' },
  documentTabText: { fontSize: 12.5, fontWeight: '900', color: '#334155' },
  documentTabTextActive: { color: '#1D4ED8' },
  documentTabCountBadge: { minWidth: 22, height: 20, borderRadius: 999, paddingHorizontal: 6, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  documentTabCountBadgeActive: { backgroundColor: '#DBEAFE' },
  documentTabCountText: { fontSize: 11, lineHeight: 13, fontWeight: '900', color: '#475569', includeFontPadding: false },
  documentTabCountTextActive: { color: '#1D4ED8' },
  documentHeaderDivider: { height: 1, marginHorizontal: -9, backgroundColor: '#E2E8F0' },
  documentBottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 80, elevation: 18, borderTopLeftRadius: 22, borderTopRightRadius: 22, shadowColor: '#0F172A', shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: -6 } },
  documentBottomGlass: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 10, paddingTop: 8 },
  documentBottomContent: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 8 },
  documentBottomInfo: { flex: 1, minWidth: 0, gap: 6 },
  documentBottomMetaRow: { minHeight: 25, flexDirection: 'row', alignItems: 'center', gap: 6 },
  documentBottomTotalPill: { flexShrink: 0, maxWidth: 132, minHeight: 25, borderRadius: 999, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF', paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  documentBottomTotalText: { color: '#2563EB', fontSize: 13, lineHeight: 16, fontWeight: '900', includeFontPadding: false },
  documentBottomDatePill: { flex: 1, minWidth: 0, minHeight: 25, borderRadius: 999, backgroundColor: '#F8FAFC', paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  documentBottomDateText: { flex: 1, minWidth: 0, color: '#475569', fontSize: 11.5, lineHeight: 14, fontWeight: '800', includeFontPadding: false },
  documentBottomCounterpartyRow: { minHeight: 24, borderRadius: 8, backgroundColor: '#F8FAFC', paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 5 },
  documentBottomCounterpartyText: { flex: 1, minWidth: 0, color: '#334155', fontSize: 11.5, lineHeight: 14, fontWeight: '800', includeFontPadding: false },
  documentBottomPrimaryButton: { width: 106, height: 46, borderRadius: 13, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  documentBottomPrimaryButtonSubmit: { backgroundColor: '#16A34A' },
  documentBottomPrimaryText: { color: '#FFFFFF', fontSize: 12.5, lineHeight: 16, fontWeight: '900', includeFontPadding: false },
  flatPressed: { opacity: 0.78 },
  compactSearchShell: { height: 34, minHeight: 34, flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingRight: 2, gap: 6, overflow: 'hidden' },
  compactSearchInputBase: { flex: 1, minWidth: 0, height: 32, paddingHorizontal: 0, paddingVertical: 0, margin: 0, color: '#0F172A', fontSize: 13, lineHeight: 16, fontWeight: '800', includeFontPadding: false, textAlignVertical: 'center' },
  compactSearchClear: { width: 28, height: 28, marginRight: 0, alignItems: 'center', justifyContent: 'center' },
  flatField: { minHeight: 48, borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: '#FFFFFF', borderRadius: 4, paddingLeft: 8, paddingRight: 5, paddingVertical: 5, flexDirection: 'row', alignItems: 'center' },
  flatFieldIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', marginRight: 7 },
  flatFieldTextWrap: { flex: 1, minWidth: 0, justifyContent: 'center' },
  flatFieldLabel: { marginBottom: 1, fontSize: 10.5, color: '#64748B', fontWeight: '900', textTransform: 'uppercase' },
  flatFieldValue: { fontSize: 13, lineHeight: 16, color: '#0F172A', fontWeight: '900' },
  flatFieldActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  flatFieldAction: { width: 30, height: 30, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  flatResetButton: { width: 42, alignSelf: 'stretch', minHeight: 48, borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: '#FFFFFF', borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  flatDateInput: { borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: '#FFFFFF', borderRadius: 4, paddingHorizontal: 8, paddingTop: 5, paddingBottom: 6, gap: 3 },
  flatCommentInput: { width: '100%', alignSelf: 'stretch', minHeight: 58, backgroundColor: '#FFFFFF', fontSize: 13 },
  flatCommentInputContent: { width: '100%', minHeight: 58, paddingTop: 8, paddingBottom: 8, textAlignVertical: 'top' },
  flatInputOutline: { borderRadius: 4, borderColor: '#D8E2F0' },
  readOnlyFieldSurface: { borderColor: 'rgba(216, 226, 240, 0.7)', backgroundColor: 'rgba(255, 255, 255, 0.64)' },
  readOnlyFieldLabel: { color: 'rgba(100, 116, 139, 0.6)' },
  readOnlyFieldValue: { color: 'rgba(15, 23, 42, 0.62)' },
  readOnlyInputContent: { color: 'rgba(15, 23, 42, 0.62)' },
  readOnlyInputOutline: { borderColor: 'rgba(216, 226, 240, 0.7)' },
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
  ordersToolbar: { backgroundColor: 'transparent', borderRadius: 0, borderWidth: 0, padding: 0, gap: 0, marginBottom: 1 },
  filtersPickerSheet: { paddingHorizontal: 0, paddingBottom: 0 },
  filtersScroll: { flex: 1, minHeight: 0 },
  filtersForm: { gap: 7, paddingHorizontal: 8, paddingBottom: 10 },
  filtersSection: { gap: 7 },
  filtersSectionTitle: { display: 'none' },
  filtersFieldLabel: { marginBottom: 3, fontSize: 10.5, lineHeight: 12, color: '#64748B', fontWeight: '800', textTransform: 'uppercase', includeFontPadding: false },
  filtersUnifiedField: { height: 42, borderRadius: 4, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', paddingLeft: 8, paddingRight: 8, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  filtersFieldIconSlot: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  filtersFieldContent: { flex: 1, minWidth: 0, height: 40, justifyContent: 'center' },
  filtersFieldRightSlot: { width: 24, height: 28, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  filtersSelectField: { height: 42, borderRadius: 4, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  filtersSelectText: { width: '100%', minWidth: 0, fontSize: 12, lineHeight: 16, fontWeight: '800', color: '#0F172A', includeFontPadding: false },
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
  filtersInnerTextInputContent: { width: '100%', height: 40, minHeight: 40, paddingHorizontal: 0, paddingVertical: 0, paddingTop: 3, margin: 0, fontSize: 12, lineHeight: 16, fontWeight: '800', color: '#0F172A', includeFontPadding: false, textAlignVertical: 'center' },
  filtersInputOutline: { borderRadius: 4, borderColor: '#CBD5E1' },
  filtersSuggestions: { marginTop: 3, borderWidth: 1, borderColor: '#D8E2F0', borderRadius: 4, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  filtersSuggestionItem: { minHeight: 34, paddingVertical: 0 },
  filtersSuggestionTitle: { fontSize: 11.5, fontWeight: '800', color: '#0F172A' },
  filtersAmountRow: { flexDirection: 'row', gap: 6 },
  filtersAmountInput: { flex: 1 },
  filtersToggle: { height: 42, borderRadius: 4, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  filtersToggleActive: { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' },
  filtersToggleText: { width: '100%', minWidth: 0, fontSize: 12, lineHeight: 16, fontWeight: '800', color: '#334155', includeFontPadding: false },
  filtersToggleTextActive: { color: '#1D4ED8' },
  filtersSheetActions: { flexShrink: 0, flexDirection: 'row', gap: 6, paddingTop: 8, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  filtersSheetActionButton: { flex: 1, borderRadius: 4, borderColor: '#CBD5E1' },
  filtersSheetActionContent: { height: 34 },
  filtersSheetActionLabel: { fontSize: 12, fontWeight: '900', marginVertical: 0 },
  ordersTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ordersTitle: { fontSize: 16, fontWeight: '900', color: '#0F172A' },
  ordersSubtitle: { marginTop: 1, fontSize: 10.5, fontWeight: '700', color: '#64748B' },
  ordersCompactToolbarRow: { minHeight: 36, flexDirection: 'row', gap: 6, alignItems: 'center' },
  ordersSearchbar: { flex: 1, height: 36, backgroundColor: '#F8FAFC', borderRadius: 9, borderWidth: 1, borderColor: '#D8E2F0', elevation: 0 },
  ordersSearchbarInput: { fontSize: 13, color: '#0F172A', fontWeight: '700' },
  ordersActionRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  ordersIconButton: { width: 36, height: 36, margin: 0, borderRadius: 9, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' },
  ordersIconButtonPrimary: { borderColor: '#16A34A', backgroundColor: '#16A34A' },
  ordersFilterButton: { width: 36, height: 36, borderRadius: 9, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  ordersToolbarLoading: { width: 30, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  ordersFilterBadge: { position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 999, paddingHorizontal: 4, backgroundColor: '#2563EB', borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  ordersFilterBadgeText: { color: '#FFFFFF', fontSize: 9, lineHeight: 11, fontWeight: '900' },
  ordersScreenSkeleton: { gap: 7 },
  ordersSkeletonToolbar: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6 },
  ordersSkeletonSearch: { flex: 1, height: 36, borderRadius: 9, borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: '#EEF4FB' },
  ordersSkeletonAction: { width: 36, height: 36, borderRadius: 9, borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: '#EEF4FB' },
  ordersSkeletonActionPrimary: { borderColor: '#BBF7D0', backgroundColor: '#DCFCE7' },
  ordersSkeletonList: { gap: 7 },
  ordersSkeletonCard: { minHeight: 116, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 8, gap: 7 },
  ordersSkeletonTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  ordersSkeletonTitleBlock: { flex: 1, minWidth: 0, gap: 5 },
  ordersSkeletonDocument: { width: 108, height: 23, borderRadius: 8, borderWidth: 1, borderColor: '#DBEAFE', backgroundColor: '#EFF6FF' },
  ordersSkeletonCounterparty: { width: '76%', height: 23, borderRadius: 8, backgroundColor: '#F8FAFC' },
  ordersSkeletonAmount: { width: 72, height: 16, borderRadius: 999, backgroundColor: '#DBEAFE', marginTop: 2 },
  ordersSkeletonChevron: { width: 18, height: 18, borderRadius: 999, backgroundColor: '#F1F5F9' },
  ordersSkeletonMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ordersSkeletonPill: { width: 100, height: 24, borderRadius: 999, backgroundColor: '#F1F5F9' },
  ordersSkeletonMeta: { width: 70, height: 13, borderRadius: 999, backgroundColor: '#EEF2F7' },
  ordersSkeletonMetaShort: { flex: 1, height: 13, borderRadius: 999, backgroundColor: '#F1F5F9' },
  documentOpenLoader: { flex: 1, minHeight: 360, justifyContent: 'flex-start', paddingTop: 12 },
  documentOpenLoaderCard: { borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 12, gap: 10 },
  documentOpenLoaderHeader: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 9 },
  documentOpenLoaderTitle: { flex: 1, minWidth: 0, color: '#0F172A', fontSize: 13, lineHeight: 17, fontWeight: '900' },
  documentOpenLoaderLine: { width: '78%', height: 22, borderRadius: 8, backgroundColor: '#F1F5F9' },
  documentOpenLoaderLineShort: { width: '54%', backgroundColor: '#EEF4FB' },
  documentOpenLoaderGrid: { gap: 8, paddingTop: 2 },
  documentOpenLoaderField: { height: 48, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  documentOpenLoaderFieldWide: { height: 76, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  ordersPrimaryButton: { width: 30, minWidth: 30, borderRadius: 4 },
  ordersSecondaryButton: { width: 30, minWidth: 30, borderRadius: 4, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' },
  ordersButtonContent: { width: 30, height: 30, paddingHorizontal: 0 },
  ordersPrimaryButtonLabel: { fontSize: 10.5, fontWeight: '900', marginVertical: 0, marginHorizontal: 0 },
  ordersSecondaryButtonLabel: { fontSize: 10.5, fontWeight: '900', marginVertical: 0, marginHorizontal: 0, color: '#2563EB' },
  orderStat: { flex: 1, minHeight: 28, borderRadius: 4, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderStatValue: { fontSize: 13, fontWeight: '900', color: '#0F172A', lineHeight: 15 },
  orderStatLabel: { fontSize: 9.5, fontWeight: '800', color: '#64748B', textTransform: 'uppercase' },
  orderCardPressable: { width: '100%' },
  orderCardPressed: { opacity: 0.96 },
  orderCardPaper: { position: 'relative', borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', borderRadius: 12, overflow: 'hidden' },
  orderCardPaperLoading: { borderColor: '#BFDBFE' },
  orderCardContentPaper: { padding: 0, paddingHorizontal: 0, paddingVertical: 0 },
  orderStatusRail: { width: 3, backgroundColor: '#E2E8F0' },
  orderStatusRailSelected: { backgroundColor: '#2563EB' },
  orderCardBody: { flex: 1, minWidth: 0, paddingHorizontal: 10, paddingVertical: 8, gap: 7 },
  orderCardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  orderTitleWrap: { flex: 1, minWidth: 0, gap: 5 },
  orderAmountWrap: { maxWidth: 116, alignItems: 'flex-end', gap: 2 },
  orderCardBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  orderCard: { borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', padding: 12, gap: 7 },
  orderDocumentRow: { alignSelf: 'flex-start', maxWidth: '100%', minHeight: 23, borderRadius: 8, borderWidth: 1, borderColor: '#DBEAFE', backgroundColor: '#EFF6FF', paddingHorizontal: 7, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 },
  orderTitle: { flexShrink: 1, minWidth: 0, fontSize: 13.5, fontWeight: '900', color: '#0F172A', lineHeight: 16 },
  orderAmount: { fontSize: 13, lineHeight: 16, fontWeight: '900', color: '#2563EB' },
  orderStatusBadge: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 999, paddingHorizontal: 0, paddingVertical: 0 },
  orderStatusPill: { flexShrink: 0, minHeight: 24, borderRadius: 999, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  orderStatusProblem: { backgroundColor: '#FEE2E2' },
  orderStatusText: { fontSize: 10.5, lineHeight: 13, fontWeight: '900' },
  orderStatusNeutral: { backgroundColor: '#F1F5F9' },
  orderStatusNeutralText: { color: '#334155' },
  orderStatusInfo: { backgroundColor: '#DBEAFE' },
  orderStatusInfoText: { color: '#1D4ED8' },
  orderStatusSuccess: { backgroundColor: '#DCFCE7' },
  orderStatusSuccessText: { color: '#166534' },
  orderStatusDanger: { backgroundColor: '#FEE2E2' },
  orderStatusDangerText: { color: '#B91C1C' },
  orderCounterpartyRow: { minHeight: 23, borderRadius: 8, backgroundColor: '#F8FAFC', paddingLeft: 4, paddingRight: 7, flexDirection: 'row', alignItems: 'center', gap: 5 },
  orderCounterpartyIcon: { width: 18, height: 18, borderRadius: 6, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  orderCounterparty: { flex: 1, minWidth: 0, fontSize: 11.5, color: '#334155', fontWeight: '800', lineHeight: 14 },
  orderMetaRow: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'nowrap', gap: 6, alignItems: 'center' },
  orderMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  orderMetaItemWide: { flex: 1, minWidth: 104, flexDirection: 'row', alignItems: 'center', gap: 3 },
  orderMetaCompact: { fontSize: 10.5, color: '#64748B', fontWeight: '800', lineHeight: 13 },
  orderMetricsRow: { flexDirection: 'row', gap: 6 },
  orderMetric: { flex: 1, minWidth: 0, borderRadius: 6, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 7, paddingVertical: 5 },
  orderMetricLabel: { fontSize: 9, fontWeight: '900', color: '#64748B', textTransform: 'uppercase' },
  orderMetricValue: { marginTop: 2, fontSize: 11.5, fontWeight: '900', color: '#0F172A' },
  orderUpdated: { flex: 1, minWidth: 0, fontSize: 10.5, color: '#94A3B8', fontWeight: '700', lineHeight: 13 },
  orderProblemRow: { minHeight: 24, borderRadius: 8, backgroundColor: '#FEF2F2', paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 5 },
  orderProblemText: { flex: 1, minWidth: 0, fontSize: 11, lineHeight: 14, fontWeight: '800', color: '#B91C1C' },
  orderCardLoadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 4, elevation: 4 },
  orderCardLoadingScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(248, 250, 252, 0.78)' },
  orderMeta: { fontSize: 12, color: '#64748B', fontWeight: '700' },
  loadMoreButton: { marginTop: 2, borderRadius: 12, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' },
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
  lineList: { backgroundColor: '#F8FAFC', paddingTop: 8, gap: 8 },
  productPreviewCard: { height: 96, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', overflow: 'hidden', flexDirection: 'row', alignItems: 'stretch' },
  productPreviewCardReadOnly: { borderColor: 'rgba(216, 226, 240, 0.7)', backgroundColor: 'rgba(255, 255, 255, 0.64)' },
  productPreviewCardInvalid: { borderColor: '#EF4444', backgroundColor: '#FFF7F7' },
  productPreviewMedia: { width: 78, height: '100%', backgroundColor: '#F1F5F9', overflow: 'hidden', borderRightWidth: 1, borderRightColor: '#E2E8F0' },
  productPreviewMediaReadOnly: { backgroundColor: 'rgba(241, 245, 249, 0.56)', borderRightColor: 'rgba(226, 232, 240, 0.66)' },
  productPreviewIndexBadge: { position: 'absolute', top: 5, left: 5, minWidth: 24, height: 22, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.9)', borderWidth: 1, borderColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' },
  productPreviewIndexBadgeReadOnly: { backgroundColor: 'rgba(255, 255, 255, 0.62)', borderColor: 'rgba(191, 219, 254, 0.62)' },
  productPreviewIndex: { color: '#2563EB', fontSize: 11, fontWeight: '900', textAlign: 'center', lineHeight: 14 },
  productPreviewIndexReadOnly: { color: 'rgba(37, 99, 235, 0.58)' },
  productPreviewImage: { width: 78, height: 96, backgroundColor: '#F1F5F9' },
  productPreviewImageReadOnly: { backgroundColor: 'rgba(241, 245, 249, 0.5)', opacity: 0.72 },
  productImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  productPreviewBody: { flex: 1, minWidth: 0, justifyContent: 'center', paddingLeft: 10, paddingRight: 10, paddingVertical: 8, gap: 4 },
  productPreviewTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  productPreviewTitle: { color: '#0F172A', fontSize: 13, fontWeight: '900', lineHeight: 16, paddingRight: 28 },
  productPreviewTitleReadOnly: { color: 'rgba(15, 23, 42, 0.62)' },
  productPreviewRemoveButton: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 8, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  productPreviewMeta: { color: '#64748B', fontSize: 11, fontWeight: '700', lineHeight: 14, paddingRight: 2 },
  productPreviewMetaReadOnly: { color: 'rgba(100, 116, 139, 0.58)' },
  productPreviewBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  productPreviewFormulaRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  productPreviewQuantity: { color: '#334155', fontSize: 13, fontWeight: '900', lineHeight: 16, includeFontPadding: false },
  productPreviewQuantityReadOnly: { color: 'rgba(15, 23, 42, 0.62)' },
  productPreviewPackage: { maxWidth: 44, color: '#64748B', fontSize: 12, fontWeight: '900', lineHeight: 15, includeFontPadding: false },
  productPreviewFormulaSeparator: { color: '#94A3B8', fontSize: 12, fontWeight: '800', lineHeight: 15, includeFontPadding: false },
  productPreviewFormulaSeparatorReadOnly: { color: 'rgba(148, 163, 184, 0.54)' },
  productPreviewPrice: { flexShrink: 1, minWidth: 0, color: '#334155', fontSize: 13, fontWeight: '900', lineHeight: 16, includeFontPadding: false },
  productPreviewPriceReadOnly: { color: 'rgba(15, 23, 42, 0.62)' },
  productPreviewTotal: { maxWidth: 112, color: '#2563EB', fontSize: 14, fontWeight: '900', lineHeight: 17, textAlign: 'right', includeFontPadding: false },
  productPreviewTotalReadOnly: { color: 'rgba(37, 99, 235, 0.58)' },
  addProductListCard: { minHeight: 60, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#93C5FD', backgroundColor: '#F8FBFF', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  addProductListText: { color: '#2563EB', fontSize: 13, fontWeight: '800' },
  productEditorSheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 0, paddingTop: 0, overflow: 'hidden', shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: -4 } },
  productEditorScroll: { flex: 1, minHeight: 0 },
  productEditorContent: { flexShrink: 0, paddingTop: 12, paddingBottom: 10, gap: 10 },
  productEditorHeaderBlock: { flexShrink: 0, position: 'relative', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  productEditorHeaderBlockReadOnly: { borderBottomColor: 'rgba(226, 232, 240, 0.66)', backgroundColor: 'rgba(255, 255, 255, 0.66)' },
  productEditorMediaRow: { position: 'relative', height: 142, flexDirection: 'row', alignItems: 'stretch', paddingLeft: 156, paddingRight: 42 },
  productEditorImageWrap: { position: 'absolute', top: 0, left: 0, width: 156, height: 142, overflow: 'hidden', backgroundColor: '#F3F4F6', borderTopLeftRadius: 18, borderRightWidth: 1, borderRightColor: '#E2E8F0' },
  productEditorImageWrapReadOnly: { backgroundColor: 'rgba(241, 245, 249, 0.56)', borderRightColor: 'rgba(226, 232, 240, 0.66)' },
  productEditorImage: { width: 156, height: 142, borderRadius: 0, backgroundColor: '#F3F4F6' },
  productEditorImageReadOnly: { backgroundColor: 'rgba(241, 245, 249, 0.5)', opacity: 0.72 },
  productEditorCloseButton: { position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  productEditorCloseButtonReadOnly: { backgroundColor: 'rgba(255, 255, 255, 0.62)' },
  productEditorInfo: { flex: 1, minWidth: 0, paddingLeft: 12, paddingRight: 0, paddingVertical: 14, justifyContent: 'center', gap: 9 },
  productEditorInfoRow: { gap: 1 },
  productEditorInfoLabel: { color: '#64748B', fontSize: 9.5, lineHeight: 12, fontWeight: '800', textTransform: 'uppercase' },
  productEditorInfoValue: { color: '#0F172A', fontSize: 12, lineHeight: 15, fontWeight: '800' },
  productEditorTitle: { color: '#0F172A', fontSize: 15, fontWeight: '800', lineHeight: 19, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12 },
  productEditorLabel: { color: '#64748B', fontSize: 11, lineHeight: 14, fontWeight: '800', textTransform: 'uppercase' },
  productEditorLabelReadOnly: { color: 'rgba(100, 116, 139, 0.58)' },
  productEditorFieldsRow: { paddingHorizontal: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  productEditorAdaptiveField: { flexGrow: 0, flexShrink: 0, gap: 5 },
  productEditorQtyStepper: { width: '100%', height: 52, borderRadius: 5, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  productEditorQtyButton: { width: 40, height: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  productEditorQtyInput: { flex: 1, height: 50, minHeight: 50, backgroundColor: '#FFFFFF', textAlign: 'center' },
  productEditorQtyInputContent: { height: 50, paddingHorizontal: 0, fontSize: 18, color: '#0F172A', fontWeight: '800', textAlign: 'center' },
  productEditorInputOutline: { borderWidth: 0, borderRadius: 0, borderColor: 'transparent' },
  productEditorPackageRow: { width: '100%', height: 52, borderRadius: 5, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', flexDirection: 'row', overflow: 'hidden', padding: 2 },
  productEditorPackageReadonly: { width: '100%', height: 52, borderRadius: 5, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  productEditorPackageReadonlyText: { color: '#64748B', fontSize: 11, fontWeight: '800' },
  productEditorPackageButton: { flex: 1, minWidth: 0, height: 46, borderRadius: 3, borderWidth: 1, borderColor: 'transparent', backgroundColor: 'transparent', paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  productEditorPackageButtonActive: { borderColor: '#2563EB', backgroundColor: '#FFFFFF' },
  productEditorPackageText: { color: '#64748B', fontSize: 11, fontWeight: '700' },
  productEditorPackageTextActive: { color: '#2563EB', fontWeight: '900' },
  productEditorPriceBox: { height: 52, borderRadius: 5, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', paddingRight: 3 },
  productEditorPriceBoxInvalid: { borderColor: '#DC2626', backgroundColor: '#FEF2F2' },
  productEditorPriceInput: { flex: 1, height: 50, minHeight: 50, backgroundColor: 'transparent' },
  productEditorPriceInputContent: { height: 50, paddingHorizontal: 7, fontSize: 17, color: '#0F172A', fontWeight: '800', textAlign: 'center' },
  productEditorCurrency: { marginRight: 7, color: '#64748B', fontSize: 16, fontWeight: '700' },
  productEditorPriceReset: { width: 32, height: 36, borderLeftWidth: 1, borderLeftColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  productEditorFooter: { borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingTop: 9, paddingBottom: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  productEditorReadOnlySurface: { borderColor: 'rgba(203, 213, 225, 0.6)', backgroundColor: 'rgba(255, 255, 255, 0.62)' },
  productEditorReadOnlySoftSurface: { borderColor: 'rgba(226, 232, 240, 0.66)', backgroundColor: 'rgba(248, 250, 252, 0.56)' },
  productEditorReadOnlyButton: { opacity: 0.74 },
  productEditorReadOnlyButtonActive: { borderColor: 'rgba(37, 99, 235, 0.36)', backgroundColor: 'rgba(255, 255, 255, 0.5)' },
  productEditorReadOnlyText: { color: 'rgba(15, 23, 42, 0.58)' },
  productEditorReadOnlyMutedText: { color: 'rgba(100, 116, 139, 0.58)' },
  productEditorReadOnlyInputText: { color: 'rgba(15, 23, 42, 0.62)' },
  productEditorReadOnlyIconButton: { borderLeftColor: 'rgba(226, 232, 240, 0.62)' },
  productEditorReadOnlyStepButton: { backgroundColor: 'rgba(248, 250, 252, 0.5)' },
  productEditorReadOnlyInputSurface: { backgroundColor: 'rgba(255, 255, 255, 0.35)' },
  productEditorFooterReadOnly: { borderTopColor: 'rgba(226, 232, 240, 0.66)', backgroundColor: 'rgba(255, 255, 255, 0.66)' },
  productEditorReadOnlyTotalText: { color: 'rgba(15, 23, 42, 0.66)' },
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
  itemsFlatSection: { backgroundColor: '#F8FAFC' },
  itemsToolbarWrap: { position: 'relative', backgroundColor: '#FFFFFF', zIndex: 30, paddingHorizontal: 10, paddingTop: 7, paddingBottom: 9, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  itemsToolbarHeaderWrap: { position: 'relative', backgroundColor: '#FFFFFF', zIndex: 2 },
  itemsFlatToolbar: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', zIndex: 2 },
  itemsSearchFlat: { flex: 1, height: 36, backgroundColor: '#F8FAFC', borderRadius: 9, borderWidth: 1, borderColor: '#D8E2F0', elevation: 0 },
  itemsSearchFlatInput: { fontSize: 13, color: '#0F172A', fontWeight: '700' },
  itemsToolbarButton: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  itemsToolbarButtonSuccess: { backgroundColor: '#16A34A' },
  itemsToolbarButtonDanger: { backgroundColor: '#DC2626' },
  itemsSearchResults: { position: 'absolute', top: 47, left: 10, right: 10, zIndex: 30, elevation: 12, maxHeight: 224, borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: 'rgba(255,255,255,0.96)', overflow: 'hidden', borderRadius: 12, shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  itemsSearchResultsPortal: { position: 'absolute', zIndex: 999, elevation: 18, maxHeight: 224, borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: 'rgba(255,255,255,0.98)', overflow: 'hidden', borderRadius: 12, shadowColor: '#0F172A', shadowOpacity: 0.14, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
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
  searchbar: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', elevation: 0 },
  searchbarInput: { minHeight: 0, fontSize: 14, color: '#0F172A' },
  pickerToolbar: { paddingHorizontal: 8, paddingTop: 6, paddingBottom: 4, gap: 6 },
  pickerBottomSheetWrap: { position: 'absolute', zIndex: 14, bottom: 0 },
  pickerBottomSheet: { width: '100%', height: '100%', borderTopLeftRadius: 8, borderTopRightRadius: 8, borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: '#FFFFFF', paddingTop: 5, paddingBottom: FLOATING_TAB_BAR_HEIGHT + FLOATING_TAB_BAR_BOTTOM_OFFSET + 8, gap: 0, shadowColor: '#0F172A', shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: -6 }, elevation: 14 },
  pickerBottomSheetHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 999, backgroundColor: '#D0D5DD', marginBottom: 12 },
  pickerBottomSheetHeader: { minHeight: 44, paddingLeft: 16, paddingRight: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerBottomSheetTitleRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  pickerBottomSheetTitle: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 20, fontWeight: '800', color: '#111827' },
  pickerBottomSheetClose: { width: 36, height: 36, borderRadius: 999, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  pickerBottomSheetBody: { flex: 1, minHeight: 0, gap: 0 },
  pickerBottomSheetNativeBackground: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  pickerBottomSheetNativeHandle: { paddingTop: 8, backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  pickerBottomSheetNativeContent: { flex: 1, minHeight: 0, backgroundColor: '#FFFFFF' },
  pickerBottomSheetNativeHandleOverlay: { position: 'absolute', top: 0, left: 0, right: 0, height: 0, paddingTop: 0, backgroundColor: 'transparent', zIndex: 10 },
  pickerBottomSheetHandleOverlay: { position: 'absolute', top: 10, left: '50%', marginLeft: -18, marginBottom: 0, zIndex: 10 },
  pickerSearchInput: {},
  pickerSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickerScroll: { flex: 1, minHeight: 0 },
  pickerSearchFlat: { flex: 1, minWidth: 0, height: 34, backgroundColor: '#FFFFFF', borderRadius: 4, borderWidth: 1, borderColor: '#CBD5E1', elevation: 0 },
  productPickerSearchFlat: { flex: 1, minWidth: 0 },
  pickerSearchInputFlat: { fontSize: 13, color: '#0F172A', fontWeight: '800' },
  productStockToggle: { width: 34, height: 34, borderRadius: 9, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  productStockToggleActive: { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' },
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
  dialogPaper: { borderRadius: 16, backgroundColor: '#FFFFFF' },
  confirmDialogPaper: { maxWidth: 430, width: '90%', alignSelf: 'center', borderRadius: 28, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  confirmDialogContent: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16, gap: 14 },
  confirmDialogTitle: { color: '#0F172A', fontSize: 22, lineHeight: 27, fontWeight: '900', textAlign: 'center', paddingTop: 6, paddingHorizontal: 4 },
  confirmDialogMessage: { color: '#475569', fontSize: 14, lineHeight: 20, textAlign: 'center', fontWeight: '700' },
  confirmDialogActions: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 2, flexWrap: 'wrap' },
  confirmDialogTextButton: { flex: 1, borderRadius: 14, borderColor: '#CBD5E1', minWidth: 128 },
  confirmDialogPrimaryButton: { flex: 1, borderRadius: 14, minWidth: 128 },
  confirmDialogButtonContent: { minHeight: 46, paddingHorizontal: 12 },
  confirmDialogButtonLabel: { marginVertical: 0, fontSize: 14, fontWeight: '900' },
  modalBackdropPaper: { flex: 1, margin: 0, justifyContent: 'flex-end' },
  modalBackdropPaperFull: { justifyContent: 'flex-end' },
  modalSheetPaper: { maxHeight: '86%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  modalSheetPaperFull: { height: '100%', borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  sheetHeader: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 8 },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: '#111827' },
  sheetCloseButton: { margin: 0 },
  sheetBody: { flex: 1, minHeight: 0, padding: 14, gap: 12 },
});
