import {ClientOrderPriceGrid} from './screen/desktop/ClientOrderPriceGrid';
import {ClientOrderCustomerStart} from './screen/desktop/ClientOrderCustomerStart';
import { useServicesHeaderSlot } from '@/src/features/services/headerSlotContext';
import { useAppSurfaceTheme } from '@/components/ui/appSurfaceTokens';
import { AppWorkspaceHeader } from '@/components/ui/AppWorkspaceHeader';
import { ClientOrdersWebTheme } from './screen/desktop/ClientOrdersWebTheme';
import { handleWebCellKey, stepWebQuantity } from './screen/desktop/clientOrdersWebEditing';
import { OrderShareFeedback } from './components/OrderShareFeedback';
import { useOrderShareActions } from './hooks/useOrderShareActions';
import { ProductImageGalleryDialog, WebProductImage, PRODUCT_IMAGE_PLACEHOLDER_URI, type ProductGalleryImage } from './components/ProductImageGalleryDialog';
import {
  computeLineTotal,
  displayedUnitPriceToBasePriceInput,
  formatDateTime,
  formatMoney,
  getClientOrderItemsCount,
  getClientOrderDisplayNumber,
  getDisplayedUnitPriceValue,
  getClientOrdersResponsiveMetrics,
  getOrderDisplayStatus,
  getOrderDisplayStatusLabelWithQueue,
  getDraftItemCancelReason,
  hasManualPrice,
  isCancelledDraftItem,
  isValidManualPriceValue,
  isValidQuantityValue,
  isWeightDraftItem,
  normalizePriceInput,
  normalizeQuantityInput,
  resolveClientOrdersEditorTier,
  resolveClientOrdersLayoutTier,
  type DraftItem,
} from './lib/clientOrdersShared';
import {
  formatDateOnly,
  formatProductTransferLabel,
  formatStockLabel,
  buildWarehousePickerRows,
  getCounterpartyTaxMeta,
  getPackageDisplayText,
  getPickerItemMeta,
  getPickerItemTitle,
  getQuantityInputWidthPx,
  hasSinglePackage,
  isProductAlreadyInOrder,
  isWarehousePickerGroupRow,
  packageLabel,
  pickerNeedsOrderContext,
  removeOrderItemsFromProductSelection,
  sortDeliveryAddressOptions,
  toggleProductSelection,
  transferSelectedProductsToOrder,
  type ClientOrdersPickerKind,
  type ProductSelectionMap,
  unitLabel,
} from './lib/clientOrdersUi';
import { hasMorePage } from './lib/clientOrdersPaging';
import { resolveStoredBooleanDefaultTrue, serializeStoredBoolean } from './lib/clientOrdersPrefs';
import { useClientOrdersWorkspace } from './hooks/useClientOrdersWorkspace';
import { useCustomerPurchaseHistory } from './hooks/useCustomerPurchaseHistory';
import { purchaseHistoryLabel } from './lib/customerPurchaseHistory';
import { SendDeviceOrdersButton } from './screen/SendDeviceOrdersButton';
import {
  getClientOrderInvoiceActionLabel,
  getClientOrderInvoiceIdentifier,
  getClientOrderInvoicePresentation,
  getDownloadableClientOrderInvoices,
  saveClientOrderInvoicePdf,
  shareClientOrderInvoicePdf,
} from './lib/clientOrderInvoices';
import type {
  ClientOrderAgreementOption,
  ClientOrderContractOption,
  ClientOrderCounterpartyOption,
  ClientOrderDeliveryAddressOption,
  ClientOrder,
  ClientOrderInvoice,
  ClientOrderOrganization,
  ClientOrderPriceTypeOption,
  ClientOrderProduct,
  ClientOrderReferenceDetails,
  ClientOrderReferenceKind,
  ClientOrderWarehouseOption,
} from '@/utils/clientOrdersService';
import { getClientOrderInvoices, getClientOrderReferenceDetails, requestClientOrderInvoice } from '@/utils/clientOrdersService';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  ClickAwayListener,
  Collapse,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Popper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  flexRender,
  useTable,
  type ColumnDef,
  type ColumnOrderState,
  type ColumnSizingState,
} from '@tanstack/react-table';
import React from 'react';
import { ClientOrderQuickProducts } from './screen/desktop/ClientOrderQuickProducts';

import { draftTableFeatures } from './screen/desktop/draftItemsTableFeatures';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import {
  DeliveryDateField,
  DocumentPlusIcon,
  ReferenceDetailsDialog,
  ResetAdornmentButton,
  ToolbarIconButton,
} from './screen/desktop/ClientOrdersDesktopUi';

type PickerKind = ClientOrdersPickerKind;
type ResponsivePane = 'customers' | 'orders' | 'editor';
type PendingPriceTypeAction =
  | { type: 'change-header'; priceType: ClientOrderPriceTypeOption | null }
  | { type: 'reset-header' };
type SegmentedChoice = { value: string | null; label: string };
const PRODUCT_IN_STOCK_ONLY_STORAGE_KEY = 'clientOrders.productPicker.inStockOnly';
const COUNTERPARTY_MANAGER_ONLY_STORAGE_KEY = 'clientOrders.counterpartyPicker.managerOnly';
const PAYMENT_FORM_CHOICES: SegmentedChoice[] = [
  { value: null, label: 'Любая' },
  { value: 'Наличная', label: 'Наличная' },
];
const DELIVERY_METHOD_CHOICES: SegmentedChoice[] = [
  { value: 'ДоКлиента', label: 'Наша доставка' },
  { value: 'Самовывоз', label: 'Самовывоз' },
];

function invoiceWebIcon(state: ReturnType<typeof getClientOrderInvoicePresentation>['state']) {
  if (state === 'SENT' || state === 'AVAILABLE') return 'checkmark-circle-outline';
  if (state === 'ERROR' || state === 'PARTIAL') return 'alert-circle-outline';
  if (state === 'QUEUED' || state === 'SENDING') return 'send-outline';
  return 'time-outline';
}

function InvoiceRequestWebField({ workspace, wide }: { workspace: any; wide: boolean }) {
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);
  const [downloadingAction, setDownloadingAction] = React.useState<'download' | 'share' | null>(null);
  const [loadingInvoices, setLoadingInvoices] = React.useState(false);
  const [requestingInvoice, setRequestingInvoice] = React.useState(false);
  const [requestPending, setRequestPending] = React.useState(false);
  const [loadedInvoices, setLoadedInvoices] = React.useState<{ orderGuid: string; items: ClientOrderInvoice[] } | null>(null);
  const [invoiceMenuAnchor, setInvoiceMenuAnchor] = React.useState<HTMLElement | null>(null);
  const selectedOrder = workspace.selectedOrder as ClientOrder | null;
  const invoiceOrderGuid = getClientOrderInvoiceIdentifier(selectedOrder);
  const currentInvoices = getDownloadableClientOrderInvoices(selectedOrder);
  const invoices = currentInvoices.length || !loadedInvoices || loadedInvoices.orderGuid !== invoiceOrderGuid
    ? currentInvoices
    : getDownloadableClientOrderInvoices({ invoices: loadedInvoices.items });
  const invoiceDownloadAvailable = invoices.length > 0 || !!selectedOrder?.invoiceDownloadAvailable;
  const invoicePresentation = getClientOrderInvoicePresentation(selectedOrder);
  const invoiceGenerationPending = requestPending || invoicePresentation.pending;
  const readOnly = !!workspace.readOnly || !!workspace.mutationLocked;
  React.useEffect(() => {
    setLoadedInvoices(null);
    setInvoiceMenuAnchor(null);
    setRequestPending(false);
  }, [invoiceOrderGuid]);
  React.useEffect(() => {
    if (invoiceDownloadAvailable) setRequestPending(false);
  }, [invoiceDownloadAvailable]);
  const download = async (invoice: ClientOrderInvoice, action: 'download' | 'share' = 'download') => {
    if (!invoiceOrderGuid || downloadingId) return;
    setInvoiceMenuAnchor(null);
    setDownloadingId(invoice.id);
    setDownloadingAction(action);
    try {
      if (action === 'share') await shareClientOrderInvoicePdf(invoiceOrderGuid, invoice);
      else await saveClientOrderInvoicePdf(invoiceOrderGuid, invoice);
    } catch (error: any) {
      window.alert(error?.message || 'Не удалось скачать счёт');
    } finally {
      setDownloadingId(null);
      setDownloadingAction(null);
    }
  };
  const requestInvoice = async () => {
    if (!invoiceOrderGuid || requestingInvoice || requestPending) return;
    setRequestingInvoice(true);
    try {
      const result = await requestClientOrderInvoice(invoiceOrderGuid);
      setLoadedInvoices({ orderGuid: invoiceOrderGuid, items: result.items });
      workspace.applyInvoiceRequestResult(invoiceOrderGuid, result.items);
      setRequestPending(!getDownloadableClientOrderInvoices({ invoices: result.items }).length);
    } catch (error: any) {
      window.alert(error?.message || 'Не удалось запросить счёт');
    } finally {
      setRequestingInvoice(false);
    }
  };
  const openDownload = async (anchor: HTMLElement) => {
    let available = invoices;
    if (!available.length && invoiceOrderGuid && invoiceDownloadAvailable && !loadingInvoices) {
      setLoadingInvoices(true);
      try {
        const loaded = await getClientOrderInvoices(invoiceOrderGuid);
        setLoadedInvoices({ orderGuid: invoiceOrderGuid, items: loaded });
        available = getDownloadableClientOrderInvoices({ invoices: loaded });
      } catch (error: any) {
        window.alert(error?.message || 'Не удалось загрузить счёт');
        return;
      } finally {
        setLoadingInvoices(false);
      }
    }
    if (available.length === 1) await download(available[0]);
    else if (available.length > 1) setInvoiceMenuAnchor(anchor);
    else window.alert('Счёт ещё не готов. Обновите документ и повторите попытку.');
  };

  if (invoiceDownloadAvailable) {
    return (
      <Box sx={{ gridColumn: wide ? 'span 2' : 'auto', minWidth: 0 }}>
        <Stack direction="row" spacing={0}>
        <Button
          variant="text"
          disabled={!!downloadingId || loadingInvoices}
          onClick={(event) => {
            void openDownload(event.currentTarget);
          }}
          startIcon={<Ionicons name="document-text-outline" size={16} color="var(--co-danger)" />}
          endIcon={downloadingAction === 'download' || loadingInvoices
            ? <CircularProgress size={15} />
            : <Ionicons name="download-outline" size={15} color="var(--co-accent)" />}
          sx={{
            flex: 1,
            height: 30,
            justifyContent: 'flex-start',
            borderRadius: 0,
            border: 0,
            color: 'var(--co-text)',
            bgcolor: 'transparent',
            px: 1,
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'none',
            '& .MuiButton-endIcon': { ml: 'auto' },
          }}
        >
          Скачать счёт
        </Button>
        {invoices.length === 1 ? (
          <IconButton aria-label="Поделиться счётом" disabled={!!downloadingId || loadingInvoices} onClick={() => void download(invoices[0], 'share')} sx={{ width: 34, height: 30, ml: 0, borderLeft: '1px solid rgba(148, 163, 184, 0.45)', borderRadius: 0 }}>
            {downloadingAction === 'share'
              ? <CircularProgress size={16} />
              : <Ionicons name="share-outline" size={16} color="var(--co-accent)" />}
          </IconButton>
        ) : null}
        </Stack>
        <Menu anchorEl={invoiceMenuAnchor} open={!!invoiceMenuAnchor} onClose={() => setInvoiceMenuAnchor(null)}>
          {invoices.map((invoice) => (
            <MenuItem key={invoice.id} onClick={() => void download(invoice)} disabled={!!downloadingId}>
              <Stack
                direction="row"
                spacing={0.8}
                sx={{
                  alignItems: "center",
                  minWidth: 240
                }}>
                <Ionicons name="document-text-outline" size={17} color="var(--co-danger)" />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{getClientOrderInvoiceActionLabel(invoice)}</Typography>
                  <Typography sx={{ fontSize: 12, color: 'var(--co-muted)', fontWeight: 700 }}>
                    {invoice.realizationDate ? `от ${formatDateOnly(invoice.realizationDate)}` : 'Дата реализации не указана'}
                  </Typography>
                </Box>
              </Stack>
            </MenuItem>
          ))}
        </Menu>
      </Box>
    );
  }

  if (readOnly) {
    const pending = invoiceGenerationPending;
    return (
      <Box sx={{ gridColumn: wide ? 'span 2' : 'auto', minWidth: 0 }}>
        <Button
          fullWidth
          variant="outlined"
          disabled={requestingInvoice || pending}
          onClick={() => void requestInvoice()}
          startIcon={requestingInvoice || pending ? <CircularProgress size={14} /> : <Ionicons name="cloud-download-outline" size={16} color="var(--co-accent)" />}
          sx={{ height: 40, justifyContent: 'flex-start', borderRadius: '12px', borderColor: 'var(--co-line)', color: 'var(--co-text)', bgcolor: 'var(--co-background)', px: 1, fontSize: 12, fontWeight: 700, textTransform: 'none' }}
        >
          {pending ? 'Счёт формируется' : 'Запросить счёт'}
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ gridColumn: wide ? 'span 2' : 'auto', minWidth: 0 }}>
      <Box component="label" sx={{ minHeight: 40, border: '1px solid var(--co-line)', borderRadius: '7px', bgcolor: readOnly ? 'var(--co-background)' : 'var(--co-surface)', px: 0.8, display: 'flex', alignItems: 'center', gap: 0.65, cursor: readOnly ? 'default' : 'pointer' }}>
        <Ionicons name="receipt-outline" size={16} color={readOnly ? 'var(--co-muted)' : 'var(--co-muted)'} />
        <Typography sx={{ minWidth: 0, flex: 1, fontSize: 12, fontWeight: 700, color: readOnly ? 'var(--co-muted)' : 'var(--co-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Отправить счёт автоматически
        </Typography>
        <Checkbox
          checked={!!workspace.draft.invoiceRequested}
          disabled={readOnly}
          onChange={(event) => workspace.patchDraft({ invoiceRequested: event.target.checked })}
          size="small"
          sx={{ p: 0.15, color: 'var(--co-muted)', '&.Mui-checked': { color: 'var(--co-accent)' } }}
          slotProps={{
            input: { 'aria-label': 'Отправить счёт автоматически' }
          }}
        />
      </Box>
    </Box>
  );
}

function getDraftItemImageUri(item: DraftItem | any) {
  return getProductGalleryImages(item)[0]?.thumbUrl || PRODUCT_IMAGE_PLACEHOLDER_URI;
}

function getProductGalleryImages(item: DraftItem | any): ProductGalleryImage[] {
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

function statusTone(status: string) {
  if (status === 'CANCELLED' || status === 'REJECTED') return 'error';
  if (status === 'SENT_TO_1C' || status === 'SYNCED' || status === 'CONFIRMED' || status === 'COMPLETED' || status === 'CLOSED') return 'success';
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
  ) return 'warning';
  return 'default';
}

function orderListTitle(order: ClientOrder) {
  if (order.number1c) {
    const date = formatDateOnly(order.date1c);
    return date === '—' ? order.number1c : `${order.number1c} от ${date}`;
  }
  return `Черновик ${getClientOrderDisplayNumber(order)}`;
}

function orderStatusChipSx(order: ClientOrder) {
  const status = getOrderDisplayStatus(order);
  if (status === 'CANCELLED' || status === 'REJECTED') {
    return { bgcolor: 'var(--co-danger-soft)', color: 'var(--co-danger)' };
  }
  if (status === 'SHIPPING_IN_PROGRESS') {
    return { bgcolor: 'var(--co-warning-soft)', color: 'var(--co-warning)' };
  }
  if (statusTone(status) === 'warning') {
    return { bgcolor: 'var(--co-soft)', color: 'var(--co-accent)' };
  }
  if (statusTone(status) === 'success') {
    return { bgcolor: 'var(--co-success-soft)', color: 'var(--co-success)' };
  }
  return { bgcolor: 'var(--co-panel)', color: 'var(--co-text)' };
}

function SelectionButton(props: { label: string; value?: string | null; onClick: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <Button
      variant="outlined"
      onClick={props.onClick}
      disabled={props.disabled}
      sx={{
        justifyContent: 'space-between',
        textTransform: 'none',
        borderRadius: '8px',
        px: 1.1,
        py: 0.3,
        minHeight: 32,
        mt: 0.35,
        position: 'relative',
        overflow: 'visible',
      }}
      fullWidth
    >
      <Typography sx={{ position: 'absolute', top: -5, left: 10, px: 0.35, bgcolor: 'var(--co-surface)', fontSize: 12, color: 'var(--co-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>
        {props.label}
      </Typography>
      <Stack
        direction="row"
        spacing={0.75}
        sx={{
          alignItems: "center",
          minWidth: 0,
          width: '100%'
        }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--co-text)', textAlign: 'left', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '26px' }}>{props.value || 'Выбрать'}</Typography>
        {props.loading ? <CircularProgress size={15} thickness={4.5} /> : null}
      </Stack>
    </Button>
  );
}

function choiceKey(value?: string | null) {
  return value ?? '';
}

function unsupportedChoiceValue(choices: SegmentedChoice[], value?: string | null) {
  if (!value) return null;
  return choices.some((choice) => choice.value === value) ? null : value;
}

function SegmentedChoiceField(props: {
  label: string;
  value?: string | null;
  choices: SegmentedChoice[];
  disabled?: boolean;
  onChange: (value: string | null) => void;
  sx?: any;
}) {
  const currentKey = choiceKey(props.value);
  const unsupported = unsupportedChoiceValue(props.choices, props.value);
  return (
    <Stack spacing={0.35} sx={{ minWidth: 0, ...props.sx }}>
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--co-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>
        {props.label}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${props.choices.length}, minmax(0, 1fr))`,
          minHeight: 30,
          borderRadius: '8px',
          border: '1px solid var(--co-line)',
          overflow: 'hidden',
          bgcolor: props.disabled ? 'var(--co-background)' : 'var(--co-surface)',
        }}
      >
        {props.choices.map((choice, index) => {
          const selected = choiceKey(choice.value) === currentKey && !unsupported;
          return (
            <Button
              key={choiceKey(choice.value) || '__default__'}
              variant="text"
              disabled={props.disabled}
              onClick={() => props.onChange(choice.value)}
              sx={{
                minWidth: 0,
                minHeight: 28,
                px: 0.75,
                py: 0,
                borderRadius: 0,
                borderRight: index === props.choices.length - 1 ? 'none' : '1px solid var(--co-line)',
                bgcolor: selected ? 'var(--co-soft)' : 'transparent',
                color: selected ? 'var(--co-accent)' : props.disabled ? 'var(--co-muted)' : 'var(--co-text)',
                fontSize: 12,
                fontWeight: 700,
                textTransform: 'none',
                lineHeight: 1.1,
                '&:hover': { bgcolor: selected ? 'var(--co-soft)' : 'var(--co-background)' },
              }}
            >
              {choice.label}
            </Button>
          );
        })}
      </Box>
      {unsupported ? (
        <Typography sx={{ fontSize: 12, color: '#B45309', fontWeight: 600, lineHeight: 1.15 }}>
          Текущее из 1С: {unsupported}
        </Typography>
      ) : null}
    </Stack>
  );
}

function CompactTextField(props: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Box sx={{ position: 'relative', minWidth: 0, mt: 0.35 }}>
      <Typography sx={{ position: 'absolute', top: -5, left: 10, zIndex: 1, px: 0.35, bgcolor: 'var(--co-surface)', fontSize: 12, fontWeight: 600, color: 'var(--co-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>
        {props.label}
      </Typography>
      <TextField
        fullWidth
        size="small"
        placeholder={props.placeholder || 'Поиск'}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        sx={{
          '& .MuiInputBase-root': { height: 40, borderRadius: '12px', fontSize: 14, fontWeight: 600 },
          '& .MuiInputBase-input': { py: 0, lineHeight: '30px' },
        }}
      />
    </Box>
  );
}

function CompactSelectField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  renderValue?: (value: string) => React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ position: 'relative', minWidth: 0, mt: 0.35 }}>
      <Typography sx={{ position: 'absolute', top: -5, left: 10, zIndex: 1, px: 0.35, bgcolor: 'var(--co-surface)', fontSize: 12, fontWeight: 600, color: 'var(--co-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>
        {props.label}
      </Typography>
      <TextField
        select
        fullWidth
        size="small"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        sx={{
          '& .MuiInputBase-root': { height: 40, borderRadius: '12px', fontSize: 14, fontWeight: 600 },
          '& .MuiSelect-select': { py: 0, lineHeight: '32px' },
        }}
        slotProps={{
          select: {
            displayEmpty: true,
            renderValue: (selected) => props.renderValue ? props.renderValue(String(selected || '')) : String(selected || ''),
          }
        }}
      >
        {props.children}
      </TextField>
    </Box>
  );
}

function getPickerItemTaxMeta(kind: PickerKind | null, item: any) {
  if (kind !== 'counterparty' && kind !== 'filterCounterparty') return '';
  return getCounterpartyTaxMeta(item);
}
function getPickerItemKey(kind: PickerKind | null, item: any, index: number) {
  return `${kind || 'picker'}-${item.guid || item.code || item.name || item.fullAddress || item.number || index}`;
}

function getQuantityControlWidthPx(value: unknown, buttonSize: number, minInputWidth: number, maxInputWidth: number) {
  return getQuantityInputWidthPx(value, minInputWidth, maxInputWidth) + buttonSize * 2 + 4;
}

function receiptPriceLabel(item: any) {
  return item?.receiptPrice === null || item?.receiptPrice === undefined
    ? 'Себестоимость —'
    : `Себестоимость ${formatMoney(item.receiptPrice, item.currency)}`;
}

function productPickerMetaParts(item: any) {
  const salePrice = item?.basePrice ?? item?.price;
  return {
    code: item?.code || 'Без кода',
    receiptPrice: salePrice === null || salePrice === undefined
      ? '—'
      : formatMoney(salePrice, item.currency),
    stock: formatStockLabel(item?.stock, item?.baseUnit) || '—',
  };
}

function draftItemMetaParts(item: any) {
  const receiptPrice = item?.receiptPrice === null || item?.receiptPrice === undefined
    ? '—'
    : formatMoney(item.receiptPrice, item.currency);
  return {
    code: item?.productCode || 'Без кода',
    receiptPrice,
    stock: formatStockLabel(item?.stock, item?.baseUnit) || '—',
  };
}

function packageSelectValue(item: DraftItem | any) {
  if (item.packageGuid) return item.packageGuid;
  return '__base__';
}

function DraftItemMeta({ item }: { item: any }) {
  const meta = draftItemMetaParts(item);
  const iconSx = { display: 'inline-flex', alignItems: 'center', color: 'var(--co-muted)', mr: 0.35, verticalAlign: 'text-bottom' };
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0, flexWrap: 'wrap' }}>
      <Box component="span">{meta.code}</Box>
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
        <Box component="span" sx={iconSx}><Ionicons name="pricetag-outline" size={11} color="inherit" /></Box>
        {meta.receiptPrice}
      </Box>
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
        <Box component="span" sx={iconSx}><Ionicons name="cube-outline" size={11} color="inherit" /></Box>
        {meta.stock}
      </Box>
    </Box>
  );
}

function stepQuantity(item: any, direction: 1 | -1) {
  return stepWebQuantity(item.quantity, isWeightDraftItem(item), direction);
}

const compactInputSx = {
  '& .MuiInputBase-root': { height: 28, borderRadius: '6px', fontSize: 12 },
  '& .MuiInputBase-input': { py: 0, fontSize: 12, lineHeight: '28px' },
  '& .MuiFormHelperText-root': { mx: 0, mt: 0.25, fontSize: 12, lineHeight: 1.1 },
} as const;

function PickerListItem(props: {
  item: any;
  kind: PickerKind | null;
  onSelect: (item: any) => void;
  onOpenImages?: (item: any) => void;
  isFirst?: boolean;
  disabled?: boolean;
  note?: string;
  selected?: boolean;
}) {
  const title = getPickerItemTitle(props.item);
  const meta = getPickerItemMeta(props.kind, props.item);
  const taxMeta = getPickerItemTaxMeta(props.kind, props.item);
  const disabled = !!props.disabled;

  if (props.kind === 'product') {
    return (
      <ProductPickerListItem
        item={props.item as ClientOrderProduct}
        onSelect={props.onSelect as (item: ClientOrderProduct) => void}
        onOpenImages={props.onOpenImages as ((item: ClientOrderProduct) => void) | undefined}
        isFirst={props.isFirst}
        disabled={props.disabled}
        note={props.note}
        selected={props.selected}
      />
    );
  }

  return (
    <Box
      component="button"
      type="button"
      disabled={disabled}
      onClick={() => {
        if (!disabled) props.onSelect(props.item);
      }}
      sx={{
        width: '100%',
        border: 0,
        borderTop: props.isFirst ? '1px solid var(--co-line)' : 0,
        borderBottom: '1px solid var(--co-line)',
        background: 'var(--co-surface)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: 1.5,
        alignItems: 'center',
        px: 1.2,
        py: taxMeta ? 1.0 : 0.85,
        textAlign: 'left',
        opacity: disabled ? 0.55 : 1,
        transformOrigin: 'center',
        transition: 'background-color 160ms ease, color 160ms ease, transform 110ms ease',
        '&:hover': { backgroundColor: disabled ? 'var(--co-surface)' : 'var(--co-panel)' },
        '&:active': disabled ? {} : { transform: 'scale(0.985)', backgroundColor: 'var(--co-line)' },
        '&:focus-visible': { outline: '2px solid var(--co-accent)', outlineOffset: '-2px' },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{
          fontWeight: 600,
          color: 'var(--co-text)',
          fontSize: 13,
          lineHeight: 1.2,
          display: '-webkit-box',
          WebkitLineClamp: 1,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>{title}</Typography>
        {meta ? <Typography sx={{ fontSize: 12, color: 'var(--co-muted)', mt: 0.3 }}>{meta}</Typography> : null}
        {taxMeta ? <Typography sx={{ fontSize: 12, color: 'var(--co-text)', fontWeight: 600, mt: 0.25 }}>{taxMeta}</Typography> : null}
        {props.note ? <Typography sx={{ fontSize: 12, color: 'var(--co-danger)', fontWeight: 600, mt: 0.35 }}>{props.note}</Typography> : null}
      </Box>
    </Box>
  );
}

function ProductPickerListItem(props: {
  item: ClientOrderProduct;
  onSelect: (item: ClientOrderProduct) => void;
  onOpenImages?: (item: ClientOrderProduct) => void;
  isFirst?: boolean;
  disabled?: boolean;
  note?: string;
  selected?: boolean;
}) {
  const title = props.item.name || getPickerItemTitle(props.item);
  const stockAvailable = Number(props.item.stock?.available ?? props.item.stock?.quantity ?? 0);
  const disabled = !!props.disabled;
  const selected = !!props.selected;
  const meta = productPickerMetaParts(props.item);
  const imageUri = getDraftItemImageUri(props.item);
  const hasGalleryImages = getProductGalleryImages(props.item).length > 0;
  const iconSx = { display: 'inline-flex', alignItems: 'center', color: 'var(--co-muted)', mr: 0.35, verticalAlign: 'text-bottom' };

  return (
    <Box
      component="button"
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={() => {
        if (!disabled) props.onSelect(props.item);
      }}
      sx={{
        width: '100%',
        border: 0,
        borderTop: props.isFirst ? '1px solid var(--co-line)' : 0,
        borderBottom: '1px solid var(--co-line)',
        background: selected ? 'var(--co-soft)' : 'var(--co-surface)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 1.2,
        px: 1.35,
        py: 1.0,
        textAlign: 'left',
        opacity: disabled ? 0.55 : 1,
        transition: 'background-color 160ms ease, color 160ms ease, transform 110ms ease',
        '&:hover': { backgroundColor: disabled ? 'var(--co-surface)' : selected ? 'var(--co-soft)' : 'var(--co-background)' },
        '&:active': disabled ? {} : { transform: 'scale(0.985)', backgroundColor: 'var(--co-line)' },
        '&:focus-visible': { outline: '2px solid var(--co-accent)', outlineOffset: '-2px' },
      }}
    >
      <Box
        component="span"
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          if (!hasGalleryImages) return;
          props.onOpenImages?.(props.item);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          if (!hasGalleryImages) return;
          props.onOpenImages?.(props.item);
        }}
        sx={{ borderRadius: '10px', flexShrink: 0, cursor: hasGalleryImages ? 'zoom-in' : 'default', '&:focus-visible': { outline: '2px solid var(--co-accent)', outlineOffset: 2 } }}
      >
        <WebProductImage
          src={imageUri}
          alt=""
          spinnerSize={18}
          sx={{ width: 64, height: 64, borderRadius: '10px', bgcolor: 'transparent' }}
        />
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          sx={{
            fontWeight: 600,
            color: 'var(--co-text)',
            fontSize: 14,
            lineHeight: 1.2,
          }}
        >
          {title}
        </Typography>
        <Box sx={{ mt: 0.55, display: 'flex', alignItems: 'center', gap: 0.9, flexWrap: 'wrap', minWidth: 0 }}>
          <Typography sx={{ fontSize: 12, color: 'var(--co-muted)', fontWeight: 700 }}>{meta.code}</Typography>
          <Typography component="div" sx={{ fontSize: 12, color: 'var(--co-muted)', fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>
            <Box component="span" sx={iconSx}><Ionicons name="pricetag-outline" size={11} color="inherit" /></Box>
            {meta.receiptPrice}
          </Typography>
          <Typography component="div" sx={{ fontSize: 12, color: stockAvailable > 0 ? 'var(--co-success)' : 'var(--co-success)', fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>
            <Box component="span" sx={iconSx}><Ionicons name="cube-outline" size={11} color="inherit" /></Box>
            {meta.stock}
          </Typography>
        </Box>
        {purchaseHistoryLabel(props.item.lastPurchasedDate) ? <Typography component="div" sx={{ mt: 0.35, fontSize: 12, color: 'var(--co-success)' }}><Ionicons name="time-outline" size={14} color="inherit" /> {purchaseHistoryLabel(props.item.lastPurchasedDate)}</Typography> : null}
        {props.note ? <Typography sx={{ mt: 0.35, fontSize: 12, color: 'var(--co-danger)', fontWeight: 600 }}>{props.note}</Typography> : null}
        {selected ? (
          <Box sx={{ mt: 0.45, display: 'inline-flex', alignItems: 'center', gap: 0.35, color: 'var(--co-accent)', fontSize: 12, fontWeight: 700 }}>
            <Ionicons name="checkmark-circle" size={13} color="var(--co-accent)" />
            Добавить в заказ
          </Box>
        ) : null}
      </Box>
      <Box sx={{ width: 28, display: 'grid', placeItems: 'center', color: selected ? 'var(--co-accent)' : disabled ? 'var(--co-line)' : 'var(--co-muted)' }}>
        <Ionicons name={selected ? 'checkmark-circle' : disabled ? 'ban-outline' : 'add-circle-outline'} size={22} color="inherit" />
      </Box>
    </Box>
  );
}

type QuickLookupLoadResult<T> = { items: T[]; meta?: { total?: number } };

type QuickLookupFieldProps<T extends { guid?: string | null }> = {
  kind: PickerKind;
  label: string;
  value: T | null;
  placeholder?: string;
  disabled?: boolean;
  loadOptions: (args: { search: string; limit: number; offset: number }) => Promise<QuickLookupLoadResult<T>>;
  onSelect: (item: T) => void | Promise<void>;
  onOpenDetails?: () => void;
  detailsDisabled?: boolean;
  detailsTooltip?: string;
  beforeDetailsAdornment?: React.ReactNode;
  loadingAdornment?: boolean;
  dense?: boolean;
  flat?: boolean;
  popperMinWidth?: number;
  inputRef?: React.Ref<HTMLInputElement>;
};

function QuickLookupField<T extends { guid?: string | null }>(props: QuickLookupFieldProps<T>) {
  const { kind, label, value, placeholder, disabled, loadOptions, onSelect, onOpenDetails, detailsDisabled, detailsTooltip, beforeDetailsAdornment, loadingAdornment, dense, flat, popperMinWidth } = props;
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<T[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(false);
  const [offset, setOffset] = React.useState(0);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const anchorRef = React.useRef<HTMLDivElement | null>(null);
  const requestIdRef = React.useRef(0);
  const appendLoadingRef = React.useRef(false);
  const valueLabel = value ? getPickerItemTitle(value) : '';
  const showDetailsAction = false;
  const inputDisabled = !!disabled && !showDetailsAction;
  const showSearchLoadingAdornment = loading || loadingAdornment;
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedValueLabel = valueLabel.trim().toLowerCase();
  const useDefaultListing = !normalizedQuery || normalizedQuery === normalizedValueLabel;

  React.useEffect(() => {
    if (open) return;
    setQuery(valueLabel);
  }, [open, valueLabel]);

  const loadPage = React.useCallback(async (search: string, nextOffset = 0, append = false) => {
    if (append && appendLoadingRef.current) return;
    if (append) appendLoadingRef.current = true;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const result = await loadOptions({ search, limit: 25, offset: nextOffset });
      if (requestIdRef.current !== requestId) return;
      const nextItems = kind === 'deliveryAddress'
        ? sortDeliveryAddressOptions(result.items || [])
        : result.items || [];
      setItems((prev) => {
        const merged = append ? [...prev, ...nextItems] : nextItems;
        return kind === 'deliveryAddress' ? sortDeliveryAddressOptions(merged as T[]) : merged;
      });
      setOffset(nextOffset + nextItems.length);
      setHasMore(hasMorePage(nextItems.length, 25, nextOffset, result.meta?.total));
      if (!append) setActiveIndex(0);
    } catch {
      if (requestIdRef.current !== requestId) return;
      if (!append) setItems([]);
      setHasMore(false);
    } finally {
      if (append) appendLoadingRef.current = false;
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, [loadOptions]);

  React.useEffect(() => {
    if (!open || disabled) return;
    const searchValue = useDefaultListing ? '' : query;
    const timer = setTimeout(() => void loadPage(searchValue, 0, false), searchValue ? 200 : 0);
    return () => clearTimeout(timer);
  }, [disabled, loadPage, open, query, useDefaultListing]);

  const visibleItems = React.useMemo(() => {
    if (!value?.guid || !useDefaultListing) return items;
    const rest = items.filter((item) => item.guid !== value.guid);
    return [value, ...rest];
  }, [items, useDefaultListing, value]);

  const close = React.useCallback(() => {
    requestIdRef.current += 1;
    appendLoadingRef.current = false;
    setOpen(false);
    setLoading(false);
    setItems([]);
    setQuery(valueLabel);
  }, [valueLabel]);

  const selectItem = React.useCallback(async (item: T) => {
    requestIdRef.current += 1;
    await onSelect(item);
    setLoading(false);
    setQuery(getPickerItemTitle(item));
    setOpen(false);
    setItems([]);
  }, [onSelect]);

  const handleScroll = React.useCallback((event: React.UIEvent<HTMLDivElement>) => {
    if (loading || !hasMore) return;
    const target = event.currentTarget;
    const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remaining > 140) return;
    void loadPage(useDefaultListing ? '' : query, offset, true);
  }, [hasMore, loadPage, loading, offset, query, useDefaultListing]);

  const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((prev) => Math.min(prev + 1, Math.max(visibleItems.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (event.key === 'Enter' && open && visibleItems[activeIndex]) {
      event.preventDefault();
      void selectItem(visibleItems[activeIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }, [activeIndex, close, open, selectItem, visibleItems]);

  return (
    <ClickAwayListener onClickAway={close}>
      <Box ref={anchorRef} sx={{ position: 'relative', minWidth: 0, mt: dense ? 0 : 0.35 }}>
        {label ? (
          <Typography sx={{ position: 'absolute', top: -5, left: 10, zIndex: 1, px: 0.35, bgcolor: disabled ? 'var(--co-background)' : 'var(--co-surface)', fontSize: 12, fontWeight: 600, color: disabled ? 'var(--co-muted)' : 'var(--co-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>
            {label}
          </Typography>
        ) : null}
        <TextField
          fullWidth
          size="small"
          inputRef={props.inputRef}
          placeholder={placeholder || 'Поиск'}
          value={query}
          disabled={inputDisabled}
          onFocus={(event) => {
            if (disabled) return;
            setOpen(true);
            event.currentTarget.select();
          }}
          onChange={(event) => {
            if (disabled) return;
            requestIdRef.current += 1;
            setItems([]);
            setLoading(true);
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          sx={[
            {
              '& .MuiInputBase-root': { height: dense ? 36 : 40, borderRadius: flat ? 0 : '12px', fontSize: 14, fontWeight: 600, alignItems: 'center', bgcolor: flat ? 'transparent' : disabled ? 'var(--co-background)' : 'var(--co-surface)' },
              '& .MuiInputBase-input': { py: 0, lineHeight: dense ? '28px' : '34px' },
            },
            disabled ? {
              '& .MuiInputBase-root': { color: 'var(--co-muted)' },
              '& .MuiInputBase-input': { color: 'var(--co-muted)', WebkitTextFillColor: 'var(--co-muted)' },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--co-line)' },
            } : {},
            flat ? {
              '& .MuiOutlinedInput-notchedOutline': { border: 0 },
              '& .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderBottom: '1px solid var(--co-accent)' },
            } : {},
          ]}
          slotProps={{
            htmlInput: {'aria-label': label || 'Поиск', 'aria-expanded': open, 'aria-autocomplete': 'list'},
            input: (showDetailsAction || beforeDetailsAdornment || showSearchLoadingAdornment) ? {
              readOnly: !!disabled,
              endAdornment: (
                <Stack
                  direction="row"
                  spacing={0.1}
                  sx={{
                    alignItems: "center",
                    mr: -0.4
                  }}>
                  {beforeDetailsAdornment}
                  {showSearchLoadingAdornment ? (
                    <Box sx={{ width: 24, height: 24, display: 'grid', placeItems: 'center' }}>
                      <CircularProgress size={15} thickness={4.5} />
                    </Box>
                  ) : null}
                  {showDetailsAction ? (
                    <Tooltip title={detailsTooltip || (detailsDisabled ? 'Сначала выберите значение' : 'Открыть карточку')} arrow>
                      <span>
                        <IconButton
                          size="small"
                          disabled={detailsDisabled}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (!detailsDisabled) onOpenDetails?.();
                          }}
                          sx={{
                            width: 24,
                            height: 24,
                            color: detailsDisabled ? 'var(--co-line)' : 'var(--co-muted)',
                            transition: 'background-color 140ms ease, color 140ms ease, transform 90ms ease',
                            '&:hover': { bgcolor: detailsDisabled ? 'transparent' : 'var(--co-soft)', color: detailsDisabled ? 'var(--co-line)' : 'var(--co-accent)' },
                            '&:active': detailsDisabled ? {} : { transform: 'scale(0.92)' },
                          }}
                        >
                          <Ionicons name="search-outline" size={14} color="inherit" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  ) : null}
                </Stack>
              ),
            } : disabled ? { readOnly: true } : undefined
          }}
        />
        <Popper
          open={open && !disabled}
          anchorEl={anchorRef.current}
          placement="bottom-start"
          sx={{ zIndex: 1500, width: Math.max(anchorRef.current?.clientWidth || 260, popperMinWidth || 0) }}
        >
          <Paper variant="outlined" sx={{ mt: 0.35, maxHeight: 280, overflowY: 'auto', borderRadius: '6px', boxShadow: '0 12px 32px rgba(15, 23, 42, 0.16)' }} onScroll={handleScroll}>
            {!loading && !visibleItems.length ? (
              <Typography sx={{ px: 1, py: 0.8, fontSize: 12, color: 'var(--co-muted)' }}>Ничего не найдено</Typography>
            ) : null}
            {visibleItems.map((item, index) => {
              const title = getPickerItemTitle(item);
              const meta = getPickerItemMeta(kind, item);
              const taxMeta = getPickerItemTaxMeta(kind, item);
              const active = index === activeIndex;
              const selected = !!value?.guid && value.guid === item.guid;
              return (
                <Box
                  key={`${kind}-${item.guid || index}`}
                  component="button"
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => void selectItem(item)}
                  sx={{
                    width: '100%',
                    border: 0,
                    borderBottom: '1px solid var(--co-line)',
                    background: active ? 'var(--co-soft)' : 'var(--co-surface)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    px: 1,
                    py: 0.75,
                    transition: 'background-color 140ms ease, transform 90ms ease',
                    '&:hover': { backgroundColor: 'var(--co-soft)' },
                    '&:active': { transform: 'scale(0.99)', backgroundColor: 'var(--co-soft)' },
                  }}
                >
                  <Stack
                    direction="row"
                    spacing={0.75}
                    sx={{
                      alignItems: "flex-start",
                      minWidth: 0
                    }}>
                    <Box sx={{ width: 16, pt: 0.1, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                      {selected ? <Ionicons name="checkmark-circle" size={15} color="var(--co-success)" /> : null}
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'var(--co-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</Typography>
                      {meta ? <Typography sx={{ fontSize: 12, color: selected ? 'var(--co-success)' : 'var(--co-muted)', fontWeight: selected ? 800 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</Typography> : null}
                      {taxMeta ? <Typography sx={{ fontSize: 12, color: 'var(--co-text)', fontWeight: 600, mt: 0.1 }}>{taxMeta}</Typography> : null}
                    </Box>
                  </Stack>
                </Box>
              );
            })}
            {loading ? <Box sx={{ height: 2, bgcolor: 'var(--co-accent)', opacity: 0.18 }} /> : null}
          </Paper>
        </Popper>
      </Box>
    </ClickAwayListener>
  );
}

export default function ClientOrdersWebScreen() {
  const { orderGuid: startOrderGuidParam } = useLocalSearchParams<{ orderGuid?: string | string[] }>();
  const startOrderGuid = React.useMemo(() => {
    const value = Array.isArray(startOrderGuidParam) ? startOrderGuidParam[0] : startOrderGuidParam;
    return String(value || '').trim().toLowerCase();
  }, [startOrderGuidParam]);
  const handledStartOrderGuidRef = React.useRef<string | null>(null);
  const { width: viewportWidth } = useWindowDimensions();
  const colors = useAppSurfaceTheme();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = React.useState(viewportWidth);
  React.useEffect(() => {
    if (!rootRef.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => { if (entry?.contentRect.width) setContainerWidth(entry.contentRect.width); });
    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, []);
  const layoutTier = resolveClientOrdersLayoutTier(containerWidth);
  const isSinglePane = containerWidth < 1060;
  const isPhoneDialog = viewportWidth < 760;
  const [responsivePane, setResponsivePane] = React.useState<ResponsivePane>(startOrderGuid ? 'editor' : 'customers');
  const [webEditorSection, setWebEditorSection] = React.useState<'header' | 'items'>('items');
  const [detailsExpanded, setDetailsExpanded] = React.useState(false);
  const [filtersExpanded, setFiltersExpanded] = React.useState(false);
  const [attentionOnly, setAttentionOnly] = React.useState(false);
  const [tableDensity, setTableDensity] = React.useState<'comfortable' | 'compact'>(() => {
    try { return window.localStorage.getItem('clientOrders.web.tableDensity') === 'compact' ? 'compact' : 'comfortable'; } catch { return 'comfortable'; }
  });
  React.useEffect(() => { try { window.localStorage.setItem('clientOrders.web.tableDensity', tableDensity); } catch { /* Private browsing may disable storage. */ } }, [tableDensity]);
  const ordersPaneRef = React.useRef<HTMLDivElement | null>(null);
  const ordersListScrollRef = React.useRef<HTMLDivElement | null>(null);
  const editorPaneRef = React.useRef<HTMLDivElement | null>(null);
  const editorScrollRef = React.useRef<HTMLDivElement | null>(null);
  const itemsTableScrollRef = React.useRef<HTMLDivElement | null>(null);
  const editorHeaderSectionRef = React.useRef<HTMLDivElement | null>(null);
  const [ordersPaneWidth, setOrdersPaneWidth] = React.useState(0);
  const [editorPaneWidth, setEditorPaneWidth] = React.useState(0);
  const [editorScrollHeight, setEditorScrollHeight] = React.useState(0);
  const [editorHeaderSectionHeight, setEditorHeaderSectionHeight] = React.useState(0);
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
  const workspace = useClientOrdersWorkspace({ confirmDiscard: requestDiscardConfirm, autoSelectLatestDraft: isSinglePane ? undefined : false });
  const [documentMenuAnchor, setDocumentMenuAnchor] = React.useState<HTMLElement | null>(null);
  const router = useRouter();
  const focusProductAfterClient = React.useRef(false);
  const clientInputRef = React.useRef<HTMLInputElement | null>(null);
  const organizationInputRef = React.useRef<HTMLInputElement | null>(null);
  const cellCheckpoints = React.useRef(new Map<string, Partial<DraftItem>>());
  const workspaceRef = React.useRef(workspace);
  workspaceRef.current = workspace;
  const { setHeaderOverride } = useServicesHeaderSlot();
  React.useEffect(() => {
    setHeaderOverride({ hidden: true });
    return () => setHeaderOverride(null);
  }, [setHeaderOverride]);
  const pageTopInset = 0;
  const background = colors.background;
  const [inspectorOpen, setInspectorOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [headerOpen, setHeaderOpen] = React.useState(false);
  const [filterCounterparty, setFilterCounterparty] = React.useState<ClientOrderCounterpartyOption | null>(null);
  const [pickerKind, setPickerKind] = React.useState<PickerKind | null>(null);
  const [purchasedOnly, setPurchasedOnly] = React.useState(false);
  const purchaseHistory = useCustomerPurchaseHistory({
    userId: workspace.offlineUserId, organizationGuid: workspace.draft.organizationGuid,
    counterpartyGuid: workspace.draft.counterpartyGuid, enabled: pickerKind === 'product', online: workspace.online,
  });
  const purchaseHistoryRevision = purchasedOnly ? purchaseHistory.snapshot?.fetchedAt || 'missing' : '';
  const purchaseHistoryReadyForFilter = !purchasedOnly || purchaseHistory.ready;
  const [pickerSearch, setPickerSearch] = React.useState('');
  const [pickerItems, setPickerItems] = React.useState<any[]>([]);
  const [pickerLoading, setPickerLoading] = React.useState(false);
  const [pickerLoadError, setPickerLoadError] = React.useState(false);
  const [pickerHasMore, setPickerHasMore] = React.useState(false);
  const [pickerOffset, setPickerOffset] = React.useState(0);
  const [selectedProducts, setSelectedProducts] = React.useState<ProductSelectionMap>(() => new Map());
  const [confirmCloseProductPickerOpen, setConfirmCloseProductPickerOpen] = React.useState(false);
  const [productInStockOnly, setProductInStockOnly] = React.useState(() => {
    if (typeof window === 'undefined') return true;
    return resolveStoredBooleanDefaultTrue(window.localStorage.getItem(PRODUCT_IN_STOCK_ONLY_STORAGE_KEY));
  });
  const [counterpartyManagerOnly, setCounterpartyManagerOnly] = React.useState(() => {
    if (typeof window === 'undefined') return true;
    return resolveStoredBooleanDefaultTrue(window.localStorage.getItem(COUNTERPARTY_MANAGER_ONLY_STORAGE_KEY));
  });
  const pickerRequestIdRef = React.useRef(0);
  const pickerAppendLoadingRef = React.useRef(false);
  const pickerLoadSignatureRef = React.useRef('');
  const [settingsDraft, setSettingsDraft] = React.useState({
    deliveryDateMode: 'NEXT_DAY',
    deliveryDateOffsetDays: 1,
    fixedDeliveryDate: '',
  });
  const [confirmSubmitOpen, setConfirmSubmitOpen] = React.useState(false);
  const [confirmSaveOpen, setConfirmSaveOpen] = React.useState(false);
  const [confirmCopyOpen, setConfirmCopyOpen] = React.useState<'copy' | 'save-copy' | null>(null);
  const [confirmCancelOpen, setConfirmCancelOpen] = React.useState(false);
  const [confirmClearItemsOpen, setConfirmClearItemsOpen] = React.useState(false);
  const [pendingPriceTypeAction, setPendingPriceTypeAction] = React.useState<PendingPriceTypeAction | null>(null);
  const [itemsSearch, setItemsSearch] = React.useState('');
  const [productImagePreview, setProductImagePreview] = React.useState<{ title: string; subtitle?: string | null; images: ProductGalleryImage[]; index: number } | null>(null);
  const openProductGallery = React.useCallback((item: any, index = 0) => {
    const images = getProductGalleryImages(item);
    if (!images.length) return;
    setProductImagePreview({
      title: item?.productName || item?.name || getPickerItemTitle(item) || 'Изображение товара',
      subtitle: item?.productCode || item?.productArticle || item?.productSku || item?.code || item?.article || item?.sku || null,
      images,
      index: Math.min(Math.max(index, 0), images.length - 1),
    });
  }, []);
  const [referenceDetailsOpen, setReferenceDetailsOpen] = React.useState(false);
  const [referenceDetailsLoading, setReferenceDetailsLoading] = React.useState(false);
  const [referenceDetailsError, setReferenceDetailsError] = React.useState<string | null>(null);
  const [referenceDetails, setReferenceDetails] = React.useState<ClientOrderReferenceDetails | null>(null);
  const [orderContextMenu, setOrderContextMenu] = React.useState<{ mouseX: number; mouseY: number; order: ClientOrder } | null>(null);
  const [pendingCancelOrder, setPendingCancelOrder] = React.useState<ClientOrder | null>(null);
  const {
    settings,
    draft,
    searchCounterparties,
    searchAgreements,
    searchContracts,
    searchWarehouses,
    searchDeliveryAddresses,
    searchProducts,
    searchPriceTypes,
    setFilters,
    setOrganization,
    setCounterparty,
    setAgreement,
    setContract,
    setWarehouse,
    setDeliveryAddress,
    setHeaderPriceType,
    resetHeaderPriceTypeToDefault,
    addProduct,
  } = workspace;
  const draftOrganizationGuid = draft.organizationGuid;
  const draftCounterpartyGuid = draft.counterpartyGuid;
  const draftAgreementGuid = draft.agreementGuid;
  const draftWarehouseGuid = draft.warehouseGuid;
  const draftPriceTypeGuid = draft.priceTypeGuid;
  const hasOrderContext = !!draftOrganizationGuid && !!draftCounterpartyGuid;
  const editingLocked = workspace.readOnly || workspace.mutationLocked || workspace.loadingDefaults || workspace.loadingDetail;
  const canLoadMorePickerItems = !!pickerKind && pickerHasMore && !pickerLoading;
  const selectedProductCount = selectedProducts.size;
  const pickerDisplayItems = React.useMemo(() => (
    pickerKind === 'warehouse'
      ? buildWarehousePickerRows(pickerItems as ClientOrderWarehouseOption[])
      : pickerKind === 'product' ? pickerItems.map(item => ({ ...item, lastPurchasedDate: purchaseHistory.dates.get(String(item.guid).toLowerCase()) || null })) : pickerItems
  ), [pickerItems, pickerKind, purchaseHistory.dates]);
  const showOrdersPane = isSinglePane && responsivePane === 'orders';
  React.useEffect(()=>{if(!isSinglePane&&responsivePane==='orders')setResponsivePane('customers');},[isSinglePane,responsivePane]);
  const showEditorPane = responsivePane === 'editor';

  React.useEffect(() => {
    setSelectedProducts((current) => removeOrderItemsFromProductSelection(current, draft.items));
  }, [draft.items]);

  const closePickerImmediately = React.useCallback(() => {
    pickerRequestIdRef.current += 1;
    pickerAppendLoadingRef.current = false;
    pickerLoadSignatureRef.current = '';
    setPickerKind(null);
    setPickerSearch('');
    setPickerItems([]);
    setPickerOffset(0);
    setPickerHasMore(false);
    setSelectedProducts(new Map());
    setConfirmCloseProductPickerOpen(false);
  }, []);

  const requestClosePicker = React.useCallback(() => {
    if (pickerKind === 'product' && selectedProducts.size > 0) {
      setConfirmCloseProductPickerOpen(true);
      return;
    }
    closePickerImmediately();
  }, [closePickerImmediately, pickerKind, selectedProducts.size]);

  const transferSelectedProducts = React.useCallback(() => {
    const addedKeys = transferSelectedProductsToOrder(selectedProducts, draft.items, addProduct, { quantity: 1 });
    setSelectedProducts(new Map());
    closePickerImmediately();
    setWebEditorSection('items');
    setResponsivePane('editor');
    if (addedKeys.length) {
      requestAnimationFrame(() => {
        const scrollElement = itemsTableScrollRef.current || editorScrollRef.current;
        if (scrollElement) scrollElement.scrollTop = scrollElement.scrollHeight;
      });
    }
  }, [addProduct, closePickerImmediately, draft.items, isSinglePane, selectedProducts]);

  const prefetchOrdersIfNeeded = React.useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    const currentWorkspace = workspaceRef.current;
    if (
      !currentWorkspace.hasMoreOrders ||
      currentWorkspace.loadingOrders ||
      currentWorkspace.loadingMoreOrders
    ) {
      return;
    }

    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    const threshold = Math.max(900, element.clientHeight * 1.5);
    if (remaining <= threshold) {
      void currentWorkspace.loadMoreOrders();
    }
  }, []);

  const handleOrdersListScroll = React.useCallback((event: React.UIEvent<HTMLDivElement>) => {
    prefetchOrdersIfNeeded(event.currentTarget);
  }, [prefetchOrdersIfNeeded]);

  React.useEffect(() => {
    if (!showOrdersPane) return;
    const timer = window.setTimeout(() => prefetchOrdersIfNeeded(ordersListScrollRef.current), 0);
    return () => window.clearTimeout(timer);
  }, [
    prefetchOrdersIfNeeded,
    showOrdersPane,
    workspace.hasMoreOrders,
    workspace.loadingMoreOrders,
    workspace.loadingOrders,
    workspace.orders.length,
  ]);

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') return;
    const observers: ResizeObserver[] = [];
    const bind = (
      element: HTMLDivElement | null,
      setter: React.Dispatch<React.SetStateAction<number>>,
      dimension: 'width' | 'height' = 'width',
    ) => {
      if (!element) return;
      const rect = element.getBoundingClientRect();
      setter(dimension === 'width' ? rect.width : rect.height);
      const observer = new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect;
        setter(dimension === 'width' ? (rect?.width ?? 0) : (rect?.height ?? 0));
      });
      observer.observe(element);
      observers.push(observer);
    };
    bind(ordersPaneRef.current, setOrdersPaneWidth);
    bind(editorPaneRef.current, setEditorPaneWidth);
    bind(editorScrollRef.current, setEditorScrollHeight, 'height');
    bind(editorHeaderSectionRef.current, setEditorHeaderSectionHeight, 'height');
    return () => {
      observers.forEach((observer) => observer.disconnect());
    };
  }, [isSinglePane, responsivePane, workspace.hasEditableDocument]);

  const desktopOrdersPaneWidth = 320;
  const effectiveOrdersPaneWidth = isSinglePane ? containerWidth : (ordersPaneWidth || desktopOrdersPaneWidth);
  const effectiveEditorPaneWidth = editorPaneWidth || containerWidth;
  const editorTier = resolveClientOrdersEditorTier(effectiveEditorPaneWidth);
  const ui = getClientOrdersResponsiveMetrics(layoutTier, editorTier);
  const useWideEditorGrid = effectiveEditorPaneWidth >= 1280;
  const useMediumEditorGrid = effectiveEditorPaneWidth >= 1020;
  const useCompactEditorGrid = effectiveEditorPaneWidth >= 760;
  const useCompactTable = !isSinglePane && editorTier === 'compact';
  const useItemCards = isSinglePane || editorTier === 'cards';
  // Keep the actual table and its focused inputs mounted across all web breakpoints.
  const usePhoneCompactItems = false;
  const showSectionSwitcher = false;

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PRODUCT_IN_STOCK_ONLY_STORAGE_KEY, serializeStoredBoolean(productInStockOnly));
  }, [productInStockOnly]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(COUNTERPARTY_MANAGER_ONLY_STORAGE_KEY, serializeStoredBoolean(counterpartyManagerOnly));
  }, [counterpartyManagerOnly]);

  const confirmHeaderPriceTypeChange = React.useCallback((priceType: ClientOrderPriceTypeOption | null) => {
    if (workspace.draft.items.length) {
      setPendingPriceTypeAction({ type: 'change-header', priceType });
      return;
    }
    setHeaderPriceType(priceType);
  }, [setHeaderPriceType, workspace.draft.items.length]);

  const confirmHeaderPriceTypeReset = React.useCallback(() => {
    setPendingPriceTypeAction({ type: 'reset-header' });
  }, []);

  const applyPendingPriceTypeAction = React.useCallback(() => {
    const action = pendingPriceTypeAction;
    setPendingPriceTypeAction(null);
    if (!action) return;
    if (action.type === 'change-header') {
      setHeaderPriceType(action.priceType);
      return;
    }
    resetHeaderPriceTypeToDefault();
  }, [pendingPriceTypeAction, resetHeaderPriceTypeToDefault, setHeaderPriceType]);

  const filteredDraftItems = React.useMemo(() => {
    const query = itemsSearch.trim().toLowerCase();
    if (!query) return workspace.draft.items;
    return workspace.draft.items.filter((item) => [
      item.productName,
      item.productCode,
      item.productArticle,
      item.productSku,
    ].some((value) => (value || '').toLowerCase().includes(query)));
  }, [itemsSearch, workspace.draft.items]);

  const draftItemsPackageLayoutKey = filteredDraftItems.map((item) => (
    `${item.key}:${hasSinglePackage(item) ? 'single' : 'multi'}`
  )).join('|');
  const quantityColumnWidth = useCompactTable ? 96 : 106;

  React.useEffect(() => {
    if (!settings) return;
    setSettingsDraft({
      deliveryDateMode: settings.deliveryDateMode,
      deliveryDateOffsetDays: settings.deliveryDateOffsetDays,
      fixedDeliveryDate: settings.fixedDeliveryDate ? String(settings.fixedDeliveryDate).slice(0, 10) : '',
    });
  }, [settings]);

  React.useEffect(() => {
    if (startOrderGuid && workspace.hasEditableDocument) setResponsivePane('editor');
  }, [workspace.hasEditableDocument, startOrderGuid]);

  const pickerTitle = React.useMemo(() => {
    switch (pickerKind) {
      case 'filterCounterparty': return 'Фильтр по контрагенту';
      case 'organization': return 'Выбор организации';
      case 'counterparty': return 'Выбор контрагента';
      case 'agreement': return 'Выбор соглашения';
      case 'contract': return 'Выбор договора';
      case 'warehouse': return 'Выбор склада';
      case 'deliveryAddress': return 'Выбор адреса доставки';
      case 'priceType': return 'Вид цены';
      case 'product': return 'Подбор товаров';
      default: return '';
    }
  }, [pickerKind]);

  const openPicker = React.useCallback((kind: PickerKind) => {
    pickerRequestIdRef.current += 1;
    pickerAppendLoadingRef.current = false;
    pickerLoadSignatureRef.current = '';
    setPickerKind(kind);
    setPickerSearch('');
    setPickerItems([]);
    setPickerOffset(0);
    setPickerHasMore(false);
    setSelectedProducts(new Map());
    setConfirmCloseProductPickerOpen(false);
  }, []);

  const loadPickerPage = React.useCallback(async (kind: PickerKind, search: string, offset = 0, append = false) => {
    const pageSize = kind === 'warehouse' ? 100 : 25;
    const contextSignature = [
      draftOrganizationGuid || '',
      draftCounterpartyGuid || '',
      draftAgreementGuid || '',
      draftWarehouseGuid || '',
      draftPriceTypeGuid || '',
    ].join(':');
    const productFilter = kind === 'product' ? `${productInStockOnly}:${purchasedOnly}:${purchaseHistoryRevision}` : 'all';
    const counterpartyFilter = (kind === 'counterparty' || kind === 'filterCounterparty') && counterpartyManagerOnly ? 'manager' : 'all';
    const signature = `${kind}|${contextSignature}|${search}|${offset}|${append ? 'append' : 'reset'}|${productFilter}|${counterpartyFilter}`;
    if ((append && pickerAppendLoadingRef.current) || pickerLoadSignatureRef.current === signature) return;
    if (append) pickerAppendLoadingRef.current = true;
    pickerLoadSignatureRef.current = signature;
    const requestId = ++pickerRequestIdRef.current;
    if (!append) setPickerItems([]);
    setPickerLoadError(false);
    setPickerLoading(true);
    try {
      if (pickerNeedsOrderContext(kind) && !hasOrderContext) {
        if (pickerRequestIdRef.current !== requestId) return;
        setPickerItems([]);
        setPickerOffset(offset);
        setPickerHasMore(false);
        return;
      }

      if (kind === 'product' && !purchaseHistoryReadyForFilter) {
        setPickerItems([]);
        setPickerHasMore(false);
        return;
      }

      if (kind === 'organization') {
        const all = settings?.organizations || [];
        const filtered = all.filter((item) => !search || item.name.toLowerCase().includes(search.toLowerCase()) || (item.code || '').toLowerCase().includes(search.toLowerCase()));
        const slice = filtered.slice(offset, offset + pageSize);
        if (pickerRequestIdRef.current !== requestId) return;
        setPickerItems((prev) => (append ? [...prev, ...slice] : slice));
        setPickerOffset(offset + slice.length);
        setPickerHasMore(hasMorePage(slice.length, pageSize, offset, filtered.length));
        return;
      }
      let result;
      switch (kind) {
        case 'filterCounterparty':
        case 'counterparty':
          result = await searchCounterparties({ search, limit: pageSize, offset, managerOnly: counterpartyManagerOnly });
          break;
        case 'agreement':
          result = await searchAgreements({ organizationGuid: draftOrganizationGuid, counterpartyGuid: draftCounterpartyGuid, search, limit: pageSize, offset });
          break;
        case 'contract':
          result = await searchContracts({ organizationGuid: draftOrganizationGuid, counterpartyGuid: draftCounterpartyGuid, search, limit: pageSize, offset });
          break;
        case 'warehouse':
          result = await searchWarehouses({ organizationGuid: draftOrganizationGuid, counterpartyGuid: draftCounterpartyGuid, search, limit: pageSize, offset });
          break;
        case 'deliveryAddress':
          result = await searchDeliveryAddresses({ organizationGuid: draftOrganizationGuid, counterpartyGuid: draftCounterpartyGuid, search, limit: pageSize, offset });
          break;
        case 'priceType':
          result = await searchPriceTypes({ search, limit: pageSize, offset });
          break;
        case 'product':
          result = await searchProducts({
            search,
            organizationGuid: draftOrganizationGuid,
            counterpartyGuid: draftCounterpartyGuid,
            agreementGuid: draftAgreementGuid || undefined,
            warehouseGuid: draftWarehouseGuid || undefined,
            priceTypeGuid: draftPriceTypeGuid || undefined,
            inStockOnly: productInStockOnly,
            purchasedOnly,
            historyUserId: workspace.offlineUserId,
            historyFetchedAt: purchaseHistoryRevision || undefined,
            limit: pageSize,
            offset,
          });
          break;
      }
      if (pickerRequestIdRef.current !== requestId) return;
      const nextItems = kind === 'deliveryAddress'
        ? sortDeliveryAddressOptions((result?.items || []) as ClientOrderDeliveryAddressOption[])
        : result?.items || [];
      setPickerItems((prev) => {
        const merged = append ? [...prev, ...nextItems] : nextItems;
        return kind === 'deliveryAddress' ? sortDeliveryAddressOptions(merged as any[]) : merged;
      });
      setPickerOffset(offset + nextItems.length);
      setPickerHasMore(hasMorePage(nextItems.length, pageSize, offset, result?.meta?.total));
    } catch {
      if (pickerRequestIdRef.current === requestId) {
        setPickerLoadError(true);
        setPickerHasMore(false);
        pickerLoadSignatureRef.current = '';
      }
    } finally {
      if (append) pickerAppendLoadingRef.current = false;
      if (pickerRequestIdRef.current === requestId) {
        setPickerLoading(false);
      }
    }
  }, [counterpartyManagerOnly, draftAgreementGuid, draftCounterpartyGuid, draftOrganizationGuid, draftPriceTypeGuid, draftWarehouseGuid, hasOrderContext, productInStockOnly, purchasedOnly, purchaseHistoryRevision, purchaseHistoryReadyForFilter, workspace.offlineUserId, searchAgreements, searchContracts, searchCounterparties, searchDeliveryAddresses, searchPriceTypes, searchProducts, searchWarehouses, settings?.organizations]);

  React.useEffect(() => {
    if (!pickerKind) return;
    const timer = setTimeout(() => void loadPickerPage(pickerKind, pickerSearch, 0, false), pickerSearch ? 250 : 0);
    return () => clearTimeout(timer);
  }, [loadPickerPage, pickerKind, pickerSearch]);

  const handlePickerScroll = React.useCallback((event: React.UIEvent<HTMLDivElement>) => {
    if (!canLoadMorePickerItems || !pickerKind) return;
    const target = event.currentTarget;
    const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remaining > 320) return;
    void loadPickerPage(pickerKind, pickerSearch, pickerOffset, true);
  }, [canLoadMorePickerItems, loadPickerPage, pickerKind, pickerOffset, pickerSearch]);

  const handlePickerSelect = React.useCallback(async (item: any) => {
    switch (pickerKind) {
      case 'filterCounterparty':
        setFilterCounterparty(item as ClientOrderCounterpartyOption);
        setFilters((prev) => ({ ...prev, counterpartyGuid: item.guid }));
        setPickerKind(null);
        return;
      case 'organization':
        await setOrganization(item as ClientOrderOrganization);
        setPickerKind(null);
        return;
      case 'counterparty':
        await setCounterparty(item as ClientOrderCounterpartyOption);
        setPickerKind(null);
        return;
      case 'agreement':
        await setAgreement(item as ClientOrderAgreementOption);
        setPickerKind(null);
        return;
      case 'contract':
        await setContract(item as ClientOrderContractOption);
        setPickerKind(null);
        return;
      case 'warehouse':
        setWarehouse(item as ClientOrderWarehouseOption);
        setPickerKind(null);
        return;
      case 'deliveryAddress':
        setDeliveryAddress(item as ClientOrderDeliveryAddressOption);
        setPickerKind(null);
        return;
      case 'priceType':
        confirmHeaderPriceTypeChange(item as ClientOrderPriceTypeOption);
        setPickerKind(null);
        return;
      case 'product':
        setSelectedProducts((current) => toggleProductSelection(current, item as ClientOrderProduct, draft.items));
        return;
    }
  }, [confirmHeaderPriceTypeChange, draft.items, pickerKind, setAgreement, setContract, setCounterparty, setDeliveryAddress, setFilters, setOrganization, setWarehouse]);

  const loadCounterpartyLookup = React.useCallback((args: { search: string; limit: number; offset: number }) => {
    return searchCounterparties({ ...args, managerOnly: counterpartyManagerOnly });
  }, [counterpartyManagerOnly, searchCounterparties]);

  const counterpartyManagerToggleAdornment = React.useMemo(() => (
    <Box
      role="checkbox"
      tabIndex={0}
      aria-checked={counterpartyManagerOnly}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setCounterpartyManagerOnly((prev) => !prev);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        setCounterpartyManagerOnly((prev) => !prev);
      }}
      sx={{
        height: 26,
        minWidth: 62,
        px: 0.35,
        border: `1px solid ${counterpartyManagerOnly ? 'var(--co-accent)' : 'var(--co-line)'}`,
        borderRadius: '7px',
        bgcolor: counterpartyManagerOnly ? 'var(--co-soft)' : 'var(--co-surface)',
        color: counterpartyManagerOnly ? 'var(--co-accent)' : 'var(--co-text)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0.1,
        cursor: 'pointer',
      }}
    >
      <Checkbox
        checked={counterpartyManagerOnly}
        size="small"
        tabIndex={-1}
        sx={{ p: 0, color: 'var(--co-muted)', '&.Mui-checked': { color: 'var(--co-accent)' } }}
        slotProps={{
          input: { readOnly: true }
        }}
      />
      <Typography sx={{ fontSize: 12, fontWeight: 700, lineHeight: 1 }}>Мои</Typography>
    </Box>
  ), [counterpartyManagerOnly]);

  const loadWarehouseLookup = React.useCallback((args: { search: string; limit: number; offset: number }) => {
    if (!workspace.draft.organizationGuid || !workspace.draft.counterpartyGuid) return Promise.resolve({ items: [], meta: { total: 0 } });
    return searchWarehouses({
      organizationGuid: workspace.draft.organizationGuid,
      counterpartyGuid: workspace.draft.counterpartyGuid,
      search: args.search,
      limit: args.limit,
      offset: args.offset,
    });
  }, [searchWarehouses, workspace.draft.counterpartyGuid, workspace.draft.organizationGuid]);

  const loadOrganizationLookup = React.useCallback(async (args: { search: string; limit: number; offset: number }) => {
    const search = args.search.trim().toLowerCase();
    const all = workspace.settings?.organizations || [];
    const filtered = all.filter((item) => !search || item.name.toLowerCase().includes(search) || (item.code || '').toLowerCase().includes(search));
    return {
      items: filtered.slice(args.offset, args.offset + args.limit),
      meta: { total: filtered.length },
    };
  }, [workspace.settings?.organizations]);

  const loadAgreementLookup = React.useCallback((args: { search: string; limit: number; offset: number }) => {
    if (!workspace.draft.organizationGuid || !workspace.draft.counterpartyGuid) return Promise.resolve({ items: [], meta: { total: 0 } });
    return searchAgreements({ organizationGuid: workspace.draft.organizationGuid, counterpartyGuid: workspace.draft.counterpartyGuid, search: args.search, limit: args.limit, offset: args.offset });
  }, [searchAgreements, workspace.draft.counterpartyGuid, workspace.draft.organizationGuid]);

  const loadContractLookup = React.useCallback((args: { search: string; limit: number; offset: number }) => {
    if (!workspace.draft.organizationGuid || !workspace.draft.counterpartyGuid) return Promise.resolve({ items: [], meta: { total: 0 } });
    return searchContracts({ organizationGuid: workspace.draft.organizationGuid, counterpartyGuid: workspace.draft.counterpartyGuid, search: args.search, limit: args.limit, offset: args.offset });
  }, [searchContracts, workspace.draft.counterpartyGuid, workspace.draft.organizationGuid]);

  const loadDeliveryAddressLookup = React.useCallback((args: { search: string; limit: number; offset: number }) => {
    if (!workspace.draft.organizationGuid || !workspace.draft.counterpartyGuid) return Promise.resolve({ items: [], meta: { total: 0 } });
    return searchDeliveryAddresses({
      organizationGuid: workspace.draft.organizationGuid,
      counterpartyGuid: workspace.draft.counterpartyGuid,
      search: args.search,
      limit: args.limit,
      offset: args.offset,
    }).then((result) => ({ ...result, items: sortDeliveryAddressOptions(result.items || []) }));
  }, [searchDeliveryAddresses, workspace.draft.counterpartyGuid, workspace.draft.organizationGuid]);

  const loadPriceTypeLookup = React.useCallback((args: { search: string; limit: number; offset: number }) => {
    if (!workspace.draft.organizationGuid || !workspace.draft.counterpartyGuid) return Promise.resolve({ items: [], meta: { total: 0 } });
    return searchPriceTypes({ search: args.search, limit: args.limit, offset: args.offset });
  }, [searchPriceTypes, workspace.draft.counterpartyGuid, workspace.draft.organizationGuid]);

  const selectFilterCounterparty = React.useCallback((item: ClientOrderCounterpartyOption) => {
    setFilterCounterparty(item);
    setFilters((prev) => ({ ...prev, counterpartyGuid: item.guid }));
  }, [setFilters]);

  const openReferenceDetails = React.useCallback(async (kind: ClientOrderReferenceKind, guid?: string | null) => {
    if (!guid) return;
    if (kind === 'counterparty') {
      router.push({
        pathname: '/services/client_orders/counterparty',
        params: {
          counterpartyGuid: guid,
          organizationGuid: workspace.draft.organizationGuid || undefined,
          sourceOrderGuid: workspace.selectedOrder?.guid || workspace.draft.guid || undefined,
        },
      } as any);
      return;
    }
    setReferenceDetailsOpen(true);
    setReferenceDetailsLoading(true);
    setReferenceDetailsError(null);
    setReferenceDetails(null);
    try {
      const details = await getClientOrderReferenceDetails(kind, guid);
      setReferenceDetails(details);
    } catch (error: any) {
      setReferenceDetailsError(error?.message || 'Не удалось загрузить карточку реквизита');
    } finally {
      setReferenceDetailsLoading(false);
    }
  }, [router, workspace.draft.guid, workspace.draft.organizationGuid, workspace.selectedOrder?.guid]);

  const submitWithConfirm = React.useCallback(async () => {
    setConfirmSubmitOpen(false);
    await workspace.submitOrder();
  }, [workspace]);
  const isQueuedResubmit = workspace.selectedOrderQueued && workspace.dirty;
  const isSyncedResubmit = workspace.selectedOrderSynced && workspace.dirty;
  const isErrorRetryTo1c = !!workspace.selectedOrderHas1cError && !workspace.dirty;
  const isResubmitTo1c = isQueuedResubmit || isSyncedResubmit || isErrorRetryTo1c;
  const currentCancelTarget = pendingCancelOrder || workspace.selectedOrder;
  const currentCancelTargetQueued = !!currentCancelTarget && (currentCancelTarget.status === 'QUEUED' || currentCancelTarget.syncState === 'QUEUED');
  const currentCancelTargetCancelled = currentCancelTarget?.status === 'CANCELLED';

  const saveWithConfirm = React.useCallback(() => {
    if (workspace.validation.warningMessage) {
      setConfirmSaveOpen(true);
      return;
    }
    void workspace.saveDraft({ reason: 'manual' });
  }, [workspace]);

  const copyWithConfirm = React.useCallback(() => {
    setConfirmCopyOpen(workspace.dirty ? 'save-copy' : 'copy');
  }, [workspace.dirty]);

  const runCopyConfirm = React.useCallback(async () => {
    const mode = confirmCopyOpen;
    setConfirmCopyOpen(null);
    if (!mode) return;
    const copied = await workspace.copyOrder();
    if (copied) {
      handledStartOrderGuidRef.current = '';
      router.setParams({ orderGuid: '' });
      setWebEditorSection('items');
      setDetailsExpanded(false);
      setResponsivePane('editor');
    }
  }, [confirmCopyOpen, isSinglePane, router, workspace]);

  const closeOrderContextMenu = React.useCallback(() => {
    setOrderContextMenu(null);
  }, []);

  const runContextOrderDangerAction = React.useCallback(async () => {
    const order = orderContextMenu?.order;
    closeOrderContextMenu();
    if (!order) return;
    if (order.status === 'DRAFT') {
      await workspace.deleteDraft(order.guid);
      return;
    }
    if (order.status === 'CANCELLED') {
      await workspace.restoreOrder({ guid: order.guid, revision: order.revision });
      return;
    }
    setPendingCancelOrder(order);
    setConfirmCancelOpen(true);
  }, [closeOrderContextMenu, orderContextMenu?.order, workspace]);

  const runContextOrderDeleteAction = React.useCallback(async () => {
    const order = orderContextMenu?.order;
    closeOrderContextMenu();
    if (!order) return;
    if (typeof window !== 'undefined' && !window.confirm('Удалить отмененный заказ из списка?')) return;
    await workspace.deleteDraft(order.guid);
  }, [closeOrderContextMenu, orderContextMenu?.order, workspace]);

  const saveDeliverySettings = React.useCallback(async () => {
    const result = await workspace.saveUserSettings({
      deliveryDateMode: settingsDraft.deliveryDateMode as any,
      deliveryDateOffsetDays: Number(settingsDraft.deliveryDateOffsetDays),
      fixedDeliveryDate: settingsDraft.fixedDeliveryDate ? new Date(settingsDraft.fixedDeliveryDate).toISOString() : null,
    });
    if (result?.resolvedDeliveryDate && workspace.draftMode) {
      workspace.patchDraft({ deliveryDate: result.resolvedDeliveryDate });
    }
    if (result) setSettingsOpen(false);
  }, [settingsDraft, workspace]);

  const toolbarUsesDeleteDraft = workspace.draftMode || workspace.selectedOrder?.status === 'DRAFT';
  const toolbarUsesRestore = workspace.selectedOrder?.status === 'CANCELLED';

  const title = workspace.draftMode
    ? 'Новый заказ клиента'
    : workspace.selectedOrder?.number1c
      ? `Заказ 1С ${workspace.selectedOrder.number1c}`
      : workspace.selectedOrder ? orderListTitle(workspace.selectedOrder) : 'Черновик';
  const inlineEditorErrorMessages = React.useMemo(() => {
    const messages = [workspace.error].filter(Boolean) as string[];
    return Array.from(new Set(messages));
  }, [workspace.error]);
  const showInlineEditorErrors = !isSinglePane && effectiveEditorPaneWidth >= 1180 && inlineEditorErrorMessages.length > 0;

  React.useEffect(() => {
    if (workspace.hasEditableDocument && workspace.draftMode && !draft.counterpartyGuid) {
      requestAnimationFrame(() => clientInputRef.current?.focus());
    }
  }, [workspace.hasEditableDocument, workspace.draftMode, draft.organizationGuid, draft.counterpartyGuid]);
  React.useEffect(() => { if (workspace.error) setDetailsExpanded(true); }, [workspace.error]);
  const visibleOrders = React.useMemo(() => attentionOnly ? workspace.orders.filter(order => (
    order.status === 'REJECTED' || ['ERROR', 'FAILED', 'CONFLICT'].includes(order.syncState || '')
    || ['SEND_ERROR', 'NEEDS_EDIT', 'PRICE_REVIEW'].includes((order as ClientOrder & { offlineDraftStatus?: string }).offlineDraftStatus || '')
  )) : workspace.orders, [attentionOnly, workspace.orders]);
  React.useEffect(() => {
    if (!focusProductAfterClient.current || workspace.loadingDefaults || !draft.counterpartyGuid) return;
    focusProductAfterClient.current = false;
    requestAnimationFrame(() => editorPaneRef.current?.querySelector<HTMLInputElement>('input[aria-label="Найти товар"]')?.focus());
  }, [workspace.loadingDefaults, draft.counterpartyGuid]);
  const missingConditions = [
    !draft.agreementGuid && 'Соглашение', !draft.contractGuid && 'Договор',
    !draft.warehouseGuid && 'Склад', !draft.deliveryAddressGuid && 'Адрес доставки', !draft.deliveryDate && 'Дата отгрузки',
  ].filter(Boolean) as string[];
  const requestSubmit = () => {
    if (workspace.readOnly || workspace.mutationLocked || workspace.loadingDefaults || workspace.loadingDetail) return;
    if (!draft.organizationGuid) {setDetailsExpanded(true); requestAnimationFrame(() => organizationInputRef.current?.focus()); return;}
    if (!draft.counterpartyGuid) {setDetailsExpanded(true); requestAnimationFrame(() => clientInputRef.current?.focus()); return;}
    const invalidQuantity = editorPaneRef.current?.querySelector<HTMLInputElement>('input[data-price-quantity][aria-invalid="true"]');
    if (invalidQuantity) {invalidQuantity.focus(); return;}
    if (workspace.canSubmitOrder) { setConfirmSubmitOpen(true); return; }
    if (missingConditions.length) setDetailsExpanded(true);
    requestAnimationFrame(() => {
      const target = missingConditions.length
        ? editorPaneRef.current?.querySelector<HTMLInputElement>(`input[aria-label="${missingConditions[0]}"]`)
        : editorPaneRef.current?.querySelector<HTMLInputElement>('input[aria-invalid="true"]') || editorPaneRef.current?.querySelector<HTMLInputElement>('input[aria-label="Найти товар"]');
      target?.focus();
      target?.scrollIntoView({ block: 'nearest' });
    });
  };

  const createDocumentFromList = React.useCallback(async () => {
    const created = await workspace.createDocument();
    if (!created) return;
    handledStartOrderGuidRef.current = '';
    router.setParams({ orderGuid: '' });
    setWebEditorSection('items');
    setDetailsExpanded(false);
    setResponsivePane('editor');
    requestAnimationFrame(() => clientInputRef.current?.focus());
  }, [isSinglePane, router, workspace]);

  const selectOrderFromList = React.useCallback(async (guid: string, updateUrl = true) => {
    const selected = await workspace.selectOrder(guid);
    if (selected) {
      setWebEditorSection('items');
      setDetailsExpanded(false);
      setResponsivePane('editor');
      if (updateUrl) { handledStartOrderGuidRef.current = guid; router.setParams({ orderGuid: guid }); }
    }
    return selected;
  }, [isSinglePane, router, workspace]);

  const openContextOrder = React.useCallback(() => {
    const order = orderContextMenu?.order;
    closeOrderContextMenu();
    if (order) void selectOrderFromList(order.guid);
  }, [closeOrderContextMenu, orderContextMenu?.order, selectOrderFromList]);

  const orderSharing = useOrderShareActions(workspace);

  React.useEffect(() => {
    if (!startOrderGuid || handledStartOrderGuidRef.current === startOrderGuid) return;
    handledStartOrderGuidRef.current = startOrderGuid;
    if (workspaceRef.current.selectedGuid === startOrderGuid) return;
    void selectOrderFromList(startOrderGuid, false).then(selected => {
      if (!selected && workspaceRef.current.selectedGuid) { handledStartOrderGuidRef.current = workspaceRef.current.selectedGuid; router.setParams({ orderGuid: workspaceRef.current.selectedGuid }); }
    });
  }, [router, selectOrderFromList, startOrderGuid]);

  const renderDraftItemCard = React.useCallback((item: any, rowNumber: number) => {
    const packageValue = packageSelectValue(item);
    const lineErrors = workspace.validation.itemMessages[item.key] || [];
    const lineWarnings = workspace.validation.itemWarnings?.[item.key] || [];
    const quantityInputWidth = getQuantityInputWidthPx(item.quantity, ui.narrowPriceWidth <= 66 ? 34 : 40, 88);
    const quantityControlWidth = getQuantityControlWidthPx(item.quantity, ui.narrowControlHeight, ui.narrowPriceWidth <= 66 ? 34 : 40, 88);
    const displayedPrice = getDisplayedUnitPriceValue(item);
    const cancelled = isCancelledDraftItem(item);
    const itemReadOnly = workspace.readOnly || workspace.mutationLocked || workspace.loadingDefaults || cancelled;
    const quantityError = !itemReadOnly && !isValidQuantityValue(item);
    const priceError = !itemReadOnly && !isValidManualPriceValue(item.manualPrice);
    const cancelReason = getDraftItemCancelReason(item);
    const issueText = cancelled ? `Отменено${cancelReason ? `: ${cancelReason}` : ''}` : [...lineErrors, ...lineWarnings].join(' ');

    return (
      <Box
        key={item.key}
        sx={{
          py: 0.7,
          borderBottom: '1px solid var(--co-line)',
          bgcolor: cancelled ? 'var(--co-background)' : lineErrors.length || lineWarnings.length ? 'var(--co-danger-soft)' : 'transparent',
          '&:last-of-type': { borderBottom: 'none', pb: 0 },
        }}
      >
        <Stack spacing={0.45}>
          <Stack direction="row" spacing={0.35} sx={{
            alignItems: "flex-start"
          }}>
            {!itemReadOnly ? (
              <IconButton
                size="small"
                color="error"
                onClick={() => workspace.removeItem(item.key)}
                sx={{ width: ui.narrowPriceWidth <= 66 ? 18 : 20, height: ui.narrowPriceWidth <= 66 ? 18 : 20, flexShrink: 0, mt: -0.1, ml: -0.25 }}
              >
                <Ionicons name="close-outline" size={ui.narrowPriceWidth <= 66 ? 13 : 14} />
              </IconButton>
            ) : null}
            <Typography sx={{ width: ui.narrowPriceWidth <= 66 ? 10 : 12, fontSize: ui.narrowPriceWidth <= 66 ? 10.5 : 11, color: 'var(--co-muted)', fontWeight: 700, pt: 0.1, flexShrink: 0 }}>
              {rowNumber}
            </Typography>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography
                sx={{
                  fontSize: ui.narrowPriceWidth <= 66 ? 10.2 : 10.8,
                  fontWeight: 700,
                  lineHeight: 1.12,
                  color: 'var(--co-text)',
                  whiteSpace: 'normal',
                  overflowWrap: 'anywhere',
                }}
              >
                {item.productName}
              </Typography>
              <Typography component="div" sx={{ mt: 0.1, fontSize: ui.narrowPriceWidth <= 66 ? 9 : 9.5, lineHeight: 1.1, color: 'var(--co-muted)' }}>
                <DraftItemMeta item={item} />
                {hasManualPrice(item) ? (
                  <Box component="span" sx={{ ml: 0.5, color: 'var(--co-accent)', fontWeight: 700 }}>руч.</Box>
                ) : null}
              </Typography>
            </Box>
            <Typography sx={{ fontSize: ui.narrowPriceWidth <= 66 ? 10.8 : 11.5, fontWeight: 700, color: 'var(--co-text)', whiteSpace: 'nowrap', flexShrink: 0, pl: 0.3 }}>
              {formatMoney(computeLineTotal(item, workspace.draft.generalDiscountPercent), item.currency)}
            </Typography>
          </Stack>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: `${quantityControlWidth}px ${ui.narrowPackageWidth}px ${ui.narrowPriceWidth}px`,
              gap: `${ui.narrowRowGap}px`,
              alignItems: 'center',
              pl: itemReadOnly ? (ui.narrowPriceWidth <= 66 ? 1.35 : 1.6) : (ui.narrowPriceWidth <= 66 ? 3.1 : 4.1),
            }}
          >
            <Stack
              direction="row"
              spacing={0.25}
              sx={{
                alignItems: "center",
                minWidth: 0
              }}>
              <IconButton
                size="small"
                disabled={itemReadOnly}
                onClick={() => workspace.setItemPatch(item.key, { quantity: stepQuantity(item, -1) })}
                sx={{ width: ui.narrowControlHeight, height: ui.narrowControlHeight, border: '1px solid var(--co-line)', borderRadius: '6px', flexShrink: 0 }}
              >
                <Ionicons name="remove-outline" size={13} color="inherit" />
              </IconButton>
              <TextField
                size="small"
                value={item.quantity}
                onChange={(e) => workspace.setItemPatch(item.key, { quantity: normalizeQuantityInput(item, e.target.value) })}
                disabled={itemReadOnly}
                error={quantityError}
                sx={{
                  width: quantityInputWidth,
                  flex: '0 0 auto',
                  ...compactInputSx,
                  '& .MuiInputBase-root': { minHeight: ui.narrowControlHeight, borderRadius: '6px' },
                  '& input': { textAlign: 'center', fontWeight: 600, fontSize: ui.narrowPriceWidth <= 66 ? 11 : 11.5, px: 0.25, py: 0 },
                }}
              />
              <IconButton
                size="small"
                disabled={itemReadOnly}
                onClick={() => workspace.setItemPatch(item.key, { quantity: stepQuantity(item, 1) })}
                sx={{ width: ui.narrowControlHeight, height: ui.narrowControlHeight, border: '1px solid var(--co-line)', borderRadius: '6px', flexShrink: 0 }}
              >
                <Ionicons name="add-outline" size={13} color="inherit" />
              </IconButton>
            </Stack>

            {hasSinglePackage(item) ? (
              <Box
                sx={{
                  minHeight: `${ui.narrowControlHeight}px`,
                  px: `${ui.compactStaticFieldHorizontalPadding}px`,
                  border: '1px solid var(--co-line)',
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  justifySelf: 'start',
                  width: 'fit-content',
                  maxWidth: '100%',
                  bgcolor: 'var(--co-background)',
                }}
              >
                <Typography sx={{ fontSize: ui.narrowPriceWidth <= 66 ? 10.5 : 11, fontWeight: 700, color: 'var(--co-text)', whiteSpace: 'nowrap' }}>
                  {getPackageDisplayText(item)}
                </Typography>
              </Box>
            ) : (
              <TextField
                select
                size="small"
                value={packageValue}
                onChange={(e) => workspace.setItemPackage(item.key, e.target.value === '__base__' ? null : e.target.value)}
                disabled={itemReadOnly}
                fullWidth
                sx={{
                  ...compactInputSx,
                  '& .MuiInputBase-root': { minHeight: ui.narrowControlHeight, borderRadius: '6px' },
                  '& .MuiInputBase-input': { fontSize: ui.narrowPriceWidth <= 66 ? 10.5 : 11, fontWeight: 700, py: 0, px: 0.6 },
                }}
              >
                <MenuItem value="__base__">{unitLabel(item.baseUnit)}</MenuItem>
                {item.packages.map((pack: any) => (
                  <MenuItem key={pack.guid} value={pack.guid}>
                    {packageLabel(pack, item)}
                  </MenuItem>
                ))}
              </TextField>
            )}

            <TextField
              size="small"
              value={displayedPrice}
              onFocus={() => cellCheckpoints.current.set(`${item.key}:price`, { manualPrice: item.manualPrice, priceTypeGuid: item.priceTypeGuid, priceTypeName: item.priceTypeName })}
              onKeyDown={event => handleWebCellKey(event, () => { const checkpoint = cellCheckpoints.current.get(`${item.key}:price`); if (checkpoint) workspace.setItemPatch(item.key, checkpoint); })}
              slotProps={{ htmlInput: { 'aria-label': `Цена: ${item.productName}`, inputMode: 'decimal' } }}
              placeholder="0"
              onChange={(e) => {
                const displayedManualPrice = normalizePriceInput(e.target.value, displayedPrice);
                const manualPrice = displayedUnitPriceToBasePriceInput(displayedManualPrice, item);
                workspace.setItemPatch(item.key, {
                  manualPrice,
                  priceTypeGuid: manualPrice.trim() ? null : workspace.draft.priceTypeGuid ?? null,
                  priceTypeName: manualPrice.trim() ? 'Произвольный' : workspace.draft.priceTypeName ?? null,
                });
              }}
              disabled={itemReadOnly}
              error={priceError}
              sx={{
                ...compactInputSx,
                '& .MuiInputBase-root': { minHeight: ui.narrowControlHeight, borderRadius: '6px' },
                '& .MuiInputBase-input': { fontSize: ui.narrowPriceWidth <= 66 ? 11 : 11.5, fontWeight: 700, px: 0.45, py: 0 },
                '& .MuiInputBase-input::placeholder': { color: 'var(--co-muted)', opacity: 1 },
              }}
            />
          </Box>

          {issueText ? (
            <Typography sx={{ pl: 4.1, fontSize: 12, color: cancelled ? 'var(--co-muted)' : lineErrors.length ? 'var(--co-danger)' : 'var(--co-warning)', lineHeight: 1.2 }}>
              {issueText}
            </Typography>
          ) : null}
        </Stack>
      </Box>
    );
  }, [ui.compactStaticFieldHorizontalPadding, ui.narrowControlHeight, ui.narrowPackageWidth, ui.narrowPriceWidth, ui.narrowQtyWidth, ui.narrowRowGap, workspace]);

  const draftItemsTableWidth = React.useMemo(() => {
    const horizontalChrome = isSinglePane ? 24 : 44;
    return Math.max(Math.floor(effectiveEditorPaneWidth - horizontalChrome), 560);
  }, [effectiveEditorPaneWidth, isSinglePane]);

  const draftItemsColumnLayout = React.useMemo(() => {
    const hasVariablePackages = draftItemsPackageLayoutKey.includes(':multi');
    const base = {
      actions: workspace.readOnly ? 0 : 30,
      product: useCompactTable ? 320 : 440,
      quantity: quantityColumnWidth,
      package: hasVariablePackages ? (useCompactTable ? 128 : 154) : (useCompactTable ? 86 : 98),
      price: useCompactTable ? 94 : 112,
      total: useCompactTable ? 96 : 116,
    };
    const min = {
      actions: workspace.readOnly ? 0 : 30,
      product: useCompactTable ? 170 : 210,
      quantity: useCompactTable ? 88 : 96,
      package: hasVariablePackages ? (useCompactTable ? 78 : 88) : (useCompactTable ? 58 : 66),
      price: useCompactTable ? 70 : 80,
      total: useCompactTable ? 76 : 86,
    };
    const baseTotal = Object.values(base).reduce((sum, width) => sum + width, 0);
    if (baseTotal <= draftItemsTableWidth) {
      return {
        width: {
          ...base,
          product: base.product + (draftItemsTableWidth - baseTotal),
        },
        min,
      };
    }

    const width = { ...base };
    let overflow = baseTotal - draftItemsTableWidth;
    const shrinkableKeys = ['product', 'quantity', 'package', 'price', 'total'] as const;
    const shrinkableTotal = shrinkableKeys.reduce((sum, key) => sum + Math.max(base[key] - min[key], 0), 0);
    const shrinkFactor = shrinkableTotal > 0 ? Math.min(1, overflow / shrinkableTotal) : 0;

    shrinkableKeys.forEach((key) => {
      const shrink = Math.floor((base[key] - min[key]) * shrinkFactor);
      width[key] = Math.max(min[key], base[key] - shrink);
      overflow -= base[key] - width[key];
    });

    for (const key of shrinkableKeys) {
      if (overflow <= 0) break;
      const room = Math.max(width[key] - min[key], 0);
      const shrink = Math.min(room, overflow);
      width[key] -= shrink;
      overflow -= shrink;
    }

    return { width, min };
  }, [draftItemsPackageLayoutKey, draftItemsTableWidth, quantityColumnWidth, useCompactTable, workspace.readOnly]);

  const draftItemColumns = React.useMemo<ColumnDef<typeof draftTableFeatures, DraftItem>[]>(() => {
    const { width, min } = draftItemsColumnLayout;

    return [
      ...(!workspace.readOnly ? [{
        id: 'actions',
        header: '',
        size: width.actions,
        minSize: min.actions,
        maxSize: width.actions,
        enableResizing: false,
        cell: ({ row }) => {
          const currentWorkspace = workspaceRef.current;
          const item = row.original;
          const itemReadOnly = currentWorkspace.readOnly || currentWorkspace.mutationLocked || currentWorkspace.loadingDefaults || isCancelledDraftItem(item);
          return (
            <Box sx={{ width: '100%', display: 'grid', placeItems: 'center' }}>
              <Tooltip title="Удалить строку" arrow>
                <span>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => currentWorkspace.removeItem(item.key)}
                    disabled={itemReadOnly}
                    sx={{
                      width: 22,
                      height: 22,
                      color: 'var(--co-muted)',
                      borderRadius: 0,
                      bgcolor: 'transparent',
                      '&:hover': { color: 'var(--co-danger)', bgcolor: 'transparent' },
                    }}
                  >
                    <Ionicons name="close-outline" size={15} color="inherit" />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          );
        },
      } as ColumnDef<typeof draftTableFeatures, DraftItem>] : []),
      {
        accessorKey: 'productName',
        header: 'Товар',
        size: width.product,
        minSize: min.product,
        cell: ({ row }) => {
          const currentWorkspace = workspaceRef.current;
          const item = row.original;
          const lineErrors = currentWorkspace.validation.itemMessages[item.key] || [];
          const lineWarnings = currentWorkspace.validation.itemWarnings?.[item.key] || [];
          const cancelled = isCancelledDraftItem(item);
          const cancelReason = getDraftItemCancelReason(item);
          const issueText = cancelled ? `Отменено${cancelReason ? `: ${cancelReason}` : ''}` : [...lineErrors, ...lineWarnings].join(' ');
          const imageUri = getDraftItemImageUri(item);
          return (
            <Stack
              direction="row"
              spacing={1}
              sx={{
                alignItems: "center",
                minWidth: 0,
                py: 0.1
              }}>
              <Tooltip title="Открыть изображение" arrow>
                <Box
                  component="button"
                  type="button"
                  onClick={() => openProductGallery(item)}
                  sx={{
                    p: 0,
                    border: 0,
                    bgcolor: 'transparent',
                    flexShrink: 0,
                    cursor: 'pointer',
                    borderRadius: '6px',
                    '&:focus-visible': { outline: '2px solid var(--co-accent)', outlineOffset: 2 },
                  }}
                >
                  <WebProductImage
                    src={imageUri}
                    alt={item.productName}
                    spinnerSize={useCompactTable ? 16 : 18}
                    sx={{
                      width: useCompactTable ? 42 : 52,
                      height: useCompactTable ? 42 : 52,
                      borderRadius: '6px',
                      border: '1px solid var(--co-line)',
                      bgcolor: 'var(--co-background)',
                    }}
                  />
                </Box>
              </Tooltip>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  sx={{
                    fontSize: 14,
                    fontWeight: 700,
                    lineHeight: 1.18,
                    color: 'var(--co-text)',
                    display: '-webkit-box',
                    WebkitLineClamp: useCompactTable ? 2 : 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    wordBreak: 'break-word',
                  }}
                >
                  {item.productName}
                </Typography>
                <Typography component="div" sx={{ mt: 0.25, fontSize: 12, color: 'var(--co-muted)', lineHeight: 1.18 }}>
                  <DraftItemMeta item={item} />
                  {hasManualPrice(item) ? (
                    <Box component="span" sx={{ ml: 0.6, color: 'var(--co-accent)', fontWeight: 700 }}>ручная цена</Box>
                  ) : null}
                </Typography>
                {issueText ? (
                  <Box sx={{ mt: 0.45, px: 0.75, py: 0.35, borderRadius: '9px', bgcolor: cancelled ? 'var(--co-panel)' : lineErrors.length ? 'var(--co-danger-soft)' : 'var(--co-warning-soft)', border: `1px solid ${cancelled ? 'var(--co-line)' : lineErrors.length ? 'var(--co-danger-line)' : 'var(--co-warning)'}` }}>
                    <Typography sx={{ fontSize: 12, color: cancelled ? 'var(--co-muted)' : lineErrors.length ? 'var(--co-danger)' : 'var(--co-warning)', lineHeight: 1.2, fontWeight: 700 }}>
                      {issueText}
                    </Typography>
                  </Box>
                ) : null}
              </Box>
            </Stack>
          );
        },
      },
      {
        id: 'quantity',
        header: 'Количество',
        size: width.quantity,
        minSize: min.quantity,
        cell: ({ row }) => {
          const currentWorkspace = workspaceRef.current;
          const item = row.original;
          const itemReadOnly = currentWorkspace.readOnly || currentWorkspace.mutationLocked || currentWorkspace.loadingDefaults || isCancelledDraftItem(item);
          const quantityInputWidth = getQuantityInputWidthPx(item.quantity, useCompactTable ? 38 : 44, useCompactTable ? 58 : 66);
          const quantityControlWidth = getQuantityControlWidthPx(item.quantity, 14, useCompactTable ? 38 : 44, useCompactTable ? 58 : 66);
          const quantityError = !itemReadOnly && !isValidQuantityValue(item);
          return (
            <Stack
              direction="row"
              spacing={0.15}
              sx={{
                alignItems: "center",
                width: quantityControlWidth,
                maxWidth: '100%',
                mx: 'auto'
              }}>
              <IconButton
                size="small"
                disabled={itemReadOnly}
                onClick={() => currentWorkspace.setItemPatch(item.key, { quantity: stepQuantity(item, -1) })}
                sx={{ width: 14, height: 28, minWidth: 14, p: 0, border: 0, borderRadius: 0, bgcolor: 'transparent', color: 'var(--co-muted)', '&:hover': { color: 'var(--co-text)', bgcolor: 'transparent' } }}
              >
                <Typography sx={{ fontSize: 15, fontWeight: 500, lineHeight: 1 }}>−</Typography>
              </IconButton>
              <TextField
                size="small"
                value={item.quantity}
                onFocus={() => cellCheckpoints.current.set(`${item.key}:quantity`, { quantity: item.quantity })}
                onKeyDown={event => handleWebCellKey(event, () => { const checkpoint = cellCheckpoints.current.get(`${item.key}:quantity`); if (checkpoint) currentWorkspace.setItemPatch(item.key, checkpoint); })}
                slotProps={{ htmlInput: { 'aria-label': `Количество: ${item.productName}`, inputMode: 'decimal' } }}
                onChange={(e) => currentWorkspace.setItemPatch(item.key, { quantity: normalizeQuantityInput(item, e.target.value) })}
                disabled={itemReadOnly}
                error={quantityError}
                sx={{
                  width: quantityInputWidth,
                  ...compactInputSx,
                  '& .MuiInputBase-root': { height: 30, borderRadius: 0, bgcolor: 'transparent' },
                  '& .MuiOutlinedInput-notchedOutline': { border: 0 },
                  '& .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderBottom: '1px solid var(--co-accent)' },
                  '& input': { textAlign: 'center', fontSize: 12, fontWeight: 700, lineHeight: '30px', py: 0, px: 0.25 },
                }}
              />
              <IconButton
                size="small"
                disabled={itemReadOnly}
                onClick={() => currentWorkspace.setItemPatch(item.key, { quantity: stepQuantity(item, 1) })}
                sx={{ width: 14, height: 28, minWidth: 14, p: 0, border: 0, borderRadius: 0, bgcolor: 'transparent', color: 'var(--co-muted)', '&:hover': { color: 'var(--co-text)', bgcolor: 'transparent' } }}
              >
                <Typography sx={{ fontSize: 14, fontWeight: 500, lineHeight: 1 }}>+</Typography>
              </IconButton>
            </Stack>
          );
        },
      },
      {
        id: 'package',
        header: 'Упаковка',
        size: width.package,
        minSize: min.package,
        cell: ({ row }) => {
          const currentWorkspace = workspaceRef.current;
          const item = row.original;
          const packageValue = packageSelectValue(item);
          const itemReadOnly = currentWorkspace.readOnly || currentWorkspace.mutationLocked || currentWorkspace.loadingDefaults || isCancelledDraftItem(item);
          if (itemReadOnly || hasSinglePackage(item)) {
            return (
              <Box sx={{ height: 30, px: 1, border: 0, borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: itemReadOnly ? 'var(--co-background)' : 'transparent', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, lineHeight: '30px', color: itemReadOnly ? 'var(--co-muted)' : 'var(--co-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center', width: '100%' }}>
                  {getPackageDisplayText(item)}
                </Typography>
              </Box>
            );
          }
          return (
            <TextField
              select
              size="small"
              value={packageValue}
              onChange={(e) => currentWorkspace.setItemPackage(item.key, e.target.value === '__base__' ? null : e.target.value)}
              disabled={itemReadOnly}
              fullWidth
              sx={{
                ...compactInputSx,
                '& .MuiInputBase-root': { height: 30, borderRadius: 0, bgcolor: 'transparent' },
                '& .MuiOutlinedInput-notchedOutline': { border: 0 },
                '& .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderBottom: '1px solid var(--co-accent)' },
                '& .MuiSelect-select': {
                  height: '30px',
                  minHeight: '30px !important',
                  py: '0 !important',
                  pl: '18px !important',
                  pr: '18px !important',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  lineHeight: '30px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                },
                '& .MuiSelect-icon': {
                  right: 4,
                  top: '50%',
                  transform: 'translateY(-50%)',
                },
              }}
            >
              <MenuItem value="__base__">{unitLabel(item.baseUnit)}</MenuItem>
              {item.packages.map((pack) => <MenuItem key={pack.guid} value={pack.guid}>{packageLabel(pack, item)}</MenuItem>)}
            </TextField>
          );
        },
      },
      {
        id: 'price',
        header: 'Цена',
        size: width.price,
        minSize: min.price,
        cell: ({ row }) => {
          const currentWorkspace = workspaceRef.current;
          const item = row.original;
          const itemReadOnly = currentWorkspace.readOnly || currentWorkspace.mutationLocked || currentWorkspace.loadingDefaults || isCancelledDraftItem(item);
          const displayedPrice = getDisplayedUnitPriceValue(item);
          const priceError = !itemReadOnly && !isValidManualPriceValue(item.manualPrice);
          return (
            <TextField
              size="small"
              value={displayedPrice}
              onFocus={() => cellCheckpoints.current.set(`${item.key}:price`, { manualPrice: item.manualPrice, priceTypeGuid: item.priceTypeGuid, priceTypeName: item.priceTypeName })}
              onKeyDown={event => handleWebCellKey(event, () => { const checkpoint = cellCheckpoints.current.get(`${item.key}:price`); if (checkpoint) currentWorkspace.setItemPatch(item.key, checkpoint); })}
              slotProps={{ htmlInput: { 'aria-label': `Цена: ${item.productName}`, inputMode: 'decimal' } }}
              placeholder="0"
              onChange={(e) => {
                const displayedManualPrice = normalizePriceInput(e.target.value, displayedPrice);
                const manualPrice = displayedUnitPriceToBasePriceInput(displayedManualPrice, item);
                currentWorkspace.setItemPatch(item.key, {
                  manualPrice,
                  priceTypeGuid: manualPrice.trim() ? null : currentWorkspace.draft.priceTypeGuid ?? null,
                  priceTypeName: manualPrice.trim() ? 'Произвольный' : currentWorkspace.draft.priceTypeName ?? null,
                });
              }}
              disabled={itemReadOnly}
              error={priceError}
              sx={{
                ...compactInputSx,
                '& .MuiInputBase-root': { height: 30, borderRadius: 0, bgcolor: 'transparent' },
                '& .MuiOutlinedInput-notchedOutline': { border: 0 },
                '& .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderBottom: '1px solid var(--co-accent)' },
                '& .MuiInputBase-input': { fontSize: 12, fontWeight: 700, py: 0, lineHeight: '30px' },
                '& .MuiInputBase-input::placeholder': { color: 'var(--co-muted)', opacity: 1 },
              }}
            />
          );
        },
      },
      {
        id: 'total',
        header: 'Итого, ₽',
        size: width.total,
        minSize: min.total,
        cell: ({ row }) => {
          const currentWorkspace = workspaceRef.current;
          return (
            <Typography sx={{ width: '100%', pr: 0.5, fontSize: 12, fontWeight: 700, color: 'var(--co-text)', whiteSpace: 'nowrap', textAlign: 'right' }}>
              {formatMoney(computeLineTotal(row.original, currentWorkspace.draft.generalDiscountPercent), row.original.currency)}
            </Typography>
          );
        },
      },
    ];
  }, [draftItemsColumnLayout, openProductGallery, useCompactTable, workspace.readOnly]);

  // TanStack renders cell functions as React components. Keep their identities stable when
  // measured widths change, otherwise a resize replaces the focused native input node.
  const currentCellRenderers = React.useRef<Record<string, any>>({});
  const stableCellRenderers = React.useRef<Record<string, any>>({});
  const stableDraftItemColumns = React.useMemo(() => draftItemColumns.map(column => {
    if (typeof column.cell !== 'function') return column;
    const id = String(column.id);
    currentCellRenderers.current[id] = column.cell;
    stableCellRenderers.current[id] ||= (context: any) => currentCellRenderers.current[id](context);
    return { ...column, cell: stableCellRenderers.current[id] };
  }), [draftItemColumns]);

  const [draftItemsColumnSizing, setDraftItemsColumnSizing] = React.useState<ColumnSizingState>({});
  const [draftItemsColumnOrder, setDraftItemsColumnOrder] = React.useState<ColumnOrderState>([]);
  const draggedDraftItemsColumnRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    setDraftItemsColumnOrder((current) => (workspace.readOnly && current.includes('actions') ? current.filter((columnId) => columnId !== 'actions') : current));
  }, [workspace.readOnly]);
  const draftItemsTable = useTable({
    features: draftTableFeatures,
    data: filteredDraftItems,
    columns: stableDraftItemColumns,
    columnResizeMode: 'onChange',
    state: {
      columnSizing: draftItemsColumnSizing,
      columnOrder: draftItemsColumnOrder,
    },
    onColumnSizingChange: setDraftItemsColumnSizing,
    onColumnOrderChange: setDraftItemsColumnOrder,
  });

  const moveDraftItemsColumn = React.useCallback((targetColumnId: string) => {
    const sourceColumnId = draggedDraftItemsColumnRef.current;
    draggedDraftItemsColumnRef.current = null;
    if (!sourceColumnId || sourceColumnId === targetColumnId) return;
    setDraftItemsColumnOrder((current) => {
      const fallback = draftItemsTable.getAllLeafColumns().map((column) => column.id);
      const next = current.length ? [...current] : fallback;
      const sourceIndex = next.indexOf(sourceColumnId);
      const targetIndex = next.indexOf(targetColumnId);
      if (sourceIndex < 0 || targetIndex < 0) return next;
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }, [draftItemsTable]);

  return (
    <ClientOrdersWebTheme>
    <Box ref={rootRef} data-testid="client-orders-web-workspace" sx={{ backgroundColor: 'var(--co-surface)', height: '100dvh', minHeight: 0, overflow: 'hidden' }}>
      <Stack direction="row" spacing={0} sx={{ height: '100%', minHeight: 0 }}>
        {responsivePane === 'customers'||!isSinglePane ? <Box sx={{width: '100%', display: responsivePane==='customers'?'flex':'none', flexDirection: 'column', minHeight: 0}}>
          {isSinglePane ? <AppWorkspaceHeader colors={colors} title="Заказы клиентов" contentSurface="plain" leading={<IconButton aria-label="К сервисам" onClick={() => router.navigate('/services')}><Ionicons name="arrow-back" size={22} color={colors.text}/></IconButton>} trailing={<Button onClick={() => setResponsivePane('orders')}>Журнал</Button>}/> : null}
          <ClientOrderCustomerStart desktop={!isSinglePane} active={responsivePane==='customers'} onOrderContextMenu={(order,x,y)=>setOrderContextMenu({order,mouseX:x+2,mouseY:y-6})} workspace={workspace} onOpenOrder={(guid?: string) => {setResponsivePane('editor'); setDetailsExpanded(false); handledStartOrderGuidRef.current = guid || ''; router.setParams({orderGuid: guid || ''});}}/>
        </Box> : null}
        {isSinglePane?<Paper ref={ordersPaneRef} elevation={0} sx={{ width: '100%', maxWidth: 1100, mx: 'auto', alignSelf: 'stretch', flexShrink: 0, minWidth: 0, height: '100%', borderRadius: 0, border: 0, borderRight: 0, display: showOrdersPane ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden', bgcolor: 'var(--co-background)' }}>
          <AppWorkspaceHeader colors={colors} title="Журнал" contentSurface="plain" trailing={workspace.hasEditableDocument ? <Button onClick={() => setResponsivePane('editor')} sx={{ whiteSpace: 'nowrap' }}>Продолжить заказ</Button> : undefined} leading={<IconButton aria-label="К сервисам" sx={{ width: 48, height: 48, bgcolor: colors.panel }} onClick={() => { void workspace.confirmDiscardIfNeeded().then((canLeave: boolean) => { if (canLeave) router.navigate('/services'); }); }}><Ionicons name="arrow-back" size={22} color={colors.text} /></IconButton>} />
          <Stack spacing={1.25} sx={{ px: 2, pb: 1.5 }}>
            <TextField fullWidth size="small" value={workspace.filters.search} placeholder="Клиент или номер заказа" onChange={event => workspace.setFilters(prev => ({ ...prev, search: event.target.value }))}
              slotProps={{ htmlInput: { 'aria-label': 'Поиск по клиенту или номеру' }, input: { startAdornment: <Ionicons name="search-outline" size={18} color={colors.muted} style={{ marginRight: 8 }} /> } }}
              sx={{ '& .MuiInputBase-root': { borderRadius: 24, bgcolor: colors.surface } }} />
            <Button variant="contained" fullWidth startIcon={<Ionicons name="add-outline" size={20} color="inherit" />} onClick={() => setResponsivePane('customers')}>Новый заказ</Button>
            <Stack direction="row" useFlexGap spacing={0.75} sx={{ flexWrap: 'wrap' }}>
              {([{ label: 'Все', value: '', count: workspace.statusCounts.all }, { label: 'Черновики', value: 'DRAFT', count: workspace.statusCounts.draft }, { label: 'В очереди', value: 'QUEUED', count: workspace.statusCounts.queued }, { label: 'Ошибки', value: 'attention' }] as const).map(filter => {
                const active = filter.value === 'attention' ? attentionOnly : !attentionOnly && (workspace.filters.statuses[0] || '') === filter.value;
                return <Chip key={filter.value} label={`${filter.label}${'count' in filter ? ` ${filter.count}` : ''}`} clickable aria-pressed={active} onClick={() => {
                  setAttentionOnly(filter.value === 'attention');
                  workspace.setFilters(prev => ({ ...prev, statuses: filter.value && filter.value !== 'attention' ? [filter.value] : [] }));
                }} sx={{ height: 32, bgcolor: active ? colors.soft : colors.surface, color: active ? colors.accentText : colors.muted, border: `1px solid ${active ? colors.accentText : 'transparent'}` }} />;
              })}
            </Stack>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Button startIcon={<Ionicons name="options-outline" size={18} color="inherit" />} endIcon={<Ionicons name={filtersExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="inherit" />} aria-expanded={filtersExpanded} onClick={() => setFiltersExpanded(value => !value)} sx={{ flex: 1, justifyContent: 'space-between', color: colors.muted, minHeight: 32 }}>
              Фильтры{filterCounterparty || workspace.filters.statuses.length ? ` · ${Number(!!filterCounterparty) + Number(!!workspace.filters.statuses.length)}` : ''}
            </Button>
            <Tooltip title="Обновить список"><span><IconButton aria-label="Обновить список заказов" disabled={workspace.loadingOrders} onClick={() => void workspace.refreshOrders()} sx={{ width: 36, height: 36 }}><Ionicons name="refresh-outline" size={19} color={colors.muted} /></IconButton></span></Tooltip>
            </Stack>
            <Collapse in={filtersExpanded}>
              <Stack spacing={1.5} sx={{ pt: 1 }}>
                <CompactSelectField label="Статус" value={workspace.filters.statuses[0] || ''} onChange={value => { setAttentionOnly(false); workspace.setFilters(prev => ({ ...prev, statuses: value ? [value] : [] })); }} renderValue={value => value ? workspace.statusLabels[value] || value : 'Все статусы'}>
                  <MenuItem value="">Все статусы</MenuItem>{Object.entries(workspace.statusLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                </CompactSelectField>
                <QuickLookupField kind="filterCounterparty" label="Контрагент" value={filterCounterparty} placeholder="Все контрагенты" loadOptions={loadCounterpartyLookup} onSelect={selectFilterCounterparty} beforeDetailsAdornment={counterpartyManagerToggleAdornment} onOpenDetails={() => void openReferenceDetails('counterparty', filterCounterparty?.guid)} detailsDisabled={!filterCounterparty?.guid} />
                <Button onClick={() => { setAttentionOnly(false); setFilterCounterparty(null); workspace.clearFilters(); }}>Сбросить фильтры</Button>
              </Stack>
            </Collapse>
            {workspace.ordersConnectionNotice ? <Typography sx={{ color: colors.muted, fontSize: 12 }}>{workspace.ordersConnectionNotice}</Typography> : null}
            {workspace.ordersError ? <Alert severity="error" onClose={() => workspace.setOrdersError(null)}>{workspace.ordersError}</Alert> : null}
            <SendDeviceOrdersButton count={workspace.queuedDeviceDraftsCount} online={workspace.online} sending={workspace.syncingDeviceDrafts} disabled={workspace.submitting} onPress={() => void workspace.syncDeviceDrafts({ force: true })} />
            {attentionOnly ? <Typography sx={{ color: colors.muted, fontSize: 12 }}>Ошибки в загруженных заказах · {visibleOrders.length}</Typography> : null}
          </Stack>
          <Box ref={ordersListScrollRef} onScroll={handleOrdersListScroll} sx={{ flex: 1, overflow: 'auto', px: 1, pb: 2, scrollbarGutter: 'stable' }}>
            {workspace.loadingOrders ? <Stack role="status" direction="row" spacing={1} sx={{ alignItems: 'center', px: 1.5, py: 2, color: colors.muted }}><CircularProgress size={18} /><Typography sx={{ fontSize: 13 }}>Обновляем заказы…</Typography></Stack> : null}
            {!workspace.loadingOrders && !visibleOrders.length ? <Box role="status" sx={{ px: 2, py: 3, color: colors.muted }}><Typography sx={{ fontSize: 14, fontWeight: 600 }}>{attentionOnly ? 'Ошибок в загруженных заказах нет' : 'Заказы не найдены'}</Typography><Typography sx={{ mt: 0.75, fontSize: 13 }}>{attentionOnly ? 'Другие заказы могут ещё загружаться.' : 'Измените условия поиска или создайте новый заказ.'}</Typography></Box> : null}
            <Stack spacing={0.45}>
              {visibleOrders.map((order) => {
                const selected = workspace.selectedGuid === order.guid;
                const readOnlyOrder = !!order.readOnly || !!order.hasRealization || (order.origin === 'onec' && !order.appGuid);
                const statusChip = orderStatusChipSx(order);
                const invoice = getClientOrderInvoicePresentation(order);
                return (
                  <Card
                    key={order.guid}
                    variant="outlined"
                    role="button" tabIndex={0} aria-pressed={selected}
                    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void selectOrderFromList(order.guid); } }}
                    onClick={() => void selectOrderFromList(order.guid)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setOrderContextMenu({
                        mouseX: event.clientX + 2,
                        mouseY: event.clientY - 6,
                        order,
                      });
                    }}
                    sx={{
                      cursor: 'pointer',
                      borderRadius: '16px',
                      borderColor: 'transparent',
                      background: selected ? 'var(--co-soft)' : readOnlyOrder ? 'var(--co-surface)' : 'var(--co-surface)',
                      boxShadow: 'none',
                      transition: 'background-color 140ms ease, border-color 140ms ease, transform 90ms ease',
                      '&:hover': { backgroundColor: selected ? 'var(--co-soft)' : 'var(--co-background)', borderColor: selected ? 'var(--co-accent)' : 'var(--co-line)' },
                      '&:active': { transform: 'scale(0.992)' },
                    }}
                  >
                    <CardContent sx={{ px: 1.5, py: 1.25, '&:last-child': { pb: 1.25 } }}>
                      <Stack spacing={0.5}>
                        <Typography sx={{ fontSize: 14, fontWeight: 650, lineHeight: 1.35, color: colors.text, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{order.counterparty?.name || 'Клиент не выбран'}</Typography>
                        <Typography sx={{ fontSize: 12, color: colors.muted }}>{orderListTitle(order)}</Typography>
                        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Box sx={{ px: 0.75, py: 0.25, borderRadius: 20, fontSize: 12, fontWeight: 600, ...statusChip }}>{getOrderDisplayStatusLabelWithQueue(order)}</Box>
                          <Typography sx={{ fontSize: 14, fontWeight: 650 }}>{formatMoney(order.totalAmount || 0, order.currency)}</Typography>
                          {invoice.visible ? (
                            <Tooltip title={invoice.label}>
                              <Stack
                                direction="row"
                                spacing={0.25}
                                sx={{
                                  alignItems: "center",
                                  borderRadius: '999px',
                                  bgcolor: 'var(--co-panel)',
                                  px: 0.65,
                                  py: 0.15
                                }}>
                                <Ionicons name={invoiceWebIcon(invoice.state)} size={11} color={invoice.color} />
                                <Typography sx={{ fontSize: 12, color: invoice.color, fontWeight: 700, lineHeight: 1.25 }}>
                                  {invoice.listLabel}
                                </Typography>
                              </Stack>
                            </Tooltip>
                          ) : null}
                        </Stack>

                      </Stack>
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>
            {workspace.loadingMoreOrders ? <Box role="status" sx={{ p: 2, textAlign: 'center', color: colors.muted }}><CircularProgress aria-label="Загрузка следующих заказов" size={20} /></Box> : null}
          </Box>
        </Paper> : null}

        <Paper ref={editorPaneRef} elevation={0} sx={{ flex: 1, minWidth: 0, width: '100%', mx: 0, alignSelf: 'stretch', minHeight: 0, height: '100%', borderRadius: 0, border: 0, overflow: 'hidden', display: showEditorPane ? 'flex' : 'none', flexDirection: 'column', bgcolor: 'var(--co-surface)' }}>
          {!workspace.hasEditableDocument ? (
            <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', p: 2 }}>
              <Stack
                spacing={1.2}
                sx={{
                  alignItems: "center",
                  maxWidth: 360,
                  textAlign: 'center'
                }}>
                <Typography sx={{ fontSize: 22, fontWeight: 700 }}>Создайте заказ</Typography>
                <Typography sx={{ color: 'var(--co-muted)', fontSize: 13 }}>Откройте новый документ. Если есть черновик, он откроется автоматически.</Typography>
                <Button variant="contained" onClick={() => setResponsivePane('customers')} sx={{ textTransform: 'none', fontWeight: 700, minHeight: 36, px: 2 }}>
                  <Stack direction="row" spacing={ui.toolbarGap / 10} sx={{
                    alignItems: "center"
                  }}>
                    <DocumentPlusIcon color="white" size={18} />
                    <span>Создать заказ</span>
                  </Stack>
                </Button>
              </Stack>
            </Box>
          ) : (
            <>
              <Box sx={{ flexShrink: 0, zIndex: 3, borderBottom: '1px solid var(--co-line)', background: 'var(--co-header)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
                <AppWorkspaceHeader colors={colors} contentSurface="plain" leading={<Button onClick={() => setResponsivePane('customers')} startIcon={<Ionicons name="arrow-back" size={20} color="inherit" />} sx={{ height: 48, bgcolor: colors.panel, color: colors.text }}>Клиенты</Button>} trailing={
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    {isSinglePane?<Button onClick={() => setResponsivePane('orders')}>Журнал</Button>:null}
                    <IconButton aria-label="Меню документа" aria-haspopup="menu" aria-expanded={!!documentMenuAnchor} onClick={event => setDocumentMenuAnchor(event.currentTarget)} disabled={workspace.loadingDetail} sx={{ width: 48, height: 48, bgcolor: colors.panel }}><Ionicons name="ellipsis-horizontal" size={22} color={colors.text} /></IconButton>
                  </Stack>
                }>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 18, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</Typography>
                    <Typography sx={{ color: colors.muted, fontSize: 12 }}>{workspace.draftMode ? 'Черновик · сохраняется автоматически' : getOrderDisplayStatusLabelWithQueue(workspace.selectedOrder)}</Typography>
                  </Box>
                </AppWorkspaceHeader>
                <Stack spacing={1.25} sx={{ px: 2, pb: 1.5 }}>
                  <Stack direction="row" sx={{alignItems:'center', gap:2, flexWrap:'wrap'}}>
                    <Typography sx={{fontWeight:600}}>{workspace.selections.counterparty?.name}</Typography>
                    <Typography sx={{color:colors.muted}}>{workspace.selections.deliveryAddress?.fullAddress || workspace.selections.deliveryAddress?.name}</Typography>
                    <Typography sx={{color:colors.muted}}>{workspace.selections.warehouse?.name}</Typography>
                    <Typography sx={{color:colors.muted}}>{draft.deliveryDate?.slice(0, 10).split('-').reverse().join('.')}</Typography>
                    <Button onClick={() => setDetailsExpanded(v => !v)} aria-expanded={detailsExpanded}>Реквизиты</Button>
                  </Stack>
                  <Collapse in={detailsExpanded}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: containerWidth >= 850 ? 'minmax(260px, 2fr) minmax(200px, 1fr) 180px auto' : containerWidth >= 580 ? '1fr 1fr' : '1fr', gap: 1.5, alignItems: 'center', pt: 0.5 }}>
                    <QuickLookupField
                      kind="counterparty"
                      label="Клиент"
                      placeholder="Название клиента или ИНН"
                      inputRef={clientInputRef}
                      value={workspace.selections.counterparty}
                      loadOptions={loadCounterpartyLookup}
                      onSelect={item => {focusProductAfterClient.current = true; setCounterparty(item);}}
                      disabled={editingLocked || workspace.mutationLocked}
                      beforeDetailsAdornment={counterpartyManagerToggleAdornment}
                      loadingAdornment={workspace.documentHeaderLoadingState.counterparty}
                      onOpenDetails={() => void openReferenceDetails('counterparty', workspace.selections.counterparty?.guid)}
                      detailsDisabled={!workspace.selections.counterparty?.guid}
                    />
                    <QuickLookupField
                      kind="organization"
                      label="Организация"
                      inputRef={organizationInputRef}
                      value={workspace.selections.organization}
                      loadOptions={loadOrganizationLookup}
                      onSelect={setOrganization}
                      disabled={editingLocked || workspace.mutationLocked}
                      loadingAdornment={workspace.documentHeaderLoadingState.organization}
                      onOpenDetails={() => void openReferenceDetails('organization', workspace.selections.organization?.guid)}
                      detailsDisabled={!workspace.selections.organization?.guid}
                    />
                    <DeliveryDateField value={workspace.draft.deliveryDate} onChange={(date) => workspace.patchDraft({ deliveryDate: date })} disabled={editingLocked} />
                  </Box>
                  </Collapse>
                  {workspace.loadingDefaults ? <Typography role="status">Загрузка условий…</Typography> : null}
                  {!workspace.readOnly && draft.counterpartyGuid && !workspace.loadingDefaults && missingConditions.length ? <Button onClick={() => setDetailsExpanded(true)} sx={{ alignSelf: 'flex-start', p: 0, minHeight: 24, color: 'var(--co-warning)', textAlign: 'left' }}>Заполните условия: {missingConditions.join(', ').toLowerCase()}</Button> : null}
                  {workspace.readOnly ? <Alert severity="info" sx={{ py: 0 }}>{workspace.selectedOrder?.readOnlyReason || 'Заказ доступен только для просмотра. Создайте копию, чтобы оформить новый заказ.'}</Alert> : null}
                  {workspace.error ? <Alert severity="error" sx={{ py: 0 }}>{workspace.error}</Alert> : null}
                  <Collapse in={detailsExpanded} id="client-order-details">
                  <Box
                    ref={editorHeaderSectionRef}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: isSinglePane
                        ? '1fr'
                        : useWideEditorGrid
                          ? 'minmax(150px, 0.9fr) minmax(220px, 1.35fr) minmax(180px, 1fr) minmax(150px, 0.8fr) minmax(150px, 0.85fr)'
                          : useMediumEditorGrid
                            ? 'repeat(3, minmax(0, 1fr))'
                            : useCompactEditorGrid
                              ? 'repeat(2, minmax(0, 1fr))'
                              : '1fr',
                      gap: 1.5,
                      alignItems: 'center',
                      maxHeight: '32vh',
                      overflowY: 'auto',
                      pt: 1,
                      pb: 0.5,
                      bgcolor: workspace.readOnly ? 'var(--co-background)' : 'var(--co-surface)',
                    }}
                  >
                    <QuickLookupField
                      kind="agreement"
                      label="Соглашение"
                      value={workspace.selections.agreement}
                      loadOptions={loadAgreementLookup}
                      onSelect={setAgreement}
                      disabled={editingLocked || !hasOrderContext}
                      loadingAdornment={workspace.documentHeaderLoadingState.agreement}
                      onOpenDetails={() => void openReferenceDetails('agreement', workspace.selections.agreement?.guid)}
                      detailsDisabled={!workspace.selections.agreement?.guid}
                    />
                    <QuickLookupField
                      kind="contract"
                      label="Договор"
                      value={workspace.selections.contract}
                      loadOptions={loadContractLookup}
                      onSelect={setContract}
                      disabled={editingLocked || !hasOrderContext}
                      loadingAdornment={workspace.documentHeaderLoadingState.contract}
                      onOpenDetails={() => void openReferenceDetails('contract', workspace.selections.contract?.guid)}
                      detailsDisabled={!workspace.selections.contract?.guid}
                    />
                    <QuickLookupField
                      kind="priceType"
                      label="Вид цены"
                      value={workspace.draft.priceTypeGuid ? { guid: workspace.draft.priceTypeGuid, name: workspace.draft.priceTypeName || 'Вид цены' } : null}
                      loadOptions={loadPriceTypeLookup}
                      onSelect={confirmHeaderPriceTypeChange}
                      disabled={editingLocked || !hasOrderContext}
                      loadingAdornment={workspace.documentHeaderLoadingState.priceType}
                      beforeDetailsAdornment={workspace.isHeaderPriceTypeCustom ? (
                        <ResetAdornmentButton title="Сбросить вид цены к соглашению" disabled={editingLocked} onClick={confirmHeaderPriceTypeReset} />
                      ) : null}
                      onOpenDetails={() => void openReferenceDetails('price-type', workspace.draft.priceTypeGuid)}
                      detailsDisabled={!workspace.draft.priceTypeGuid}
                    />
                    <InvoiceRequestWebField workspace={workspace} wide={!isSinglePane && useWideEditorGrid} />
                    <SegmentedChoiceField
                      label="Форма оплаты"
                      value={workspace.draft.paymentForm}
                      choices={PAYMENT_FORM_CHOICES}
                      disabled={editingLocked || !hasOrderContext || workspace.loadingDefaults}
                      onChange={(value) => workspace.patchDraft({ paymentForm: value })}
                      sx={{
                        bgcolor: 'transparent',
                      }}
                    />
                    <SegmentedChoiceField
                      label="Способ доставки"
                      value={workspace.draft.deliveryMethod}
                      choices={DELIVERY_METHOD_CHOICES}
                      disabled={editingLocked || !hasOrderContext || workspace.loadingDefaults}
                      onChange={(value) => workspace.patchDraft({ deliveryMethod: value })}
                      sx={{
                        bgcolor: 'transparent',
                      }}
                    />
                    <QuickLookupField
                      kind="warehouse"
                      label="Склад"
                      value={workspace.selections.warehouse}
                      loadOptions={loadWarehouseLookup}
                      onSelect={setWarehouse}
                      disabled={editingLocked || !hasOrderContext}
                      loadingAdornment={workspace.documentHeaderLoadingState.warehouse}
                      onOpenDetails={() => void openReferenceDetails('warehouse', workspace.selections.warehouse?.guid)}
                      detailsDisabled={!workspace.selections.warehouse?.guid}
                    />
                    <Box sx={{ gridColumn: !isSinglePane && useWideEditorGrid ? 'span 2' : 'auto', minWidth: 0 }}>
                      <QuickLookupField
                        kind="deliveryAddress"
                        label="Адрес доставки"
                        value={workspace.selections.deliveryAddress}
                        loadOptions={loadDeliveryAddressLookup}
                        onSelect={setDeliveryAddress}
                        disabled={editingLocked || !hasOrderContext}
                        loadingAdornment={workspace.documentHeaderLoadingState.deliveryAddress}
                        onOpenDetails={() => void openReferenceDetails('delivery-address', workspace.selections.deliveryAddress?.guid)}
                        detailsDisabled={!workspace.selections.deliveryAddress?.guid}
                        popperMinWidth={620}
                      />
                    </Box>

                    <TextField
                      size="small"
                      placeholder="Комментарий"
                      value={workspace.draft.comment}
                      onChange={(event) => workspace.patchDraft({ comment: event.target.value })}
                      disabled={editingLocked}
                      sx={{
                        gridColumn: isSinglePane ? 'span 1' : useWideEditorGrid ? 'span 2' : '1 / -1',
                        bgcolor: workspace.readOnly ? 'var(--co-background)' : 'var(--co-surface)',
                        '& .MuiInputBase-root': { height: 40, borderRadius: '12px', fontSize: 14, bgcolor: workspace.readOnly ? 'var(--co-background)' : 'var(--co-surface)' },
                        '& .MuiInputBase-input': { py: 0, lineHeight: '30px', color: workspace.readOnly ? 'var(--co-muted)' : 'var(--co-text)', WebkitTextFillColor: workspace.readOnly ? 'var(--co-muted)' : undefined },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: workspace.readOnly ? 'var(--co-line)' : undefined },
                      }}
                    />
                  </Box>
                  </Collapse>
                </Stack>
              </Box>

              {!workspace.readOnly ? <ClientOrderPriceGrid workspace={workspace}/> : null}

              <Box ref={editorScrollRef} sx={{ display: workspace.readOnly ? 'flex' : 'none', flex: 1, minHeight: 0, overflow: 'auto', px: 2, py: 0, flexDirection: 'column' }}>
                <Stack spacing={0.8} sx={{ flex: 1, minHeight: 0 }}>

                  {(!showSectionSwitcher || webEditorSection === 'items') ? (
                    <Paper
                      variant="outlined"
                      sx={{
                        borderRadius: 0,
                        p: usePhoneCompactItems ? 0 : 0,
                        borderColor: 'transparent',
                        boxShadow: 'none',
                        mx: -2,
                        overflow: 'hidden',
                        bgcolor: 'var(--co-surface)',
                        flex: usePhoneCompactItems ? undefined : 1,
                        minHeight: usePhoneCompactItems ? undefined : 0,
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      {usePhoneCompactItems ? (
                        <Box sx={{ borderTop: '1px solid var(--co-line)', pb: `${ui.itemsBottomInset}px` }}>
                          {filteredDraftItems.map((item, index) => renderDraftItemCard(item, index + 1))}
                        </Box>
                      ) : (
                        <Box sx={{ bgcolor: 'var(--co-surface)', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                          <Stack direction="row" useFlexGap spacing={1} sx={{ px: 2, py: 1.5, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
                            <Typography sx={{ fontSize: 16, fontWeight: 700 }}>В заказе <Box component="span" sx={{ color: colors.muted, fontWeight: 400 }}>{workspace.draft.items.length}</Box></Typography>
                            <TextField size="small" placeholder="Найти в заказе" value={itemsSearch} onChange={event => setItemsSearch(event.target.value)} sx={{ flex: '1 1 180px', minWidth: 150, maxWidth: 320, display: workspace.draft.items.length >= 8 || itemsSearch ? 'flex' : 'none' }} slotProps={{ htmlInput: { 'aria-label': 'Найти товар в заказе' }, input: { startAdornment: <Ionicons name="search-outline" size={18} color={colors.muted} style={{ marginRight: 8 }} /> } }} />
                            <Box sx={{ flex: 1 }} />
                            <Tooltip title={tableDensity === 'compact' ? 'Обычная плотность строк' : 'Компактные строки'}><IconButton aria-label="Плотность строк" aria-pressed={tableDensity === 'compact'} onClick={() => setTableDensity(value => value === 'compact' ? 'comfortable' : 'compact')} sx={{ width: 40, height: 40, bgcolor: colors.panel }}><Ionicons name={tableDensity === 'compact' ? 'reorder-three-outline' : 'reorder-two-outline'} size={20} color={colors.muted} /></IconButton></Tooltip>

                          </Stack>
                          <Box
                            ref={itemsTableScrollRef}
                            sx={{
                              flex: 1,
                              minHeight: 0,
                              overflow: 'auto',
                              scrollbarGutter: 'stable',
                              bgcolor: 'var(--co-surface)',
                            }}
                          >
                            {!filteredDraftItems.length ? (
                              <Box sx={{ py: 4, display: 'grid', placeItems: 'center', gap: 1.2, color: 'var(--co-muted)' }}>
                                <WebProductImage
                                  src={PRODUCT_IMAGE_PLACEHOLDER_URI}
                                  alt=""
                                  spinnerSize={20}
                                  sx={{ width: 72, height: 72, borderRadius: '18px', opacity: 0.9 }}
                                />
                                <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'var(--co-text)' }}>
                                  Товаров пока нет
                                </Typography>
                                <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'var(--co-muted)' }}>
                                  Найдите товар выше, укажите количество и нажмите Enter.
                                </Typography>
                              </Box>
                            ) : (
                              <Box
                                component="table"
                                sx={{
                                  width: '100%',
                                  minWidth: 680,
                                  '& .MuiInputBase-input': { fontSize: '14px !important' },
                                  '& .MuiInputBase-root': { minHeight: 32 },
                                  borderCollapse: 'separate',
                                  borderSpacing: 0,
                                  tableLayout: 'fixed',
                                }}
                              >
                                <colgroup>
                                  {draftItemsTable.getVisibleLeafColumns().map((column) => (
                                    <col key={column.id} style={{ width: column.getSize() }} />
                                  ))}
                                </colgroup>
                                <Box component="thead" sx={{ position: 'sticky', top: 0, zIndex: 2 }}>
                                  {draftItemsTable.getHeaderGroups().map((headerGroup) => (
                                    <Box component="tr" key={headerGroup.id}>
                                      {headerGroup.headers.map((header) => (
                                        <Box
                                          component="th"
                                          key={header.id}
                                          draggable={header.column.id !== 'actions'}
                                          onDragStart={() => {
                                            draggedDraftItemsColumnRef.current = header.column.id;
                                          }}
                                          onDragOver={(event) => event.preventDefault()}
                                          onDrop={() => moveDraftItemsColumn(header.column.id)}
                                          sx={{
                                            width: header.getSize(),
                                            minWidth: header.column.columnDef.minSize,
                                            maxWidth: header.column.columnDef.maxSize,
                                            position: 'relative',
                                            bgcolor: 'var(--co-background)',
                                            borderBottom: '1px solid var(--co-line)',
                                            borderRight: '1px solid var(--co-line)',
                                            color: 'var(--co-muted)',
                                            fontSize: 12,
                                            fontWeight: 700,
                                            lineHeight: 1.1,
                                            py: 0.75,
                                            px: ui.tableCellX + 0.35,
                                            textTransform: 'none',
                                            letterSpacing: 0,
                                            textAlign: ['total', 'price', 'quantity'].includes(header.column.id) ? 'right' : 'left',
                                            verticalAlign: 'middle',
                                            whiteSpace: 'nowrap',
                                            cursor: header.column.id !== 'actions' ? 'grab' : 'default',
                                            '&:last-of-type': { borderRight: 0 },
                                          }}
                                        >
                                          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                          {header.column.getCanResize() ? (
                                            <Box
                                              onMouseDown={header.getResizeHandler()}
                                              onTouchStart={header.getResizeHandler()}
                                              sx={{
                                                position: 'absolute',
                                                top: 0,
                                                right: -3,
                                                width: 6,
                                                height: '100%',
                                                cursor: 'col-resize',
                                                userSelect: 'none',
                                                touchAction: 'none',
                                                '&:hover': { bgcolor: 'var(--co-soft)' },
                                              }}
                                            />
                                          ) : null}
                                        </Box>
                                      ))}
                                    </Box>
                                  ))}
                                </Box>
                                <Box component="tbody">
                                  {draftItemsTable.getRowModel().rows.map((row) => {
                                    const hasRowErrors = (workspace.validation.itemMessages[row.original.key] || []).length > 0;
                                    const hasRowWarnings = (workspace.validation.itemWarnings?.[row.original.key] || []).length > 0;
                                    return (
                                      <Box
                                        component="tr"
                                        key={row.id}
                                        sx={{
                                          bgcolor: hasRowErrors ? 'var(--co-danger-soft)' : hasRowWarnings ? 'var(--co-warning-soft)' : 'var(--co-surface)',
                                          transition: 'background-color 140ms ease',
                                          '&:hover td': { bgcolor: hasRowErrors ? 'var(--co-danger-soft)' : hasRowWarnings ? 'var(--co-warning-soft)' : 'var(--co-surface)' },
                                        }}
                                      >
                                        {row.getVisibleCells().map((cell) => (
                                          <Box
                                            component="td"
                                            key={cell.id}
                                            sx={{
                                              width: cell.column.getSize(),
                                              borderBottom: '1px solid var(--co-line)',
                                              borderRight: '1px solid var(--co-line)',
                                              px: ui.tableCellX + 0.35,
                                              py: tableDensity === 'compact' ? 0.25 : 0.75,
                                              verticalAlign: 'middle',
                                              bgcolor: 'inherit',
                                              '&:last-of-type': { borderRight: 0 },
                                            }}
                                          >
                                            <Box
                                              sx={{
                                                minHeight: tableDensity === 'compact' ? 44 : 56,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: cell.column.id === 'total' ? 'flex-end' : cell.column.id === 'actions' ? 'center' : 'flex-start',
                                                width: '100%',
                                                minWidth: 0,
                                              }}
                                            >
                                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </Box>
                                          </Box>
                                        ))}
                                      </Box>
                                    );
                                  })}
                                </Box>
                              </Box>
                            )}
                          </Box>
                        </Box>
                      )}
                    </Paper>
                  ) : null}

                  <Box sx={{ display: 'none' }}>
                    <Stack
                      direction="row"
                      sx={{
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}>
                      <Box>
                        <Typography sx={{ fontSize: 16, fontWeight: 700 }}>Добавить товары</Typography>
                      </Box>
                      <ToolbarIconButton
                        title="Открыть подбор товаров"
                        icon="add-circle-outline"
                        color="var(--co-accent)"
                        onClick={() => openPicker('product')}
                        disabled={!hasOrderContext || editingLocked}
                      />
                    </Stack>
                  </Box>
                </Stack>
              </Box>
              <Box component="footer" sx={{ flexShrink: 0, borderTop: '1px solid var(--co-line)', px: 2, py: 1.5, background: colors.surface }}>
                <Stack direction="row" useFlexGap spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography role="status" aria-live="polite" sx={{ fontSize: 13, color: workspace.error ? colors.danger : colors.muted }}>{workspace.submitting ? 'Отправляется…' : workspace.saving ? 'Сохраняется…' : workspace.autosaveLabel}</Typography>
                    {!workspace.readOnly && workspace.validation.blockingMessage ? <Typography component="button" onClick={requestSubmit} sx={{ border: 0, p: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer', fontSize: 12, color: colors.danger }}>{workspace.validation.blockingMessage}</Typography> : null}
                  </Box>
                  <Stack direction="row" useFlexGap spacing={2.5} sx={{ alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', maxWidth: '100%' }}>
                    <Typography sx={{ fontSize: 12, color: colors.muted }}>Позиций: {workspace.draft.items.length}</Typography>

                    <Box sx={{ textAlign: 'right' }}><Typography sx={{ fontSize: 12, color: colors.muted }}>Итого</Typography><Typography sx={{ fontSize: 22, fontWeight: 700 }}>{formatMoney(workspace.localTotal, workspace.draft.currency)}</Typography></Box>
                    <Button variant="contained" onClick={requestSubmit} disabled={editingLocked || workspace.submitting || workspace.mutationLocked || workspace.loadingDefaults || workspace.loadingDetail} startIcon={workspace.submitting ? <CircularProgress color="inherit" size={16} /> : <Ionicons name="checkmark" size={20} color="inherit" />} sx={{ height: 48, whiteSpace: 'nowrap', px: 3 }}>{workspace.submitting ? 'Отправляется…' : 'Проверить заказ'}</Button>
                  </Stack>
                </Stack>
              </Box>
            </>
          )}
        </Paper>
      </Stack>

      <Drawer anchor={isPhoneDialog ? 'bottom' : 'right'} open={headerOpen} onClose={() => setHeaderOpen(false)}>
        <Box sx={{ width: isPhoneDialog ? '100vw' : 520, maxWidth: '100vw', height: isPhoneDialog ? '96vh' : '100%', borderTopLeftRadius: isPhoneDialog ? '18px' : 0, borderTopRightRadius: isPhoneDialog ? '18px' : 0, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--co-surface)' }}>
          <Box sx={{ px: 1.5, py: 1.25, borderBottom: '1px solid var(--co-line)' }}>
            <Stack
              direction="row"
              spacing={1}
              sx={{
                alignItems: "center",
                justifyContent: "space-between"
              }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 20, fontWeight: 700 }}>Шапка документа</Typography>
                <Typography sx={{ color: 'var(--co-muted)', fontSize: 12 }}>Значения по умолчанию можно изменить вручную.</Typography>
              </Box>
              <Button variant="outlined" onClick={() => setHeaderOpen(false)} sx={{ textTransform: 'none', fontWeight: 600 }}>Закрыть</Button>
            </Stack>
          </Box>
          <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
            <Stack spacing={1}>
              {workspace.draftMode && !workspace.draft.organizationGuid && !workspace.loadingSettings ? (
                <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1, borderColor: 'var(--co-warning)', background: 'var(--co-warning-soft)' }}>
                  <Stack spacing={0.75}>
                    <Typography sx={{ fontWeight: 700 }}>Нет организации по умолчанию</Typography>
                    <Typography sx={{ color: 'var(--co-warning)', fontSize: 12 }}>Выберите организацию. Она сохранится для следующих заказов.</Typography>
                    <Stack direction="row" spacing={0.75} useFlexGap sx={{
                      flexWrap: "wrap"
                    }}>
                      {(workspace.settings?.organizations || []).map((item) => (
                        <Button key={item.guid} variant="contained" onClick={() => void workspace.setOrganization(item)} sx={{ textTransform: 'none', fontWeight: 600, minHeight: 30 }}>
                          {item.name}
                        </Button>
                      ))}
                    </Stack>
                  </Stack>
                </Paper>
              ) : null}

              <SelectionButton label="Организация" value={workspace.selections.organization?.name} onClick={() => openPicker('organization')} disabled={editingLocked} loading={workspace.documentHeaderLoadingState.organization} />
              <Typography sx={{ color: 'var(--co-muted)', fontSize: 12 }}>{workspace.documentHeaderDefaultsState.organization}</Typography>

              <QuickLookupField
                kind="counterparty"
                label="Контрагент"
                value={workspace.selections.counterparty}
                loadOptions={loadCounterpartyLookup}
                onSelect={setCounterparty}
                disabled={editingLocked}
                beforeDetailsAdornment={counterpartyManagerToggleAdornment}
                loadingAdornment={workspace.documentHeaderLoadingState.counterparty}
              />
              <Typography sx={{ color: 'var(--co-muted)', fontSize: 12 }}>{workspace.documentHeaderDefaultsState.counterparty}</Typography>

              <Box>
                <SelectionButton label="Соглашение" value={workspace.selections.agreement?.name} onClick={() => openPicker('agreement')} disabled={editingLocked || !hasOrderContext} loading={workspace.documentHeaderLoadingState.agreement} />
                <Typography sx={{ color: 'var(--co-muted)', fontSize: 12, mt: 0.35 }}>{workspace.documentHeaderDefaultsState.agreement}</Typography>
              </Box>
              <Box>
                <SelectionButton label="Договор" value={workspace.selections.contract?.number} onClick={() => openPicker('contract')} disabled={editingLocked || !hasOrderContext} loading={workspace.documentHeaderLoadingState.contract} />
                <Typography sx={{ color: 'var(--co-muted)', fontSize: 12, mt: 0.35 }}>{workspace.documentHeaderDefaultsState.contract}</Typography>
              </Box>
              <Box>
                <SelectionButton label="Вид цены" value={workspace.draft.priceTypeName} onClick={() => openPicker('priceType')} disabled={editingLocked || !hasOrderContext} loading={workspace.documentHeaderLoadingState.priceType} />
                <Typography sx={{ color: 'var(--co-muted)', fontSize: 12, mt: 0.35 }}>из соглашения или вручную</Typography>
              </Box>
              <InvoiceRequestWebField workspace={workspace} wide={false} />
              <Box>
                <SegmentedChoiceField
                  label="Форма оплаты"
                  value={workspace.draft.paymentForm}
                  choices={PAYMENT_FORM_CHOICES}
                  disabled={editingLocked || !hasOrderContext || workspace.loadingDefaults}
                  onChange={(value) => workspace.patchDraft({ paymentForm: value })}
                />
              </Box>
              <Box>
                <SegmentedChoiceField
                  label="Способ доставки"
                  value={workspace.draft.deliveryMethod}
                  choices={DELIVERY_METHOD_CHOICES}
                  disabled={editingLocked || !hasOrderContext || workspace.loadingDefaults}
                  onChange={(value) => workspace.patchDraft({ deliveryMethod: value })}
                />
              </Box>
              <Box>
                <QuickLookupField
                  kind="warehouse"
                  label="Склад"
                  value={workspace.selections.warehouse}
                  loadOptions={loadWarehouseLookup}
                  onSelect={setWarehouse}
                  disabled={editingLocked || !hasOrderContext}
                  loadingAdornment={workspace.documentHeaderLoadingState.warehouse}
                />
                <Typography sx={{ color: 'var(--co-muted)', fontSize: 12, mt: 0.35 }}>{workspace.documentHeaderDefaultsState.warehouse}</Typography>
              </Box>
              <Box>
                <SelectionButton label="Адрес доставки" value={workspace.selections.deliveryAddress?.fullAddress} onClick={() => openPicker('deliveryAddress')} disabled={editingLocked || !hasOrderContext} loading={workspace.documentHeaderLoadingState.deliveryAddress} />
                <Typography sx={{ color: 'var(--co-muted)', fontSize: 12, mt: 0.35 }}>{workspace.documentHeaderDefaultsState.deliveryAddress}</Typography>
              </Box>
              <Box>
                <DeliveryDateField value={workspace.draft.deliveryDate} onChange={(date) => workspace.patchDraft({ deliveryDate: date })} disabled={editingLocked} />
                <Typography sx={{ color: 'var(--co-muted)', fontSize: 12, mt: 0.35 }}>{workspace.documentHeaderDefaultsState.deliveryDate}</Typography>
              </Box>

              <TextField
                label="Комментарий"
                value={workspace.draft.comment}
                onChange={(e) => workspace.patchDraft({ comment: e.target.value })}
                multiline
                minRows={5}
                disabled={editingLocked}
              />
              <TextField label="Скидки" value="Недоступно в этой версии" disabled />
            </Stack>
          </Box>
        </Box>
      </Drawer>

      <Drawer anchor={isPhoneDialog ? 'bottom' : 'right'} open={!!pickerKind} onClose={requestClosePicker}>
        <Box sx={{ width: isPhoneDialog ? '100vw' : pickerKind === 'product' ? 860 : pickerKind === 'deliveryAddress' ? 620 : 380, maxWidth: '100vw', height: isPhoneDialog ? '96vh' : '100%', borderTopLeftRadius: isPhoneDialog ? '18px' : 0, borderTopRightRadius: isPhoneDialog ? '18px' : 0, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--co-surface)' }}>
          <Box sx={{ borderBottom: '1px solid var(--co-line)', backgroundColor: 'var(--co-header)', backdropFilter: 'blur(18px)' }}>
            <AppWorkspaceHeader colors={colors} title={pickerTitle} trailing={<IconButton sx={{ width: 48, height: 48, bgcolor: colors.panel }} onClick={requestClosePicker} aria-label="Закрыть подбор"><Ionicons name="close" size={22} color={colors.text} /></IconButton>} />
            <Stack spacing={1.25} sx={{ px: 2, pb: 2 }}>
              {pickerKind === 'product' ? <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                <Chip clickable label="Есть в наличии" aria-pressed={productInStockOnly} onClick={() => setProductInStockOnly(prev => !prev)} icon={<MaterialCommunityIcons name="warehouse" size={18} color={productInStockOnly ? colors.accentText : colors.muted} />} sx={{ height: 36, bgcolor: productInStockOnly ? colors.soft : colors.panel, color: productInStockOnly ? colors.accentText : colors.muted }} />
                <Chip clickable label="Клиент уже покупал" aria-pressed={purchasedOnly} disabled={!hasOrderContext || (!purchaseHistory.ready && !purchasedOnly)} onClick={() => setPurchasedOnly(prev => !prev)} icon={<Ionicons name="time-outline" size={18} color={purchasedOnly ? colors.accentText : colors.muted} />} sx={{ height: 36, bgcolor: purchasedOnly ? colors.soft : colors.panel, color: purchasedOnly ? colors.accentText : colors.muted }} />
              </Stack> : null}
              <Stack direction={isPhoneDialog ? 'column' : 'row'} spacing={0.8} sx={{
                alignItems: isPhoneDialog ? 'stretch' : 'center'
              }}>
                <TextField
                  size="small"
                  label="Поиск"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  disabled={pickerNeedsOrderContext(pickerKind) && !hasOrderContext}
                  sx={{ flex: 1 }}
                  slotProps={{
                    input: pickerLoading ? {
                      endAdornment: (
                        <Box sx={{ width: 24, height: 24, display: 'grid', placeItems: 'center', mr: -0.4 }}>
                          <CircularProgress size={16} thickness={4.5} />
                        </Box>
                      ),
                    } : undefined
                  }}
                />
                {pickerKind === 'counterparty' || pickerKind === 'filterCounterparty' ? (
                  <Box
                    role="checkbox"
                    tabIndex={0}
                    aria-checked={counterpartyManagerOnly}
                    onClick={() => setCounterpartyManagerOnly((prev) => !prev)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      setCounterpartyManagerOnly((prev) => !prev);
                    }}
                    sx={{
                      height: 32,
                      minWidth: isPhoneDialog ? '100%' : 78,
                      px: 0.75,
                      border: `1px solid ${counterpartyManagerOnly ? 'var(--co-accent)' : 'var(--co-line)'}`,
                      borderRadius: '8px',
                      background: counterpartyManagerOnly ? 'var(--co-soft)' : 'var(--co-surface)',
                      color: counterpartyManagerOnly ? 'var(--co-accent)' : 'var(--co-text)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 0.25,
                      cursor: 'pointer',
                    }}
                  >
                    <Checkbox
                      checked={counterpartyManagerOnly}
                      size="small"
                      tabIndex={-1}
                      sx={{ p: 0, color: 'var(--co-muted)', '&.Mui-checked': { color: 'var(--co-accent)' } }}
                      slotProps={{
                        input: { readOnly: true }
                      }}
                    />
                    <Typography sx={{ fontSize: 12, fontWeight: 700, lineHeight: 1 }}>Мои</Typography>
                  </Box>
                ) : null}
              </Stack>
            </Stack>
          </Box>
          <Box onScroll={handlePickerScroll} sx={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}>
            {pickerLoadError ? <Button onClick={() => pickerKind && void loadPickerPage(pickerKind, pickerSearch, 0, false)}>Не удалось загрузить список. Повторить</Button> : null}
            {pickerKind === 'product' && hasOrderContext && !purchaseHistory.ready ? <Typography sx={{ px: 2, py: 0.5, fontSize: 12, color: 'var(--co-muted)' }}>{purchaseHistory.loading ? 'Загружается история покупок…' : 'История покупок ещё не загружена'}</Typography> : null}
            {pickerKind === 'product' && purchaseHistory.error && workspace.online ? <Button startIcon={<Ionicons name="refresh" color="inherit" />} onClick={purchaseHistory.refresh}>Повторить загрузку истории</Button> : null}
            {pickerKind === 'product' && purchasedOnly && purchaseHistory.snapshot ? <Typography sx={{ px: 2, py: 0.5, fontSize: 12, color: 'var(--co-muted)' }}>Покупки с 31.03.2026 · данные на {purchaseHistory.snapshot.asOf.slice(0, 10).split('-').reverse().join('.')}</Typography> : null}
            {pickerNeedsOrderContext(pickerKind) && !hasOrderContext ? (
              <Typography sx={{ px: 2, py: 1.5, color: 'var(--co-muted)', borderBottom: '1px solid var(--co-line)' }}>Сначала выберите организацию и контрагента.</Typography>
            ) : null}
            {!pickerLoading && !pickerLoadError && !(pickerKind === 'product' && purchasedOnly && !purchaseHistory.ready) && pickerItems.length === 0 && !(pickerNeedsOrderContext(pickerKind) && !hasOrderContext) ? (
              <Typography sx={{ px: 2, py: 1.5, color: 'var(--co-muted)', borderBottom: '1px solid var(--co-line)' }}>Ничего не найдено.</Typography>
            ) : null}
            {pickerDisplayItems.map((item: any, index) => {
              if (isWarehousePickerGroupRow(item)) {
                return (
                  <Box
                    key={item.__warehouseGroupKey}
                    sx={{
                      minHeight: 38,
                      px: 1.5,
                      py: 0.8,
                      borderBottom: '1px solid var(--co-line)',
                      bgcolor: 'var(--co-panel)',
                      color: 'var(--co-text)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                    }}
                  >
                    <Ionicons name="location-outline" size={16} color="var(--co-muted)" />
                    <Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.035em' }}>{item.name}</Typography>
                  </Box>
                );
              }
              const alreadyInOrder = pickerKind === 'product' && isProductAlreadyInOrder(item as ClientOrderProduct, workspace.draft.items);
              const selected = pickerKind === 'product' && !!item.guid && selectedProducts.has(item.guid);
              return (
                <PickerListItem
                  key={getPickerItemKey(pickerKind, item, index)}
                  item={item}
                  kind={pickerKind}
                  isFirst={index === 0}
                  disabled={alreadyInOrder}
                  note={alreadyInOrder ? 'Уже в заказе' : undefined}
                  selected={selected}
                  onSelect={(nextItem) => void handlePickerSelect(nextItem)}
                  onOpenImages={openProductGallery}
                />
              );
            })}
          </Box>
          {pickerKind === 'product' && selectedProductCount > 0 ? (
            <Box sx={{ flexShrink: 0, borderTop: '1px solid var(--co-line)', bgcolor: 'var(--co-surface)', p: 1.25 }}>
              <Button
                fullWidth
                variant="contained"
                onClick={transferSelectedProducts}
                startIcon={<Ionicons name="arrow-down-circle-outline" size={18} color="white" />}
                sx={{ minHeight: 42, borderRadius: '10px', fontWeight: 700, textTransform: 'none' }}
              >
                Добавить в заказ · {selectedProductCount}
              </Button>
            </Box>
          ) : null}
          {pickerLoading && pickerItems.length ? <Box sx={{ height: 3, bgcolor: 'var(--co-accent)', opacity: 0.18 }} /> : null}
        </Box>
      </Drawer>
      <Dialog open={confirmCloseProductPickerOpen} onClose={() => setConfirmCloseProductPickerOpen(false)} maxWidth="xs" fullWidth fullScreen={isPhoneDialog}>
        <DialogTitle>Выйти из подбора?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: 'var(--co-muted)', fontSize: 13 }}>
            Выбрано {selectedProductCount} поз. Если выйти, они не будут перенесены в заказ.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmCloseProductPickerOpen(false)} sx={{ textTransform: 'none', fontWeight: 600 }}>Остаться</Button>
          <Button color="error" onClick={closePickerImmediately} sx={{ textTransform: 'none', fontWeight: 600 }}>Выйти</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="sm" fullWidth fullScreen={isPhoneDialog}>
        <DialogTitle>Настройки даты отгрузки</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField select label="Режим" value={settingsDraft.deliveryDateMode} onChange={(e) => setSettingsDraft((prev) => ({ ...prev, deliveryDateMode: e.target.value }))}>
              <MenuItem value="NEXT_DAY">Следующий день</MenuItem>
              <MenuItem value="OFFSET_DAYS">Через N дней</MenuItem>
              <MenuItem value="FIXED_DATE">Фиксированная дата</MenuItem>
            </TextField>
            {settingsDraft.deliveryDateMode === 'OFFSET_DAYS' ? <TextField type="number" label="Смещение, дней" value={settingsDraft.deliveryDateOffsetDays} onChange={(e) => setSettingsDraft((prev) => ({ ...prev, deliveryDateOffsetDays: Number(e.target.value) }))} /> : null}
            {settingsDraft.deliveryDateMode === 'FIXED_DATE' ? <TextField type="date" label="Дата" value={settingsDraft.fixedDeliveryDate} onChange={(e) => setSettingsDraft((prev) => ({ ...prev, fixedDeliveryDate: e.target.value }))} slotProps={{
              inputLabel: { shrink: true }
            }} /> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)} sx={{ textTransform: 'none' }}>Закрыть</Button>
          <Button onClick={() => void saveDeliverySettings()} variant="contained" disabled={workspace.savingSettings} sx={{ textTransform: 'none' }}>{workspace.savingSettings ? 'Сохраняю...' : 'Сохранить'}</Button>
        </DialogActions>
      </Dialog>

      <Menu
        open={!!orderContextMenu}
        onClose={closeOrderContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={orderContextMenu ? { top: orderContextMenu.mouseY, left: orderContextMenu.mouseX } : undefined}
      >
        <MenuItem disabled={workspace.mutationLocked || workspace.loadingDetail || orderSharing.copying} onClick={() => {
          const guid = orderContextMenu?.order.guid;
          closeOrderContextMenu();
          if (guid) void orderSharing.copyFromList(guid);
        }}>
          <Stack direction="row" spacing={1} sx={{
            alignItems: "center"
          }}><Ionicons name="link-outline" size={16} color="var(--co-accent)" /><Typography sx={{ fontSize: 13, fontWeight: 600 }}>Ссылка для клиента</Typography></Stack>
        </MenuItem>
        <MenuItem onClick={openContextOrder}>
          <Stack direction="row" spacing={1} sx={{
            alignItems: "center"
          }}>
            <Ionicons name="document-text-outline" size={16} color="var(--co-text)" />
            <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Открыть</Typography>
          </Stack>
        </MenuItem>
        <MenuItem onClick={() => void runContextOrderDangerAction()} sx={{ color: orderContextMenu?.order.status === 'CANCELLED' ? 'var(--co-accent)' : 'var(--co-danger)' }}>
          <Stack direction="row" spacing={1} sx={{
            alignItems: "center"
          }}>
            <Ionicons
              name={orderContextMenu?.order.status === 'DRAFT' ? 'trash-outline' : orderContextMenu?.order.status === 'CANCELLED' ? 'refresh-outline' : 'close-circle-outline'}
              size={16}
              color={orderContextMenu?.order.status === 'CANCELLED' ? 'var(--co-accent)' : 'var(--co-danger)'}
            />
            <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
              {orderContextMenu?.order.status === 'DRAFT' ? 'Удалить черновик' : orderContextMenu?.order.status === 'CANCELLED' ? 'Восстановить' : 'Отменить заказ'}
            </Typography>
          </Stack>
        </MenuItem>
        {orderContextMenu?.order.status === 'CANCELLED' ? (
          <MenuItem onClick={() => void runContextOrderDeleteAction()} sx={{ color: 'var(--co-danger)' }}>
            <Stack direction="row" spacing={1} sx={{
              alignItems: "center"
            }}>
              <Ionicons name="trash-outline" size={16} color="var(--co-danger)" />
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Удалить из списка</Typography>
            </Stack>
          </MenuItem>
        ) : null}
      </Menu>

      <Dialog open={discardConfirm.open} onClose={() => closeDiscardConfirm('cancel')} maxWidth="xs" fullWidth fullScreen={isPhoneDialog}>
        <DialogTitle>{isResubmitTo1c ? 'Переотправить документ?' : 'Несохраненные изменения'}</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: 'var(--co-muted)', fontSize: 13 }}>
            {isQueuedResubmit
              ? 'Если сохранить изменения, документ будет переотправлен и поставлен в конец очереди.'
              : isSyncedResubmit
                ? 'Если сохранить изменения, документ будет отправлен в 1С.'
                : 'Сохранить изменения перед выходом из документа?'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => closeDiscardConfirm('cancel')} sx={{ textTransform: 'none', fontWeight: 600 }}>Остаться</Button>
          <Button color="error" onClick={() => closeDiscardConfirm('discard')} sx={{ textTransform: 'none', fontWeight: 600 }}>Не сохранять</Button>
          <Button variant="contained" onClick={() => closeDiscardConfirm('save')} sx={{ textTransform: 'none', fontWeight: 600 }}>{isResubmitTo1c ? 'Переотправить' : 'Сохранить'}</Button>
        </DialogActions>
      </Dialog>

      <Menu anchorEl={documentMenuAnchor} open={!!documentMenuAnchor} onClose={() => setDocumentMenuAnchor(null)}>
        {!((workspace.selectedOrderQueued || workspace.selectedOrderSynced) && workspace.dirty) ? <MenuItem disabled={editingLocked || workspace.saving || !workspace.validation.canSave} onClick={() => { setDocumentMenuAnchor(null); saveWithConfirm(); }}>Сохранить сейчас</MenuItem> : null}
        <MenuItem disabled={workspace.copying || workspace.saving || workspace.submitting || !workspace.hasEditableDocument} onClick={() => { setDocumentMenuAnchor(null); copyWithConfirm(); }}>Создать копию</MenuItem>
        <MenuItem onClick={() => { setDocumentMenuAnchor(null); setHeaderOpen(true); }}>Все реквизиты и счёт</MenuItem>
        <MenuItem onClick={() => { setDocumentMenuAnchor(null); setSettingsOpen(true); }}>Настройки даты отгрузки</MenuItem>
        <MenuItem onClick={() => { setDocumentMenuAnchor(null); setInspectorOpen(true); }}>Информация о заказе</MenuItem>
        <MenuItem disabled={editingLocked || !workspace.draft.items.length} onClick={() => { setDocumentMenuAnchor(null); setConfirmClearItemsOpen(true); }}>Очистить товары…</MenuItem>
        <Divider />
        <MenuItem sx={{ color: toolbarUsesRestore ? colors.accentText : colors.danger }} disabled={toolbarUsesDeleteDraft ? workspace.deletingDraft : toolbarUsesRestore ? workspace.cancelling : workspace.readOnly || workspace.cancelling} onClick={() => {
          setDocumentMenuAnchor(null);
          if (toolbarUsesDeleteDraft) { void workspace.deleteDraft(); return; }
          if (toolbarUsesRestore) { void workspace.restoreOrder(); return; }
          setPendingCancelOrder(null); setConfirmCancelOpen(true);
        }}>{toolbarUsesDeleteDraft ? 'Удалить черновик' : toolbarUsesRestore ? 'Восстановить заказ' : 'Отменить заказ…'}</MenuItem>
        <Divider />
        <MenuItem disabled={workspace.mutationLocked || orderSharing.copying} onClick={() => { setDocumentMenuAnchor(null); void orderSharing.copy(); }}>
          <Stack direction="row" spacing={1} sx={{
            alignItems: "center"
          }}><Ionicons name="link-outline" size={16} color="var(--co-accent)" /><Typography sx={{ fontSize: 13, fontWeight: 600 }}>Ссылка для клиента</Typography></Stack>
        </MenuItem>
      </Menu>
      <OrderShareFeedback message={orderSharing.feedback} onDismiss={orderSharing.dismissFeedback} />
      <Dialog open={confirmSubmitOpen} onClose={() => setConfirmSubmitOpen(false)} maxWidth="md" fullWidth fullScreen={isPhoneDialog}>
        <DialogTitle>{isErrorRetryTo1c ? 'Повторить отправку в 1С?' : isResubmitTo1c ? 'Переотправить в 1С?' : 'Отправить в 1С?'}</DialogTitle>
        <DialogContent>
          <Typography sx={{fontWeight:600}}>{workspace.selections.counterparty?.name}</Typography>
          <Typography>{workspace.selections.deliveryAddress?.fullAddress || workspace.selections.deliveryAddress?.name}</Typography>
          <Box component="table" sx={{width:'100%', borderCollapse:'collapse', my:2}}><tbody>{draft.items.filter(item => !isCancelledDraftItem(item)).map(item => <tr key={item.key}><td>{item.productName}</td><td>{item.quantity} {getPackageDisplayText(item)}</td><td style={{textAlign:'right'}}>{formatMoney(computeLineTotal(item, draft.generalDiscountPercent), item.currency)}</td></tr>)}</tbody></Box>
          <Typography sx={{fontWeight:700, mb:2}}>Итого: {formatMoney(workspace.localTotal, draft.currency)}</Typography>

          <Typography sx={{ color: 'var(--co-muted)', fontSize: 13 }}>
            {isQueuedResubmit
              ? 'Документ будет сохранен и поставлен в конец очереди.'
              : isSyncedResubmit
                ? 'Изменения будут сохранены и отправлены в 1С.'
                : isErrorRetryTo1c
                  ? 'Документ уже сохранен в 1С, но не проведен. Повторная отправка попробует провести его еще раз.'
              : 'Документ будет поставлен в очередь обмена. После отправки часть полей станет недоступна для редактирования.'}
          </Typography>
          {workspace.validation.warningMessage ? (
            <Alert severity="warning" sx={{ mt: 1.5 }}>
              {workspace.validation.warningMessage}
            </Alert>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmSubmitOpen(false)} sx={{ textTransform: 'none', fontWeight: 600 }}>Остаться</Button>
          <Button variant="contained" color="secondary" onClick={() => void submitWithConfirm()} disabled={editingLocked || workspace.submitting || !workspace.canSubmitOrder} sx={{ textTransform: 'none', fontWeight: 600 }}>
            {workspace.submitting ? 'Отправляю...' : isQueuedResubmit ? 'В конец очереди' : isErrorRetryTo1c ? 'Повторить' : 'Отправить в 1С'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmSaveOpen} onClose={() => setConfirmSaveOpen(false)} maxWidth="xs" fullWidth fullScreen={isPhoneDialog}>
        <DialogTitle>Сохранить документ?</DialogTitle>
        <DialogContent>
          <Alert severity="warning">{workspace.validation.warningMessage}</Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmSaveOpen(false)} sx={{ textTransform: 'none', fontWeight: 600 }}>Остаться</Button>
          <Button
            variant="contained"
            onClick={() => {
              setConfirmSaveOpen(false);
              void workspace.saveDraft({ reason: 'manual' });
            }}
            disabled={workspace.saving || !workspace.validation.canSave}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {workspace.saving ? 'Сохраняю...' : 'Сохранить'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!confirmCopyOpen} onClose={() => setConfirmCopyOpen(null)} maxWidth="xs" fullWidth fullScreen={isPhoneDialog}>
        <DialogTitle>{confirmCopyOpen === 'save-copy' ? 'Скопировать с изменениями?' : 'Скопировать документ?'}</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: 'var(--co-muted)', fontSize: 13 }}>
            {confirmCopyOpen === 'save-copy'
              ? 'Будет создан отдельный редактируемый черновик. Ошибки исходного документа не помешают копированию.'
              : 'Будет создан новый черновик-копия, и он сразу откроется.'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmCopyOpen(null)} sx={{ textTransform: 'none', fontWeight: 600 }}>Отмена</Button>
          <Button variant="contained" onClick={() => void runCopyConfirm()} disabled={workspace.copying || workspace.saving} sx={{ textTransform: 'none', fontWeight: 600 }}>
            {workspace.copying ? 'Копирую...' : 'Скопировать'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmCancelOpen} onClose={() => { setConfirmCancelOpen(false); setPendingCancelOrder(null); }} maxWidth="xs" fullWidth fullScreen={isPhoneDialog}>
        <DialogTitle>{currentCancelTargetQueued ? 'Документ в очереди' : currentCancelTargetCancelled ? 'Восстановить заказ?' : 'Отменить заказ?'}</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: 'var(--co-muted)', fontSize: 13 }}>
            {currentCancelTargetQueued
              ? 'Можно снять документ с очереди и продолжить редактирование, либо удалить локальный документ.'
              : currentCancelTargetCancelled
                ? 'Отмененный локальный заказ вернется в черновики и снова станет доступен для редактирования.'
              : 'Заказ будет переведен в статус отмененного. Действие нельзя будет продолжить как обычное редактирование черновика.'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setConfirmCancelOpen(false); setPendingCancelOrder(null); }} sx={{ textTransform: 'none', fontWeight: 600 }}>Остаться</Button>
          {currentCancelTargetQueued ? (
            <Button
              color="error"
              onClick={() => {
                const target = currentCancelTarget ? { guid: currentCancelTarget.guid, revision: currentCancelTarget.revision } : undefined;
                setConfirmCancelOpen(false);
                setPendingCancelOrder(null);
                void workspace.deleteDraft(target?.guid);
              }}
              disabled={workspace.deletingDraft}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              {workspace.deletingDraft ? 'Удаляю...' : 'Удалить'}
            </Button>
          ) : null}
          <Button
            variant="contained"
            color={currentCancelTargetQueued || currentCancelTargetCancelled ? 'primary' : 'error'}
            onClick={() => {
              const target = pendingCancelOrder ? { guid: pendingCancelOrder.guid, revision: pendingCancelOrder.revision } : undefined;
              setConfirmCancelOpen(false);
              setPendingCancelOrder(null);
              if (currentCancelTargetQueued) {
                void workspace.unqueueOrder(target);
              } else if (currentCancelTargetCancelled) {
                void workspace.restoreOrder(target);
              } else {
                void workspace.cancelOrderConfirmed(target);
              }
            }}
            disabled={workspace.cancelling}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {workspace.cancelling ? 'Выполняю...' : currentCancelTargetQueued ? 'Снять с очереди' : currentCancelTargetCancelled ? 'Восстановить' : 'Отменить заказ'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!pendingPriceTypeAction} onClose={() => setPendingPriceTypeAction(null)} maxWidth="xs" fullWidth fullScreen={isPhoneDialog}>
        <DialogTitle>{pendingPriceTypeAction?.type === 'reset-header' ? 'Сбросить вид цены?' : 'Сменить вид цены?'}</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: 'var(--co-muted)', fontSize: 13 }}>
            {pendingPriceTypeAction?.type === 'reset-header'
              ? 'Вид цены и ручные цены строк будут сброшены к значениям соглашения. Продолжить?'
              : 'Цены строк будут пересчитаны по выбранному виду цены. Ручные цены останутся произвольными. Продолжить?'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingPriceTypeAction(null)} sx={{ textTransform: 'none', fontWeight: 600 }}>Отмена</Button>
          <Button
            variant="contained"
            onClick={applyPendingPriceTypeAction}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Продолжить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmClearItemsOpen} onClose={() => setConfirmClearItemsOpen(false)} maxWidth="xs" fullWidth fullScreen={isPhoneDialog}>
        <DialogTitle>Удалить все строки?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: 'var(--co-muted)', fontSize: 13 }}>
            Все товары будут удалены из документа. Действие можно отменить только вручную, добавив товары заново.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClearItemsOpen(false)} sx={{ textTransform: 'none', fontWeight: 600 }}>Отмена</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              setConfirmClearItemsOpen(false);
              workspace.clearItems();
            }}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Удалить
          </Button>
        </DialogActions>
      </Dialog>

      <ProductImageGalleryDialog productImagePreview={productImagePreview} setProductImagePreview={setProductImagePreview} isPhoneDialog={isPhoneDialog} />

      <ReferenceDetailsDialog
        open={referenceDetailsOpen}
        loading={referenceDetailsLoading}
        error={referenceDetailsError}
        details={referenceDetails}
        fullScreen={isPhoneDialog}
        onClose={() => setReferenceDetailsOpen(false)}
      />

      <Drawer anchor={isPhoneDialog ? 'bottom' : 'right'} open={inspectorOpen} onClose={() => setInspectorOpen(false)}>
        <Box sx={{ width: isPhoneDialog ? '100vw' : 420, height: isPhoneDialog ? '92vh' : '100%', p: 2.25, borderTopLeftRadius: isPhoneDialog ? '18px' : 0, borderTopRightRadius: isPhoneDialog ? '18px' : 0 }}>
          <Stack spacing={0.8}>
            <Typography sx={{ fontSize: 18, fontWeight: 700 }}>Инспектор заказа</Typography>
            <Paper variant="outlined" sx={{ borderRadius: '18px', p: 1.75 }}>
              <Stack spacing={0.75}>
                <Typography sx={{ fontWeight: 700 }}>Статус и 1С</Typography>
                <Typography sx={{ fontSize: 13, color: 'var(--co-muted)' }}>Revision: {workspace.draft.revision || '—'}</Typography>
                <Typography sx={{ fontSize: 13, color: 'var(--co-muted)' }}>Статус: {workspace.selectedOrder ? getOrderDisplayStatusLabelWithQueue(workspace.selectedOrder) : '—'}</Typography>
                <Typography sx={{ fontSize: 13, color: 'var(--co-muted)' }}>Sync state: {workspace.syncLabels[workspace.selectedOrder?.syncState || ''] || workspace.selectedOrder?.syncState || '—'}</Typography>
                <Typography sx={{ fontSize: 13, color: 'var(--co-muted)' }}>Организация: {workspace.selectedOrder?.organization?.name || '—'}</Typography>
                <Typography sx={{ fontSize: 13, color: 'var(--co-muted)' }}>Документ 1С: {workspace.selectedOrder?.number1c || 'Еще не создан'}</Typography>
              </Stack>
            </Paper>
            <Paper variant="outlined" sx={{ borderRadius: '18px', p: 1.75 }}>
              <Stack spacing={1}>
                <Typography sx={{ fontWeight: 700 }}>История</Typography>
                {!workspace.selectedOrder?.events.length ? <Typography sx={{ fontSize: 13, color: 'var(--co-muted)' }}>Событий пока нет.</Typography> : workspace.selectedOrder.events.map((event) => (
                  <Box key={event.id} sx={{ borderRadius: '14px', bgcolor: 'var(--co-background)', px: 1.4, py: 1.2 }}>
                    <Typography sx={{ fontWeight: 600 }}>{event.eventType} • rev {event.revision}</Typography>
                    <Typography sx={{ fontSize: 12, color: 'var(--co-muted)' }}>{event.source} • {formatDateTime(event.createdAt)}</Typography>
                  </Box>
                ))}
              </Stack>
            </Paper>
          </Stack>
        </Box>
      </Drawer>
    </Box>
    </ClientOrdersWebTheme>
  );
}
