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
  getClientOrderItemsCount,
  getDisplayedUnitPriceValue,
  getClientOrdersResponsiveMetrics,
  getOrderDisplayStatus,
  getOrderDisplayStatusLabelWithQueue,
  getDraftItemCancelReason,
  hasManualPrice,
  buildNewItem,
  isCancelledDraftItem,
  isValidManualPriceValue,
  isValidQuantityValue,
  isWeightDraftItem,
  displayedUnitPriceToBasePriceInput,
  normalizePriceInput,
  normalizeQuantityInput,
  resolveClientOrdersEditorTier,
  resolveClientOrdersLayoutTier,
  type DraftItem,
} from './lib/clientOrdersShared';
import {
  formatDateOnly,
  formatProductTransferLabel,
  formatStockInlineLabel,
  getPackageDisplayText,
  getPickerItemMeta,
  getPickerItemTitle,
  getSelectedPickerGuid,
  isProductAlreadyInOrder,
  packageLabel,
  removeOrderItemsFromProductSelection,
  resolveProductPickerPressAction,
  sortDeliveryAddressOptions,
  toggleProductSelection,
  transferSelectedProductsToOrder,
  type ClientOrdersPickerKind,
  type ProductSelectionMap,
  unitLabel,
} from './lib/clientOrdersUi';
import { hasMorePage } from './lib/clientOrdersPaging';
import { useClientOrdersWorkspace } from './hooks/useClientOrdersWorkspace';
import { getClientOrderProductsBatch, getClientOrderReferenceDetails } from '@/utils/clientOrdersService';
import type { ClientOrder, ClientOrderCounterpartyOption, ClientOrderOrganization, ClientOrderPriceTypeOption, ClientOrderProduct, ClientOrderReferenceDetails, ClientOrderReferenceKind, ClientOrderWarehouseOption } from '@/utils/clientOrdersService';
import { useServerStatus } from '@/src/shared/network/useServerStatus';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import React from 'react';
import { Animated, BackHandler, findNodeHandle, FlatList, Keyboard, LayoutAnimation, PanResponder, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, UIManager, useWindowDimensions, View } from 'react-native';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, TextInputProps } from 'react-native';
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
type ProductGalleryImage = {
  key: string;
  thumbUrl: string;
  previewUrl: string;
  isMain?: boolean;
};
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
type SegmentedChoice = { value: string | null; label: string };

const PAGE_SIZE = 25;
const PRODUCT_PICKER_PAGE_SIZE = 50;
const PRODUCT_PICKER_PREFETCH_DISTANCE = 1100;
const ITEMS_SEARCH_PAGE_SIZE = 10;
const ORDERS_PREFETCH_DISTANCE = 640;
const IN_STOCK_KEY = 'clientOrders.productPicker.inStockOnly';
const COUNTERPARTY_MANAGER_ONLY_KEY = 'clientOrders.counterpartyPicker.managerOnly';
const SheetScrollView = (PickerBottomSheetScrollView || ScrollView) as any;
const SheetTextInput = (PickerBottomSheetTextInput || TextInput) as any;
const SEARCH_TEXT_INPUT_PROPS: Pick<
  TextInputProps,
  | 'autoCapitalize'
  | 'autoCorrect'
  | 'spellCheck'
  | 'autoComplete'
  | 'textContentType'
  | 'importantForAutofill'
  | 'keyboardType'
  | 'returnKeyType'
  | 'inputMode'
  | 'disableFullscreenUI'
  | 'multiline'
  | 'blurOnSubmit'
> = {
  autoCapitalize: 'none',
  autoCorrect: false,
  spellCheck: false,
  autoComplete: 'off',
  textContentType: 'none',
  importantForAutofill: Platform.OS === 'android' ? 'noExcludeDescendants' : 'no',
  // Android keyboards can ignore autoCorrect=false for normal text/search inputs.
  // visible-password keeps the field readable but disables IME suggestions/autofill.
  keyboardType: Platform.OS === 'android' ? 'visible-password' : 'web-search',
  returnKeyType: 'search',
  inputMode: Platform.OS === 'android' ? undefined : 'search',
  disableFullscreenUI: true,
  multiline: false,
  blurOnSubmit: true,
};
const PAYMENT_FORM_CHOICES: SegmentedChoice[] = [
  { value: null, label: 'Любая' },
  { value: 'Наличная', label: 'Наличная' },
];
const DELIVERY_METHOD_CHOICES: SegmentedChoice[] = [
  { value: 'ДоКлиента', label: 'Наша доставка' },
  { value: 'Самовывоз', label: 'Самовывоз' },
];

function choiceKey(value?: string | null) {
  return value ?? '';
}

function unsupportedChoiceValue(choices: SegmentedChoice[], value?: string | null) {
  if (!value) return null;
  return choices.some((choice) => choice.value === value) ? null : value;
}

function assignComposedRef<T>(targetRef: React.Ref<T> | undefined, value: T | null) {
  if (!targetRef) return;
  if (typeof targetRef === 'function') {
    targetRef(value as T);
    return;
  }
  try {
    (targetRef as React.MutableRefObject<T | null>).current = value;
  } catch {
    // Some refs are read-only wrappers; ignoring keeps the input usable.
  }
}
const DOCUMENT_HEADER_TRANSITION = {
  duration: 320,
  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  update: { type: LayoutAnimation.Types.easeInEaseOut },
  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
};
const DOCUMENT_ITEMS_TOOLBAR_HEIGHT_DELTA = 51;
const LINE_ITEM_SCROLL_ESTIMATE = 116;
const IS_NEW_ARCHITECTURE = !!(globalThis as any).nativeFabricUIManager;
const loadedProductImageUris = new Set<string>();
const failedProductImageUris = new Set<string>();
let lastClientOrdersListScrollY = 0;
type FilterKeyboardFieldKey = 'deliveryDates' | 'updatedDates' | 'amount' | 'items' | 'organization' | 'counterparty' | 'warehouse' | 'priceType';
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

function normalizeSearchText(value: unknown) {
  return String(value ?? '')
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function searchTokens(value: string) {
  return Array.from(new Set(normalizeSearchText(value).split(' ').filter((token) => token.length >= 2)));
}

function flattenSearchText(value: unknown, depth = 0): string {
  if (value === null || value === undefined || depth > 4) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((item) => flattenSearchText(item, depth + 1)).join(' ');
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).map((item) => flattenSearchText(item, depth + 1)).join(' ');
  }
  return '';
}

function matchesTokenSearch(item: unknown, search: string) {
  const tokens = searchTokens(search);
  if (!tokens.length) return true;
  const haystack = normalizeSearchText(flattenSearchText(item));
  return tokens.every((token) => haystack.includes(token));
}

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
function linePackageShortLabel(item: any) {
  const selectedPack = item?.packageGuid
    ? (item?.packages || []).find((pack: any) => pack.guid === item.packageGuid)
    : null;
  if (selectedPack) {
    return packageLabel(selectedPack, item) || selectedPack.unit?.symbol || selectedPack.unit?.name || unitLabel(item?.baseUnit);
  }
  return unitLabel(item?.baseUnit);
}
function productPickerMeta(item: any, context?: { hasPriceType?: boolean; hasWarehouse?: boolean }) {
  const canShowPrice = context?.hasPriceType !== false;
  const canShowStock = context?.hasWarehouse !== false;
  const salePrice = item?.basePrice ?? item?.price;
  return {
    code: item?.code || 'Без кода',
    receiptPrice: !canShowPrice || salePrice === null || salePrice === undefined
      ? '—'
      : formatMoney(salePrice, item.currency),
    stock: canShowStock ? formatStockInlineLabel(item?.stock, item?.baseUnit) || '—' : '—',
  };
}
function getDraftItemImageUri(item: any) {
  return getProductGalleryImages(item)[0]?.thumbUrl || null;
}
function getProductImageCacheKey(item: any, imageUri?: string | null, kind = 'thumb') {
  if (!imageUri) return null;
  const ownerKey = item?.productGuid || item?.guid || item?.lineGuid || imageUri;
  return item?.imageHash ? `${ownerKey}:${kind}:${item.imageHash}` : imageUri;
}
async function hasCachedProductImage(imageCacheKey?: string | null, imageUri?: string | null) {
  const keys = [imageCacheKey, imageUri].filter(Boolean) as string[];
  const uniqueKeys = Array.from(new Set(keys));
  for (const key of uniqueKeys) {
    try {
      const path = await ExpoImage.getCachePathAsync(key);
      if (path) return true;
    } catch {
      continue;
    }
  }
  return false;
}
function hasProductImage(item: any) {
  return getProductGalleryImages(item).length > 0;
}
function productImagePatchFromSource(source?: Partial<ClientOrderProduct> | null) {
  if (!source || !hasProductImage(source)) return null;
  return {
    imageThumbUrl: source.imageThumbUrl ?? null,
    imagePreviewUrl: source.imagePreviewUrl ?? null,
    imageHash: source.imageHash ?? null,
    images: source.images ?? [],
  };
}
function mergeProductImageData<T extends Record<string, any>>(target: T, source?: Partial<ClientOrderProduct> | null): T {
  const patch = productImagePatchFromSource(source);
  if (!patch) return target;
  return {
    ...target,
    ...patch,
  };
}
function getProductGalleryImages(item: any): ProductGalleryImage[] {
  const result: ProductGalleryImage[] = [];
  const seen = new Set<string>();
  const pushImage = (input: Partial<ProductGalleryImage> & { previewUrl?: string | null; thumbUrl?: string | null }) => {
    const previewUrl = input.previewUrl || input.thumbUrl || null;
    const thumbUrl = input.thumbUrl || input.previewUrl || null;
    if (!previewUrl || !thumbUrl) return;
    const dedupeKey = `${thumbUrl}|${previewUrl}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    result.push({
      key: input.key || previewUrl,
      thumbUrl,
      previewUrl,
      isMain: input.isMain,
    });
  };

  const images = Array.isArray(item?.images) ? item.images : [];
  [...images]
    .sort((a, b) => Number(!!b?.isMain) - Number(!!a?.isMain))
    .forEach((image: any, index) => {
      pushImage({
        key: image?.id || image?.fileGuid || `image-${index}`,
        thumbUrl: image?.thumbUrl,
        previewUrl: image?.previewUrl,
        isMain: !!image?.isMain,
      });
    });
  pushImage({
    key: item?.imageHash || item?.productGuid || item?.guid || 'primary',
    thumbUrl: item?.imageThumbUrl || item?.thumbnailUrl || item?.imageUrl || item?.pictureUrl || item?.photoUrl,
    previewUrl: item?.imagePreviewUrl || item?.imageUrl || item?.pictureUrl || item?.photoUrl || item?.imageThumbUrl || item?.thumbnailUrl,
    isMain: true,
  });
  return result;
}
function quantityStep(item: any, direction: 1 | -1) {
  const weight = isWeightDraftItem(item);
  const current = Number(String(item.quantity || '').replace(',', '.')) || 0;
  const min = weight ? 0.001 : 1;
  return String(Math.max(min, current + direction * 1)).replace(/\.0+$/, '').replace(/\./g, ',');
}
function hasPositiveQuantity(item: any) {
  const quantity = Number(String(item?.quantity || '').replace(',', '.'));
  return Number.isFinite(quantity) && quantity > 0;
}
function orderTitle(order: ClientOrder) {
  if (order.number1c) {
    const date = formatDateOnly(order.date1c);
    return date === '—' ? order.number1c : `${order.number1c} от ${date}`;
  }
  const date = formatDateOnly(order.updatedAt || order.createdAt || order.deliveryDate);
  const shortGuid = order.guid.slice(0, 8);
  return date === '—' ? shortGuid : `${shortGuid} от ${date}`;
}

function normalizeClientOrderUserErrorMessage(value: unknown, fallback = 'Документ требует проверки') {
  const message = String(value || '').trim();
  if (!message) return fallback;
  const lower = message.toLocaleLowerCase('ru');
  if (lower.includes('недостаточно доступного остатка') || lower.includes('не хватает остатка')) {
    return 'Недостаточно остатка по одной или нескольким позициям';
  }
  if (
    lower.includes('errorid=')
    || lower.includes('непредвиденная ошибка')
    || lower.includes('internal_error')
    || lower.includes('http 500')
    || lower.includes('поле объекта не обнаружено')
    || lower.includes('метод объекта не обнаружен')
    || lower.includes('zod')
    || lower.includes('stack')
    || lower.includes('{')
  ) {
    return fallback;
  }
  if (lower.includes('1с') && (lower.includes('недоступ') || lower.includes('timeout') || lower.includes('network'))) {
    return '1С временно недоступна';
  }
  return message;
}

function runDocumentHeaderTransition() {
  LayoutAnimation.configureNext(DOCUMENT_HEADER_TRANSITION);
}

function pickerNeedsOrderContext(kind: PickerKind | null) {
  return kind === 'agreement'
    || kind === 'contract'
    || kind === 'deliveryAddress'
    || kind === 'warehouse'
    || kind === 'priceType'
    || kind === 'product';
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
  const { isReachable } = useServerStatus();
  const topInset = useHeaderContentTopInset({ compact: true, hasSubtitle: false, extraGap: 2 });
  const { headerBottomOffset, setHeaderBottomOffset } = useNotificationViewport();
  const { setHeaderOverride } = useServicesHeaderSlot();
  const tabBarVisibility = useOptionalTabBarVisibility();
  const setTabBarHidden = tabBarVisibility?.setHidden;
  const background = useThemeColor({}, 'background');
  const card = useThemeColor({}, 'cardBackground');
  const { width, height } = useWindowDimensions();
  const { top: safeTop, bottom: safeBottom } = useSafeAreaInsets();
  const layoutTier = resolveClientOrdersLayoutTier(width);
  const editorTier = resolveClientOrdersEditorTier(width);
  const ui = getClientOrdersResponsiveMetrics(layoutTier, editorTier);
  const [mode, setMode] = React.useState<ScreenMode>('orders');
  const [section, setSection] = React.useState<EditorSection>('header');
  const [openingDocument, setOpeningDocument] = React.useState<DocumentOpeningState>(null);
  const [openingOrderGuid, setOpeningOrderGuid] = React.useState<string | null>(null);
  const [ordersRefreshing, setOrdersRefreshing] = React.useState(false);
  const [pickerKind, setPickerKind] = React.useState<PickerKind | null>(null);
  const [pickerSearch, setPickerSearch] = React.useState('');
  const [pickerItems, setPickerItems] = React.useState<any[]>([]);
  const [pickerOffset, setPickerOffset] = React.useState(0);
  const [pickerHasMore, setPickerHasMore] = React.useState(false);
  const [pickerScrollOffset, setPickerScrollOffset] = React.useState(0);
  const [pickerLoading, setPickerLoading] = React.useState(false);
  const [selectedProducts, setSelectedProducts] = React.useState<ProductSelectionMap>(() => new Map());
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [inspectorOpen, setInspectorOpen] = React.useState(false);
  const [deleteDocumentOverlayVisible, setDeleteDocumentOverlayVisible] = React.useState(false);
  const [filterOrganization, setFilterOrganization] = React.useState<ClientOrderOrganization | null>(null);
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
  const [counterpartyManagerOnly, setCounterpartyManagerOnly] = React.useState(false);
  const [linePriceTarget, setLinePriceTarget] = React.useState<string | null>(null);
  const [actionsMenuOpen, setActionsMenuOpen] = React.useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = React.useState(false);
  const [confirmDialog, setConfirmDialog] = React.useState<ConfirmDialogState>(null);
  const [editingItemKey, setEditingItemKey] = React.useState<string | null>(null);
  const [pendingProductItem, setPendingProductItem] = React.useState<DraftItem | null>(null);
  const [metadataLoadingItemKeys, setMetadataLoadingItemKeys] = React.useState<Set<string>>(() => new Set());
  const [productGallery, setProductGallery] = React.useState<{
    title: string;
    subtitle?: string | null;
    images: ProductGalleryImage[];
    index: number;
  } | null>(null);
  const [referenceOpen, setReferenceOpen] = React.useState(false);
  const [referenceLoading, setReferenceLoading] = React.useState(false);
  const [referenceError, setReferenceError] = React.useState<string | null>(null);
  const [referenceDetails, setReferenceDetails] = React.useState<ClientOrderReferenceDetails | null>(null);
  const [referenceScrollOffset, setReferenceScrollOffset] = React.useState(0);
  const [editorKeyboardVisible, setEditorKeyboardVisible] = React.useState(false);
  const ordersScrollRef = React.useRef<any>(null);
  const editorScrollRef = React.useRef<any>(null);
  const ordersScrollRestoreRequestRef = React.useRef(0);
  const editorKeyboardTopRef = React.useRef<number | null>(null);
  const editorFocusedTargetRef = React.useRef<unknown>(null);
  const editorFocusTimersRef = React.useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const pickerRequestIdRef = React.useRef(0);
  const pickerLoadSignatureRef = React.useRef('');
  const pickerAppendLoadingRef = React.useRef(false);
  const pickerSearchInputRef = React.useRef<any>(null);
  const pickerFocusTimersRef = React.useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const pickerAutoFocusSuppressedRef = React.useRef(false);
  const pickerListRef = React.useRef<any>(null);
  const pickerSkipNextResetLoadRef = React.useRef(false);
  const productPickerStateSignatureRef = React.useRef('');
  const pickerScrollYRef = React.useRef(0);
  const pickerScrollMetricsRef = React.useRef({ y: 0, contentHeight: 0, viewportHeight: 0 });
  const itemsSearchRequestIdRef = React.useRef(0);
  const itemsSearchLoadingMoreRef = React.useRef(false);
  const itemsSearchBlurTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lineItemLayoutYRef = React.useRef<Record<string, number>>({});
  const pendingScrollItemKeyRef = React.useRef<string | null>(null);
  const openingOrderRequestIdRef = React.useRef(0);
  const ordersEntrance = React.useRef(new Animated.Value(0)).current;
  const ordersViewportHeightRef = React.useRef(0);
  const ordersContentHeightRef = React.useRef(0);
  const productPickerContextSignature = React.useMemo(() => ([
    workspace.draft.organizationGuid || '',
    workspace.draft.counterpartyGuid || '',
    workspace.draft.agreementGuid || '',
    workspace.draft.warehouseGuid || '',
    workspace.draft.priceTypeGuid || '',
    inStockOnly ? 'stock' : 'all',
  ].join(':')), [
    inStockOnly,
    workspace.draft.agreementGuid,
    workspace.draft.counterpartyGuid,
    workspace.draft.organizationGuid,
    workspace.draft.priceTypeGuid,
    workspace.draft.warehouseGuid,
  ]);
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
  React.useEffect(() => {
    setSelectedProducts((current) => removeOrderItemsFromProductSelection(current, workspace.draft.items));
  }, [workspace.draft.items]);
  const editorKeyboardPadding = Math.min(460, Math.max(320, Math.round(height * 0.42)));
  const showOrdersInitialLoading = !workspace.ordersInitialLoadDone && !workspace.orders.length;
  const showOrdersEmptyState = workspace.ordersInitialLoadDone && !workspace.loadingOrders && !workspace.orders.length;
  const showOrdersFooter = !showOrdersInitialLoading && !!workspace.orders.length && (workspace.loadingMoreOrders || !!workspace.ordersAppendError);
  const hasActiveOrderFilters = countActiveOrderFilters(workspace.filters) > 0;
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

  const prefetchMoreOrders = React.useCallback(() => {
    if (
      mode !== 'orders' ||
      showOrdersInitialLoading ||
      workspace.loadingOrders ||
      workspace.loadingMoreOrders ||
      workspace.ordersAppendError ||
      !workspace.hasMoreOrders
    ) {
      return;
    }
    void workspace.loadMoreOrders();
  }, [
    mode,
    showOrdersInitialLoading,
    workspace.hasMoreOrders,
    workspace.loadMoreOrders,
    workspace.loadingMoreOrders,
    workspace.loadingOrders,
    workspace.ordersAppendError,
  ]);

  const handleOrdersScroll = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    lastClientOrdersListScrollY = Math.max(0, contentOffset.y);
    ordersViewportHeightRef.current = layoutMeasurement.height;
    ordersContentHeightRef.current = contentSize.height;
    const distanceToEnd = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    if (distanceToEnd <= ORDERS_PREFETCH_DISTANCE) prefetchMoreOrders();
  }, [prefetchMoreOrders]);

  const restoreOrdersScrollPosition = React.useCallback(() => {
    const targetY = Math.max(0, lastClientOrdersListScrollY);
    if (targetY <= 1) return;
    const requestId = ++ordersScrollRestoreRequestRef.current;
    const restore = () => {
      if (ordersScrollRestoreRequestRef.current !== requestId || mode !== 'orders') return;
      ordersScrollRef.current?.scrollTo?.({ y: targetY, animated: false });
    };
    requestAnimationFrame(restore);
    setTimeout(restore, 80);
    setTimeout(restore, 220);
  }, [mode]);

  const handleOrdersListLayout = React.useCallback((event: LayoutChangeEvent) => {
    ordersViewportHeightRef.current = event.nativeEvent.layout.height;
    if (ordersContentHeightRef.current && ordersContentHeightRef.current <= ordersViewportHeightRef.current + ORDERS_PREFETCH_DISTANCE) {
      prefetchMoreOrders();
    }
  }, [prefetchMoreOrders]);

  const handleOrdersContentSizeChange = React.useCallback((_width: number, contentHeight: number) => {
    ordersContentHeightRef.current = contentHeight;
    if (ordersViewportHeightRef.current && contentHeight <= ordersViewportHeightRef.current + ORDERS_PREFETCH_DISTANCE) {
      prefetchMoreOrders();
    }
  }, [prefetchMoreOrders]);

  const refreshOrdersList = React.useCallback(async () => {
    if (ordersRefreshing) return;
    setOrdersRefreshing(true);
    try {
      await workspace.refreshOrders();
    } finally {
      setOrdersRefreshing(false);
    }
  }, [ordersRefreshing, workspace.refreshOrders]);

  React.useEffect(() => {
    setTabBarHidden?.(mode === 'editor');
    return () => setTabBarHidden?.(false);
  }, [mode, setTabBarHidden]);
  React.useEffect(() => {
    if (mode !== 'orders' || showOrdersInitialLoading || !workspace.orders.length) return;
    restoreOrdersScrollPosition();
  }, [mode, restoreOrdersScrollPosition, showOrdersInitialLoading, workspace.orders.length]);
  React.useEffect(() => {
    if (mode !== 'orders') return;
    void workspace.syncDeviceDrafts?.();
  }, [mode, workspace.syncDeviceDrafts]);
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
  React.useEffect(() => { AsyncStorage.getItem(COUNTERPARTY_MANAGER_ONLY_KEY).then((v) => setCounterpartyManagerOnly(v === '1')).catch(() => undefined); }, []);
  React.useEffect(() => { void AsyncStorage.setItem(COUNTERPARTY_MANAGER_ONLY_KEY, counterpartyManagerOnly ? '1' : '0'); }, [counterpartyManagerOnly]);
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

  const restorePickerListScroll = React.useCallback((y: number) => {
    const targetY = Math.max(0, y);
    if (targetY <= 1) return;
    const restore = () => {
      const list = pickerListRef.current;
      try {
        if (typeof list?.scrollTo === 'function') {
          list.scrollTo({ y: targetY, animated: false });
        } else if (typeof list?.scrollToOffset === 'function') {
          list.scrollToOffset({ offset: targetY, animated: false });
        }
      } catch {
        return;
      }
    };
    requestAnimationFrame(restore);
    setTimeout(restore, 80);
    setTimeout(restore, 220);
  }, []);

  const clearPickerFocusTimers = React.useCallback(() => {
    pickerFocusTimersRef.current.forEach((timer) => clearTimeout(timer));
    pickerFocusTimersRef.current = [];
  }, []);

  const suppressPickerAutoFocus = React.useCallback(() => {
    pickerAutoFocusSuppressedRef.current = true;
    clearPickerFocusTimers();
    pickerSearchInputRef.current?.blur?.();
    Keyboard.dismiss();
  }, [clearPickerFocusTimers]);

  const openPicker = React.useCallback((kind: PickerKind, lineKey?: string) => {
    pickerAutoFocusSuppressedRef.current = false;
    clearPickerFocusTimers();
    const shouldRestoreProductPicker = kind === 'product'
      && productPickerStateSignatureRef.current === productPickerContextSignature
      && (pickerItems.length > 0 || !!pickerSearch);
    setPickerKind(kind);
    setLinePriceTarget(kind === 'priceType' && lineKey ? lineKey : null);
    setSelectedProducts(new Map());
    if (shouldRestoreProductPicker) {
      pickerAppendLoadingRef.current = false;
      pickerLoadSignatureRef.current = '';
      pickerSkipNextResetLoadRef.current = true;
      restorePickerListScroll(pickerScrollYRef.current);
      return;
    }
    setPickerSearch('');
    setPickerItems([]);
    setPickerOffset(0);
    setPickerHasMore(false);
    setPickerScrollOffset(0);
    pickerScrollYRef.current = 0;
    pickerScrollMetricsRef.current = { y: 0, contentHeight: 0, viewportHeight: 0 };
    pickerAppendLoadingRef.current = false;
    pickerLoadSignatureRef.current = '';
    pickerSkipNextResetLoadRef.current = false;
    if (kind === 'product') {
      productPickerStateSignatureRef.current = productPickerContextSignature;
    }
    requestAnimationFrame(() => scrollPickerListToTop(false));
  }, [
    clearPickerFocusTimers,
    pickerItems.length,
    pickerSearch,
    productPickerContextSignature,
    restorePickerListScroll,
    scrollPickerListToTop,
  ]);

  const handlePickerSearchChange = React.useCallback((value: string) => {
    setPickerSearch(value);
    setPickerOffset(0);
    setPickerHasMore(false);
    setPickerScrollOffset(0);
    pickerScrollYRef.current = 0;
    pickerScrollMetricsRef.current = { y: 0, contentHeight: 0, viewportHeight: pickerScrollMetricsRef.current.viewportHeight };
    pickerAppendLoadingRef.current = false;
    pickerLoadSignatureRef.current = '';
    requestAnimationFrame(() => scrollPickerListToTop(false));
  }, [scrollPickerListToTop]);

  const loadPickerPage = React.useCallback(async (kind: PickerKind, search: string, offset = 0, append = false) => {
    const pageSize = kind === 'product' ? PRODUCT_PICKER_PAGE_SIZE : PAGE_SIZE;
    const contextSignature = [
      workspace.draft.organizationGuid || '',
      workspace.draft.counterpartyGuid || '',
      workspace.draft.agreementGuid || '',
      workspace.draft.warehouseGuid || '',
      workspace.draft.priceTypeGuid || '',
    ].join(':');
    const productFilter = kind === 'product' && inStockOnly ? 'stock' : 'all';
    const counterpartyFilter = (kind === 'counterparty' || kind === 'filterCounterparty') && counterpartyManagerOnly ? 'manager' : 'all';
    const signature = `${kind}|${contextSignature}|${search}|${offset}|${append ? 'append' : 'reset'}|${productFilter}|${counterpartyFilter}`;
    if ((append && pickerAppendLoadingRef.current) || pickerLoadSignatureRef.current === signature) return;
    if (append) pickerAppendLoadingRef.current = true;
    pickerLoadSignatureRef.current = signature;
    const requestId = ++pickerRequestIdRef.current;
    setPickerLoading(true);
    try {
      const hasOrderContext = !!workspace.draft.organizationGuid && !!workspace.draft.counterpartyGuid;
      if (pickerNeedsOrderContext(kind) && !hasOrderContext) {
        if (pickerRequestIdRef.current !== requestId) return;
        setPickerItems([]);
        setPickerOffset(offset);
        setPickerHasMore(false);
        return;
      }
      let result: any;
      if (kind === 'organization') {
        const all = workspace.settings?.organizations || [];
        const filtered = all.filter((item) => matchesTokenSearch(item, search));
        result = { items: filtered.slice(offset, offset + pageSize), meta: { total: filtered.length } };
      } else if (kind === 'filterCounterparty' || kind === 'counterparty') result = await workspace.searchCounterparties({ search, limit: pageSize, offset, managerOnly: counterpartyManagerOnly });
      else if (kind === 'agreement') result = await workspace.searchAgreements({ counterpartyGuid: workspace.draft.counterpartyGuid || undefined, search, limit: pageSize, offset });
      else if (kind === 'contract') result = await workspace.searchContracts({ counterpartyGuid: workspace.draft.counterpartyGuid || undefined, search, limit: pageSize, offset });
      else if (kind === 'warehouse') result = await workspace.searchWarehouses({ organizationGuid: workspace.draft.organizationGuid || undefined, counterpartyGuid: workspace.draft.counterpartyGuid || undefined, search, limit: pageSize, offset });
      else if (kind === 'deliveryAddress') result = await workspace.searchDeliveryAddresses({ organizationGuid: workspace.draft.organizationGuid || undefined, counterpartyGuid: workspace.draft.counterpartyGuid || undefined, search, limit: pageSize, offset });
      else if (kind === 'priceType') result = await workspace.searchPriceTypes({ search, limit: pageSize, offset });
      else result = await workspace.searchProducts({ search, organizationGuid: workspace.draft.organizationGuid || undefined, counterpartyGuid: workspace.draft.counterpartyGuid, agreementGuid: workspace.draft.agreementGuid || undefined, warehouseGuid: workspace.draft.warehouseGuid || undefined, priceTypeGuid: workspace.draft.priceTypeGuid || undefined, inStockOnly, limit: pageSize, offset });
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
      const nextItems = kind === 'deliveryAddress' ? sortDeliveryAddressOptions(items) : items;
      if (kind === 'product' && !append) {
        productPickerStateSignatureRef.current = productPickerContextSignature;
      }
      setPickerItems((prev) => {
        if (!append) return nextItems;
        const known = new Set(prev.map((item) => item?.guid || item?.id || `${item?.name || ''}|${item?.fullAddress || ''}`));
        const merged = [...prev, ...nextItems.filter((item: any) => !known.has(item?.guid || item?.id || `${item?.name || ''}|${item?.fullAddress || ''}`))];
        return kind === 'deliveryAddress' ? sortDeliveryAddressOptions(merged) : merged;
      });
      setPickerOffset(offset + items.length);
      setPickerHasMore(hasMorePage(items.length, pageSize, offset, result?.meta?.total));
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
    counterpartyManagerOnly,
    inStockOnly,
    workspace.draft.agreementGuid,
    workspace.draft.counterpartyGuid,
    workspace.draft.organizationGuid,
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
    productPickerContextSignature,
    scrollPickerListToTop,
  ]);

  React.useEffect(() => {
    if (!pickerKind) return;
    if (pickerSkipNextResetLoadRef.current) {
      pickerSkipNextResetLoadRef.current = false;
      return;
    }
    const searchDelay = pickerSearch && pickerKind !== 'product' ? 650 : 0;
    const timeout = setTimeout(() => void loadPickerPage(pickerKind, pickerSearch, 0, false), searchDelay);
    return () => clearTimeout(timeout);
  }, [loadPickerPage, pickerKind, pickerSearch]);
  React.useEffect(() => {
    if (!pickerKind) return undefined;
    if (!pickerShouldAutofocusSearch(pickerKind)) return undefined;
    if (pickerNeedsOrderContext(pickerKind) && (!workspace.draft.organizationGuid || !workspace.draft.counterpartyGuid)) return undefined;
    if (pickerAutoFocusSuppressedRef.current) return undefined;

    clearPickerFocusTimers();
    const focusSearch = () => {
      if (pickerAutoFocusSuppressedRef.current) return;
      pickerSearchInputRef.current?.focus?.();
    };
    pickerFocusTimersRef.current = [140, 320].map((delay) => setTimeout(focusSearch, delay));
    return clearPickerFocusTimers;
  }, [
    clearPickerFocusTimers,
    pickerKind,
    workspace.draft.counterpartyGuid,
    workspace.draft.organizationGuid,
  ]);

  React.useEffect(() => {
    if (!pickerKind) return undefined;
    const subscription = Keyboard.addListener('keyboardDidHide', () => {
      if (!pickerShouldAutofocusSearch(pickerKind)) return;
      pickerAutoFocusSuppressedRef.current = true;
      clearPickerFocusTimers();
    });
    return () => subscription.remove();
  }, [clearPickerFocusTimers, pickerKind]);

  const closePicker = React.useCallback(() => {
    suppressPickerAutoFocus();
    pickerRequestIdRef.current += 1;
    pickerAppendLoadingRef.current = false;
    pickerLoadSignatureRef.current = '';
    pickerSkipNextResetLoadRef.current = false;
    setPickerKind(null);
    setLinePriceTarget(null);
    setPickerLoading(false);
    setSelectedProducts(new Map());
  }, [suppressPickerAutoFocus]);
  const requestClosePicker = React.useCallback(() => {
    if (pickerKind === 'product' && selectedProducts.size > 0) {
      setConfirmDialog({
        title: 'Выйти из подбора?',
        message: `Выбрано ${selectedProducts.size} поз. Если выйти, они не будут перенесены в заказ.`,
        cancelLabel: 'Остаться',
        confirmLabel: 'Выйти',
        destructive: true,
        onConfirm: closePicker,
      });
      return false;
    }
    closePicker();
    return undefined;
  }, [closePicker, pickerKind, selectedProducts.size]);
  const cancelOpeningOrder = React.useCallback(() => {
    if (!openingOrderGuid) return false;
    openingOrderRequestIdRef.current += 1;
    workspace.cancelDetailLoading?.();
    setOpeningOrderGuid(null);
    setOpeningDocument(null);
    return true;
  }, [openingOrderGuid, workspace]);
  const closeDocumentToOrders = React.useCallback(() => {
    const leaveDocument = () => {
      setOpeningDocument(null);
      runDocumentHeaderTransition();
      setMode('orders');
    };
    if (!workspace.dirty || workspace.readOnly) {
      leaveDocument();
      return;
    }
    void workspace.confirmDiscardIfNeeded().then((canLeave: boolean) => {
      if (!canLeave) return;
      leaveDocument();
    });
  }, [workspace]);
  const closeTopOverlay = React.useCallback(() => {
    if (productGallery) {
      setProductGallery(null);
      return true;
    }
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
      requestClosePicker();
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
  }, [cancelOpeningOrder, closeDocumentToOrders, editingItemKey, filtersOpen, mode, pickerKind, productGallery, referenceOpen, requestClosePicker]);

  React.useEffect(() => {
    if (!registerBackOverlayHandler) return undefined;
    registerBackOverlayHandler(closeTopOverlay);
    return () => registerBackOverlayHandler(null);
  }, [closeTopOverlay, registerBackOverlayHandler]);

  const maybeLoadMorePickerItems = React.useCallback((metrics?: Partial<{ y: number; contentHeight: number; viewportHeight: number }>) => {
    if (!pickerKind || pickerLoading || !pickerHasMore || pickerAppendLoadingRef.current) return;
    const current = pickerScrollMetricsRef.current;
    const y = Math.max(0, metrics?.y ?? current.y);
    const contentHeight = Math.max(0, metrics?.contentHeight ?? current.contentHeight);
    const viewportHeight = Math.max(0, metrics?.viewportHeight ?? current.viewportHeight);
    if (!viewportHeight || !contentHeight) return;
    const remaining = contentHeight - y - viewportHeight;
    const prefetchDistance = pickerKind === 'product'
      ? Math.max(PRODUCT_PICKER_PREFETCH_DISTANCE, viewportHeight * 1.5)
      : 320;
    if (remaining > prefetchDistance) return;
    void loadPickerPage(pickerKind, pickerSearch, pickerOffset, true);
  }, [loadPickerPage, pickerHasMore, pickerKind, pickerLoading, pickerOffset, pickerSearch]);

  const handlePickerScroll = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const y = Math.max(0, contentOffset.y || 0);
    const contentHeight = Math.max(0, contentSize.height || 0);
    const viewportHeight = Math.max(0, layoutMeasurement.height || 0);
    pickerScrollYRef.current = y;
    pickerScrollMetricsRef.current = { y, contentHeight, viewportHeight };
    setPickerScrollOffset(y <= 1 ? 0 : 2);
    maybeLoadMorePickerItems({ y, contentHeight, viewportHeight });
  }, [maybeLoadMorePickerItems]);

  const handlePickerListLayout = React.useCallback((event: LayoutChangeEvent) => {
    const viewportHeight = Math.max(0, event.nativeEvent.layout.height || 0);
    pickerScrollMetricsRef.current = { ...pickerScrollMetricsRef.current, viewportHeight };
    maybeLoadMorePickerItems({ viewportHeight });
  }, [maybeLoadMorePickerItems]);

  const handlePickerContentSizeChange = React.useCallback((_width: number, contentHeight: number) => {
    const nextContentHeight = Math.max(0, contentHeight || 0);
    pickerScrollMetricsRef.current = { ...pickerScrollMetricsRef.current, contentHeight: nextContentHeight };
    maybeLoadMorePickerItems({ contentHeight: nextContentHeight });
  }, [maybeLoadMorePickerItems]);

  const handlePickerEndReached = React.useCallback(() => {
    maybeLoadMorePickerItems();
  }, [maybeLoadMorePickerItems]);

  React.useEffect(() => {
    if (!pickerKind || pickerLoading || !pickerHasMore) return;
    maybeLoadMorePickerItems();
  }, [maybeLoadMorePickerItems, pickerHasMore, pickerItems.length, pickerKind, pickerLoading]);

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

  const openProductGallery = React.useCallback((item: any, index = 0) => {
    const images = getProductGalleryImages(item);
    if (!images.length) return;
    setProductGallery({
      title: item?.productName || item?.name || getPickerItemTitle(item) || 'Изображение товара',
      subtitle: item?.productCode || item?.productArticle || item?.productSku || item?.code || item?.article || item?.sku || null,
      images,
      index: Math.min(Math.max(index, 0), images.length - 1),
    });
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
    if (workspace.readOnly || workspace.mutationLocked) return;
    const existingIndex = workspace.draft.items.findIndex((line: any) => line.productGuid === product.guid);
    const existingKey = existingIndex >= 0 ? workspace.draft.items[existingIndex]?.key : null;
    setSection('items');
    if (existingKey) {
      setPendingProductItem(null);
      setMetadataLoadingItemKeys((prev) => {
        const next = new Set(prev);
        next.add(existingKey);
        return next;
      });
      Promise.resolve(workspace.enrichItemMetadata?.(existingKey)).finally(() => {
        setMetadataLoadingItemKeys((prev) => {
          if (!prev.has(existingKey)) return prev;
          const next = new Set(prev);
          next.delete(existingKey);
          return next;
        });
      });
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
      readOnly: !!workspace.mutationLocked,
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
      setItemPackage: (lineKey: string, packageGuid: string | null) => {
        setPendingProductItem((prev) => {
          if (!prev || prev.key !== lineKey) return prev;
          return {
            ...prev,
            packageGuid: packageGuid || null,
            manualPrice: '',
            priceTypeGuid: prev.priceTypeGuid || workspace.draft.priceTypeGuid || null,
            priceTypeName: prev.priceTypeName || workspace.draft.priceTypeName || null,
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
    else if (selectedKind === 'agreement') await workspace.setAgreement(item);
    else if (selectedKind === 'contract') await workspace.setContract(item);
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
    }
  }, [closePicker, linePriceTarget, pickerKind, workspace]);

  const togglePickerProductSelection = React.useCallback((item: ClientOrderProduct) => {
    if (workspace.readOnly || workspace.mutationLocked) return;
    React.startTransition(() => {
      setSelectedProducts((current) => toggleProductSelection(current, item, workspace.draft.items));
    });
  }, [workspace.draft.items, workspace.mutationLocked, workspace.readOnly]);

  const handleProductPickerPress = React.useCallback((item: ClientOrderProduct) => {
    const action = resolveProductPickerPressAction({
      product: item,
      orderItems: workspace.draft.items,
      selectedCount: selectedProducts.size,
      readOnly: workspace.readOnly,
      mutationLocked: workspace.mutationLocked,
    });
    if (action === 'toggleSelection') {
      togglePickerProductSelection(item);
      return;
    }
    if (action === 'openEditor') {
      closePicker();
      openProductEditorForProduct(item);
    }
  }, [
    closePicker,
    openProductEditorForProduct,
    selectedProducts.size,
    togglePickerProductSelection,
    workspace.draft.items,
    workspace.mutationLocked,
    workspace.readOnly,
  ]);

  const handleProductPickerLongPress = React.useCallback((item: ClientOrderProduct) => {
    const action = resolveProductPickerPressAction({
      product: item,
      orderItems: workspace.draft.items,
      selectedCount: selectedProducts.size,
      readOnly: workspace.readOnly,
      mutationLocked: workspace.mutationLocked,
      longPress: true,
    });
    if (action === 'toggleSelection') togglePickerProductSelection(item);
  }, [
    selectedProducts.size,
    togglePickerProductSelection,
    workspace.draft.items,
    workspace.mutationLocked,
    workspace.readOnly,
  ]);

  const clearPickerProductSelection = React.useCallback(() => {
    setSelectedProducts(new Map());
  }, []);

  const transferSelectedProducts = React.useCallback(() => {
    const firstNewIndex = workspace.draft.items.length;
    const addedKeys = transferSelectedProductsToOrder(selectedProducts, workspace.draft.items, workspace.addProduct, { quantity: 0 });
    closePicker();
    setSection('items');
    if (addedKeys.length) {
      requestScrollToLineItem(addedKeys[0], firstNewIndex);
    }
  }, [closePicker, requestScrollToLineItem, selectedProducts, workspace]);

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
    if (workspace.selectedOrderQueued) {
      setConfirmDialog({
        title: 'Снять документ с очереди?',
        message: '',
        confirmLabel: 'Снять с очереди',
        destructive: true,
        onConfirm: async () => { await workspace.unqueueOrder(); },
      });
      return;
    }
    if (workspace.selectedOrder?.status === 'CANCELLED') {
      setConfirmDialog({
        title: 'Отмененный заказ',
        message: '',
        confirmLabel: 'Восстановить',
        onConfirm: async () => { await workspace.restoreOrder(); },
      });
      return;
    }
    if (workspace.draftMode || workspace.selectedOrder?.status === 'DRAFT') {
      setConfirmDialog({
        title: 'Удалить черновик?',
        message: '',
        confirmLabel: 'Удалить',
        destructive: true,
        onConfirm: async () => {
          setDeleteDocumentOverlayVisible(true);
          try {
            await workspace.deleteDraft();
            setOpeningDocument(null);
            runDocumentHeaderTransition();
            setMode('orders');
          } finally {
            setDeleteDocumentOverlayVisible(false);
          }
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
  const deleteDocumentFromMenu = React.useCallback(() => {
    setActionsMenuOpen(false);
    setConfirmDialog({
      title: workspace.selectedOrderQueued ? 'Удалить документ из очереди?' : 'Удалить документ?',
      message: workspace.selectedOrderQueued
        ? 'Документ будет снят с очереди и удален из приложения.'
        : '',
      confirmLabel: 'Удалить',
      destructive: true,
      onConfirm: async () => {
        setDeleteDocumentOverlayVisible(true);
        try {
          await workspace.deleteDraft();
          setOpeningDocument(null);
          runDocumentHeaderTransition();
          setMode('orders');
        } finally {
          setDeleteDocumentOverlayVisible(false);
        }
      },
    });
  }, [workspace]);

  const submitFromMenu = React.useCallback(() => {
    if (!workspace.canSubmitOrder) return;
    setActionsMenuOpen(false);
    const isQueuedResubmit = workspace.selectedOrderQueued && workspace.dirty;
    const isSyncedResubmit = workspace.selectedOrderSynced && workspace.dirty;
    const isErrorRetry = !!workspace.selectedOrderHas1cError && !workspace.dirty;
    const isResubmit = isQueuedResubmit || isSyncedResubmit || isErrorRetry;
    const warningMessage = workspace.validation.warningMessage
      ? `\n${workspace.validation.warningMessage}`
      : '';
    setConfirmDialog({
      title: isErrorRetry ? 'Повторить отправку в 1С?' : isResubmit ? 'Переотправить в 1С?' : 'Отправить в 1С?',
      message: `${isQueuedResubmit
        ? 'Документ будет сохранен и поставлен в конец очереди.'
        : isSyncedResubmit
          ? 'Изменения будут сохранены и отправлены в 1С.'
          : isErrorRetry
            ? 'Документ уже сохранен в 1С, но не проведен. Повторная отправка попробует провести его еще раз.'
          : ''}${warningMessage}`.trim(),
      confirmLabel: isQueuedResubmit ? 'В конец очереди' : isErrorRetry ? 'Повторить' : 'Отправить',
      onConfirm: () => workspace.submitOrder(),
    });
  }, [workspace]);
  const saveDraftFromMenu = React.useCallback(() => {
    setActionsMenuOpen(false);
    if (workspace.validation.warningMessage) {
      setConfirmDialog({
        title: 'Сохранить документ?',
        message: workspace.validation.warningMessage,
        confirmLabel: 'Сохранить',
        onConfirm: async () => { await workspace.saveDraft({ reason: 'manual' }); },
      });
      return;
    }
    void workspace.saveDraft({ reason: 'manual' });
  }, [workspace]);
  const copyFromMenu = React.useCallback(() => {
    if (!workspace.draft.guid && !workspace.selectedGuid) return;
    setActionsMenuOpen(false);
    if (workspace.dirty) {
      setConfirmDialog({
        title: 'Сохранить и скопировать?',
        message: '',
        confirmLabel: 'Сохранить и скопировать',
        onConfirm: async () => {
          const copied = await workspace.copyOrder({ saveFirst: true });
          if (copied) {
            runDocumentHeaderTransition();
            setMode('editor');
          }
        },
      });
      return;
    }
    setConfirmDialog({
      title: 'Скопировать документ?',
      message: '',
      confirmLabel: 'Скопировать',
      onConfirm: async () => {
        const copied = await workspace.copyOrder();
        if (copied) {
          runDocumentHeaderTransition();
          setMode('editor');
        }
      },
    });
  }, [workspace]);
  const handleDocumentPrimaryAction = React.useCallback(() => {
    if ((workspace.selectedOrderQueued || workspace.selectedOrderSynced) && workspace.dirty) {
      submitFromMenu();
      return;
    }
    if (workspace.dirty) {
      saveDraftFromMenu();
      return;
    }
    submitFromMenu();
  }, [saveDraftFromMenu, submitFromMenu, workspace]);

  const confirmClearItems = React.useCallback(() => {
    if (workspace.readOnly || workspace.mutationLocked) return;
    setConfirmDialog({
      title: 'Удалить все товары?',
      message: '',
      confirmLabel: 'Удалить',
      destructive: true,
      onConfirm: workspace.clearItems,
    });
  }, [workspace.clearItems, workspace.mutationLocked, workspace.readOnly]);
  const confirmResetHeaderPriceType = React.useCallback(() => {
    if (workspace.readOnly || workspace.mutationLocked) return;
    setConfirmDialog({
      title: 'Сбросить вид цены?',
      message: '',
      confirmLabel: 'Сбросить',
      onConfirm: () => workspace.resetHeaderPriceTypeToDefault(),
    });
  }, [workspace]);

  const documentNumber = workspace.draftMode
    ? 'Новый заказ'
    : workspace.selectedOrder
      ? orderTitle(workspace.selectedOrder)
      : workspace.draft.guid
        ? (formatDateOnly(workspace.draft.deliveryDate) === '—'
          ? workspace.draft.guid.slice(0, 8)
          : `${workspace.draft.guid.slice(0, 8)} от ${formatDateOnly(workspace.draft.deliveryDate)}`)
        : 'Без номера';
  const documentStatusFullText = workspace.draftMode
    ? 'Черновик'
    : getOrderDisplayStatusLabelWithQueue(workspace.selectedOrder);
  const documentStatusCode = workspace.draftMode
    ? 'DRAFT'
    : workspace.selectedOrder
      ? getOrderDisplayStatus(workspace.selectedOrder)
      : 'DRAFT';
  const documentDisplayTitle = workspace.dirty ? `${documentNumber}*` : documentNumber;
  const hasOrganizationValue = !!(workspace.draft.organizationGuid || workspace.selections.organization?.guid || workspace.selections.organization?.name);
  const hasCounterpartyValue = !!(workspace.draft.counterpartyGuid || workspace.selections.counterparty?.guid || workspace.selections.counterparty?.name);
  const hasAgreementValue = !!(workspace.draft.agreementGuid || workspace.selections.agreement?.guid || workspace.selections.agreement?.name);
  const hasContractValue = !!(workspace.draft.contractGuid || workspace.selections.contract?.guid || workspace.selections.contract?.number || workspace.selections.contract?.name);
  const hasPriceTypeValue = !!(workspace.draft.priceTypeGuid || workspace.draft.priceTypeName || workspace.selections.agreement?.priceType?.guid || workspace.selections.agreement?.priceType?.name);
  const hasWarehouseValue = !!(workspace.draft.warehouseGuid || workspace.selections.warehouse?.guid || workspace.selections.warehouse?.name);
  const hasDeliveryAddressValue = !!(
    workspace.draft.deliveryAddressGuid
    || workspace.selections.deliveryAddress?.guid
    || workspace.selections.deliveryAddress?.fullAddress
    || workspace.selections.deliveryAddress?.name
  );
  const headerRequiredState = React.useMemo(() => ({
    organization: !hasOrganizationValue,
    counterparty: !hasCounterpartyValue,
    agreement: !hasAgreementValue,
    contract: !hasContractValue,
    priceType: !hasPriceTypeValue,
    warehouse: !hasWarehouseValue,
    deliveryAddress: !hasDeliveryAddressValue,
    deliveryDate: !workspace.draft.deliveryDate,
  }), [
    hasAgreementValue,
    hasContractValue,
    hasCounterpartyValue,
    hasDeliveryAddressValue,
    hasOrganizationValue,
    hasPriceTypeValue,
    hasWarehouseValue,
    workspace.draft.deliveryDate,
  ]);
  const muteDocumentValidation = !!workspace.readOnly;
  const hasHeaderErrors = !muteDocumentValidation && Object.values(headerRequiredState).some(Boolean);
  const hasItemsErrors = !muteDocumentValidation && (
    !workspace.draft.items.length
    || Object.keys(workspace.validation.itemMessages || {}).length > 0
  );
  const filteredItems = workspace.draft.items;
  const handleItemsSearchFocus = React.useCallback(() => {
    if (itemsSearchBlurTimerRef.current) clearTimeout(itemsSearchBlurTimerRef.current);
    setItemsSearchFocused(true);
  }, []);
  const handleItemsSearchBlur = React.useCallback(() => {
    if (itemsSearchBlurTimerRef.current) clearTimeout(itemsSearchBlurTimerRef.current);
    itemsSearchBlurTimerRef.current = setTimeout(() => setItemsSearchFocused(false), 160);
  }, []);
  const dismissItemsSearch = React.useCallback(() => {
    if (itemsSearchBlurTimerRef.current) {
      clearTimeout(itemsSearchBlurTimerRef.current);
      itemsSearchBlurTimerRef.current = null;
    }
    Keyboard.dismiss();
    setItemsSearchFocused(false);
  }, []);
  React.useEffect(() => {
    const search = itemsSearch.trim();
    const requestId = ++itemsSearchRequestIdRef.current;
    const hasOrderContext = !!workspace.draft.organizationGuid && !!workspace.draft.counterpartyGuid;
    if (!search || !hasOrderContext) {
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
    }, 320);
    const requestTimer = setTimeout(() => {
      void workspace.searchProducts({
        search,
        organizationGuid: workspace.draft.organizationGuid || undefined,
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
        setItemsSearchError(normalizeClientOrderUserErrorMessage(error instanceof Error ? error.message : error, 'Не удалось выполнить поиск.'));
      }).finally(() => {
        if (itemsSearchRequestIdRef.current === requestId) setItemsSearchLoading(false);
      });
    }, 650);
    return () => {
      clearTimeout(loadingTimer);
      clearTimeout(requestTimer);
    };
  }, [
    inStockOnly,
    itemsSearch,
    workspace.draft.agreementGuid,
    workspace.draft.counterpartyGuid,
    workspace.draft.organizationGuid,
    workspace.draft.priceTypeGuid,
    workspace.draft.warehouseGuid,
    workspace.searchProducts,
  ]);
  const loadMoreItemsSearchResults = React.useCallback(() => {
    const search = itemsSearch.trim();
    if (!search || !workspace.draft.organizationGuid || !workspace.draft.counterpartyGuid || itemsSearchLoading || itemsSearchLoadingMore || itemsSearchLoadingMoreRef.current || !itemsSearchHasMore) return;
    const requestId = itemsSearchRequestIdRef.current;
    const offset = itemsSearchOffset;
    itemsSearchLoadingMoreRef.current = true;
    setItemsSearchLoadingMore(true);
    void workspace.searchProducts({
      search,
      organizationGuid: workspace.draft.organizationGuid || undefined,
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
    workspace.draft.organizationGuid,
    workspace.draft.priceTypeGuid,
    workspace.draft.warehouseGuid,
    workspace.searchProducts,
  ]);
  const productImageRefreshCandidates = React.useMemo(() => {
    const byGuid = new Map<string, any>();
    const addCandidate = (item: any, guid?: string | null) => {
      const productGuid = guid || item?.guid || item?.productGuid || null;
      if (!productGuid || hasProductImage(item) || byGuid.has(productGuid)) return;
      byGuid.set(productGuid, item);
    };
    if (pickerKind === 'product') pickerItems.forEach((item) => addCandidate(item, item.guid));
    itemsSearchResults.forEach((item) => addCandidate(item, item.guid));
    if (pendingProductItem) addCandidate(pendingProductItem, pendingProductItem.productGuid);
    workspace.draft.items.forEach((item: DraftItem) => addCandidate(item, item.productGuid));
    return [...byGuid.keys()].slice(0, 18);
  }, [itemsSearchResults, pendingProductItem, pickerItems, pickerKind, workspace.draft.items]);
  const productImageRefreshSignature = productImageRefreshCandidates.join('|');
  React.useEffect(() => {
    if (!productImageRefreshCandidates.length || !workspace.draft.counterpartyGuid) return undefined;
    let cancelled = false;
    const refreshImages = async () => {
      try {
        const products = await getClientOrderProductsBatch({
          productGuids: productImageRefreshCandidates,
          organizationGuid: workspace.draft.organizationGuid || undefined,
          counterpartyGuid: workspace.draft.counterpartyGuid,
          agreementGuid: workspace.draft.agreementGuid || undefined,
          warehouseGuid: workspace.draft.warehouseGuid || undefined,
          priceTypeGuid: workspace.draft.priceTypeGuid || undefined,
        });
        if (cancelled) return;
        const byGuid = new Map(products.map((product) => [product.guid, product]));
        setPickerItems((prev) => (
          pickerKind === 'product'
            ? prev.map((item) => mergeProductImageData(item, byGuid.get(item.guid)))
            : prev
        ));
        setItemsSearchResults((prev) => prev.map((item) => mergeProductImageData(item, byGuid.get(item.guid))));
        setPendingProductItem((prev) => {
          if (!prev) return prev;
          return mergeProductImageData(prev, byGuid.get(prev.productGuid));
        });
        workspace.draft.items.forEach((item: DraftItem) => {
          const patch = productImagePatchFromSource(byGuid.get(item.productGuid));
          if (!patch) return;
          workspace.setItemPatch(item.key, patch);
        });
      } catch {
        // Image availability is opportunistic; product search must remain usable.
      }
    };
    const timers = [700, 2400, 5200].map((delay) => setTimeout(() => void refreshImages(), delay));
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [
    productImageRefreshSignature,
    workspace.draft.agreementGuid,
    workspace.draft.counterpartyGuid,
    workspace.draft.organizationGuid,
    workspace.draft.priceTypeGuid,
    workspace.draft.warehouseGuid,
    workspace.setItemPatch,
    pickerKind,
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
    if (workspace.readOnly || workspace.mutationLocked) return;
    Keyboard.dismiss();
    resetItemsSearch();
    openProductEditorForProduct(product);
  }, [openProductEditorForProduct, resetItemsSearch, workspace.mutationLocked, workspace.readOnly]);
  const requestLineMetadata = React.useCallback((lineKey: string) => {
    if (!lineKey) return;
    setMetadataLoadingItemKeys((prev) => {
      const next = new Set(prev);
      next.add(lineKey);
      return next;
    });
    Promise.resolve(workspace.enrichItemMetadata?.(lineKey)).finally(() => {
      setMetadataLoadingItemKeys((prev) => {
        if (!prev.has(lineKey)) return prev;
        const next = new Set(prev);
        next.delete(lineKey);
        return next;
      });
    });
  }, [workspace]);
  const openLineEditor = React.useCallback((lineKey: string) => {
    requestLineMetadata(lineKey);
    setEditingItemKey(lineKey);
  }, [requestLineMetadata]);
  const editingItem = React.useMemo(() => workspace.draft.items.find((item) => item.key === editingItemKey) || null, [editingItemKey, workspace.draft.items]);
  const editingItemIndex = React.useMemo(() => editingItem ? workspace.draft.items.findIndex((item) => item.key === editingItem.key) : -1, [editingItem, workspace.draft.items]);
  React.useEffect(() => {
    if (editingItemKey && !editingItem && !pendingProductItem) setEditingItemKey(null);
  }, [editingItem, editingItemKey, pendingProductItem]);
  const documentHeaderRightSlot = React.useMemo(() => {
    if (mode !== 'editor') return undefined;
    return (
      <View style={styles.documentHeaderRightActions}>
        {!isReachable ? (
          <View style={styles.documentHeaderOfflineBadge}>
            <MaterialCommunityIcons name="wifi-off" size={15} color="#DC2626" />
          </View>
        ) : null}
        <DocumentActionsMenu
          styles={styles}
          workspace={workspace}
          actionsMenuOpen={actionsMenuOpen}
          setActionsMenuOpen={setActionsMenuOpen}
          setInspectorOpen={setInspectorOpen}
          saveDraftFromMenu={saveDraftFromMenu}
          submitFromMenu={submitFromMenu}
          copyFromMenu={copyFromMenu}
          removeOrCancel={removeOrCancel}
          deleteDocumentFromMenu={deleteDocumentFromMenu}
          compact
        />
      </View>
    );
  }, [actionsMenuOpen, copyFromMenu, deleteDocumentFromMenu, isReachable, mode, removeOrCancel, saveDraftFromMenu, submitFromMenu, workspace]);
  const handleEditorSectionChange = React.useCallback((nextSection: EditorSection) => {
    if (nextSection === section) return;
    runDocumentHeaderTransition();

    const currentHasToolbar = section === 'items' && !workspace.readOnly && !workspace.mutationLocked;
    const nextHasToolbar = nextSection === 'items' && !workspace.readOnly && !workspace.mutationLocked;
    if (currentHasToolbar !== nextHasToolbar && headerBottomOffset > 0) {
      const delta = nextHasToolbar ? DOCUMENT_ITEMS_TOOLBAR_HEIGHT_DELTA : -DOCUMENT_ITEMS_TOOLBAR_HEIGHT_DELTA;
      setHeaderBottomOffset(Math.max(topInset, headerBottomOffset + delta));
    }

    setSection(nextSection);
  }, [headerBottomOffset, section, setHeaderBottomOffset, topInset, workspace.mutationLocked, workspace.readOnly]);
  const documentHeaderSlot = React.useMemo(() => {
    if (mode !== 'editor') return null;
    return (
      <DocumentHeaderSlot
        styles={styles}
        workspace={workspace}
        section={section}
        setSection={handleEditorSectionChange}
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
        hasHeaderErrors={hasHeaderErrors}
        hasItemsErrors={hasItemsErrors}
      />
    );
  }, [
    addProductFromItemsSearch,
    confirmClearItems,
    handleItemsSearchBlur,
    handleItemsSearchFocus,
    dismissItemsSearch,
    handleEditorSectionChange,
    hasHeaderErrors,
    hasItemsErrors,
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
  const documentHeaderTitleSlot = React.useMemo(() => {
    if (mode !== 'editor') return null;
    return (
      <DocumentHeaderTitleSlot
        styles={styles}
        documentNumber={documentDisplayTitle}
        status={documentStatusCode}
        statusText={documentStatusFullText}
        queuePosition={workspace.selectedOrder?.queuePosition}
        queuedAt={workspace.selectedOrder?.queuedAt}
        exportAttempts={workspace.selectedOrder?.exportAttempts}
        lastExportError={workspace.selectedOrder?.lastExportError}
        last1cError={workspace.selectedOrder?.last1cError}
        syncState={workspace.selectedOrder?.syncState}
        visible={statusMenuOpen}
        onOpen={() => setStatusMenuOpen(true)}
        onClose={() => setStatusMenuOpen(false)}
      />
    );
  }, [
    documentDisplayTitle,
    documentStatusCode,
    documentStatusFullText,
    mode,
    statusMenuOpen,
    workspace.selectedOrder?.exportAttempts,
    workspace.selectedOrder?.last1cError,
    workspace.selectedOrder?.lastExportError,
    workspace.selectedOrder?.queuePosition,
    workspace.selectedOrder?.queuedAt,
    workspace.selectedOrder?.syncState,
  ]);
  const documentHeaderOverride = React.useMemo(() => {
    if (mode !== 'editor') return null;
    return {
      title: 'Заказы клиентов',
      icon: 'receipt-outline',
      titleSlot: documentHeaderTitleSlot,
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
  }, [closeDocumentToOrders, documentHeaderRightSlot, documentHeaderSlot, documentHeaderTitleSlot, mode]);
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
  const isCounterpartyPicker = pickerKind === 'counterparty' || pickerKind === 'filterCounterparty';
  const pickerContent = (
    <>
      <View style={styles.pickerToolbar}>
        <View style={styles.pickerSearchRow}>
          <CompactSearchbar
            inputRef={pickerSearchInputRef}
            style={[styles.pickerSearchFlat, (isProductPicker || isCounterpartyPicker) && styles.productPickerSearchFlat]}
            inputStyle={styles.pickerSearchInputFlat}
            value={pickerSearch}
            onChangeText={handlePickerSearchChange}
            placeholder={isProductPicker ? 'Поиск товара' : 'Поиск'}
            inputComponent={SheetTextInput}
            autoFocus={pickerShouldAutofocusSearch(pickerKind)}
            loading={pickerLoading}
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
          {isCounterpartyPicker ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: counterpartyManagerOnly }}
              accessibilityLabel="Показывать только моих контрагентов"
              onPress={() => setCounterpartyManagerOnly((prev) => !prev)}
              style={[
                styles.counterpartyManagerToggle,
                counterpartyManagerOnly && styles.counterpartyManagerToggleActive,
              ]}
            >
              <Checkbox.Android
                status={counterpartyManagerOnly ? 'checked' : 'unchecked'}
                color="#2563EB"
                uncheckedColor="#64748B"
                rippleColor="rgba(37, 99, 235, 0.12)"
              />
              <Text style={[
                styles.counterpartyManagerToggleText,
                counterpartyManagerOnly && styles.counterpartyManagerToggleTextActive,
              ]}>Мои</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <PickerContentScrollView
        ref={pickerListRef}
        style={styles.pickerScroll}
        onScroll={handlePickerScroll}
        onScrollBeginDrag={suppressPickerAutoFocus}
        scrollEventThrottle={16}
        nestedScrollEnabled
        contentContainerStyle={styles.pickerListContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {pickerNeedsOrderContext(pickerKind) && (!workspace.draft.organizationGuid || !workspace.draft.counterpartyGuid) ? <InfoText styles={styles} text="Сначала выберите организацию и контрагента." /> : null}
        {visiblePickerItems.map((item: any) => {
          const disabled = pickerKind === 'product' && isProductAlreadyInOrder(item as ClientOrderProduct, workspace.draft.items);
          const pickerMeta = pickerKind === 'product'
            ? productPickerMeta(item, {
                hasPriceType: !!workspace.draft.priceTypeGuid,
                hasWarehouse: !!workspace.draft.warehouseGuid,
              })
            : null;
          const isProductRow = pickerKind === 'product';
          const isSelected = isProductRow
            ? !!item.guid && selectedProducts.has(item.guid)
            : !!selectedPickerGuid && selectedPickerGuid === item.guid;
          const description = pickerKind === 'product'
            ? [pickerMeta?.code, pickerMeta?.receiptPrice ? `Цена: ${pickerMeta.receiptPrice}` : '', pickerMeta?.stock].filter(Boolean).join(' • ')
            : getPickerItemMeta(pickerKind, item) || '';
          return (
            <Pressable
              key={`${pickerKind}-${item.guid || item.name || item.fullAddress}`}
              disabled={disabled}
              onPress={() => void selectPickerItem(item)}
              style={({ pressed }) => [
                styles.pickerFlatRow,
                isProductRow && styles.productPickerRow,
                isSelected && styles.pickerFlatRowSelected,
                disabled && styles.disabled,
                pressed && styles.flatPressed,
              ]}
            >
              {pickerKind === 'product' ? (
                <ProductThumb
                  item={item}
                  style={[styles.productPickerThumb, disabled && styles.productPickerThumbDisabled]}
                  iconSize={26}
                  iconColor={disabled ? '#94A3B8' : '#2563EB'}
                  onPress={() => openProductGallery(item)}
                />
              ) : null}
              <View style={styles.pickerFlatTextWrap}>
                <Text style={styles.pickerFlatTitle} numberOfLines={2}>{pickerKind === 'product' ? (item.name || getPickerItemTitle(item)) : getPickerItemTitle(item)}</Text>
                {description ? <Text style={[styles.pickerFlatMeta, disabled && styles.pickerRowDisabled]} numberOfLines={2}>{description}</Text> : null}
                {isProductRow && disabled ? <Text style={styles.productPickerAlreadyText}>Уже в заказе</Text> : null}
                {isProductRow && isSelected ? <Text style={styles.productPickerSelectedText}>Добавить в заказ</Text> : null}
              </View>
              {isSelected
                ? <MaterialCommunityIcons name="check-circle" size={21} color="#16A34A" />
                : <MaterialCommunityIcons name={isProductRow && !disabled ? 'plus-circle-outline' : 'chevron-right'} size={22} color={disabled ? '#CBD5E1' : '#94A3B8'} />}
            </Pressable>
          );
        })}
        {!pickerLoading && !visiblePickerItems.length && !(pickerNeedsOrderContext(pickerKind) && (!workspace.draft.organizationGuid || !workspace.draft.counterpartyGuid)) ? <InfoText styles={styles} text="Ничего не найдено." /> : null}
        {pickerLoading ? <View style={styles.pickerFooter}><ActivityIndicator size="small" color="#2563EB" /><Text style={styles.pickerFooterText}>Загружаю...</Text></View> : null}
      </PickerContentScrollView>
      {isProductPicker && selectedProducts.size > 0 ? (
        <Surface mode="flat" style={[styles.productPickerTransferFooter, { paddingBottom: Math.max(safeBottom, 10) + 8 }]}>
          <PaperButton
            mode="contained"
            onPress={transferSelectedProducts}
            buttonColor="#2563EB"
            textColor="#FFFFFF"
            icon="arrow-down-circle-outline"
            style={styles.productPickerTransferButton}
            labelStyle={styles.productPickerTransferLabel}
            contentStyle={styles.productPickerTransferContent}
          >
            {formatProductTransferLabel(selectedProducts.size)}
          </PaperButton>
        </Surface>
      ) : null}
    </>
  );
  const discardConfirmState = React.useMemo<ConfirmDialogState>(() => {
    if (!discardConfirm.open) return null;
    return {
      title: 'Выйти из документа?',
      message: discardConfirm.mode === 'create'
        ? 'Новый документ не сохранен. Если выйти, введенные данные будут потеряны.'
        : 'Есть несохраненные изменения. Если выйти, они будут потеряны.',
      cancelLabel: 'Остаться',
      confirmLabel: 'Выйти',
      destructive: true,
      onConfirm: () => closeDiscardConfirm('discard'),
    };
  }, [closeDiscardConfirm, discardConfirm.mode, discardConfirm.open]);

  const editorTopPadding = Math.max(topInset, headerBottomOffset || 0);
  const ordersTopPadding = Math.max(0, topInset - 24);
  const pageTopPadding = mode === 'editor' ? editorTopPadding : ordersTopPadding;
  const showItemsSearchOverlay = mode === 'editor' && !workspace.readOnly && !workspace.mutationLocked && section === 'items' && !!itemsSearch.trim() && itemsSearchFocused;
  const itemsSearchOverlayTop = Math.max(topInset + 96, headerBottomOffset + 6);
  const showDocumentOpenLoader = mode === 'editor' && (!!openingDocument || workspace.loadingDetail);
  const showDocumentDeleteOverlay = mode === 'editor' && deleteDocumentOverlayVisible;
  const documentOpenLabel = openingDocument === 'new' ? 'Готовлю новый документ' : 'Открываю документ';

  return (
    <View style={[styles.screen, { backgroundColor: background, paddingTop: pageTopPadding }]}>
      {mode === 'orders' ? (
        <Animated.View style={[styles.ordersStage, ordersEntranceStyle]}>
          <View style={[styles.ordersStickyToolbar, width >= 720 && styles.contentTablet, { paddingHorizontal: ui.pageX, maxWidth: layoutTier === 'tablet' ? 760 : undefined }]}>
            <OrdersToolbar
              styles={styles}
              workspace={workspace}
              onOpenFilters={() => setFiltersOpen(true)}
              onCreate={() => void createDocument()}
            />
          </View>
          <ScrollView
            ref={ordersScrollRef}
            contentContainerStyle={[styles.ordersContent, width >= 720 && styles.contentTablet, { paddingHorizontal: ui.pageX, paddingTop: 7, maxWidth: layoutTier === 'tablet' ? 760 : undefined }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            scrollEventThrottle={16}
            onScroll={handleOrdersScroll}
            onLayout={handleOrdersListLayout}
            onContentSizeChange={handleOrdersContentSizeChange}
            refreshControl={
              <RefreshControl
                refreshing={ordersRefreshing}
                onRefresh={refreshOrdersList}
                tintColor="#2563EB"
                colors={['#2563EB']}
                progressBackgroundColor="#FFFFFF"
              />
            }
          >
            {showOrdersInitialLoading ? (
              <OrdersInitialLoadingState styles={styles} />
            ) : (
              <>
                {workspace.orders.map((order) => (
                  <OrderCard
                    key={order.guid}
                    order={order}
                    loading={openingOrderGuid === order.guid}
                    disabled={!!openingOrderGuid}
                    onPress={() => void selectOrder(order)}
                  />
                ))}
                {showOrdersEmptyState ? <OrdersEmptyState styles={styles} filtered={hasActiveOrderFilters} /> : null}
                {showOrdersFooter ? (
                  <OrdersPaginationFooter
                    styles={styles}
                    loading={workspace.loadingMoreOrders}
                    error={workspace.ordersAppendError}
                    onRetry={() => void workspace.loadMoreOrders()}
                  />
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
                <ItemsSection
                  workspace={workspace}
                  filteredItems={filteredItems}
                  ui={ui}
                  onEditItem={openLineEditor}
                  onAddItem={() => openPicker('product')}
                  onItemLayout={handleLineItemLayout}
                  onOpenImages={openProductGallery}
                />
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
        sideOffset={Math.max(12, ui.pageX)}
        workspace={workspace}
        searchResults={itemsSearchResults}
        searchLoading={itemsSearchLoading}
        searchLoadingMore={itemsSearchLoadingMore}
        searchHasMore={itemsSearchHasMore}
        searchError={itemsSearchError}
        onSelectSearchResult={addProductFromItemsSearch}
        onLoadMoreSearchResults={loadMoreItemsSearchResults}
        onDismiss={dismissItemsSearch}
      />

      {mode === 'editor' && !showDocumentOpenLoader ? (
        <DocumentBottomBar
          styles={styles}
          workspace={workspace}
          safeBottom={safeBottom}
          onPrimaryAction={handleDocumentPrimaryAction}
        />
      ) : null}

      {showDocumentDeleteOverlay ? (
        <DocumentBusyOverlay styles={styles} label="Удаляю черновик" />
      ) : null}

      <OrdersFiltersFullscreen
        styles={styles}
        visible={filtersOpen}
        topOffset={Math.max(88, topInset + 12)}
        filters={workspace.filters}
        statusLabels={workspace.statusLabels}
        syncLabels={workspace.syncLabels}
        organizations={workspace.settings?.organizations || []}
        filterOrganization={filterOrganization}
        filterCounterparty={filterCounterparty}
        filterWarehouse={filterWarehouse}
        filterPriceType={filterPriceType}
        searchCounterparties={workspace.searchCounterparties}
        searchWarehouses={workspace.searchWarehouses}
        searchPriceTypes={workspace.searchPriceTypes}
        onApply={(next) => {
          setFilterOrganization(next.organization);
          setFilterCounterparty(next.counterparty);
          setFilterWarehouse(next.warehouse);
          setFilterPriceType(next.priceType);
          workspace.setFilters(next.filters);
          setFiltersOpen(false);
        }}
        onReset={() => {
          setFilterOrganization(null);
          setFilterCounterparty(null);
          setFilterWarehouse(null);
          setFilterPriceType(null);
          workspace.clearFilters();
        }}
        onClose={() => setFiltersOpen(false)}
      />

      {pickerKind === 'product' ? (
        <ProductPickerFullscreenPanel
          styles={styles}
          visible
          topInset={safeTop}
          bottomInset={safeBottom}
          onClose={requestClosePicker}
          search={pickerSearch}
          onSearchChange={handlePickerSearchChange}
          searchInputRef={pickerSearchInputRef}
          listRef={pickerListRef}
          loading={pickerLoading}
          inStockOnly={inStockOnly}
          onToggleInStockOnly={() => setInStockOnly((prev) => !prev)}
          items={visiblePickerItems as ClientOrderProduct[]}
          selectedProducts={selectedProducts}
          orderItems={workspace.draft.items}
          hasOrderContext={!!workspace.draft.organizationGuid && !!workspace.draft.counterpartyGuid}
          hasPriceType={!!workspace.draft.priceTypeGuid}
          hasWarehouse={!!workspace.draft.warehouseGuid}
          onPressProduct={handleProductPickerPress}
          onLongPressProduct={handleProductPickerLongPress}
          onOpenImages={openProductGallery}
          onScroll={handlePickerScroll}
          onMomentumScrollEnd={handlePickerScroll}
          onLayout={handlePickerListLayout}
          onContentSizeChange={handlePickerContentSizeChange}
          onEndReached={handlePickerEndReached}
          onScrollBeginDrag={suppressPickerAutoFocus}
          selectedCount={selectedProducts.size}
          onTransfer={transferSelectedProducts}
          onClearSelection={clearPickerProductSelection}
        />
      ) : (
        <PickerBottomSheet
          styles={styles}
          visible={!!pickerKind}
          topOffset={Math.max(88, topInset + 12)}
          title={pickerTitle(pickerKind)}
          titleIcon={pickerIcon(pickerKind)}
          onClose={requestClosePicker}
          contentScrollOffset={pickerScrollOffset}
          enableContentDrag
          keyboardTopInset={Math.max(88, topInset + 12)}
        >
          {pickerContent}
        </PickerBottomSheet>
      )}

      <SheetModal styles={styles} visible={inspectorOpen} onClose={() => setInspectorOpen(false)} title="Инспектор">
        <Text style={styles.orderMeta}>Revision: {workspace.draft.revision || '—'}</Text>
        <Text style={styles.orderMeta}>Статус: {workspace.selectedOrder ? getOrderDisplayStatusLabelWithQueue(workspace.selectedOrder) : '—'}</Text>
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
        metadataLoading={!!editingItemKey && metadataLoadingItemKeys.has(editingItemKey)}
        onClose={() => {
          setPendingProductItem(null);
          setEditingItemKey(null);
        }}
        onOpenImages={openProductGallery}
      />

      <ProductImageGalleryModal
        styles={styles}
        gallery={productGallery}
        onClose={() => setProductGallery(null)}
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
  const readOnly = !!workspace.readOnly || !!workspace.mutationLocked;
  const missingOrderContext = !workspace.draft.organizationGuid || !workspace.draft.counterpartyGuid;
  const showRequiredErrors = !readOnly;
  const hasOrganizationValue = !!(workspace.draft.organizationGuid || workspace.selections.organization?.guid || workspace.selections.organization?.name);
  const hasCounterpartyValue = !!(workspace.draft.counterpartyGuid || workspace.selections.counterparty?.guid || workspace.selections.counterparty?.name);
  const hasAgreementValue = !!(workspace.draft.agreementGuid || workspace.selections.agreement?.guid || workspace.selections.agreement?.name);
  const hasContractValue = !!(workspace.draft.contractGuid || workspace.selections.contract?.guid || workspace.selections.contract?.number || workspace.selections.contract?.name);
  const hasPriceTypeValue = !!(workspace.draft.priceTypeGuid || workspace.draft.priceTypeName || workspace.selections.agreement?.priceType?.guid || workspace.selections.agreement?.priceType?.name);
  const hasWarehouseValue = !!(workspace.draft.warehouseGuid || workspace.selections.warehouse?.guid || workspace.selections.warehouse?.name);
  const hasDeliveryAddressValue = !!(
    workspace.draft.deliveryAddressGuid
    || workspace.selections.deliveryAddress?.guid
    || workspace.selections.deliveryAddress?.fullAddress
    || workspace.selections.deliveryAddress?.name
  );
  const deliveryAddressComment = workspace.selections.deliveryAddress?.deliveryComment || workspace.selections.deliveryAddress?.comment || '';
  return <View style={styles.cardStack}>
    <FlatDocumentField label="Организация" value={workspace.selections.organization?.name || 'Выбрать'} icon="office-building-outline" onPress={() => openPicker('organization')} disabled={readOnly} invalid={showRequiredErrors && !hasOrganizationValue} loading={workspace.documentHeaderLoadingState.organization} onDetails={() => openDetails('organization', workspace.draft.organizationGuid || workspace.selections.organization?.guid)} />
    <FlatDocumentField label="Контрагент" value={workspace.selections.counterparty?.name || 'Выбрать'} icon="account-outline" onPress={() => openPicker('counterparty')} disabled={readOnly} invalid={showRequiredErrors && !hasCounterpartyValue} loading={workspace.documentHeaderLoadingState.counterparty} onDetails={() => openDetails('counterparty', workspace.draft.counterpartyGuid || workspace.selections.counterparty?.guid)} />
    <FlatDocumentField label="Соглашение" value={workspace.selections.agreement?.name || 'Выбрать'} icon="file-document-outline" onPress={() => openPicker('agreement')} disabled={readOnly || missingOrderContext} invalid={showRequiredErrors && !hasAgreementValue} loading={workspace.documentHeaderLoadingState.agreement} onDetails={() => openDetails('agreement', workspace.draft.agreementGuid || workspace.selections.agreement?.guid)} />
    <FlatDocumentField label="Договор" value={workspace.selections.contract?.name || workspace.selections.contract?.number || 'Выбрать'} icon="file-sign" onPress={() => openPicker('contract')} disabled={readOnly || missingOrderContext} invalid={showRequiredErrors && !hasContractValue} loading={workspace.documentHeaderLoadingState.contract} onDetails={() => openDetails('contract', workspace.draft.contractGuid || workspace.selections.contract?.guid)} />
    <FlatDocumentField
      label="Вид цены"
      value={workspace.draft.priceTypeName || workspace.selections.agreement?.priceType?.name || 'Выбрать'}
      icon="tag-outline"
      onPress={() => openPicker('priceType')}
      disabled={readOnly || missingOrderContext}
      invalid={showRequiredErrors && !hasPriceTypeValue}
      loading={workspace.documentHeaderLoadingState.priceType}
      onDetails={() => openDetails('price-type', workspace.draft.priceTypeGuid || workspace.selections.agreement?.priceType?.guid)}
      onReset={workspace.isHeaderPriceTypeCustom ? onResetHeaderPriceType : undefined}
    />
    <FlatSegmentedField
      label="Форма оплаты"
      value={workspace.draft.paymentForm}
      choices={PAYMENT_FORM_CHOICES}
      icon="cash-multiple"
      disabled={readOnly || missingOrderContext || workspace.loadingDefaults}
      loading={workspace.loadingDefaults}
      onChange={(value) => workspace.patchDraft({ paymentForm: value })}
    />
    <FlatSegmentedField
      label="Способ доставки"
      value={workspace.draft.deliveryMethod}
      choices={DELIVERY_METHOD_CHOICES}
      icon="truck-delivery-outline"
      disabled={readOnly || missingOrderContext || workspace.loadingDefaults}
      loading={workspace.loadingDefaults}
      onChange={(value) => workspace.patchDraft({ deliveryMethod: value })}
    />
    <FlatDocumentField label="Склад" value={workspace.selections.warehouse?.name || 'Выбрать'} icon="warehouse" onPress={() => openPicker('warehouse')} disabled={readOnly || missingOrderContext} invalid={showRequiredErrors && !hasWarehouseValue} loading={workspace.documentHeaderLoadingState.warehouse} onDetails={() => openDetails('warehouse', workspace.draft.warehouseGuid || workspace.selections.warehouse?.guid)} />
    <FlatDocumentField label="Адрес доставки" value={workspace.selections.deliveryAddress?.fullAddress || workspace.selections.deliveryAddress?.name || 'Выбрать'} helperText={deliveryAddressComment} icon="map-marker-outline" onPress={() => openPicker('deliveryAddress')} disabled={readOnly || missingOrderContext} invalid={showRequiredErrors && !hasDeliveryAddressValue} loading={workspace.documentHeaderLoadingState.deliveryAddress} onDetails={() => openDetails('delivery-address', workspace.draft.deliveryAddressGuid || workspace.selections.deliveryAddress?.guid)} />
    <FlatDateField
      label="Дата отгрузки"
      value={workspace.draft.deliveryDate || undefined}
      disabled={readOnly}
      invalid={showRequiredErrors && !workspace.draft.deliveryDate}
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
      editable={!readOnly}
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
  invalid,
  minDate,
  maxDate,
  onChange,
}: {
  label: string;
  value?: string;
  disabled?: boolean;
  invalid?: boolean;
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
          style={({ pressed }) => [styles.flatField, disabled && styles.readOnlyFieldSurface, invalid && styles.flatFieldInvalid, pressed && !disabled && styles.flatPressed]}
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
  helperText,
  icon,
  onPress,
  disabled,
  invalid,
  onDetails,
  onReset,
  resetIcon,
  loading,
}: {
  label: string;
  value: string;
  helperText?: string | null;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  onPress: () => void;
  disabled?: boolean;
  invalid?: boolean;
  onDetails?: () => void;
  onReset?: () => void;
  resetIcon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  loading?: boolean;
}) {
  const showDetailsAction = false;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.flatField, disabled && styles.readOnlyFieldSurface, invalid && styles.flatFieldInvalid, pressed && !disabled && styles.flatPressed]}
    >
      <View style={styles.flatFieldIcon}>
        <MaterialCommunityIcons name={icon} size={20} color={disabled ? 'rgba(71, 85, 105, 0.48)' : '#475569'} />
      </View>
      <View style={styles.flatFieldTextWrap}>
        <Text style={[styles.flatFieldLabel, disabled && styles.readOnlyFieldLabel]}>{label}</Text>
        <Text style={[styles.flatFieldValue, disabled && styles.readOnlyFieldValue]} numberOfLines={2}>{value}</Text>
        {helperText ? (
          <Text style={[styles.flatFieldHelper, disabled && styles.readOnlyFieldLabel]} numberOfLines={2}>
            {helperText}
          </Text>
        ) : null}
      </View>
      {loading || onReset || showDetailsAction ? (
        <View style={styles.flatFieldActions}>
          {loading ? (
            <View style={styles.flatFieldAction}>
              <ActivityIndicator size={17} color="#2563EB" />
            </View>
          ) : null}
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
              <MaterialCommunityIcons name={resetIcon || 'refresh'} size={18} color={disabled ? 'rgba(37, 99, 235, 0.42)' : '#2563EB'} />
            </Pressable>
          ) : null}
          {showDetailsAction ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Открыть карточку: ${label}`}
              disabled={disabled}
              onPress={(event) => {
                event.stopPropagation();
                onDetails?.();
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

function FlatSegmentedField({
  label,
  value,
  choices,
  icon,
  disabled,
  loading,
  onChange,
}: {
  label: string;
  value?: string | null;
  choices: SegmentedChoice[];
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  disabled?: boolean;
  loading?: boolean;
  onChange: (value: string | null) => void;
}) {
  const unsupported = unsupportedChoiceValue(choices, value);
  const currentKey = choiceKey(value);

  return (
    <View style={[styles.flatSegmentedField, disabled && styles.readOnlyFieldSurface]}>
      <View style={styles.flatFieldIcon}>
        <MaterialCommunityIcons name={icon} size={20} color={disabled ? 'rgba(71, 85, 105, 0.48)' : '#475569'} />
      </View>
      <View style={styles.flatSegmentedContent}>
        <View style={styles.flatSegmentedHeader}>
          <Text style={[styles.flatFieldLabel, disabled && styles.readOnlyFieldLabel]}>{label}</Text>
          {loading ? <ActivityIndicator size={15} color="#2563EB" /> : null}
        </View>
        <View style={styles.flatSegmentedControl}>
          {choices.map((choice, index) => {
            const selected = choiceKey(choice.value) === currentKey && !unsupported;
            return (
              <Pressable
                key={choiceKey(choice.value) || '__default__'}
                accessibilityRole="button"
                disabled={disabled}
                onPress={() => onChange(choice.value)}
                style={({ pressed }) => [
                  styles.flatSegmentedOption,
                  index === choices.length - 1 && styles.flatSegmentedOptionLast,
                  selected && styles.flatSegmentedOptionActive,
                  disabled && styles.flatSegmentedOptionDisabled,
                  pressed && !disabled && styles.flatPressed,
                ]}
              >
                <Text style={[styles.flatSegmentedOptionText, selected && styles.flatSegmentedOptionTextActive, disabled && styles.readOnlyFieldValue]} numberOfLines={1}>
                  {choice.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {unsupported ? <Text style={styles.flatSegmentedUnsupported} numberOfLines={2}>Текущее из 1С: {unsupported}</Text> : null}
      </View>
    </View>
  );
}

function DocumentActionsMenu({
  styles,
  workspace,
  actionsMenuOpen,
  setActionsMenuOpen,
  setInspectorOpen,
  saveDraftFromMenu,
  submitFromMenu,
  copyFromMenu,
  removeOrCancel,
  deleteDocumentFromMenu,
  compact = false,
}: {
  styles: any;
  workspace: any;
  actionsMenuOpen: boolean;
  setActionsMenuOpen: (open: boolean) => void;
  setInspectorOpen: (open: boolean) => void;
  saveDraftFromMenu: () => void;
  submitFromMenu: () => void;
  copyFromMenu: () => void;
  removeOrCancel: () => void;
  deleteDocumentFromMenu: () => void;
  compact?: boolean;
}) {
  const hideSave = (workspace.selectedOrderQueued || workspace.selectedOrderSynced) && workspace.dirty;
  const status = workspace.selectedOrder?.status || '';
  const canDeleteLocal = workspace.draftMode || status === 'DRAFT' || status === 'QUEUED' || status === 'CANCELLED';
  const showStateAction = !(workspace.draftMode || status === 'DRAFT');
  const dangerIcon = workspace.selectedOrderQueued
    ? 'playlist-remove'
    : workspace.selectedOrder?.status === 'CANCELLED'
      ? 'backup-restore'
      : 'close-circle-outline';
  const dangerTitle = workspace.selectedOrderQueued
    ? 'Снять с очереди'
    : workspace.selectedOrder?.status === 'CANCELLED'
      ? 'Восстановить'
      : 'Отменить заказ';
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
      {!hideSave ? (
        <Menu.Item leadingIcon="content-save-outline" title={workspace.saving ? 'Сохраняю...' : 'Сохранить'} onPress={saveDraftFromMenu} disabled={workspace.readOnly || workspace.mutationLocked || !workspace.validation.canSave} />
      ) : null}
      <Menu.Item leadingIcon="cloud-upload-outline" title={workspace.submitting ? 'Отправляю...' : 'Отправить в 1С'} onPress={submitFromMenu} disabled={workspace.readOnly || workspace.mutationLocked || !workspace.canSubmitOrder} />
      <Menu.Item leadingIcon="content-copy" title={workspace.copying ? 'Копирую...' : 'Копировать'} onPress={copyFromMenu} disabled={workspace.mutationLocked || (!workspace.draft.guid && !workspace.selectedGuid)} />
      {canDeleteLocal ? (
        <Menu.Item leadingIcon="trash-can-outline" title="Удалить документ" disabled={workspace.mutationLocked} onPress={deleteDocumentFromMenu} />
      ) : null}
      <Menu.Item leadingIcon="information-outline" title="Инспектор" onPress={() => { setActionsMenuOpen(false); setInspectorOpen(true); }} />
      {showStateAction ? (
        <Menu.Item leadingIcon={dangerIcon} title={dangerTitle} disabled={workspace.mutationLocked} onPress={() => { setActionsMenuOpen(false); removeOrCancel(); }} />
      ) : null}
    </Menu>
  );
}

function DocumentHeaderTitleSlot({
  styles,
  documentNumber,
  status,
  statusText,
  queuePosition,
  queuedAt,
  exportAttempts,
  lastExportError,
  last1cError,
  syncState,
  visible,
  onOpen,
  onClose,
}: {
  styles: any;
  documentNumber: string;
  status: string;
  statusText: string;
  queuePosition?: number | null;
  queuedAt?: string | null;
  exportAttempts?: number | null;
  lastExportError?: string | null;
  last1cError?: string | null;
  syncState?: string | null;
  visible: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const statusIcon = orderStatusIcon(status);
  const position = Number(queuePosition || 0);
  const queueError = lastExportError || last1cError || null;
  const queueDetails = [
    position > 0 ? `В очереди: ${position}` : null,
    queuedAt ? `Поставлен: ${formatDateTime(queuedAt)}` : null,
    exportAttempts ? `Попыток отправки: ${exportAttempts}` : null,
    syncState ? `Синхронизация: ${syncState}` : null,
  ].filter(Boolean);

  return (
    <View style={styles.documentTopTitleRow}>
      <Menu
        visible={visible}
        onDismiss={onClose}
        anchor={(
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Статус документа: ${statusText}`}
            onPress={onOpen}
            style={({ pressed }) => [
              styles.documentTopStatusButton,
              pressed && styles.flatPressed,
            ]}
          >
            <MaterialCommunityIcons name={statusIcon.name as any} size={17} color={statusIcon.color} />
            {position > 0 ? (
              <View style={styles.documentTopQueueBadge}>
                <Text style={styles.documentTopQueueBadgeText}>{position > 99 ? '99+' : position}</Text>
              </View>
            ) : null}
          </Pressable>
        )}
        contentStyle={styles.documentStatusMenuPaper}
      >
        <Menu.Item
          leadingIcon={statusIcon.name as any}
          title={statusText}
          onPress={onClose}
          titleStyle={[styles.documentStatusMenuText, { color: statusIcon.color }]}
        />
        {queueDetails.map((title) => (
          <Menu.Item
            key={title}
            leadingIcon="format-list-numbered"
            title={title}
            onPress={onClose}
            titleStyle={styles.documentStatusMenuText}
          />
        ))}
        {queueError ? (
          <Menu.Item
            leadingIcon="alert-circle-outline"
            title={normalizeClientOrderUserErrorMessage(queueError)}
            onPress={onClose}
            titleStyle={[styles.documentStatusMenuText, styles.documentStatusMenuErrorText]}
          />
        ) : null}
      </Menu>
      <Text style={styles.documentTopTitle} numberOfLines={1} ellipsizeMode="tail">
        {documentNumber}
      </Text>
    </View>
  );
}

function DocumentHeaderSlot({
  styles,
  workspace,
  section,
  setSection,
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
  hasHeaderErrors,
  hasItemsErrors,
}: {
  styles: any;
  workspace: any;
  section: EditorSection;
  setSection: (section: EditorSection) => void;
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
  hasHeaderErrors?: boolean;
  hasItemsErrors?: boolean;
}) {
  const headerIconColor = hasHeaderErrors ? '#DC2626' : section === 'header' ? '#1D4ED8' : '#64748B';
  const itemsIconColor = hasItemsErrors ? '#DC2626' : section === 'items' ? '#1D4ED8' : '#64748B';
  return (
    <View style={[styles.documentHeaderSlot, section === 'items' && !workspace.readOnly && !workspace.mutationLocked && styles.documentHeaderSlotItems]}>
      {workspace.error ? <Text style={styles.error}>{normalizeClientOrderUserErrorMessage(workspace.error, 'Не удалось выполнить действие')}</Text> : null}
      <View style={styles.documentTabsRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setSection('header')}
          style={({ pressed }) => [styles.documentTab, section === 'header' && styles.documentTabActive, pressed && styles.flatPressed]}
        >
          <MaterialCommunityIcons name="clipboard-text-outline" size={16} color={headerIconColor} />
          <Text style={[styles.documentTabText, section === 'header' && styles.documentTabTextActive]}>Шапка</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setSection('items')}
          style={({ pressed }) => [styles.documentTab, section === 'items' && styles.documentTabActive, pressed && styles.flatPressed]}
        >
          <MaterialCommunityIcons name="cube-outline" size={16} color={itemsIconColor} />
          <Text style={[styles.documentTabText, section === 'items' && styles.documentTabTextActive]}>Товары</Text>
          <View style={[styles.documentTabCountBadge, section === 'items' && styles.documentTabCountBadgeActive]}>
            <Text style={[styles.documentTabCountText, section === 'items' && styles.documentTabCountTextActive]}>{workspace.draft.items.length}</Text>
          </View>
        </Pressable>
      </View>
      {section === 'items' && !workspace.readOnly && !workspace.mutationLocked ? (
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
  const missingOrderContext = !workspace.draft.organizationGuid || !workspace.draft.counterpartyGuid;
  const handleSearchChange = React.useCallback((value: string) => {
    if (missingOrderContext) return;
    setItemsSearch(value);
    if (value.trim()) onSearchFocus();
  }, [missingOrderContext, onSearchFocus, setItemsSearch]);

  return <View style={embedded ? styles.itemsToolbarHeaderWrap : styles.itemsToolbarWrap}>
    <View style={styles.itemsFlatToolbar}>
      <CompactSearchbar
        style={styles.itemsSearchFlat}
        inputStyle={styles.itemsSearchFlatInput}
        value={itemsSearch}
        onChangeText={handleSearchChange}
        placeholder="Поиск товара"
        onFocus={missingOrderContext ? undefined : onSearchFocus}
        onBlur={onSearchBlur}
        editable={!missingOrderContext}
        loading={searchLoading}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Добавить товар"
        disabled={missingOrderContext}
        onPress={() => openPicker('product')}
        style={({ pressed }) => [styles.itemsToolbarButton, styles.itemsToolbarButtonSuccess, missingOrderContext && styles.disabled, pressed && !missingOrderContext && styles.flatPressed]}
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
            const meta = productPickerMeta(product, {
              hasPriceType: !!workspace.draft.priceTypeGuid,
              hasWarehouse: !!workspace.draft.warehouseGuid,
            });
            return (
              <Pressable
                key={product.guid}
                accessibilityRole="button"
                disabled={disabled}
                onPress={() => onSelectSearchResult(product)}
                style={({ pressed }) => [styles.itemsSearchResultRow, disabled && styles.disabled, pressed && styles.flatPressed]}
              >
                <InlineProductSearchThumb styles={styles} item={product} selected={disabled} />
                <View style={styles.itemsSearchResultTextWrap}>
                  <Text style={styles.itemsSearchResultTitle} numberOfLines={1}>{product.name || getPickerItemTitle(product)}</Text>
                  <Text style={styles.itemsSearchResultMeta} numberOfLines={1}>
                    {[meta.code, `Цена: ${meta.receiptPrice}`, meta.stock].filter(Boolean).join(' • ')}
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
  onDismiss,
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
  onDismiss: () => void;
}) {
  if (!visible) return null;
  return (
    <Portal>
      <View style={StyleSheet.absoluteFill}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть поиск товаров"
          onPress={onDismiss}
          style={StyleSheet.absoluteFill}
        />
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
              const meta = productPickerMeta(product, {
                hasPriceType: !!workspace.draft.priceTypeGuid,
                hasWarehouse: !!workspace.draft.warehouseGuid,
              });
              return (
                <Pressable
                  key={product.guid}
                  accessibilityRole="button"
                  disabled={disabled}
                  onPress={() => onSelectSearchResult(product)}
                  style={({ pressed }) => [styles.itemsSearchResultRow, disabled && styles.disabled, pressed && styles.flatPressed]}
                >
                  <InlineProductSearchThumb styles={styles} item={product} selected={disabled} />
                  <View style={styles.itemsSearchResultTextWrap}>
                    <Text style={styles.itemsSearchResultTitle} numberOfLines={1}>{product.name || getPickerItemTitle(product)}</Text>
                    <Text style={styles.itemsSearchResultMeta} numberOfLines={1}>
                      {[meta.code, `Цена: ${meta.receiptPrice}`, meta.stock].filter(Boolean).join(' • ')}
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

function InlineProductSearchThumb({
  styles,
  item,
  selected,
}: {
  styles: any;
  item: ClientOrderProduct;
  selected: boolean;
}) {
  return (
    <View style={styles.itemsSearchResultThumbWrap}>
      <ProductThumb
        item={item}
        style={styles.itemsSearchResultThumb}
        iconSize={18}
        iconColor="#2563EB"
      />
      <View style={[styles.itemsSearchResultThumbBadge, selected ? styles.itemsSearchResultThumbBadgeSelected : styles.itemsSearchResultThumbBadgeAdd]}>
        <MaterialCommunityIcons name={selected ? 'check' : 'plus'} size={10} color="#FFFFFF" />
      </View>
    </View>
  );
}

const ProductPickerFullscreenRow = React.memo(function ProductPickerFullscreenRow({
  styles,
  item,
  selected,
  disabled,
  hasPriceType,
  hasWarehouse,
  onPressProduct,
  onLongPressProduct,
  onOpenImages,
}: {
  styles: any;
  item: ClientOrderProduct;
  selected: boolean;
  disabled: boolean;
  hasPriceType: boolean;
  hasWarehouse: boolean;
  onPressProduct: (item: ClientOrderProduct) => void;
  onLongPressProduct: (item: ClientOrderProduct) => void;
  onOpenImages: (item: ClientOrderProduct) => void;
}) {
  const description = React.useMemo(() => {
    const meta = productPickerMeta(item, { hasPriceType, hasWarehouse });
    return [meta.code, meta.receiptPrice ? `Цена: ${meta.receiptPrice}` : '', meta.stock].filter(Boolean).join(' • ');
  }, [hasPriceType, hasWarehouse, item]);
  const suppressNextPressRef = React.useRef(false);
  const handlePress = React.useCallback(() => {
    if (suppressNextPressRef.current) {
      suppressNextPressRef.current = false;
      return;
    }
    onPressProduct(item);
  }, [item, onPressProduct]);
  const handleLongPress = React.useCallback(() => {
    suppressNextPressRef.current = true;
    onLongPressProduct(item);
  }, [item, onLongPressProduct]);
  const handlePressOut = React.useCallback(() => {
    if (!suppressNextPressRef.current) return;
    setTimeout(() => {
      suppressNextPressRef.current = false;
    }, 0);
  }, []);
  const handleOpenImages = React.useCallback(() => onOpenImages(item), [item, onOpenImages]);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={handlePress}
      onLongPress={handleLongPress}
      onPressOut={handlePressOut}
      delayLongPress={280}
      style={({ pressed }) => [
        styles.pickerFlatRow,
        styles.productPickerRow,
        selected && styles.pickerFlatRowSelected,
        pressed && styles.flatPressed,
      ]}
    >
      <ProductThumb
        item={item}
        style={styles.productPickerThumb}
        iconSize={26}
        iconColor={disabled ? '#94A3B8' : '#2563EB'}
        onPress={handleOpenImages}
      />
      <View style={styles.pickerFlatTextWrap}>
        <Text style={styles.pickerFlatTitle} numberOfLines={2}>{item.name || getPickerItemTitle(item)}</Text>
        {description ? <Text style={styles.pickerFlatMeta} numberOfLines={2}>{description}</Text> : null}
        {disabled ? <Text style={styles.productPickerAlreadyText}>Уже в заказе</Text> : null}
      </View>
      {selected ? (
        <MaterialCommunityIcons name="check-circle" size={21} color="#16A34A" />
      ) : (
        <MaterialCommunityIcons name={disabled ? 'check-circle-outline' : 'plus-circle-outline'} size={22} color={disabled ? '#CBD5E1' : '#94A3B8'} />
      )}
    </Pressable>
  );
});

function ProductPickerFullscreenPanel({
  styles,
  visible,
  topInset,
  bottomInset,
  onClose,
  search,
  onSearchChange,
  searchInputRef,
  listRef,
  loading,
  inStockOnly,
  onToggleInStockOnly,
  items,
  selectedProducts,
  orderItems,
  hasOrderContext,
  hasPriceType,
  hasWarehouse,
  onPressProduct,
  onLongPressProduct,
  onOpenImages,
  onScroll,
  onMomentumScrollEnd,
  onLayout,
  onContentSizeChange,
  onEndReached,
  onScrollBeginDrag,
  selectedCount,
  onTransfer,
  onClearSelection,
}: {
  styles: any;
  visible: boolean;
  topInset: number;
  bottomInset: number;
  onClose: () => void | false;
  search: string;
  onSearchChange: (value: string) => void;
  searchInputRef: React.Ref<any>;
  listRef: React.Ref<any>;
  loading: boolean;
  inStockOnly: boolean;
  onToggleInStockOnly: () => void;
  items: ClientOrderProduct[];
  selectedProducts: ReadonlyMap<string, ClientOrderProduct>;
  orderItems: DraftItem[];
  hasOrderContext: boolean;
  hasPriceType: boolean;
  hasWarehouse: boolean;
  onPressProduct: (item: ClientOrderProduct) => void;
  onLongPressProduct: (item: ClientOrderProduct) => void;
  onOpenImages: (item: ClientOrderProduct) => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onMomentumScrollEnd: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onLayout: (event: LayoutChangeEvent) => void;
  onContentSizeChange: (width: number, height: number) => void;
  onEndReached: () => void;
  onScrollBeginDrag: () => void;
  selectedCount: number;
  onTransfer: () => void;
  onClearSelection: () => void;
}) {
  const orderProductGuids = React.useMemo(() => {
    return new Set(orderItems.map((item) => item.productGuid).filter(Boolean) as string[]);
  }, [orderItems]);
  const hasSearch = !!search.trim();
  const showInitialLoader = loading && hasOrderContext && !items.length && !hasSearch;
  const showSearchLoader = loading && hasSearch;
  const showFooterLoader = loading && !!items.length && !hasSearch;
  const selectedProductGuidKey = React.useMemo(() => Array.from(selectedProducts.keys()).join('|'), [selectedProducts]);
  const orderProductGuidKey = React.useMemo(() => Array.from(orderProductGuids).join('|'), [orderProductGuids]);
  const keyExtractor = React.useCallback((item: ClientOrderProduct, index: number) => item.guid || item.code || item.name || `product-${index}`, []);
  const renderProductItem = React.useCallback(({ item }: { item: ClientOrderProduct }) => (
    <ProductPickerFullscreenRow
      styles={styles}
      item={item}
      selected={!!item.guid && selectedProducts.has(item.guid)}
      disabled={!!item.guid && orderProductGuids.has(item.guid)}
      hasPriceType={hasPriceType}
      hasWarehouse={hasWarehouse}
      onPressProduct={onPressProduct}
      onLongPressProduct={onLongPressProduct}
      onOpenImages={onOpenImages}
    />
  ), [
    hasPriceType,
    hasWarehouse,
    onLongPressProduct,
    onOpenImages,
    onPressProduct,
    orderProductGuids,
    selectedProducts,
    styles,
  ]);
  const listHeader = React.useMemo(() => (
    <>
      {!hasOrderContext ? <InfoText styles={styles} text="Сначала выберите организацию и контрагента." /> : null}
      {showInitialLoader ? (
        <View style={styles.productPickerInitialLoader}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : null}
    </>
  ), [hasOrderContext, showInitialLoader, styles]);
  const listEmpty = React.useMemo(() => {
    if (loading || !hasOrderContext) return null;
    return <Text style={styles.filtersLookupEmpty}>Ничего не найдено.</Text>;
  }, [hasOrderContext, loading, styles]);
  const listFooter = React.useMemo(() => {
    if (!showFooterLoader) return null;
    return (
      <View style={styles.filtersLookupStateRow}>
        <ActivityIndicator size="small" color="#2563EB" />
      </View>
    );
  }, [showFooterLoader, styles]);
  if (!visible) return null;

  return (
    <View style={styles.filtersLookupOverlay}>
      <Surface mode="flat" style={[styles.filtersFullscreenHeader, styles.productPickerFullscreenHeader, { paddingTop: Math.max(topInset, 10) + 8 }]}>
        <View style={styles.filtersFullscreenHeaderRow}>
          <View style={styles.filtersLookupTitleRow}>
            <MaterialCommunityIcons name="cube-outline" size={20} color="#2563EB" />
            <Text style={styles.filtersFullscreenTitle}>Подбор товаров</Text>
          </View>
          <View style={styles.productPickerFullscreenHeaderActions}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: inStockOnly }}
              accessibilityLabel="Показывать только товары с остатком"
              onPress={onToggleInStockOnly}
              style={[
                styles.productPickerFullscreenStockChip,
                inStockOnly && styles.productPickerFullscreenStockChipActive,
              ]}
            >
              <MaterialCommunityIcons
                name={inStockOnly ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={18}
                color={inStockOnly ? '#16A34A' : '#64748B'}
              />
              <Text style={[styles.productPickerFullscreenStockText, inStockOnly && styles.productPickerFullscreenStockTextActive]}>
                С остатками
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Закрыть подбор товаров" onPress={onClose} style={({ pressed }) => [styles.filtersCloseButton, pressed && styles.flatPressed]}>
              <MaterialCommunityIcons name="close" size={22} color="#0F172A" />
            </Pressable>
          </View>
        </View>
        <View style={styles.productPickerFullscreenSearchArea}>
          <CompactSearchbar
            inputRef={searchInputRef}
            style={[styles.pickerSearchFlat, styles.productPickerSearchFlat, styles.productPickerFullscreenSearch]}
            inputStyle={[styles.pickerSearchInputFlat, styles.productPickerFullscreenSearchInput]}
            value={search}
            onChangeText={onSearchChange}
            placeholder="Поиск товара"
            loading={showSearchLoader}
            debounceMs={520}
          />
        </View>
      </Surface>
      <FlatList
        ref={listRef}
        style={styles.productPickerFullscreenList}
        contentContainerStyle={[styles.pickerListContent, { paddingBottom: Math.max(bottomInset, 10) + (selectedCount > 0 ? 92 : 22) }]}
        data={items}
        extraData={`${selectedProductGuidKey}:${orderProductGuidKey}:${hasPriceType ? 'price' : 'noprice'}:${hasWarehouse ? 'warehouse' : 'nowarehouse'}`}
        keyExtractor={keyExtractor}
        renderItem={renderProductItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={onScroll}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onLayout={onLayout}
        onContentSizeChange={onContentSizeChange}
        onScrollBeginDrag={onScrollBeginDrag}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.8}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={40}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        nestedScrollEnabled
        scrollEventThrottle={16}
      />
      {selectedCount > 0 ? (
        <Surface mode="flat" style={[styles.filtersFullscreenFooter, { paddingBottom: Math.max(bottomInset, 10) + 8 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Очистить подборку"
            onPress={onClearSelection}
            style={({ pressed }) => [styles.productPickerClearSelectionButton, pressed && styles.flatPressed]}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={20} color="#B91C1C" />
          </Pressable>
          <PaperButton
            mode="contained"
            onPress={onTransfer}
            buttonColor="#2563EB"
            textColor="#FFFFFF"
            icon="arrow-down-circle-outline"
            style={styles.filtersFullscreenFooterButton}
            labelStyle={styles.filtersFullscreenFooterLabel}
            contentStyle={styles.filtersFullscreenFooterContent}
          >
            {formatProductTransferLabel(selectedCount)}
          </PaperButton>
        </Surface>
      ) : null}
    </View>
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
  const shouldSubmitChangedSyncedDocument = !!workspace.dirty && (!!workspace.selectedOrderQueued || !!workspace.selectedOrderSynced);
  const shouldSave = !!workspace.dirty && !shouldSubmitChangedSyncedDocument;
  const shouldRetry1cError = !!workspace.selectedOrderHas1cError && !workspace.dirty;
  const busy = !!workspace.saving || !!workspace.submitting;
  const disabled = workspace.readOnly || busy || (shouldSave ? !workspace.validation.canSave : !workspace.canSubmitOrder);
  const label = workspace.saving
    ? 'Сохраняю'
    : workspace.submitting
      ? 'Отправляю'
      : shouldSave
        ? 'Сохранить'
        : shouldRetry1cError
          ? 'Повторить'
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
              <View style={styles.documentBottomTotalPill} accessibilityLabel={`Сумма ${formatMoney(workspace.localTotal, workspace.draft.currency)}`}>
                <MaterialCommunityIcons name="cash-multiple" size={13} color="#2563EB" />
                <Text style={styles.documentBottomTotalText} numberOfLines={1}>{formatMoney(workspace.localTotal, workspace.draft.currency)}</Text>
              </View>
              <View style={styles.documentBottomProfitPill} accessibilityLabel={`Выручка ${formatMoney(workspace.localProfit, workspace.draft.currency)}`}>
                <MaterialCommunityIcons name="chart-line" size={13} color={workspace.localProfit < 0 ? '#DC2626' : '#16A34A'} />
                <Text style={[styles.documentBottomProfitText, workspace.localProfit < 0 && styles.documentBottomProfitTextNegative]} numberOfLines={1}>{formatMoney(workspace.localProfit, workspace.draft.currency)}</Text>
              </View>
            </View>
            <View style={styles.documentBottomCounterpartyRow}>
              <MaterialCommunityIcons name="account-outline" size={13} color="#64748B" />
              <Text style={styles.documentBottomCounterpartyText} numberOfLines={1}>{counterparty}</Text>
              <View style={styles.documentBottomDateInline}>
                <MaterialCommunityIcons name="truck-outline" size={12} color="#64748B" />
                <Text style={styles.documentBottomDateText} numberOfLines={1}>{deliveryDate}</Text>
              </View>
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
  onOpenImages,
}: {
  workspace: any;
  filteredItems: any[];
  ui: ReturnType<typeof getClientOrdersResponsiveMetrics>;
  onEditItem: (key: string) => void;
  onAddItem: () => void;
  onItemLayout: (key: string, y: number) => void;
  onOpenImages: (item: any) => void;
}) {
  return <View style={styles.itemsFlatSection}>
    {filteredItems.length ? (
      <View style={[styles.lineList, { paddingBottom: ui.itemsBottomInset }]}>
        {filteredItems.map((item, index) => (
          <View key={item.key} onLayout={(event) => onItemLayout(item.key, event.nativeEvent.layout.y)}>
            <LineItemCard
              item={item}
              index={index}
              workspace={workspace}
              onPress={() => onEditItem(item.key)}
              onRemove={() => workspace.removeItem(item.key)}
              onOpenImages={() => onOpenImages(item)}
            />
          </View>
        ))}
        {!workspace.readOnly && !workspace.mutationLocked ? <AddProductListCard onPress={onAddItem} /> : null}
      </View>
    ) : (
      <View style={[styles.lineList, { paddingBottom: ui.itemsBottomInset }]}>
        {!workspace.readOnly && !workspace.mutationLocked ? <AddProductListCard onPress={onAddItem} /> : null}
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

function LineItemCard({
  item,
  index,
  workspace,
  onPress,
  onRemove,
  onOpenImages,
}: {
  item: any;
  index: number;
  workspace: any;
  onPress: () => void;
  onRemove: () => void;
  onOpenImages: () => void;
}) {
  const displayedPrice = getDisplayedUnitPriceValue(item);
  const lineTotal = formatMoney(computeLineTotal(item, workspace.draft.generalDiscountPercent), workspace.draft.currency);
  const packageLabelText = linePackageShortLabel(item);
  const muteValidation = !!workspace.readOnly;
  const lineMessages = muteValidation ? [] : (workspace.validation.itemMessages[item.key] || []);
  const lineWarnings = muteValidation ? [] : (workspace.validation.itemWarnings?.[item.key] || []);
  const hasErrors = lineMessages.length > 0;
  const hasWarnings = lineWarnings.length > 0;
  const cancelled = isCancelledDraftItem(item);
  const cancelReason = getDraftItemCancelReason(item);
  const issueText = cancelled ? `Отменено${cancelReason ? `: ${cancelReason}` : ''}` : ([...lineMessages, ...lineWarnings][0] || '');
  const manualPrice = hasManualPrice(item);
  const readOnly = !!workspace.readOnly || !!workspace.mutationLocked || cancelled;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.productPreviewCard, cancelled && styles.productPreviewCardCancelled, !cancelled && (hasErrors || hasWarnings) && styles.productPreviewCardInvalid, issueText && styles.productPreviewCardWithIssue, readOnly && styles.productPreviewCardReadOnly, pressed && styles.flatPressed]}>
      <View style={[styles.productPreviewMedia, readOnly && styles.productPreviewMediaReadOnly]}>
        <ProductThumb
          item={item}
          style={[styles.productPreviewImage, readOnly && styles.productPreviewImageReadOnly]}
          iconSize={34}
          iconColor={readOnly ? 'rgba(37, 99, 235, 0.42)' : '#2563EB'}
          onPress={onOpenImages}
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
            {manualPrice ? <MaterialCommunityIcons name="pencil-outline" size={12} color={hasErrors || hasWarnings ? '#DC2626' : '#64748B'} /> : null}
            <Text style={[styles.productPreviewPrice, readOnly && styles.productPreviewPriceReadOnly]} numberOfLines={1}>{displayedPrice || '0'} ₽</Text>
          </View>
          <Text style={[styles.productPreviewTotal, readOnly && styles.productPreviewTotalReadOnly]} numberOfLines={1}>{lineTotal}</Text>
        </View>
        {issueText ? (
          <Text style={[styles.productPreviewIssueText, cancelled && styles.productPreviewCancelledText]} numberOfLines={1}>{issueText}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function ProductThumb({
  item,
  style,
  iconSize,
  iconColor = '#2563EB',
  onPress,
}: {
  item: any;
  style: any;
  iconSize: number;
  iconColor?: string;
  onPress?: () => void;
}) {
  const imageUri = getDraftItemImageUri(item);
  const imageCacheKey = React.useMemo(() => getProductImageCacheKey(item, imageUri, 'thumb'), [imageUri, item]);
  const recyclingKey = imageCacheKey || item?.productGuid || item?.guid || imageUri;
  const imageSource = React.useMemo(() => (imageUri ? { uri: imageUri, cacheKey: imageCacheKey || undefined } : null), [imageCacheKey, imageUri]);
  const imageAlreadyFailed = !!imageCacheKey && failedProductImageUris.has(imageCacheKey);
  const loadingDelayRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheCheckedRef = React.useRef(false);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(imageAlreadyFailed);

  const clearLoadingDelay = React.useCallback(() => {
    if (loadingDelayRef.current) {
      clearTimeout(loadingDelayRef.current);
      loadingDelayRef.current = null;
    }
  }, []);

  const scheduleLoadingIndicator = React.useCallback(() => {
    clearLoadingDelay();
    if (!imageCacheKey || loadedProductImageUris.has(imageCacheKey) || failedProductImageUris.has(imageCacheKey)) return;
    loadingDelayRef.current = setTimeout(() => {
      loadingDelayRef.current = null;
      if (cacheCheckedRef.current && !loadedProductImageUris.has(imageCacheKey) && !failedProductImageUris.has(imageCacheKey)) {
        setLoading(true);
      }
    }, 180);
  }, [clearLoadingDelay, imageCacheKey]);

  React.useEffect(() => {
    const nextFailed = !!imageCacheKey && failedProductImageUris.has(imageCacheKey);
    const nextLoaded = !!imageCacheKey && loadedProductImageUris.has(imageCacheKey);
    let cancelled = false;
    cacheCheckedRef.current = false;
    clearLoadingDelay();
    setLoading(false);
    setFailed(nextFailed);
    if (!imageCacheKey || nextLoaded || nextFailed) {
      cacheCheckedRef.current = true;
      return () => {
        cancelled = true;
        clearLoadingDelay();
      };
    }
    hasCachedProductImage(imageCacheKey, imageUri)
      .then((cached) => {
        if (cancelled) return;
        cacheCheckedRef.current = true;
        if (cached) {
          loadedProductImageUris.add(imageCacheKey);
          setLoading(false);
          return;
        }
        scheduleLoadingIndicator();
      })
      .catch(() => {
        if (cancelled) return;
        cacheCheckedRef.current = true;
        scheduleLoadingIndicator();
      });
    return () => {
      cancelled = true;
      clearLoadingDelay();
    };
  }, [clearLoadingDelay, imageCacheKey, imageUri, scheduleLoadingIndicator]);

  React.useEffect(() => {
    if (!imageCacheKey || !loading || failed) return undefined;
    const timeout = setTimeout(() => {
      failedProductImageUris.add(imageCacheKey);
      setFailed(true);
      setLoading(false);
    }, 12000);
    return () => clearTimeout(timeout);
  }, [failed, imageCacheKey, loading]);

  const handleImageLoaded = React.useCallback(() => {
    clearLoadingDelay();
    if (imageCacheKey) {
      loadedProductImageUris.add(imageCacheKey);
      failedProductImageUris.delete(imageCacheKey);
    }
    cacheCheckedRef.current = true;
    setFailed(false);
    setLoading(false);
  }, [clearLoadingDelay, imageCacheKey]);

  const handleImageError = React.useCallback(() => {
    clearLoadingDelay();
    if (imageCacheKey) {
      failedProductImageUris.add(imageCacheKey);
      loadedProductImageUris.delete(imageCacheKey);
    }
    cacheCheckedRef.current = true;
    setFailed(true);
    setLoading(false);
  }, [clearLoadingDelay, imageCacheKey]);

  const content = (
    <>
      {imageSource && !failed ? (
        <ExpoImage
          source={imageSource}
          style={styles.productImageObject}
          contentFit="contain"
          cachePolicy="memory-disk"
          recyclingKey={recyclingKey}
          onDisplay={handleImageLoaded}
          onLoad={handleImageLoaded}
          onLoadEnd={() => {
            clearLoadingDelay();
            setLoading(false);
          }}
          onError={handleImageError}
        />
      ) : (
        <View style={styles.productImagePlaceholderFill}>
          <MaterialCommunityIcons name="image-outline" size={iconSize} color={iconColor} />
        </View>
      )}
      {imageSource && loading && !failed ? (
        <View pointerEvents="none" style={styles.productImageLoadingOverlay}>
          <ActivityIndicator size={iconSize >= 40 ? 22 : 16} color="#2563EB" />
        </View>
      ) : null}
    </>
  );

  if (!onPress || !imageSource) {
    return <View style={[style, styles.productImageFrame]}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel="Открыть изображение товара"
      onPress={(event) => {
        event.stopPropagation?.();
        onPress();
      }}
      style={({ pressed }) => [style, styles.productImageFrame, pressed && styles.productImagePressed]}
    >
      {content}
    </Pressable>
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
  editable = true,
  loading = false,
  debounceMs = 260,
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
  editable?: boolean;
  loading?: boolean;
  debounceMs?: number;
}) {
  const innerInputRef = React.useRef<any>(null);
  const focusedRef = React.useRef(false);
  const lastExternalValueRef = React.useRef(value);
  const [inputText, setInputText] = React.useState(value);
  const [forcedText, setForcedText] = React.useState(value);
  const [forcedTextRevision, setForcedTextRevision] = React.useState(0);

  const setInputRef = React.useCallback((node: any) => {
    innerInputRef.current = node;
    assignComposedRef(inputRef, node);
  }, [inputRef]);

  const forceInputText = React.useCallback((next: string) => {
    setForcedText(next);
    setForcedTextRevision((revision) => revision + 1);
    setInputText(next);
    try {
      if (next === '') innerInputRef.current?.clear?.();
      innerInputRef.current?.setNativeProps?.({ text: next });
    } catch {
      return;
    }
  }, []);

  React.useEffect(() => {
    if (value === lastExternalValueRef.current) return;
    lastExternalValueRef.current = value;
    if (!focusedRef.current || value === '') {
      forceInputText(value);
    }
  }, [forceInputText, value]);

  const clearSearch = React.useCallback(() => {
    forceInputText('');
    onChangeText('');
  }, [forceInputText, onChangeText]);

  const handleFocus = React.useCallback(() => {
    focusedRef.current = true;
    onFocus?.();
  }, [onFocus]);

  const handleBlur = React.useCallback(() => {
    focusedRef.current = false;
    onBlur?.();
  }, [onBlur]);

  return (
    <View style={[styles.compactSearchShell, style]}>
      <MaterialCommunityIcons name="magnify" size={18} color="#475569" />
      <StableSearchTextInput
        inputRef={setInputRef}
        inputComponent={inputComponent}
        style={[styles.compactSearchInputBase, inputStyle]}
        initialText={value}
        externalText={forcedText}
        externalTextRevision={forcedTextRevision}
        onChangeText={onChangeText}
        onImmediateTextChange={setInputText}
        commitDebounceMs={debounceMs}
        placeholder={placeholder}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholderTextColor="#64748B"
        {...SEARCH_TEXT_INPUT_PROPS}
        autoFocus={autoFocus}
        editable={editable}
      />
      {loading ? (
        <View style={styles.compactSearchLoading}>
          <ActivityIndicator size={14} color="#2563EB" />
        </View>
      ) : null}
      {inputText ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Очистить поиск"
          hitSlop={4}
          onPress={clearSearch}
          style={({ pressed }) => [styles.compactSearchClear, pressed && styles.flatPressed]}
        >
          <MaterialCommunityIcons name="close" size={16} color="#475569" />
        </Pressable>
      ) : null}
    </View>
  );
}

function StableSearchTextInput({
  inputRef,
  inputComponent,
  initialText,
  externalText,
  externalTextRevision = 0,
  onChangeText,
  onImmediateTextChange,
  commitDebounceMs = Platform.OS === 'android' ? 260 : 0,
  onFocus,
  onBlur,
  onKeyPress,
  ...props
}: TextInputProps & {
  inputRef?: React.Ref<any>;
  inputComponent?: React.ComponentType<any>;
  initialText: string;
  externalText?: string;
  externalTextRevision?: number;
  onChangeText: (value: string) => void;
  onImmediateTextChange?: (value: string) => void;
  commitDebounceMs?: number;
}) {
  const isAndroid = Platform.OS === 'android';
  const InputComponent = (isAndroid ? TextInput : (inputComponent || TextInput)) as any;
  const initialTextRef = React.useRef(initialText);
  const nativeRef = React.useRef<any>(null);
  const nativeTextRef = React.useRef(initialTextRef.current);
  const focusedRef = React.useRef(false);
  const recentKeyRef = React.useRef<string | null>(null);
  const recentKeyAtRef = React.useRef(0);
  const commitTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const setNativeText = React.useCallback((next: string) => {
    nativeTextRef.current = next;
    if (next === '') nativeRef.current?.clear?.();
    nativeRef.current?.setNativeProps?.({ text: next });
  }, []);

  const setRef = React.useCallback((node: any) => {
    nativeRef.current = node;
    assignComposedRef(inputRef, node);
  }, [inputRef]);

  const clearCommitTimer = React.useCallback(() => {
    if (!commitTimerRef.current) return;
    clearTimeout(commitTimerRef.current);
    commitTimerRef.current = null;
  }, []);

  const commitText = React.useCallback((next: string, immediate = false) => {
    clearCommitTimer();
    if (immediate || commitDebounceMs <= 0) {
      onChangeText(next);
      return;
    }
    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = null;
      onChangeText(next);
    }, commitDebounceMs);
  }, [clearCommitTimer, commitDebounceMs, onChangeText]);

  React.useEffect(() => {
    if (externalTextRevision <= 0) return;
    clearCommitTimer();
    setNativeText(externalText ?? '');
    onImmediateTextChange?.(externalText ?? '');
  }, [clearCommitTimer, externalText, externalTextRevision, onImmediateTextChange, setNativeText]);

  React.useEffect(() => () => clearCommitTimer(), [clearCommitTimer]);

  const normalizeAndroidSearchText = React.useCallback((next: string) => {
    if (!isAndroid || !focusedRef.current) return next;
    const prev = nativeTextRef.current;
    if (next === prev) return next;

    const key = recentKeyRef.current;
    const keyIsFresh = !!key && Date.now() - recentKeyAtRef.current < 900;
    recentKeyRef.current = null;

    if (keyIsFresh && key) {
      if (key === 'Backspace') {
        const expected = prev.slice(0, -1);
        if (next !== expected && next.length >= expected.length) return expected;
        return next;
      }
      if (key === 'Enter') return prev;
      if (key.length <= 2) {
        const expected = `${prev}${key}`;
        const addedLength = next.length - prev.length;
        if (next !== expected && addedLength > 1) return expected;
      }
    }

    if (prev.length > 0 && next.startsWith(prev) && next.length - prev.length > 1) {
      return `${prev}${Array.from(next.slice(prev.length))[0] || ''}`;
    }

    return next;
  }, [isAndroid]);

  const handleChangeText = React.useCallback((next: string) => {
    const accepted = normalizeAndroidSearchText(next);
    nativeTextRef.current = accepted;
    if (accepted !== next) {
      requestAnimationFrame(() => setNativeText(accepted));
    }
    onImmediateTextChange?.(accepted);
    commitText(accepted);
  }, [commitText, normalizeAndroidSearchText, onImmediateTextChange, setNativeText]);

  const handleKeyPress = React.useCallback((event: any) => {
    const key = event?.nativeEvent?.key;
    if (isAndroid && typeof key === 'string' && key) {
      recentKeyRef.current = key;
      recentKeyAtRef.current = Date.now();
    }
    onKeyPress?.(event);
  }, [isAndroid, onKeyPress]);

  const handleFocus = React.useCallback((event: any) => {
    focusedRef.current = true;
    onFocus?.(event);
  }, [onFocus]);

  const handleBlur = React.useCallback((event: any) => {
    focusedRef.current = false;
    commitText(nativeTextRef.current, true);
    onBlur?.(event);
  }, [commitText, onBlur]);

  return (
    <InputComponent
      ref={setRef}
      {...props}
      defaultValue={initialTextRef.current}
      onChangeText={handleChangeText}
      onKeyPress={handleKeyPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
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
  allowZeroQuantity = false,
  metadataLoading = false,
  onClose,
  onOpenImages,
}: {
  styles: any;
  visible: boolean;
  topOffset: number;
  item: any | null;
  rowNumber: number;
  workspace: any;
  allowZeroQuantity?: boolean;
  metadataLoading?: boolean;
  onClose: () => void;
  onOpenImages: (item: any) => void;
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
  const priceInputRef = React.useRef<any>(null);
  const currentDisplayedPrice = getDisplayedUnitPriceValue(displayedItem);
  const displayedItemKey = displayedItem?.key || displayedItem?.productGuid || '';
  const previousDisplayedItemKeyRef = React.useRef(displayedItemKey);
  const visibleRef = React.useRef(false);
  React.useEffect(() => {
    if (visible && !visibleRef.current) {
      setScrollOffset(0);
      previousDisplayedItemKeyRef.current = displayedItemKey;
      setPriceFocused(false);
      setPriceInputValue(currentDisplayedPrice);
    }
    visibleRef.current = visible;
  }, [currentDisplayedPrice, displayedItemKey, visible]);
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
  React.useEffect(() => {
    if (!visible) return;
    if (previousDisplayedItemKeyRef.current === displayedItemKey) return;
    previousDisplayedItemKeyRef.current = displayedItemKey;
    setPriceFocused(false);
    setPriceInputValue(currentDisplayedPrice);
  }, [currentDisplayedPrice, displayedItemKey, visible]);

  if (!displayedItem) return null;

  const readOnly = !!workspace.readOnly || !!workspace.mutationLocked || isCancelledDraftItem(displayedItem);
  const qtyValid = readOnly || (allowZeroQuantity && !hasPositiveQuantity(displayedItem))
    ? true
    : isValidQuantityValue(displayedItem);
  const currentManualPrice = displayedItem.manualPrice || '';
  const priceValid = readOnly || !currentManualPrice || isValidManualPriceValue(currentManualPrice);
  const displayedPrice = currentDisplayedPrice;
  const priceInputDisplayValue = priceFocused && previousDisplayedItemKeyRef.current === displayedItemKey
    ? priceInputValue
    : displayedPrice;
  const lineTotal = formatMoney(
    computeLineTotal(displayedItem, workspace.draft.generalDiscountPercent),
    displayedItem.currency || workspace.draft.currency
  );
  const article = displayedItem.productArticle || displayedItem.productSku || displayedItem.productCode || '—';
  const stock = formatStockInlineLabel(displayedItem.stock, displayedItem.baseUnit) || '—';
  const receiptPrice = displayedItem.receiptPrice === null || displayedItem.receiptPrice === undefined
    ? '—'
    : formatMoney(displayedItem.receiptPrice, displayedItem.currency || workspace.draft.currency);
  const basePackageOption = { guid: null as string | null, label: unitLabel(displayedItem.baseUnit) || 'шт' };
  const packageOptions = [
    basePackageOption,
    ...(displayedItem.packages || []).map((pack: any) => ({ guid: pack.guid as string, label: packageLabel(pack, displayedItem) })),
  ];
  const packageMetadataLoading = metadataLoading && !displayedItem.packagesLoaded;
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
      fastDismiss
      headerContent={(closeSheet) => (
        <View style={styles.productEditorHeaderBlock} onLayout={(event) => setHeaderHeight(Math.ceil(event.nativeEvent.layout.height))}>
          <View style={styles.productEditorMediaRow}>
            <View style={styles.productEditorImageWrap}>
              <ProductThumb item={displayedItem} style={styles.productEditorImage} iconSize={40} onPress={() => onOpenImages(displayedItem)} />
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
                <Text style={styles.productEditorInfoLabel}>Себестоимость</Text>
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
            {packageMetadataLoading ? (
              <View style={[styles.productEditorPackageReadonly, readOnly && styles.productEditorReadOnlySoftSurface]}>
                <ActivityIndicator size={16} color="#2563EB" />
                <Text style={[styles.productEditorPackageReadonlyText, readOnly && styles.productEditorReadOnlyMutedText]} numberOfLines={1}>Загружаю упаковки</Text>
              </View>
            ) : packageOptions.length === 1 ? (
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
                      onPress={() => workspace.setItemPackage(displayedItem.key, option.guid)}
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
                ref={priceInputRef}
                value={priceInputDisplayValue}
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
                  const manualPrice = nextValue === '' ? '0' : displayedUnitPriceToBasePriceInput(nextValue, displayedItem);
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
                onPress={() => {
                  priceInputRef.current?.blur?.();
                  setPriceFocused(false);
                  setPriceInputValue('');
                  workspace.resetItemPriceType(displayedItem.key);
                }}
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
  if (status === 'CANCELLED' || status === 'REJECTED') return styles.orderStatusDanger;
  if (status === 'SENT' || status === 'SENT_TO_1C' || status === 'POSTED' || status === 'COMPLETED' || status === 'CLOSED' || status === 'CONFIRMED') return styles.orderStatusSuccess;
  if (
    status === 'QUEUED' ||
    status === 'AWAITING_APPROVAL' ||
    status === 'AWAITING_ADVANCE_BEFORE_SUPPLY' ||
    status === 'READY_FOR_SUPPLY' ||
    status === 'AWAITING_PREPAYMENT_BEFORE_SHIPMENT' ||
    status === 'AWAITING_SUPPLY' ||
    status === 'READY_FOR_SHIPMENT' ||
    status === 'SHIPPING_IN_PROGRESS' ||
    status === 'AWAITING_PAYMENT_AFTER_SHIPMENT' ||
    status === 'READY_TO_CLOSE' ||
    status === 'TO_SUPPLY' ||
    status === 'TO_SHIP' ||
    status === 'IN_RESERVE' ||
    status === 'TO_FULFILLMENT'
  ) return styles.orderStatusInfo;
  return styles.orderStatusNeutral;
}

function orderStatusIcon(status: string) {
  if (status === 'CANCELLED') return { name: 'close-circle', color: '#B91C1C' };
  if (status === 'REJECTED') return { name: 'alert-circle-outline', color: '#B91C1C' };
  if (status === 'QUEUED') return { name: 'clock-outline', color: '#1D4ED8' };
  if (status === 'AWAITING_APPROVAL') return { name: 'file-clock-outline', color: '#1D4ED8' };
  if (status === 'AWAITING_ADVANCE_BEFORE_SUPPLY') return { name: 'cash-clock', color: '#1D4ED8' };
  if (status === 'READY_FOR_SUPPLY') return { name: 'package-variant-closed-check', color: '#1D4ED8' };
  if (status === 'AWAITING_PREPAYMENT_BEFORE_SHIPMENT') return { name: 'cash-clock', color: '#1D4ED8' };
  if (status === 'AWAITING_SUPPLY') return { name: 'package-variant', color: '#1D4ED8' };
  if (status === 'READY_FOR_SHIPMENT') return { name: 'truck-check-outline', color: '#1D4ED8' };
  if (status === 'SHIPPING_IN_PROGRESS') return { name: 'truck-fast-outline', color: '#1D4ED8' };
  if (status === 'AWAITING_PAYMENT_AFTER_SHIPMENT') return { name: 'cash-clock', color: '#1D4ED8' };
  if (status === 'READY_TO_CLOSE') return { name: 'check-decagram-outline', color: '#1D4ED8' };
  if (status === 'TO_SUPPLY') return { name: 'package-variant-closed', color: '#1D4ED8' };
  if (status === 'TO_SHIP') return { name: 'truck-outline', color: '#1D4ED8' };
  if (status === 'IN_RESERVE') return { name: 'lock-outline', color: '#1D4ED8' };
  if (status === 'TO_FULFILLMENT') return { name: 'clipboard-check-outline', color: '#1D4ED8' };
  if (status === 'NOT_CONFIRMED') return { name: 'file-alert-outline', color: '#334155' };
  if (status === 'CLOSED') return { name: 'lock-check-outline', color: '#166534' };
  if (status === 'SENT' || status === 'SENT_TO_1C') return { name: 'cloud-upload-outline', color: '#166534' };
  if (status === 'POSTED' || status === 'COMPLETED' || status === 'CONFIRMED') return { name: 'check-circle', color: '#166534' };
  return { name: 'file-document-edit-outline', color: '#334155' };
}

function orderHasVisibleProblem(order: ClientOrder) {
  return Boolean(
    order.lastExportError ||
      order.last1cError ||
      order.syncState === 'ERROR' ||
      order.syncState === 'CONFLICT' ||
      order.status === 'REJECTED'
  );
}

function countActiveOrderFilters(filters: any) {
  return [
    Array.isArray(filters.statuses) && filters.statuses.length ? 'statuses' : '',
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
  const [queryText, setQueryText] = React.useState(selected?.name || '');
  const [forcedText, setForcedText] = React.useState(selected?.name || '');
  const [forcedTextRevision, setForcedTextRevision] = React.useState(0);
  const [items, setItems] = React.useState<T[]>([]);
  const [loading, setLoading] = React.useState(false);

  const forceLookupText = React.useCallback((next: string) => {
    setForcedText(next);
    setForcedTextRevision((revision) => revision + 1);
    setQuery(next);
    setQueryText(next);
  }, []);

  React.useEffect(() => {
    const next = selected?.name || '';
    forceLookupText(next);
  }, [forceLookupText, selected?.guid, selected?.name]);

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
    }, 320);
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
    }, 650);
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
          selected || queryText.trim()
            ? (
              <Pressable hitSlop={8} style={styles.filtersInlineClear} onPress={() => { forceLookupText(''); setItems([]); onChange(null); }}>
                <MaterialCommunityIcons name="close" size={18} color="#475569" />
              </Pressable>
            )
            : loading
              ? <ActivityIndicator size={14} color="#64748B" />
              : undefined
        }
      >
        <StableSearchTextInput
          inputRef={inputRef}
          initialText={selected?.name || ''}
          externalText={forcedText}
          externalTextRevision={forcedTextRevision}
          onChangeText={(value: string) => {
            setQuery(value);
            if (!value.trim()) onChange(null);
          }}
          onImmediateTextChange={setQueryText}
          commitDebounceMs={260}
          placeholder={placeholder}
          placeholderTextColor="#64748B"
          style={styles.filtersInnerTextInputContent}
          {...SEARCH_TEXT_INPUT_PROPS}
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
                forceLookupText(item.name);
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
        <TextInput
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

function OrdersInitialLoadingState({ styles }: { styles: any }) {
  return (
    <View style={styles.ordersInitialLoadingState}>
      <ActivityIndicator size="small" color="#2563EB" />
    </View>
  );
}

function OrdersEmptyState({ styles, filtered }: { styles: any; filtered: boolean }) {
  return (
    <View style={styles.ordersEmptyState}>
      <View style={styles.ordersEmptyIcon}>
        <MaterialCommunityIcons name={filtered ? 'filter-off-outline' : 'file-document-outline'} size={22} color="#64748B" />
      </View>
      <Text style={styles.ordersEmptyTitle}>{filtered ? 'Ничего не найдено' : 'Документов нет'}</Text>
      <Text style={styles.ordersEmptySubtitle}>
        {filtered ? 'Измените поиск или фильтр.' : 'Создайте новый заказ.'}
      </Text>
    </View>
  );
}

function OrdersPaginationFooter({
  styles,
  loading,
  error,
  onRetry,
}: {
  styles: any;
  loading: boolean;
  error?: string | null;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Повторить загрузку документов"
        disabled={loading}
        onPress={onRetry}
        style={({ pressed }) => [styles.ordersPaginationRetry, pressed && !loading && styles.flatPressed]}
      >
        {loading ? (
          <ActivityIndicator size={14} color="#2563EB" />
        ) : (
          <MaterialCommunityIcons name="reload" size={15} color="#2563EB" />
        )}
        <Text style={styles.ordersPaginationRetryText}>Повторить загрузку</Text>
      </Pressable>
    );
  }
  if (!loading) return null;
  return (
    <View style={styles.ordersPaginationLoading}>
      <ActivityIndicator size="small" color="#2563EB" />
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

function DocumentBusyOverlay({ styles, label }: { styles: any; label: string }) {
  return (
    <View pointerEvents="auto" style={styles.documentBusyOverlay}>
      <LiquidGlassSurface
        pointerEvents="none"
        style={styles.documentBusyBlur}
        borderColor="rgba(226, 232, 240, 0.24)"
        overlayColor="rgba(248, 250, 252, 0.68)"
        blurIntensity={30}
        blurTint="light"
        specularOpacity={0.12}
        depthOpacity={0.03}
      />
      <Surface mode="flat" style={styles.documentBusyCard}>
        <ActivityIndicator size={24} color="#2563EB" />
        <Text style={styles.documentBusyTitle}>{label}</Text>
      </Surface>
    </View>
  );
}

function ProductImageGalleryModal({
  styles,
  gallery,
  onClose,
}: {
  styles: any;
  gallery: { title: string; subtitle?: string | null; images: ProductGalleryImage[]; index: number } | null;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const scrollRef = React.useRef<any>(null);
  const [activeIndex, setActiveIndex] = React.useState(gallery?.index || 0);
  const images = gallery?.images || [];
  const stageWidth = Math.max(240, Math.min(width - 28, 720));
  const stageHeight = Math.max(260, Math.min(Math.round(height * 0.62), Math.round(stageWidth * 0.9)));

  React.useEffect(() => {
    if (!gallery) return;
    const nextIndex = Math.min(Math.max(gallery.index || 0, 0), Math.max(gallery.images.length - 1, 0));
    setActiveIndex(nextIndex);
    requestAnimationFrame(() => scrollRef.current?.scrollTo?.({ x: nextIndex * stageWidth, animated: false }));
  }, [gallery?.title, gallery?.index, gallery?.images.length, stageWidth]);

  if (!gallery || !images.length) return null;

  const scrollToIndex = (index: number) => {
    const nextIndex = Math.min(Math.max(index, 0), images.length - 1);
    setActiveIndex(nextIndex);
    scrollRef.current?.scrollTo?.({ x: nextIndex * stageWidth, animated: true });
  };

  return (
    <Portal>
      <View style={styles.productGalleryOverlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Закрыть просмотр изображения" style={styles.productGalleryBackdrop} onPress={onClose} />
        <Surface mode="flat" style={[styles.productGalleryCard, { width: stageWidth }]}>
          <View style={styles.productGalleryHeader}>
            <View style={styles.productGalleryTitleWrap}>
              <Text style={styles.productGalleryTitle} numberOfLines={1}>{gallery.title}</Text>
              <Text style={styles.productGallerySubtitle} numberOfLines={1}>
                {gallery.subtitle || `${activeIndex + 1} из ${images.length}`}
              </Text>
            </View>
            <View style={styles.productGalleryHeaderActions}>
              {images.length > 1 ? <Text style={styles.productGalleryCounter}>{activeIndex + 1}/{images.length}</Text> : null}
              <Pressable accessibilityRole="button" accessibilityLabel="Закрыть" onPress={onClose} style={({ pressed }) => [styles.productGalleryCloseButton, pressed && styles.flatPressed]}>
                <MaterialCommunityIcons name="close" size={22} color="#0F172A" />
              </Pressable>
            </View>
          </View>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(event) => {
              const nextIndex = Math.round(event.nativeEvent.contentOffset.x / stageWidth);
              setActiveIndex(Math.min(Math.max(nextIndex, 0), images.length - 1));
            }}
            style={{ width: stageWidth }}
          >
            {images.map((image) => (
              <ProductGallerySlide key={image.key} image={image} width={stageWidth} height={stageHeight} styles={styles} />
            ))}
          </ScrollView>
          {images.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productGalleryThumbs}>
              {images.map((image, index) => (
                <Pressable
                  key={`thumb-${image.key}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Показать изображение ${index + 1}`}
                  onPress={() => scrollToIndex(index)}
                  style={({ pressed }) => [
                    styles.productGalleryThumb,
                    activeIndex === index && styles.productGalleryThumbActive,
                    pressed && styles.flatPressed,
                  ]}
                >
                  <ExpoImage source={{ uri: image.thumbUrl }} style={styles.productGalleryThumbImage} contentFit="contain" cachePolicy="memory-disk" />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </Surface>
      </View>
    </Portal>
  );
}

function ProductGallerySlide({
  image,
  width,
  height,
  styles,
}: {
  image: ProductGalleryImage;
  width: number;
  height: number;
  styles: any;
}) {
  const imageSource = React.useMemo(() => ({ uri: image.previewUrl }), [image.previewUrl]);
  const [loading, setLoading] = React.useState(!loadedProductImageUris.has(image.previewUrl) && !failedProductImageUris.has(image.previewUrl));
  const [failed, setFailed] = React.useState(failedProductImageUris.has(image.previewUrl));

  React.useEffect(() => {
    const nextFailed = failedProductImageUris.has(image.previewUrl);
    const nextLoaded = loadedProductImageUris.has(image.previewUrl);
    setLoading(!nextLoaded && !nextFailed);
    setFailed(nextFailed);
  }, [image.previewUrl]);

  React.useEffect(() => {
    if (!loading || failed) return undefined;
    const timeout = setTimeout(() => {
      failedProductImageUris.add(image.previewUrl);
      setFailed(true);
      setLoading(false);
    }, 12000);
    return () => clearTimeout(timeout);
  }, [failed, image.previewUrl, loading]);

  const handleImageLoaded = React.useCallback(() => {
    loadedProductImageUris.add(image.previewUrl);
    failedProductImageUris.delete(image.previewUrl);
    setFailed(false);
    setLoading(false);
  }, [image.previewUrl]);

  const handleImageError = React.useCallback(() => {
    failedProductImageUris.add(image.previewUrl);
    loadedProductImageUris.delete(image.previewUrl);
    setFailed(true);
    setLoading(false);
  }, [image.previewUrl]);

  return (
    <View style={[styles.productGallerySlide, { width, height }]}>
      {!failed ? (
        <ExpoImage
          source={imageSource}
          style={styles.productGalleryImage}
          contentFit="contain"
          cachePolicy="memory-disk"
          onLoadStart={() => {
            if (!loadedProductImageUris.has(image.previewUrl) && !failedProductImageUris.has(image.previewUrl)) {
              setLoading(true);
            }
          }}
          onLoad={handleImageLoaded}
          onLoadEnd={() => setLoading(false)}
          onError={handleImageError}
        />
      ) : (
        <View style={styles.productGalleryEmpty}>
          <MaterialCommunityIcons name="image-broken-variant" size={42} color="#94A3B8" />
          <Text style={styles.productGalleryEmptyText}>Изображение не загрузилось</Text>
        </View>
      )}
      {loading && !failed ? (
        <View pointerEvents="none" style={styles.productGalleryLoader}>
          <ActivityIndicator size={28} color="#2563EB" />
        </View>
      ) : null}
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
  const setFilters = workspace.setFilters;
  const activeFilters = countActiveOrderFilters(filters);
  const [searchDraft, setSearchDraft] = React.useState(filters.search);

  React.useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  React.useEffect(() => {
    if (searchDraft === filters.search) return undefined;
    const timer = setTimeout(() => {
      setFilters((prev: any) => (
        prev.search === searchDraft ? prev : { ...prev, search: searchDraft }
      ));
    }, 520);
    return () => clearTimeout(timer);
  }, [filters.search, searchDraft, setFilters]);

  return (
    <Surface mode="flat" style={styles.ordersToolbar}>
      <View style={styles.ordersCompactToolbarRow}>
        <CompactSearchbar
          style={styles.ordersSearchbar}
          inputStyle={styles.ordersSearchbarInput}
          value={searchDraft}
          onChangeText={setSearchDraft}
          placeholder="Поиск по номеру или клиенту"
          loading={workspace.loadingOrders && workspace.ordersInitialLoadDone}
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

const PRIMARY_ORDER_FILTER_STATUSES = ['DRAFT', 'QUEUED', 'TO_SHIP', 'SHIPPING_IN_PROGRESS', 'IN_RESERVE', 'CLOSED', 'CANCELLED'];

function emptyUiOrderFilters(search = '') {
  return {
    search,
    statuses: [] as string[],
    counterpartyGuid: '',
    amountMin: '',
    amountMax: '',
    deliveryDateFrom: '',
    deliveryDateTo: '',
    updatedFrom: '',
    updatedTo: '',
    itemsMin: '',
    itemsMax: '',
    syncState: '',
    organizationGuid: '',
    warehouseGuid: '',
    priceTypeGuid: '',
    hasNumber1c: '',
    onlyProblems: false,
  };
}

function FilterDateField({
  styles,
  label,
  value,
  onChange,
}: {
  styles: any;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.filtersInputWrap}>
      <Text style={styles.filtersFieldLabel}>{label}</Text>
      <DateTimeInput
        value={value || undefined}
        includeTime={false}
        quickActions={false}
        allowClear
        onClear={() => onChange('')}
        onChange={(iso) => onChange(String(iso || '').slice(0, 10))}
        renderTrigger={({ open, displayValue }) => (
          <FilterFieldFrame
            styles={styles}
            icon="calendar-outline"
            onPress={open}
            right={value ? (
              <Pressable
                hitSlop={8}
                style={styles.filtersInlineClear}
                onPress={(event) => {
                  event.stopPropagation();
                  onChange('');
                }}
              >
                <MaterialCommunityIcons name="close" size={18} color="#475569" />
              </Pressable>
            ) : (
              <MaterialCommunityIcons name="calendar-month-outline" size={18} color="#64748B" />
            )}
          >
            <Text style={styles.filtersSelectText} numberOfLines={1}>{displayValue || 'Не выбрано'}</Text>
          </FilterFieldFrame>
        )}
      />
    </View>
  );
}

function FilterStatusMultiField({
  styles,
  labels,
  value,
  onChange,
}: {
  styles: any;
  labels: Record<string, string>;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [showAll, setShowAll] = React.useState(false);
  const selected = new Set(value || []);
  const allOptions = Object.entries(labels).map(([status, label]) => ({ status, label }));
  const primary = PRIMARY_ORDER_FILTER_STATUSES
    .filter((status) => labels[status])
    .map((status) => ({ status, label: labels[status] }));
  const options = showAll ? allOptions : primary;
  const toggle = (status: string) => {
    const next = new Set(selected);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    onChange(Array.from(next));
  };
  return (
    <View>
      <View style={styles.filtersSectionHeaderRow}>
        <Text style={styles.filtersFieldLabel}>Статус документа</Text>
        {selected.size ? (
          <Pressable onPress={() => onChange([])} hitSlop={8}>
            <Text style={styles.filtersLinkText}>Сбросить</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.filtersStatusGrid}>
        {options.map((item) => {
          const active = selected.has(item.status);
          const icon = filterStatusIcon(item.status);
          return (
            <Pressable
              key={item.status}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              onPress={() => toggle(item.status)}
              style={({ pressed }) => [styles.filtersStatusChip, active && styles.filtersStatusChipActive, pressed && styles.flatPressed]}
            >
              <MaterialCommunityIcons name={icon.name as any} size={15} color={active ? '#2563EB' : icon.color} />
              <Text style={[styles.filtersStatusChipText, active && styles.filtersStatusChipTextActive]} numberOfLines={1}>{item.label}</Text>
              {active ? <MaterialCommunityIcons name="check" size={14} color="#2563EB" /> : null}
            </Pressable>
          );
        })}
      </View>
      <Pressable onPress={() => setShowAll((prev) => !prev)} style={styles.filtersShowAllButton}>
        <Text style={styles.filtersShowAllText}>{showAll ? 'Скрыть редкие статусы' : 'Показать все статусы'}</Text>
        <MaterialCommunityIcons name={showAll ? 'chevron-up' : 'chevron-down'} size={18} color="#2563EB" />
      </Pressable>
    </View>
  );
}

function OrdersFiltersFullscreen({
  styles,
  visible,
  filters,
  statusLabels,
  syncLabels,
  organizations,
  filterOrganization,
  filterCounterparty,
  filterWarehouse,
  filterPriceType,
  searchCounterparties,
  searchWarehouses,
  searchPriceTypes,
  onApply,
  onReset,
  onClose,
}: {
  styles: any;
  visible: boolean;
  topOffset: number;
  filters: any;
  statusLabels: Record<string, string>;
  syncLabels: Record<string, string>;
  organizations: ClientOrderOrganization[];
  filterOrganization: ClientOrderOrganization | null;
  filterCounterparty: ClientOrderCounterpartyOption | null;
  filterWarehouse: ClientOrderWarehouseOption | null;
  filterPriceType: ClientOrderPriceTypeOption | null;
  searchCounterparties: (args: { search: string; limit: number; offset: number }) => Promise<{ items: ClientOrderCounterpartyOption[] }>;
  searchWarehouses: (args: { search: string; limit: number; offset: number }) => Promise<{ items: ClientOrderWarehouseOption[] }>;
  searchPriceTypes: (args: { search: string; limit: number; offset: number }) => Promise<{ items: ClientOrderPriceTypeOption[] }>;
  onApply: (value: {
    filters: any;
    organization: ClientOrderOrganization | null;
    counterparty: ClientOrderCounterpartyOption | null;
    warehouse: ClientOrderWarehouseOption | null;
    priceType: ClientOrderPriceTypeOption | null;
  }) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = React.useState<any>(filters);
  const [draftOrganization, setDraftOrganization] = React.useState<ClientOrderOrganization | null>(filterOrganization);
  const [draftCounterparty, setDraftCounterparty] = React.useState<ClientOrderCounterpartyOption | null>(filterCounterparty);
  const [draftWarehouse, setDraftWarehouse] = React.useState<ClientOrderWarehouseOption | null>(filterWarehouse);
  const [draftPriceType, setDraftPriceType] = React.useState<ClientOrderPriceTypeOption | null>(filterPriceType);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [lookupKind, setLookupKind] = React.useState<'status' | 'organization' | 'counterparty' | 'warehouse' | null>(null);

  React.useEffect(() => {
    if (!visible) return;
    setDraft({ ...filters, statuses: Array.isArray(filters.statuses) ? filters.statuses : [] });
    setDraftOrganization(filterOrganization || organizations.find((item) => item.guid === filters.organizationGuid) || null);
    setDraftCounterparty(filterCounterparty);
    setDraftWarehouse(filterWarehouse);
    setDraftPriceType(filterPriceType);
    setShowAdvanced(false);
    setLookupKind(null);
  }, [filterCounterparty, filterOrganization, filterPriceType, filterWarehouse, filters, organizations, visible]);

  React.useEffect(() => {
    if (!visible || Platform.OS === 'web') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (lookupKind) {
        setLookupKind(null);
        return true;
      }
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [lookupKind, onClose, visible]);

  const patchDraft = React.useCallback((patch: Record<string, unknown>) => {
    setDraft((prev: any) => ({ ...prev, ...patch }));
  }, []);

  const searchOrganizations = React.useCallback(async ({ search, limit, offset }: { search: string; limit: number; offset: number }) => {
    const normalized = search.trim().toLocaleLowerCase('ru');
    const source = normalized
      ? organizations.filter((item) => [item.name, item.code, item.guid].some((value) => String(value || '').toLocaleLowerCase('ru').includes(normalized)))
      : organizations;
    return { items: source.slice(offset, offset + limit) };
  }, [organizations]);

  const resetDraft = React.useCallback(() => {
    const next = emptyUiOrderFilters(filters.search || '');
    setDraft(next);
    setDraftOrganization(null);
    setDraftCounterparty(null);
    setDraftWarehouse(null);
    setDraftPriceType(null);
    onReset();
  }, [filters.search, onReset]);

  const applyDraft = React.useCallback(() => {
    onApply({
      filters: {
        ...draft,
        statuses: Array.isArray(draft.statuses) ? draft.statuses : [],
        organizationGuid: draftOrganization?.guid || '',
        counterpartyGuid: draftCounterparty?.guid || '',
        warehouseGuid: draftWarehouse?.guid || '',
        priceTypeGuid: draftPriceType?.guid || '',
      },
      organization: draftOrganization,
      counterparty: draftCounterparty,
      warehouse: draftWarehouse,
      priceType: draftPriceType,
    });
  }, [draft, draftCounterparty, draftOrganization, draftPriceType, draftWarehouse, onApply]);

  const syncOptions = React.useMemo<FilterSelectOption[]>(() => [
    { value: '', label: 'Любая синхронизация', icon: 'sync', color: '#2563EB' },
    ...Object.entries(syncLabels).map(([value, label]) => ({
      value,
      label: String(label),
      icon: value === 'ERROR' || value === 'CONFLICT' || value === 'FAILED' ? 'alert-circle-outline' : 'sync',
      color: value === 'ERROR' || value === 'CONFLICT' || value === 'FAILED' ? '#B91C1C' : '#64748B',
    })),
  ], [syncLabels]);
  const numberOptions = React.useMemo<FilterSelectOption[]>(() => [
    { value: '', label: 'Любой номер 1С', icon: 'numeric', color: '#2563EB' },
    { value: 'yes', label: 'Есть номер 1С', icon: 'check-circle-outline', color: '#166534' },
    { value: 'no', label: 'Без номера 1С', icon: 'minus-circle-outline', color: '#B91C1C' },
  ], []);
  const draftStatuses = React.useMemo(
    () => (Array.isArray(draft.statuses) ? draft.statuses.filter(Boolean) : []),
    [draft.statuses]
  );
  const statusFieldValue = React.useMemo(() => {
    if (!draftStatuses.length) return 'Все статусы';
    if (draftStatuses.length === 1) return statusLabels[draftStatuses[0]] || draftStatuses[0];
    return `${draftStatuses.length} выбрано`;
  }, [draftStatuses, statusLabels]);

  if (!visible) return null;

  return (
    <Portal>
      <View style={styles.filtersFullscreenRoot}>
        <Surface mode="flat" style={[styles.filtersFullscreenHeader, { paddingTop: Math.max(insets.top, 10) + 8 }]}>
          <View style={styles.filtersFullscreenHeaderRow}>
            <Text style={styles.filtersFullscreenTitle}>Фильтр документов</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Закрыть фильтр" onPress={onClose} style={({ pressed }) => [styles.filtersCloseButton, pressed && styles.flatPressed]}>
              <MaterialCommunityIcons name="close" size={22} color="#0F172A" />
            </Pressable>
          </View>
        </Surface>

        <ScrollView
          style={styles.filtersFullscreenScroll}
          contentContainerStyle={[styles.filtersFullscreenContent, { paddingBottom: Math.max(insets.bottom, 10) + 84 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.filtersDocumentFieldsBlock}>
            <FlatDocumentField
              label="Статус документа"
              value={statusFieldValue}
              icon="filter-variant"
              onPress={() => setLookupKind('status')}
              onReset={draftStatuses.length ? () => patchDraft({ statuses: [] }) : undefined}
              resetIcon="close"
            />
            <FlatDocumentField
              label="Организация"
              value={draftOrganization?.name || 'Все организации'}
              icon="office-building-outline"
              onPress={() => setLookupKind('organization')}
              onReset={draftOrganization ? () => {
                setDraftOrganization(null);
                patchDraft({ organizationGuid: '' });
              } : undefined}
              resetIcon="close"
            />
            <FlatDocumentField
              label="Контрагент"
              value={draftCounterparty?.name || 'Все контрагенты'}
              icon="account-outline"
              onPress={() => setLookupKind('counterparty')}
              onReset={draftCounterparty ? () => {
                setDraftCounterparty(null);
                patchDraft({ counterpartyGuid: '' });
              } : undefined}
              resetIcon="close"
            />
            <FlatDocumentField
              label="Склад"
              value={draftWarehouse?.name || 'Все склады'}
              icon="warehouse"
              onPress={() => setLookupKind('warehouse')}
              onReset={draftWarehouse ? () => {
                setDraftWarehouse(null);
                patchDraft({ warehouseGuid: '' });
              } : undefined}
              resetIcon="close"
            />
          </View>

          <View style={styles.filtersAmountRow}>
            <FilterDateField styles={styles} label="Период от" value={draft.deliveryDateFrom || ''} onChange={(deliveryDateFrom) => patchDraft({ deliveryDateFrom })} />
            <FilterDateField styles={styles} label="Период до" value={draft.deliveryDateTo || ''} onChange={(deliveryDateTo) => patchDraft({ deliveryDateTo })} />
          </View>

          <View style={styles.filtersAmountRow}>
            <FilterInputField styles={styles} label="Сумма от" value={draft.amountMin || ''} onChange={(amountMin) => patchDraft({ amountMin })} placeholder="От" icon="cash" keyboardType="decimal-pad" />
            <FilterInputField styles={styles} label="Сумма до" value={draft.amountMax || ''} onChange={(amountMax) => patchDraft({ amountMax })} placeholder="До" icon="cash" keyboardType="decimal-pad" />
          </View>

          <Pressable onPress={() => setShowAdvanced((prev) => !prev)} style={styles.filtersAdvancedToggle}>
            <Text style={styles.filtersAdvancedToggleText}>{showAdvanced ? 'Скрыть дополнительные фильтры' : 'Показать все фильтры'}</Text>
            <MaterialCommunityIcons name={showAdvanced ? 'chevron-up' : 'chevron-down'} size={20} color="#2563EB" />
          </Pressable>

          {showAdvanced ? (
            <View style={styles.filtersAdvancedBlock}>
              <FilterSelectField styles={styles} label="Синхронизация" value={draft.syncState || ''} options={syncOptions} onChange={(syncState) => patchDraft({ syncState })} />
              <FilterFieldFrame
                styles={styles}
                icon="alert-circle-outline"
                onPress={() => patchDraft({ onlyProblems: !draft.onlyProblems })}
                right={draft.onlyProblems ? <MaterialCommunityIcons name="check" size={18} color="#2563EB" /> : <MaterialCommunityIcons name="chevron-right" size={18} color="#94A3B8" />}
              >
                <Text style={[styles.filtersToggleText, draft.onlyProblems && styles.filtersToggleTextActive]}>Только проблемные</Text>
              </FilterFieldFrame>
              <FilterLookupField
                styles={styles}
                label="Вид цены"
                icon="tag-outline"
                selected={draftPriceType}
                placeholder="Начните вводить вид цены"
                search={searchPriceTypes}
                onChange={(priceType) => {
                  setDraftPriceType(priceType);
                  patchDraft({ priceTypeGuid: priceType?.guid || '' });
                }}
              />
              <View style={styles.filtersAmountRow}>
                <FilterDateField styles={styles} label="Изменен от" value={draft.updatedFrom || ''} onChange={(updatedFrom) => patchDraft({ updatedFrom })} />
                <FilterDateField styles={styles} label="Изменен до" value={draft.updatedTo || ''} onChange={(updatedTo) => patchDraft({ updatedTo })} />
              </View>
              <View style={styles.filtersAmountRow}>
                <FilterInputField styles={styles} label="Позиций от" value={draft.itemsMin || ''} onChange={(itemsMin) => patchDraft({ itemsMin })} placeholder="От" icon="format-list-numbered" keyboardType="number-pad" />
                <FilterInputField styles={styles} label="Позиций до" value={draft.itemsMax || ''} onChange={(itemsMax) => patchDraft({ itemsMax })} placeholder="До" icon="format-list-numbered" keyboardType="number-pad" />
              </View>
              <FilterSelectField styles={styles} label="Номер 1С" value={draft.hasNumber1c || ''} options={numberOptions} onChange={(hasNumber1c) => patchDraft({ hasNumber1c })} />
            </View>
          ) : null}
        </ScrollView>

        <Surface mode="flat" style={[styles.filtersFullscreenFooter, { paddingBottom: Math.max(insets.bottom, 10) + 8 }]}>
          <PaperButton mode="outlined" onPress={resetDraft} style={styles.filtersFullscreenFooterButton} labelStyle={styles.filtersFullscreenFooterLabel} contentStyle={styles.filtersFullscreenFooterContent}>
            Сбросить
          </PaperButton>
          <PaperButton mode="contained" onPress={applyDraft} buttonColor="#2563EB" textColor="#FFFFFF" style={styles.filtersFullscreenFooterButton} labelStyle={styles.filtersFullscreenFooterLabel} contentStyle={styles.filtersFullscreenFooterContent}>
            Готово
          </PaperButton>
        </Surface>
        {lookupKind === 'status' ? (
          <FilterStatusPickerPanel
            styles={styles}
            topInset={insets.top}
            bottomInset={insets.bottom}
            labels={statusLabels}
            value={draftStatuses}
            onChange={(statuses) => patchDraft({ statuses })}
            onApply={applyDraft}
            onClose={() => setLookupKind(null)}
          />
        ) : lookupKind ? (
          <FilterLookupPickerPanel
            styles={styles}
            topInset={insets.top}
            bottomInset={insets.bottom}
            title={lookupKind === 'organization' ? 'Организация' : lookupKind === 'warehouse' ? 'Склад' : 'Контрагент'}
            icon={lookupKind === 'organization' ? 'office-building-outline' : lookupKind === 'warehouse' ? 'warehouse' : 'account-outline'}
            selectedGuid={lookupKind === 'organization' ? draftOrganization?.guid : lookupKind === 'warehouse' ? draftWarehouse?.guid : draftCounterparty?.guid}
            placeholder={lookupKind === 'organization' ? 'Название или код' : lookupKind === 'warehouse' ? 'Название склада' : 'Название, ИНН или КПП'}
            search={(lookupKind === 'organization' ? searchOrganizations : lookupKind === 'warehouse' ? searchWarehouses : searchCounterparties) as any}
            onApply={applyDraft}
            onReset={() => {
              if (lookupKind === 'organization') {
                setDraftOrganization(null);
                patchDraft({ organizationGuid: '' });
              } else if (lookupKind === 'warehouse') {
                setDraftWarehouse(null);
                patchDraft({ warehouseGuid: '' });
              } else if (lookupKind === 'counterparty') {
                setDraftCounterparty(null);
                patchDraft({ counterpartyGuid: '' });
              }
            }}
            onClose={() => setLookupKind(null)}
            onSelect={(item: any) => {
              if (lookupKind === 'organization') {
                const organization = item as ClientOrderOrganization;
                setDraftOrganization(organization);
                patchDraft({ organizationGuid: organization.guid });
              } else if (lookupKind === 'warehouse') {
                const warehouse = item as ClientOrderWarehouseOption;
                setDraftWarehouse(warehouse);
                patchDraft({ warehouseGuid: warehouse.guid });
              } else {
                const counterparty = item as ClientOrderCounterpartyOption;
                setDraftCounterparty(counterparty);
                patchDraft({ counterpartyGuid: counterparty.guid });
              }
            }}
          />
        ) : null}
      </View>
    </Portal>
  );
}

function FilterStatusPickerPanel({
  styles,
  topInset,
  bottomInset,
  labels,
  value,
  onChange,
  onApply,
  onClose,
}: {
  styles: any;
  topInset: number;
  bottomInset: number;
  labels: Record<string, string>;
  value: string[];
  onChange: (value: string[]) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  const [showAll, setShowAll] = React.useState(false);
  const selected = React.useMemo(() => new Set(value || []), [value]);
  const allOptions = React.useMemo(() => Object.entries(labels).map(([status, label]) => ({ status, label })), [labels]);
  const primary = React.useMemo(() => PRIMARY_ORDER_FILTER_STATUSES
    .filter((status) => labels[status])
    .map((status) => ({ status, label: labels[status] })), [labels]);
  const options = showAll ? allOptions : primary;
  const toggleStatus = React.useCallback((status: string) => {
    const next = new Set(selected);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    onChange(Array.from(next));
  }, [onChange, selected]);

  return (
    <View style={styles.filtersLookupOverlay}>
      <Surface mode="flat" style={[styles.filtersFullscreenHeader, { paddingTop: Math.max(topInset, 10) + 8 }]}>
        <View style={styles.filtersFullscreenHeaderRow}>
          <View style={styles.filtersLookupTitleRow}>
            <MaterialCommunityIcons name="filter-variant" size={20} color="#2563EB" />
            <Text style={styles.filtersFullscreenTitle}>Статус документа</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Закрыть выбор статусов" onPress={onClose} style={({ pressed }) => [styles.filtersCloseButton, pressed && styles.flatPressed]}>
            <MaterialCommunityIcons name="close" size={22} color="#0F172A" />
          </Pressable>
        </View>
      </Surface>
      <View style={styles.filtersStatusPickerToolbar}>
        <Pressable onPress={() => onChange([])} disabled={!selected.size} style={({ pressed }) => [styles.filtersStatusResetButton, !selected.size && styles.disabled, pressed && !!selected.size && styles.flatPressed]}>
          <Text style={styles.filtersStatusResetText}>Сбросить</Text>
        </Pressable>
        <Pressable onPress={() => setShowAll((prev) => !prev)} style={({ pressed }) => [styles.filtersStatusResetButton, pressed && styles.flatPressed]}>
          <Text style={styles.filtersStatusResetText}>{showAll ? 'Основные' : 'Все статусы'}</Text>
        </Pressable>
      </View>
      <ScrollView
        style={styles.filtersLookupList}
        contentContainerStyle={[styles.filtersLookupListContent, { paddingBottom: Math.max(bottomInset, 10) + 86 }]}
      >
        {options.map((item) => {
          const active = selected.has(item.status);
          const icon = filterStatusIcon(item.status);
          return (
            <Pressable
              key={item.status}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              onPress={() => toggleStatus(item.status)}
              style={({ pressed }) => [styles.filtersLookupRow, active && styles.filtersLookupRowSelected, pressed && styles.flatPressed]}
            >
              <MaterialCommunityIcons name={icon.name as any} size={19} color={active ? '#2563EB' : icon.color} />
              <View style={styles.filtersLookupRowText}>
                <Text style={styles.filtersLookupRowTitle} numberOfLines={1}>{item.label}</Text>
              </View>
              {active ? (
                <MaterialCommunityIcons name="check-circle" size={21} color="#16A34A" />
              ) : (
                <MaterialCommunityIcons name="checkbox-blank-circle-outline" size={21} color="#CBD5E1" />
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      <Surface mode="flat" style={[styles.filtersFullscreenFooter, { paddingBottom: Math.max(bottomInset, 10) + 8 }]}>
        <PaperButton mode="outlined" onPress={() => onChange([])} disabled={!selected.size} style={styles.filtersFullscreenFooterButton} labelStyle={styles.filtersFullscreenFooterLabel} contentStyle={styles.filtersFullscreenFooterContent}>
          Сбросить
        </PaperButton>
        <PaperButton mode="contained" onPress={onApply} buttonColor="#2563EB" textColor="#FFFFFF" style={styles.filtersFullscreenFooterButton} labelStyle={styles.filtersFullscreenFooterLabel} contentStyle={styles.filtersFullscreenFooterContent}>
          Готово
        </PaperButton>
      </Surface>
    </View>
  );
}

function FilterLookupPickerPanel<T extends { guid: string; name: string }>({
  styles,
  topInset,
  bottomInset,
  title,
  icon,
  selectedGuid,
  placeholder,
  search,
  onSelect,
  onApply,
  onReset,
  onClose,
}: {
  styles: any;
  topInset: number;
  bottomInset: number;
  title: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  selectedGuid?: string | null;
  placeholder: string;
  search: (args: { search: string; limit: number; offset: number }) => Promise<{ items: T[] }>;
  onSelect: (item: T) => void;
  onApply: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = React.useState('');
  const [items, setItems] = React.useState<T[]>([]);
  const [loading, setLoading] = React.useState(false);
  const requestRef = React.useRef(0);

  React.useEffect(() => {
    const requestId = ++requestRef.current;
    const loadingTimer = setTimeout(() => {
      if (requestRef.current === requestId) setLoading(true);
    }, query.trim() ? 260 : 0);
    const requestTimer = setTimeout(() => {
      void search({ search: query.trim(), limit: 40, offset: 0 })
        .then((result) => {
          if (requestRef.current !== requestId) return;
          setItems(Array.isArray(result.items) ? result.items : []);
        })
        .catch(() => {
          if (requestRef.current !== requestId) return;
          setItems([]);
        })
        .finally(() => {
          if (requestRef.current === requestId) setLoading(false);
        });
    }, query.trim() ? 520 : 0);
    return () => {
      clearTimeout(loadingTimer);
      clearTimeout(requestTimer);
    };
  }, [query, search]);

  return (
    <View style={styles.filtersLookupOverlay}>
      <Surface mode="flat" style={[styles.filtersFullscreenHeader, { paddingTop: Math.max(topInset, 10) + 8 }]}>
        <View style={styles.filtersFullscreenHeaderRow}>
          <View style={styles.filtersLookupTitleRow}>
            <MaterialCommunityIcons name={icon} size={20} color="#2563EB" />
            <Text style={styles.filtersFullscreenTitle}>{title}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Закрыть подбор" onPress={onClose} style={({ pressed }) => [styles.filtersCloseButton, pressed && styles.flatPressed]}>
            <MaterialCommunityIcons name="close" size={22} color="#0F172A" />
          </Pressable>
        </View>
      </Surface>
      <View style={styles.filtersLookupSearchArea}>
        <CompactSearchbar
          style={styles.filtersLookupSearch}
          inputStyle={styles.ordersSearchbarInput}
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder}
        />
      </View>
      <ScrollView
        style={styles.filtersLookupList}
        contentContainerStyle={[styles.filtersLookupListContent, { paddingBottom: Math.max(bottomInset, 10) + 86 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {loading ? (
          <View style={styles.filtersLookupStateRow}>
            <ActivityIndicator size="small" color="#2563EB" />
          </View>
        ) : null}
        {!loading && !items.length ? (
          <Text style={styles.filtersLookupEmpty}>Ничего не найдено.</Text>
        ) : null}
        {items.map((item) => {
          const selected = item.guid === selectedGuid;
          return (
            <Pressable
              key={item.guid}
              accessibilityRole="button"
              onPress={() => onSelect(item)}
              style={({ pressed }) => [styles.filtersLookupRow, selected && styles.filtersLookupRowSelected, pressed && styles.flatPressed]}
            >
              <View style={styles.filtersLookupRowText}>
                <Text style={styles.filtersLookupRowTitle} numberOfLines={2}>{item.name}</Text>
                {getPickerItemMeta(title === 'Контрагент' ? 'filterCounterparty' : 'organization', item) ? (
                  <Text style={styles.filtersLookupRowMeta} numberOfLines={1}>{getPickerItemMeta(title === 'Контрагент' ? 'filterCounterparty' : 'organization', item)}</Text>
                ) : null}
              </View>
              {selected ? (
                <MaterialCommunityIcons name="check-circle" size={21} color="#16A34A" />
              ) : (
                <MaterialCommunityIcons name="chevron-right" size={22} color="#94A3B8" />
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      <Surface mode="flat" style={[styles.filtersFullscreenFooter, { paddingBottom: Math.max(bottomInset, 10) + 8 }]}>
        <PaperButton mode="outlined" onPress={onReset} disabled={!selectedGuid} style={styles.filtersFullscreenFooterButton} labelStyle={styles.filtersFullscreenFooterLabel} contentStyle={styles.filtersFullscreenFooterContent}>
          Сбросить
        </PaperButton>
        <PaperButton mode="contained" onPress={onApply} buttonColor="#2563EB" textColor="#FFFFFF" style={styles.filtersFullscreenFooterButton} labelStyle={styles.filtersFullscreenFooterLabel} contentStyle={styles.filtersFullscreenFooterContent}>
          Готово
        </PaperButton>
      </Surface>
    </View>
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
  const displayStatus = getOrderDisplayStatus(order);
  const isDeviceOrder = order.origin === 'device';
  const statusIcon = isDeviceOrder ? { name: 'cellphone-check', color: '#1D4ED8' } : orderStatusIcon(displayStatus);
  const hasProblem = !isDeviceOrder && orderHasVisibleProblem(order);
  const isLocalOrder = order.origin !== 'onec';
  const itemsCount = getClientOrderItemsCount(order);
  const statusLabel = isDeviceOrder ? 'На устройстве' : getOrderDisplayStatusLabelWithQueue(order);
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
        <Surface
          mode="flat"
          style={[
            styles.orderCardPaper,
            isLocalOrder && styles.orderCardPaperLocal,
            hasProblem && styles.orderCardPaperProblem,
            loading && styles.orderCardPaperLoading,
          ]}
        >
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
            <View style={[styles.orderStatusPill, orderStatusTone(isDeviceOrder ? 'QUEUED' : displayStatus), hasProblem && styles.orderStatusProblem]}>
              <MaterialCommunityIcons name={statusIcon.name as any} size={14} color={statusIcon.color} />
              <Text style={[styles.orderStatusText, { color: statusIcon.color }]} numberOfLines={1}>
                {statusLabel}
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
                {normalizeClientOrderUserErrorMessage(order.lastExportError || order.last1cError, 'Документ требует проверки')}
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
  ordersStickyToolbar: { flexShrink: 0, paddingTop: 2, paddingBottom: 5, backgroundColor: 'transparent', zIndex: 2 },
  contentTablet: { maxWidth: 760, alignSelf: 'center', width: '100%' },
  panelCard: { borderColor: '#DBEAFE', overflow: 'hidden' },
  cardContent: { paddingTop: 0, paddingBottom: 0 },
  panel: { borderRadius: 18, borderWidth: 1, borderColor: '#DBEAFE', padding: 12, gap: 10, shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },
  cardStack: { gap: 4 },
  documentHeaderSlot: { gap: 7 },
  documentHeaderSlotItems: { minHeight: 0 },
  documentTopTitleRow: { flex: 1, minWidth: 0, minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 7 },
  documentTopStatusButton: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  documentTopQueueBadge: { position: 'absolute', top: -5, right: -7, minWidth: 18, height: 18, borderRadius: 999, paddingHorizontal: 4, backgroundColor: '#2563EB', borderWidth: 1.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  documentTopQueueBadgeText: { color: '#FFFFFF', fontSize: 9.5, lineHeight: 11, fontWeight: '900', includeFontPadding: false },
  documentTopTitle: { flex: 1, minWidth: 0, color: '#0F172A', fontSize: 15.5, lineHeight: 19, fontWeight: '900', includeFontPadding: false },
  documentStatusMenuPaper: { borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  documentStatusMenuText: { fontSize: 13, lineHeight: 17, fontWeight: '900' },
  documentStatusMenuErrorText: { color: '#B91C1C' },
  documentHeaderRightActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  documentHeaderOfflineBadge: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  documentHeaderMoreButton: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  documentHeaderTopMoreButton: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
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
  documentBottomMetaRow: { minHeight: 25, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  documentBottomTotalPill: { flexGrow: 1, flexShrink: 0, flexBasis: 118, maxWidth: '100%', minHeight: 25, borderRadius: 999, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF', paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  documentBottomTotalText: { flex: 1, minWidth: 0, color: '#2563EB', fontSize: 12, lineHeight: 15, fontWeight: '900', includeFontPadding: false },
  documentBottomProfitPill: { flexGrow: 1, flexShrink: 0, flexBasis: 118, maxWidth: '100%', minHeight: 25, borderRadius: 999, borderWidth: 1, borderColor: '#BBF7D0', backgroundColor: '#F0FDF4', paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  documentBottomProfitText: { flex: 1, minWidth: 0, color: '#16A34A', fontSize: 12, lineHeight: 15, fontWeight: '900', includeFontPadding: false },
  documentBottomProfitTextNegative: { color: '#DC2626' },
  documentBottomDateText: { flexShrink: 0, color: '#475569', fontSize: 11.5, lineHeight: 14, fontWeight: '800', includeFontPadding: false },
  documentBottomCounterpartyRow: { minHeight: 24, borderRadius: 8, backgroundColor: '#F8FAFC', paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 5 },
  documentBottomCounterpartyText: { flex: 1, minWidth: 0, color: '#334155', fontSize: 11.5, lineHeight: 14, fontWeight: '800', includeFontPadding: false },
  documentBottomDateInline: { flexShrink: 0, maxWidth: 112, minHeight: 20, borderRadius: 999, backgroundColor: '#EEF2F7', paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', gap: 3 },
  documentBottomPrimaryButton: { width: 106, height: 46, borderRadius: 13, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  documentBottomPrimaryButtonSubmit: { backgroundColor: '#16A34A' },
  documentBottomPrimaryText: { color: '#FFFFFF', fontSize: 12.5, lineHeight: 16, fontWeight: '900', includeFontPadding: false },
  flatPressed: { opacity: 0.78 },
  compactSearchShell: { height: 34, minHeight: 34, flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingRight: 2, gap: 6, overflow: 'hidden' },
  compactSearchInputBase: { flex: 1, minWidth: 0, height: 32, paddingHorizontal: 0, paddingVertical: 0, margin: 0, color: '#0F172A', fontSize: 13, lineHeight: 16, fontWeight: '800', includeFontPadding: false, textAlignVertical: 'center' },
  compactSearchLoading: { width: 24, height: 28, alignItems: 'center', justifyContent: 'center' },
  compactSearchClear: { width: 28, height: 28, marginRight: 0, alignItems: 'center', justifyContent: 'center' },
  flatField: { minHeight: 48, borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: '#FFFFFF', borderRadius: 4, paddingLeft: 8, paddingRight: 5, paddingVertical: 5, flexDirection: 'row', alignItems: 'center' },
  flatFieldInvalid: { borderColor: '#FCA5A5', backgroundColor: '#FFF7F7' },
  flatFieldIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', marginRight: 7 },
  flatFieldTextWrap: { flex: 1, minWidth: 0, justifyContent: 'center' },
  flatFieldLabel: { marginBottom: 1, fontSize: 10.5, color: '#64748B', fontWeight: '900', textTransform: 'uppercase' },
  flatFieldValue: { fontSize: 13, lineHeight: 16, color: '#0F172A', fontWeight: '900' },
  flatFieldHelper: { marginTop: 2, fontSize: 11, lineHeight: 13, color: '#64748B', fontWeight: '700' },
  flatFieldActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  flatFieldAction: { width: 30, height: 30, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  flatSegmentedField: { minHeight: 58, borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: '#FFFFFF', borderRadius: 4, paddingLeft: 8, paddingRight: 6, paddingVertical: 6, flexDirection: 'row', alignItems: 'center' },
  flatSegmentedContent: { flex: 1, minWidth: 0, gap: 4 },
  flatSegmentedHeader: { minHeight: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  flatSegmentedControl: { minHeight: 30, borderRadius: 5, borderWidth: 1, borderColor: '#D8E2F0', overflow: 'hidden', flexDirection: 'row', backgroundColor: '#F8FAFC' },
  flatSegmentedOption: { flex: 1, minWidth: 0, minHeight: 28, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: '#D8E2F0' },
  flatSegmentedOptionLast: { borderRightWidth: 0 },
  flatSegmentedOptionActive: { backgroundColor: '#DBEAFE' },
  flatSegmentedOptionDisabled: { backgroundColor: 'rgba(248, 250, 252, 0.7)' },
  flatSegmentedOptionText: { color: '#334155', fontSize: 11.5, lineHeight: 14, fontWeight: '900', includeFontPadding: false },
  flatSegmentedOptionTextActive: { color: '#1D4ED8' },
  flatSegmentedUnsupported: { color: '#B45309', fontSize: 10.5, lineHeight: 13, fontWeight: '800', includeFontPadding: false },
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
  filtersFullscreenRoot: { ...StyleSheet.absoluteFillObject, zIndex: 360, elevation: 360, backgroundColor: '#F8FAFC' },
  filtersFullscreenHeader: { borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingBottom: 10 },
  filtersFullscreenHeaderRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  filtersFullscreenTitle: { flex: 1, color: '#0F172A', fontSize: 18, lineHeight: 22, fontWeight: '900' },
  filtersCloseButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  filtersFullscreenScroll: { flex: 1 },
  filtersFullscreenContent: { paddingHorizontal: 14, paddingTop: 14, gap: 12 },
  filtersFullscreenFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  filtersFullscreenFooterButton: { flex: 1, borderRadius: 12, borderColor: '#CBD5E1' },
  filtersFullscreenFooterContent: { minHeight: 44 },
  filtersFullscreenFooterLabel: { fontSize: 13, fontWeight: '900', marginVertical: 0 },
  filtersDocumentFieldsBlock: { gap: 8 },
  filtersLookupOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 380, elevation: 380, backgroundColor: '#F8FAFC' },
  filtersLookupTitleRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  filtersLookupSearchArea: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, backgroundColor: '#F8FAFC' },
  filtersLookupSearch: { height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', elevation: 0 },
  productPickerFullscreenHeader: { flexShrink: 0, minHeight: 140, paddingBottom: 16, gap: 10, overflow: 'visible', backgroundColor: '#FFFFFF' },
  productPickerFullscreenSearchArea: { flexShrink: 0, width: '100%' },
  productPickerFullscreenSearch: { height: 42, minHeight: 42, borderRadius: 8, backgroundColor: '#F8FAFC' },
  productPickerFullscreenSearchInput: { height: 38, fontSize: 14 },
  productPickerFullscreenHeaderActions: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  productPickerFullscreenStockChip: { height: 28, borderRadius: 8, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5 },
  productPickerFullscreenStockChipActive: { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' },
  productPickerFullscreenStockText: { color: '#475569', fontSize: 11, lineHeight: 14, fontWeight: '900' },
  productPickerFullscreenStockTextActive: { color: '#166534' },
  productPickerFullscreenList: { flex: 1, minHeight: 0, backgroundColor: '#FFFFFF' },
  productPickerClearSelectionButton: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  productPickerInitialLoader: { minHeight: 220, flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  filtersLookupList: { flex: 1 },
  filtersLookupListContent: { paddingHorizontal: 14, gap: 6 },
  filtersLookupStateRow: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  filtersLookupEmpty: { paddingVertical: 22, color: '#64748B', fontSize: 13, lineHeight: 17, fontWeight: '800', textAlign: 'center' },
  filtersLookupRow: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  filtersLookupRowSelected: { borderColor: '#93C5FD', backgroundColor: '#EFF6FF' },
  filtersLookupRowText: { flex: 1, minWidth: 0, gap: 2 },
  filtersLookupRowTitle: { color: '#0F172A', fontSize: 13, lineHeight: 17, fontWeight: '900' },
  filtersLookupRowMeta: { color: '#64748B', fontSize: 11, lineHeight: 14, fontWeight: '800' },
  filtersStatusPickerToolbar: { minHeight: 52, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F8FAFC' },
  filtersStatusResetButton: { minHeight: 34, borderRadius: 999, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  filtersStatusResetText: { color: '#2563EB', fontSize: 12, lineHeight: 15, fontWeight: '900' },
  filtersSectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  filtersLinkText: { color: '#2563EB', fontSize: 12, lineHeight: 15, fontWeight: '900' },
  filtersStatusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filtersStatusChip: { maxWidth: '100%', minHeight: 34, borderRadius: 999, borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: '#FFFFFF', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  filtersStatusChipActive: { borderColor: '#93C5FD', backgroundColor: '#EFF6FF' },
  filtersStatusChipText: { maxWidth: 190, color: '#334155', fontSize: 12, lineHeight: 15, fontWeight: '800' },
  filtersStatusChipTextActive: { color: '#1D4ED8' },
  filtersShowAllButton: { alignSelf: 'flex-start', minHeight: 32, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, backgroundColor: '#EFF6FF' },
  filtersShowAllText: { color: '#2563EB', fontSize: 12, lineHeight: 15, fontWeight: '900' },
  filtersAdvancedToggle: { minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  filtersAdvancedToggleText: { color: '#1D4ED8', fontSize: 13, lineHeight: 17, fontWeight: '900' },
  filtersAdvancedBlock: { gap: 12 },
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
  ordersFilterBadge: { position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 999, paddingHorizontal: 4, backgroundColor: '#2563EB', borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  ordersFilterBadgeText: { color: '#FFFFFF', fontSize: 9, lineHeight: 11, fontWeight: '900' },
  ordersInitialLoadingState: { minHeight: 160, alignItems: 'center', justifyContent: 'center', paddingVertical: 28 },
  ordersEmptyState: { minHeight: 148, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 22, gap: 6 },
  ordersEmptyIcon: { width: 42, height: 42, borderRadius: 999, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  ordersEmptyTitle: { color: '#334155', fontSize: 14, lineHeight: 18, fontWeight: '900', includeFontPadding: false },
  ordersEmptySubtitle: { color: '#64748B', fontSize: 12, lineHeight: 15, fontWeight: '700', includeFontPadding: false, textAlign: 'center' },
  ordersPaginationLoading: { minHeight: 30, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  ordersPaginationRetry: { alignSelf: 'center', minHeight: 32, borderRadius: 999, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#FFFFFF', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  ordersPaginationRetryText: { color: '#2563EB', fontSize: 12, lineHeight: 15, fontWeight: '900', includeFontPadding: false },
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
  documentBusyOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 260, elevation: 260, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  documentBusyBlur: { ...StyleSheet.absoluteFillObject, borderWidth: 0 },
  documentBusyCard: { minWidth: 164, minHeight: 92, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(191, 219, 254, 0.82)', backgroundColor: 'rgba(255, 255, 255, 0.86)', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 16, shadowColor: '#0F172A', shadowOpacity: 0.13, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 18 },
  documentBusyTitle: { color: '#0F172A', fontSize: 13, lineHeight: 17, fontWeight: '900', textAlign: 'center' },
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
  orderCardPaperLocal: { borderColor: '#BFDBFE', backgroundColor: '#F8FBFF' },
  orderCardPaperProblem: { borderColor: '#FECACA', backgroundColor: '#FFFBFB' },
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
  productPreviewCardCancelled: { borderColor: '#CBD5E1', backgroundColor: '#F8FAFC' },
  productPreviewCardInvalid: { borderColor: '#EF4444', backgroundColor: '#FFF7F7' },
  productPreviewCardWithIssue: { height: 114 },
  productPreviewMedia: { width: 78, height: '100%', backgroundColor: '#F1F5F9', overflow: 'hidden', borderRightWidth: 1, borderRightColor: '#E2E8F0' },
  productPreviewMediaReadOnly: { backgroundColor: 'rgba(241, 245, 249, 0.56)', borderRightColor: 'rgba(226, 232, 240, 0.66)' },
  productPreviewIndexBadge: { position: 'absolute', top: 5, left: 5, minWidth: 24, height: 22, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.9)', borderWidth: 1, borderColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' },
  productPreviewIndexBadgeReadOnly: { backgroundColor: 'rgba(255, 255, 255, 0.62)', borderColor: 'rgba(191, 219, 254, 0.62)' },
  productPreviewIndex: { color: '#2563EB', fontSize: 11, fontWeight: '900', textAlign: 'center', lineHeight: 14 },
  productPreviewIndexReadOnly: { color: 'rgba(37, 99, 235, 0.58)' },
  productPreviewImage: { width: 78, height: '100%', backgroundColor: '#F1F5F9' },
  productPreviewImageReadOnly: { backgroundColor: 'rgba(241, 245, 249, 0.5)', opacity: 0.72 },
  productImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  productImageFrame: { position: 'relative', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  productImageObject: { ...StyleSheet.absoluteFillObject },
  productImagePlaceholderFill: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  productImageLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(248, 250, 252, 0.74)',
  },
  productImagePressed: { opacity: 0.82 },
  productGalleryOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 80, elevation: 80, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  productGalleryBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 23, 42, 0.58)' },
  productGalleryCard: { maxWidth: '100%', maxHeight: '88%', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(226, 232, 240, 0.72)', backgroundColor: '#FFFFFF', overflow: 'hidden' },
  productGalleryHeader: { minHeight: 58, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center', gap: 10 },
  productGalleryTitleWrap: { flex: 1, minWidth: 0 },
  productGalleryTitle: { color: '#0F172A', fontSize: 14, lineHeight: 18, fontWeight: '900' },
  productGallerySubtitle: { marginTop: 2, color: '#64748B', fontSize: 11, lineHeight: 14, fontWeight: '800' },
  productGalleryHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  productGalleryCounter: { minWidth: 38, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: '#EFF6FF', color: '#2563EB', fontSize: 11, lineHeight: 14, fontWeight: '900', textAlign: 'center' },
  productGalleryCloseButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  productGallerySlide: { position: 'relative', backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  productGalleryImage: { ...StyleSheet.absoluteFillObject },
  productGalleryLoader: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(248, 250, 252, 0.72)' },
  productGalleryEmpty: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 },
  productGalleryEmptyText: { color: '#64748B', fontSize: 12, lineHeight: 16, fontWeight: '800', textAlign: 'center' },
  productGalleryThumbs: { paddingHorizontal: 10, paddingVertical: 10, gap: 8, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  productGalleryThumb: { width: 54, height: 54, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', overflow: 'hidden' },
  productGalleryThumbActive: { borderColor: '#2563EB', borderWidth: 2 },
  productGalleryThumbImage: { width: '100%', height: '100%' },
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
  productPreviewIssueText: { color: '#DC2626', fontSize: 10.5, fontWeight: '800', lineHeight: 13, marginTop: 2 },
  productPreviewCancelledText: { color: '#64748B' },
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
  itemsSearchResultThumbWrap: { width: 34, height: 34, flexShrink: 0, position: 'relative' },
  itemsSearchResultThumb: { width: 34, height: 34, borderRadius: 8, backgroundColor: 'transparent' },
  itemsSearchResultThumbBadge: { position: 'absolute', right: -3, bottom: -3, width: 15, height: 15, borderRadius: 999, borderWidth: 1.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  itemsSearchResultThumbBadgeAdd: { backgroundColor: '#2563EB' },
  itemsSearchResultThumbBadgeSelected: { backgroundColor: '#16A34A' },
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
  counterpartyManagerToggle: { height: 34, minWidth: 76, borderRadius: 9, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', paddingRight: 9, paddingLeft: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  counterpartyManagerToggleActive: { borderColor: '#93C5FD', backgroundColor: '#EFF6FF' },
  counterpartyManagerToggleText: { marginLeft: -5, color: '#334155', fontSize: 11, lineHeight: 14, fontWeight: '900' },
  counterpartyManagerToggleTextActive: { color: '#1D4ED8' },
  pickerListContent: { paddingBottom: 20, flexGrow: 1 },
  pickerFlatRow: { minHeight: 54, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#FFFFFF', paddingLeft: 10, paddingRight: 8, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 8 },
  productPickerRow: { minHeight: 84, paddingLeft: 5, paddingRight: 10, paddingVertical: 2, gap: 8 },
  pickerFlatRowSelected: { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' },
  productPickerThumb: { width: 80, height: 80, borderRadius: 10, backgroundColor: 'transparent' },
  productPickerThumbDisabled: { opacity: 0.55 },
  pickerFlatTextWrap: { flex: 1, minWidth: 0 },
  pickerFlatTitle: { color: '#0F172A', fontSize: 12.5, fontWeight: '900', lineHeight: 15 },
  pickerFlatMeta: { marginTop: 1, color: '#64748B', fontSize: 10.5, fontWeight: '800', lineHeight: 12.5 },
  productPickerSelectedText: { marginTop: 3, color: '#1D4ED8', fontSize: 11, lineHeight: 13, fontWeight: '900' },
  productPickerAlreadyText: { marginTop: 3, color: '#B91C1C', fontSize: 11, lineHeight: 13, fontWeight: '900' },
  pickerRowSurface: { backgroundColor: '#FFFFFF' },
  pickerRowTitle: { color: '#111827', fontSize: 15, fontWeight: '800' },
  pickerRowMeta: { color: '#64748B', fontSize: 12, fontWeight: '600' },
  pickerRowDisabled: { color: '#B91C1C' },
  pickerRowChevron: { alignSelf: 'center', marginVertical: 10 },
  pickerFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  pickerFooterText: { color: '#64748B', fontSize: 12, fontWeight: '700' },
  productPickerTransferFooter: { flexShrink: 0, paddingTop: 8, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  productPickerTransferButton: { borderRadius: 12 },
  productPickerTransferContent: { minHeight: 44 },
  productPickerTransferLabel: { marginVertical: 0, fontSize: 13, fontWeight: '900' },
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
  confirmDialogTextButton: { flex: 1, borderRadius: 14, borderColor: '#CBD5E1', minWidth: 140 },
  confirmDialogPrimaryButton: { flex: 1, borderRadius: 14, minWidth: 140 },
  confirmDialogButtonContent: { minHeight: 46, paddingHorizontal: 8 },
  confirmDialogButtonLabel: { marginVertical: 0, fontSize: 13, fontWeight: '900' },
  modalBackdropPaper: { flex: 1, margin: 0, justifyContent: 'flex-end' },
  modalBackdropPaperFull: { justifyContent: 'flex-end' },
  modalSheetPaper: { maxHeight: '86%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  modalSheetPaperFull: { height: '100%', borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  sheetHeader: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 8 },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: '#111827' },
  sheetCloseButton: { margin: 0 },
  sheetBody: { flex: 1, minHeight: 0, padding: 14, gap: 12 },
});
