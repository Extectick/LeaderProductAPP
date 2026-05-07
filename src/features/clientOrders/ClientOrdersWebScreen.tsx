import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';
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
  getCounterpartyTaxMeta,
  getPackageDisplayText,
  getPickerItemMeta,
  getPickerItemTitle,
  getQuantityInputWidthPx,
  hasSinglePackage,
  packageLabel,
  pickerNeedsCounterparty,
  type ClientOrdersPickerKind,
  unitLabel,
} from './lib/clientOrdersUi';
import { useClientOrdersWorkspace } from './hooks/useClientOrdersWorkspace';
import type {
  ClientOrderAgreementOption,
  ClientOrderContractOption,
  ClientOrderCounterpartyOption,
  ClientOrderDeliveryAddressOption,
  ClientOrder,
  ClientOrderOrganization,
  ClientOrderPriceTypeOption,
  ClientOrderProduct,
  ClientOrderReferenceDetails,
  ClientOrderReferenceKind,
  ClientOrderWarehouseOption,
} from '@/utils/clientOrdersService';
import { getClientOrderReferenceDetails } from '@/utils/clientOrdersService';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  ClickAwayListener,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { useWindowDimensions } from 'react-native';
import {
  DeliveryDateField,
  DocumentPlusIcon,
  ReferenceDetailsDialog,
  ResetAdornmentButton,
  ToolbarIconButton,
} from './screen/desktop/ClientOrdersDesktopUi';

type PickerKind = ClientOrdersPickerKind;
type ResponsivePane = 'orders' | 'editor';
type PendingPriceTypeAction =
  | { type: 'change-header'; priceType: ClientOrderPriceTypeOption | null }
  | { type: 'reset-header' };
const PRODUCT_IN_STOCK_ONLY_STORAGE_KEY = 'clientOrders.productPicker.inStockOnly';

function statusTone(status: string) {
  if (status === 'CANCELLED') return 'error';
  if (status === 'SENT_TO_1C' || status === 'SYNCED') return 'success';
  if (status === 'QUEUED') return 'warning';
  return 'default';
}

function SelectionButton(props: { label: string; value?: string | null; onClick: () => void; disabled?: boolean }) {
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
      <Typography sx={{ position: 'absolute', top: -5, left: 10, px: 0.35, bgcolor: '#FFFFFF', fontSize: 10, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>
        {props.label}
      </Typography>
      <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#0F172A', textAlign: 'left', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '26px' }}>{props.value || 'Выбрать'}</Typography>
    </Button>
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
      <Typography sx={{ position: 'absolute', top: -5, left: 10, zIndex: 1, px: 0.35, bgcolor: '#FFFFFF', fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>
        {props.label}
      </Typography>
      <TextField
        fullWidth
        size="small"
        placeholder={props.placeholder || 'Поиск'}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        sx={{
          '& .MuiInputBase-root': { height: 32, borderRadius: '6px', fontSize: 11, fontWeight: 800 },
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
      <Typography sx={{ position: 'absolute', top: -5, left: 10, zIndex: 1, px: 0.35, bgcolor: '#FFFFFF', fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>
        {props.label}
      </Typography>
      <TextField
        select
        fullWidth
        size="small"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        SelectProps={{
          displayEmpty: true,
          renderValue: (selected) => props.renderValue ? props.renderValue(String(selected || '')) : String(selected || ''),
        }}
        sx={{
          '& .MuiInputBase-root': { height: 32, borderRadius: '6px', fontSize: 11, fontWeight: 800 },
          '& .MuiSelect-select': { py: 0, lineHeight: '32px' },
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

function formatQuantityInputValue(value: number, weight: boolean) {
  const normalized = weight ? value.toFixed(3) : String(Math.round(value));
  return normalized.replace(/\.?0+$/, '');
}

function getQuantityControlWidthPx(value: unknown, buttonSize: number, minInputWidth: number, maxInputWidth: number) {
  return getQuantityInputWidthPx(value, minInputWidth, maxInputWidth) + buttonSize * 2 + 8;
}

function receiptPriceLabel(item: any) {
  return item?.receiptPrice === null || item?.receiptPrice === undefined
    ? 'Цена поступления —'
    : `Цена поступления ${formatMoney(item.receiptPrice, item.currency)}`;
}

function productPickerMetaParts(item: any) {
  return {
    code: item?.code || 'Без кода',
    receiptPrice: item?.receiptPrice === null || item?.receiptPrice === undefined
      ? '—'
      : formatMoney(item.receiptPrice, item.currency),
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

function DraftItemMeta({ item }: { item: any }) {
  const meta = draftItemMetaParts(item);
  const iconSx = { display: 'inline-flex', alignItems: 'center', color: '#64748B', mr: 0.35, verticalAlign: 'text-bottom' };
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0, flexWrap: 'wrap' }}>
      <Box component="span">{meta.code}</Box>
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
        <Box component="span" sx={iconSx}><Ionicons name="pricetag-outline" size={11} /></Box>
        {meta.receiptPrice}
      </Box>
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
        <Box component="span" sx={iconSx}><Ionicons name="cube-outline" size={11} /></Box>
        {meta.stock}
      </Box>
    </Box>
  );
}

function stepQuantity(item: any, direction: 1 | -1) {
  const weight = isWeightDraftItem(item);
  const current = Number(String(item.quantity || '').replace(',', '.')) || 0;
  const step = 1;
  const min = weight ? 0.001 : 1;
  return formatQuantityInputValue(Math.max(min, current + direction * step), weight);
}

const compactInputSx = {
  '& .MuiInputBase-root': { height: 28, borderRadius: '6px', fontSize: 11 },
  '& .MuiInputBase-input': { py: 0, fontSize: 12, lineHeight: '28px' },
  '& .MuiFormHelperText-root': { mx: 0, mt: 0.25, fontSize: 10, lineHeight: 1.1 },
} as const;

function PickerListItem(props: {
  item: any;
  kind: PickerKind | null;
  onSelect: (item: any) => void;
  isFirst?: boolean;
  disabled?: boolean;
  note?: string;
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
        isFirst={props.isFirst}
        disabled={props.disabled}
        note={props.note}
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
        borderTop: props.isFirst ? '1px solid #D8E2F0' : 0,
        borderBottom: '1px solid #D8E2F0',
        background: '#FFFFFF',
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
        '&:hover': { backgroundColor: disabled ? '#FFFFFF' : '#F1F5F9' },
        '&:active': disabled ? {} : { transform: 'scale(0.985)', backgroundColor: '#E2E8F0' },
        '&:focus-visible': { outline: '2px solid #2563EB', outlineOffset: '-2px' },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{
          fontWeight: 800,
          color: '#0F172A',
          fontSize: 13,
          lineHeight: 1.2,
          display: '-webkit-box',
          WebkitLineClamp: 1,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>{title}</Typography>
        {meta ? <Typography sx={{ fontSize: 10, color: '#64748B', mt: 0.3 }}>{meta}</Typography> : null}
        {taxMeta ? <Typography sx={{ fontSize: 12, color: '#334155', fontWeight: 800, mt: 0.25 }}>{taxMeta}</Typography> : null}
        {props.note ? <Typography sx={{ fontSize: 10.5, color: '#DC2626', fontWeight: 800, mt: 0.35 }}>{props.note}</Typography> : null}
      </Box>
    </Box>
  );
}

function ProductPickerListItem(props: {
  item: ClientOrderProduct;
  onSelect: (item: ClientOrderProduct) => void;
  isFirst?: boolean;
  disabled?: boolean;
  note?: string;
}) {
  const title = props.item.name || getPickerItemTitle(props.item);
  const stockAvailable = Number(props.item.stock?.available ?? props.item.stock?.quantity ?? 0);
  const disabled = !!props.disabled;
  const meta = productPickerMetaParts(props.item);
  const iconSx = { display: 'inline-flex', alignItems: 'center', color: '#64748B', mr: 0.35, verticalAlign: 'text-bottom' };

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
        borderTop: props.isFirst ? '1px solid #D8E2F0' : 0,
        borderBottom: '1px solid #D8E2F0',
        background: '#FFFFFF',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'block',
        px: 1.2,
        py: 1.05,
        textAlign: 'left',
        opacity: disabled ? 0.55 : 1,
        transition: 'background-color 160ms ease, color 160ms ease, transform 110ms ease',
        '&:hover': { backgroundColor: disabled ? '#FFFFFF' : '#F1F5F9' },
        '&:active': disabled ? {} : { transform: 'scale(0.985)', backgroundColor: '#E2E8F0' },
        '&:focus-visible': { outline: '2px solid #2563EB', outlineOffset: '-2px' },
      }}
    >
      <Typography
        sx={{
          fontWeight: 800,
          color: '#0F172A',
          fontSize: 14,
          lineHeight: 1.2,
        }}
      >
        {title}
      </Typography>
      <Box sx={{ mt: 0.55, display: 'flex', alignItems: 'center', gap: 0.9, flexWrap: 'wrap', minWidth: 0 }}>
        <Typography sx={{ fontSize: 10.5, color: '#64748B', fontWeight: 700 }}>{meta.code}</Typography>
        <Typography sx={{ fontSize: 10.5, color: '#64748B', fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>
          <Box component="span" sx={iconSx}><Ionicons name="pricetag-outline" size={11} /></Box>
          {meta.receiptPrice}
        </Typography>
        <Typography sx={{ fontSize: 10.5, color: stockAvailable > 0 ? '#15803D' : '#166534', fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>
          <Box component="span" sx={iconSx}><Ionicons name="cube-outline" size={11} /></Box>
          {meta.stock}
        </Typography>
      </Box>
      {props.note ? <Typography sx={{ mt: 0.35, fontSize: 10.5, color: '#DC2626', fontWeight: 800 }}>{props.note}</Typography> : null}
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
  dense?: boolean;
};

function QuickLookupField<T extends { guid?: string | null }>(props: QuickLookupFieldProps<T>) {
  const { kind, label, value, placeholder, disabled, loadOptions, onSelect, onOpenDetails, detailsDisabled, detailsTooltip, beforeDetailsAdornment, dense } = props;
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<T[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(false);
  const [offset, setOffset] = React.useState(0);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const anchorRef = React.useRef<HTMLDivElement | null>(null);
  const requestIdRef = React.useRef(0);
  const valueLabel = value ? getPickerItemTitle(value) : '';
  const inputDisabled = !!disabled && !onOpenDetails;
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedValueLabel = valueLabel.trim().toLowerCase();
  const useDefaultListing = !normalizedQuery || normalizedQuery === normalizedValueLabel;

  React.useEffect(() => {
    if (open) return;
    setQuery(valueLabel);
  }, [open, valueLabel]);

  const loadPage = React.useCallback(async (search: string, nextOffset = 0, append = false) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const result = await loadOptions({ search, limit: 25, offset: nextOffset });
      if (requestIdRef.current !== requestId) return;
      const nextItems = result.items || [];
      setItems((prev) => (append ? [...prev, ...nextItems] : nextItems));
      setOffset(nextOffset);
      setHasMore(nextOffset + nextItems.length < (result.meta?.total || 0));
      if (!append) setActiveIndex(0);
    } catch {
      if (requestIdRef.current !== requestId) return;
      if (!append) setItems([]);
      setHasMore(false);
    } finally {
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
    setOpen(false);
    setItems([]);
    setQuery(valueLabel);
  }, [valueLabel]);

  const selectItem = React.useCallback(async (item: T) => {
    await onSelect(item);
    setQuery(getPickerItemTitle(item));
    setOpen(false);
    setItems([]);
  }, [onSelect]);

  const handleScroll = React.useCallback((event: React.UIEvent<HTMLDivElement>) => {
    if (loading || !hasMore) return;
    const target = event.currentTarget;
    const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remaining > 140) return;
    void loadPage(useDefaultListing ? '' : query, offset + 25, true);
  }, [hasMore, loadPage, loading, offset, query, useDefaultListing]);

  const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
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
          <Typography sx={{ position: 'absolute', top: -5, left: 10, zIndex: 1, px: 0.35, bgcolor: '#FFFFFF', fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>
            {label}
          </Typography>
        ) : null}
        <TextField
          fullWidth
          size="small"
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
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          InputProps={(onOpenDetails || beforeDetailsAdornment) ? {
            readOnly: !!disabled,
            endAdornment: (
              <Stack direction="row" alignItems="center" spacing={0.1} sx={{ mr: -0.4 }}>
                {beforeDetailsAdornment}
                {onOpenDetails ? (
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
                          if (!detailsDisabled) onOpenDetails();
                        }}
                        sx={{
                          width: 24,
                          height: 24,
                          color: detailsDisabled ? '#CBD5E1' : '#64748B',
                          transition: 'background-color 140ms ease, color 140ms ease, transform 90ms ease',
                          '&:hover': { bgcolor: detailsDisabled ? 'transparent' : '#EFF6FF', color: detailsDisabled ? '#CBD5E1' : '#2563EB' },
                          '&:active': detailsDisabled ? {} : { transform: 'scale(0.92)' },
                        }}
                      >
                        <Ionicons name="search-outline" size={14} />
                      </IconButton>
                    </span>
                  </Tooltip>
                ) : null}
              </Stack>
            ),
          } : disabled ? { readOnly: true } : undefined}
          sx={{
            '& .MuiInputBase-root': { height: dense ? 28 : 30, borderRadius: '6px', fontSize: 10.5, fontWeight: 800, alignItems: 'center', bgcolor: disabled ? '#F8FAFC' : '#FFFFFF' },
            '& .MuiInputBase-input': { py: 0, lineHeight: dense ? '28px' : '34px' },
          }}
        />
        <Popper
          open={open && !disabled}
          anchorEl={anchorRef.current}
          placement="bottom-start"
          sx={{ zIndex: 1500, width: anchorRef.current?.clientWidth || 260 }}
        >
          <Paper variant="outlined" sx={{ mt: 0.35, maxHeight: 280, overflowY: 'auto', borderRadius: '6px', boxShadow: '0 12px 32px rgba(15, 23, 42, 0.16)' }} onScroll={handleScroll}>
            {!loading && !visibleItems.length ? (
              <Typography sx={{ px: 1, py: 0.8, fontSize: 12, color: '#64748B' }}>Ничего не найдено</Typography>
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
                    borderBottom: '1px solid #E2E8F0',
                    background: active ? '#EFF6FF' : '#FFFFFF',
                    cursor: 'pointer',
                    textAlign: 'left',
                    px: 1,
                    py: 0.75,
                    transition: 'background-color 140ms ease, transform 90ms ease',
                    '&:hover': { backgroundColor: '#EFF6FF' },
                    '&:active': { transform: 'scale(0.99)', backgroundColor: '#DBEAFE' },
                  }}
                >
                  <Stack direction="row" spacing={0.75} alignItems="flex-start" sx={{ minWidth: 0 }}>
                    <Box sx={{ width: 16, pt: 0.1, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                      {selected ? <Ionicons name="checkmark-circle" size={15} color="#16A34A" /> : null}
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 900, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</Typography>
                      {meta ? <Typography sx={{ fontSize: 10, color: selected ? '#16A34A' : '#64748B', fontWeight: selected ? 800 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</Typography> : null}
                      {taxMeta ? <Typography sx={{ fontSize: 10, color: '#334155', fontWeight: 800, mt: 0.1 }}>{taxMeta}</Typography> : null}
                    </Box>
                  </Stack>
                </Box>
              );
            })}
            {loading ? <Box sx={{ height: 2, bgcolor: '#2563EB', opacity: 0.18 }} /> : null}
          </Paper>
        </Popper>
      </Box>
    </ClickAwayListener>
  );
}

function getDisplayedPriceValue(manualPrice: string, basePrice?: number | null) {
  if (manualPrice.trim()) return manualPrice;
  if (basePrice === null || basePrice === undefined || basePrice <= 0) return '';
  return String(basePrice);
}
export default function ClientOrdersWebScreen() {
  const { width: viewportWidth } = useWindowDimensions();
  const layoutTier = resolveClientOrdersLayoutTier(viewportWidth);
  const isSinglePane = viewportWidth < 980;
  const isPhoneDialog = viewportWidth < 760;
  const [responsivePane, setResponsivePane] = React.useState<ResponsivePane>('orders');
  const [webEditorSection, setWebEditorSection] = React.useState<'header' | 'items'>('items');
  const ordersPaneRef = React.useRef<HTMLDivElement | null>(null);
  const editorPaneRef = React.useRef<HTMLDivElement | null>(null);
  const editorScrollRef = React.useRef<HTMLDivElement | null>(null);
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
  const [inspectorOpen, setInspectorOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [headerOpen, setHeaderOpen] = React.useState(false);
  const [filterCounterparty, setFilterCounterparty] = React.useState<ClientOrderCounterpartyOption | null>(null);
  const [pickerKind, setPickerKind] = React.useState<PickerKind | null>(null);
  const [pickerSearch, setPickerSearch] = React.useState('');
  const [pickerItems, setPickerItems] = React.useState<any[]>([]);
  const [pickerLoading, setPickerLoading] = React.useState(false);
  const [pickerHasMore, setPickerHasMore] = React.useState(false);
  const [pickerOffset, setPickerOffset] = React.useState(0);
  const [productInStockOnly, setProductInStockOnly] = React.useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(PRODUCT_IN_STOCK_ONLY_STORAGE_KEY) === '1';
  });
  const pickerRequestIdRef = React.useRef(0);
  const [settingsDraft, setSettingsDraft] = React.useState({
    deliveryDateMode: 'NEXT_DAY',
    deliveryDateOffsetDays: 1,
    fixedDeliveryDate: '',
  });
  const [confirmSubmitOpen, setConfirmSubmitOpen] = React.useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = React.useState(false);
  const [confirmClearItemsOpen, setConfirmClearItemsOpen] = React.useState(false);
  const [pendingPriceTypeAction, setPendingPriceTypeAction] = React.useState<PendingPriceTypeAction | null>(null);
  const [pendingOrganization, setPendingOrganization] = React.useState<ClientOrderOrganization | null>(null);
  const [itemsSearch, setItemsSearch] = React.useState('');
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
  const draftCounterpartyGuid = draft.counterpartyGuid;
  const draftAgreementGuid = draft.agreementGuid;
  const draftWarehouseGuid = draft.warehouseGuid;
  const draftPriceTypeGuid = draft.priceTypeGuid;
  const canLoadMorePickerItems = !!pickerKind && pickerHasMore && !pickerLoading;

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

  const desktopOrdersPaneWidth = getClientOrdersResponsiveMetrics(layoutTier, 'wide').listPaneWidth;
  const effectiveOrdersPaneWidth = isSinglePane ? viewportWidth : (ordersPaneWidth || desktopOrdersPaneWidth);
  const effectiveEditorPaneWidth = isSinglePane ? viewportWidth : (editorPaneWidth || Math.max(viewportWidth - effectiveOrdersPaneWidth - 48, 0));
  const editorTier = resolveClientOrdersEditorTier(effectiveEditorPaneWidth);
  const ui = getClientOrdersResponsiveMetrics(layoutTier, editorTier);
  const useWideEditorGrid = effectiveEditorPaneWidth >= 1280;
  const useMediumEditorGrid = effectiveEditorPaneWidth >= 1020;
  const useCompactEditorGrid = effectiveEditorPaneWidth >= 760;
  const useCompactTable = !isSinglePane && editorTier === 'compact';
  const useItemCards = isSinglePane || editorTier === 'cards';
  const usePhoneCompactItems = useItemCards && layoutTier === 'phone';
  const forceSectionSwitcher = !isSinglePane
    && editorHeaderSectionHeight > 0
    && editorScrollHeight > 0
    && editorHeaderSectionHeight > editorScrollHeight / 3;
  const showSectionSwitcher = isSinglePane || useItemCards || forceSectionSwitcher;
  const previousShowSectionSwitcherRef = React.useRef(showSectionSwitcher);

  React.useEffect(() => {
    const previous = previousShowSectionSwitcherRef.current;
    previousShowSectionSwitcherRef.current = showSectionSwitcher;
    if (!previous && showSectionSwitcher && webEditorSection !== 'items') {
      setWebEditorSection('items');
    }
  }, [showSectionSwitcher, webEditorSection]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PRODUCT_IN_STOCK_ONLY_STORAGE_KEY, productInStockOnly ? '1' : '0');
  }, [productInStockOnly]);

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

  const quantityColumnWidth = React.useMemo(() => {
    const fallback = useCompactTable ? 104 : 124;
    if (!filteredDraftItems.length) return fallback;
    const buttonSize = 28;
    const minInputWidth = useCompactTable ? 44 : 52;
    const maxInputWidth = useCompactTable ? 102 : 126;
    const maxWidth = filteredDraftItems.reduce((currentMax, item) => (
      Math.max(currentMax, getQuantityControlWidthPx(item.quantity, buttonSize, minInputWidth, maxInputWidth))
    ), fallback);
    return Math.max(fallback, maxWidth + 8);
  }, [filteredDraftItems, useCompactTable]);

  React.useEffect(() => {
    if (!settings) return;
    setSettingsDraft({
      deliveryDateMode: settings.deliveryDateMode,
      deliveryDateOffsetDays: settings.deliveryDateOffsetDays,
      fixedDeliveryDate: settings.fixedDeliveryDate ? String(settings.fixedDeliveryDate).slice(0, 10) : '',
    });
  }, [settings]);

  React.useEffect(() => {
    if (!isSinglePane || workspace.hasEditableDocument) return;
    setResponsivePane('orders');
  }, [isSinglePane, workspace.hasEditableDocument]);

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
    setPickerKind(kind);
    setPickerSearch('');
    setPickerItems([]);
    setPickerOffset(0);
  }, []);

  const loadPickerPage = React.useCallback(async (kind: PickerKind, search: string, offset = 0, append = false) => {
    const requestId = ++pickerRequestIdRef.current;
    setPickerLoading(true);
    try {
      if (pickerNeedsCounterparty(kind) && !draftCounterpartyGuid) {
        if (pickerRequestIdRef.current !== requestId) return;
        setPickerItems([]);
        setPickerOffset(offset);
        setPickerHasMore(false);
        return;
      }

      if (kind === 'organization') {
        const all = settings?.organizations || [];
        const filtered = all.filter((item) => !search || item.name.toLowerCase().includes(search.toLowerCase()) || (item.code || '').toLowerCase().includes(search.toLowerCase()));
        const slice = filtered.slice(offset, offset + 25);
        if (pickerRequestIdRef.current !== requestId) return;
        setPickerItems((prev) => (append ? [...prev, ...slice] : slice));
        setPickerOffset(offset);
        setPickerHasMore(offset + slice.length < filtered.length);
        return;
      }
      let result;
      switch (kind) {
        case 'filterCounterparty':
        case 'counterparty':
          result = await searchCounterparties({ search, limit: 25, offset });
          break;
        case 'agreement':
          result = await searchAgreements({ counterpartyGuid: draftCounterpartyGuid, search, limit: 25, offset });
          break;
        case 'contract':
          result = await searchContracts({ counterpartyGuid: draftCounterpartyGuid, search, limit: 25, offset });
          break;
        case 'warehouse':
          result = await searchWarehouses({ search, limit: 25, offset });
          break;
        case 'deliveryAddress':
          result = await searchDeliveryAddresses({ counterpartyGuid: draftCounterpartyGuid, search, limit: 25, offset });
          break;
        case 'priceType':
          result = await searchPriceTypes({ search, limit: 25, offset });
          break;
        case 'product':
          result = await searchProducts({
            search,
            counterpartyGuid: draftCounterpartyGuid,
            agreementGuid: draftAgreementGuid || undefined,
            warehouseGuid: draftWarehouseGuid || undefined,
            priceTypeGuid: draftPriceTypeGuid || undefined,
            inStockOnly: productInStockOnly,
            limit: 25,
            offset,
          });
          break;
      }
      if (pickerRequestIdRef.current !== requestId) return;
      const nextItems = result?.items || [];
      setPickerItems((prev) => (append ? [...prev, ...nextItems] : nextItems));
      setPickerOffset(offset);
      setPickerHasMore((offset + nextItems.length) < (result?.meta.total || 0));
    } finally {
      if (pickerRequestIdRef.current === requestId) {
        setPickerLoading(false);
      }
    }
  }, [draftAgreementGuid, draftCounterpartyGuid, draftPriceTypeGuid, draftWarehouseGuid, productInStockOnly, searchAgreements, searchContracts, searchCounterparties, searchDeliveryAddresses, searchPriceTypes, searchProducts, searchWarehouses, settings?.organizations]);

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
    void loadPickerPage(pickerKind, pickerSearch, pickerOffset + 25, true);
  }, [canLoadMorePickerItems, loadPickerPage, pickerKind, pickerOffset, pickerSearch]);

  const requestOrganizationChange = React.useCallback((item: ClientOrderOrganization) => {
    const hasDependentData = !!(
      workspace.draft.counterpartyGuid ||
      workspace.draft.agreementGuid ||
      workspace.draft.contractGuid ||
      workspace.draft.warehouseGuid ||
      workspace.draft.items.length
    );
    if (hasDependentData && workspace.draft.organizationGuid && workspace.draft.organizationGuid !== item.guid) {
      setPendingOrganization(item);
      return;
    }
    void setOrganization(item);
  }, [setOrganization, workspace.draft.agreementGuid, workspace.draft.contractGuid, workspace.draft.counterpartyGuid, workspace.draft.items.length, workspace.draft.organizationGuid, workspace.draft.warehouseGuid]);

  const handlePickerSelect = React.useCallback(async (item: any) => {
    switch (pickerKind) {
      case 'filterCounterparty':
        setFilterCounterparty(item as ClientOrderCounterpartyOption);
        setFilters((prev) => ({ ...prev, counterpartyGuid: item.guid }));
        setPickerKind(null);
        return;
      case 'organization':
        requestOrganizationChange(item as ClientOrderOrganization);
        setPickerKind(null);
        return;
      case 'counterparty':
        await setCounterparty(item as ClientOrderCounterpartyOption);
        setPickerKind(null);
        return;
      case 'agreement':
        setAgreement(item as ClientOrderAgreementOption);
        setPickerKind(null);
        return;
      case 'contract':
        setContract(item as ClientOrderContractOption);
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
        addProduct(item as ClientOrderProduct);
        return;
    }
  }, [addProduct, confirmHeaderPriceTypeChange, pickerKind, requestOrganizationChange, setAgreement, setContract, setCounterparty, setDeliveryAddress, setFilters, setWarehouse]);

  const loadCounterpartyLookup = React.useCallback((args: { search: string; limit: number; offset: number }) => {
    return searchCounterparties(args);
  }, [searchCounterparties]);

  const loadWarehouseLookup = React.useCallback((args: { search: string; limit: number; offset: number }) => {
    return searchWarehouses(args);
  }, [searchWarehouses]);

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
    if (!workspace.draft.counterpartyGuid) return Promise.resolve({ items: [], meta: { total: 0 } });
    return searchAgreements({ counterpartyGuid: workspace.draft.counterpartyGuid, search: args.search, limit: args.limit, offset: args.offset });
  }, [searchAgreements, workspace.draft.counterpartyGuid]);

  const loadContractLookup = React.useCallback((args: { search: string; limit: number; offset: number }) => {
    if (!workspace.draft.counterpartyGuid) return Promise.resolve({ items: [], meta: { total: 0 } });
    return searchContracts({ counterpartyGuid: workspace.draft.counterpartyGuid, search: args.search, limit: args.limit, offset: args.offset });
  }, [searchContracts, workspace.draft.counterpartyGuid]);

  const loadDeliveryAddressLookup = React.useCallback((args: { search: string; limit: number; offset: number }) => {
    if (!workspace.draft.counterpartyGuid) return Promise.resolve({ items: [], meta: { total: 0 } });
    return searchDeliveryAddresses({ counterpartyGuid: workspace.draft.counterpartyGuid, search: args.search, limit: args.limit, offset: args.offset });
  }, [searchDeliveryAddresses, workspace.draft.counterpartyGuid]);

  const loadPriceTypeLookup = React.useCallback((args: { search: string; limit: number; offset: number }) => {
    return searchPriceTypes({ search: args.search, limit: args.limit, offset: args.offset });
  }, [searchPriceTypes]);

  const selectFilterCounterparty = React.useCallback((item: ClientOrderCounterpartyOption) => {
    setFilterCounterparty(item);
    setFilters((prev) => ({ ...prev, counterpartyGuid: item.guid }));
  }, [setFilters]);

  const openReferenceDetails = React.useCallback(async (kind: ClientOrderReferenceKind, guid?: string | null) => {
    if (!guid) return;
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
  }, []);

  const submitWithConfirm = React.useCallback(async () => {
    setConfirmSubmitOpen(false);
    await workspace.submitOrder();
  }, [workspace]);

  const closeOrderContextMenu = React.useCallback(() => {
    setOrderContextMenu(null);
  }, []);

  const openContextOrder = React.useCallback(() => {
    const order = orderContextMenu?.order;
    closeOrderContextMenu();
    if (order) {
      void workspace.selectOrder(order.guid);
      if (isSinglePane) setResponsivePane('editor');
    }
  }, [closeOrderContextMenu, isSinglePane, orderContextMenu?.order, workspace]);

  const runContextOrderDangerAction = React.useCallback(async () => {
    const order = orderContextMenu?.order;
    closeOrderContextMenu();
    if (!order) return;
    if (order.status === 'DRAFT') {
      await workspace.deleteDraft(order.guid);
      return;
    }
    setPendingCancelOrder(order);
    setConfirmCancelOpen(true);
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

  const title = workspace.draftMode
    ? 'Новый заказ клиента'
    : workspace.selectedOrder?.number1c
      ? `Заказ 1С ${workspace.selectedOrder.number1c}`
      : `Черновик ${workspace.selectedOrder?.guid.slice(0, 8) || ''}`;
  const inlineEditorErrorMessages = React.useMemo(() => {
    const messages = [workspace.error, workspace.validation.blockingMessage].filter(Boolean) as string[];
    return Array.from(new Set(messages));
  }, [workspace.error, workspace.validation.blockingMessage]);
  const showInlineEditorErrors = !isSinglePane && effectiveEditorPaneWidth >= 1180 && inlineEditorErrorMessages.length > 0;

  const createDocumentFromList = React.useCallback(async () => {
    await workspace.createDocument();
    setWebEditorSection('header');
    if (isSinglePane) setResponsivePane('editor');
  }, [isSinglePane, workspace]);

  const selectOrderFromList = React.useCallback(async (guid: string) => {
    const selected = await workspace.selectOrder(guid);
    if (selected) {
      setWebEditorSection('header');
      if (isSinglePane) setResponsivePane('editor');
    }
  }, [isSinglePane, workspace]);

  const showOrdersPane = !isSinglePane || responsivePane === 'orders';
  const showEditorPane = !isSinglePane || responsivePane === 'editor';
  const renderDraftItemCard = React.useCallback((item: any, rowNumber: number) => {
    const packageValue = item.packageGuid || (item.packages.length ? '' : '__base__');
    const lineErrors = workspace.validation.itemMessages[item.key] || [];
    const quantityError = !isValidQuantityValue(item);
    const priceError = !isValidManualPriceValue(item.manualPrice);
    const quantityInputWidth = getQuantityInputWidthPx(item.quantity, ui.narrowPriceWidth <= 66 ? 34 : 40, 88);
    const quantityControlWidth = getQuantityControlWidthPx(item.quantity, ui.narrowControlHeight, ui.narrowPriceWidth <= 66 ? 34 : 40, 88);
    const priceTypeValue = item.manualPrice.trim()
      ? { guid: '__manual__', name: 'Произвольный' }
      : item.priceTypeGuid
        ? { guid: item.priceTypeGuid, name: item.priceTypeName || workspace.draft.priceTypeName || 'Вид цены' }
        : workspace.draft.priceTypeGuid
          ? { guid: workspace.draft.priceTypeGuid, name: workspace.draft.priceTypeName || 'Вид цены' }
          : null;
    const displayedPrice = getDisplayedPriceValue(item.manualPrice, item.basePrice);

    return (
      <Box
        key={item.key}
        sx={{
          py: 0.7,
          borderBottom: '1px solid #E2E8F0',
          '&:last-of-type': { borderBottom: 'none', pb: 0 },
        }}
      >
        <Stack spacing={0.45}>
          <Stack direction="row" spacing={0.35} alignItems="flex-start">
            <IconButton
              size="small"
              color="error"
              onClick={() => workspace.removeItem(item.key)}
              disabled={workspace.readOnly}
              sx={{ width: ui.narrowPriceWidth <= 66 ? 18 : 20, height: ui.narrowPriceWidth <= 66 ? 18 : 20, flexShrink: 0, mt: -0.1, ml: -0.25 }}
            >
              <Ionicons name="close-outline" size={ui.narrowPriceWidth <= 66 ? 13 : 14} />
            </IconButton>
            <Typography sx={{ width: ui.narrowPriceWidth <= 66 ? 10 : 12, fontSize: ui.narrowPriceWidth <= 66 ? 10.5 : 11, color: '#64748B', fontWeight: 900, pt: 0.1, flexShrink: 0 }}>
              {rowNumber}
            </Typography>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography
                sx={{
                  fontSize: ui.narrowPriceWidth <= 66 ? 10.2 : 10.8,
                  fontWeight: 900,
                  lineHeight: 1.12,
                  color: '#0F172A',
                  whiteSpace: 'normal',
                  overflowWrap: 'anywhere',
                }}
              >
                {item.productName}
              </Typography>
              <Typography sx={{ mt: 0.1, fontSize: ui.narrowPriceWidth <= 66 ? 9 : 9.5, lineHeight: 1.1, color: '#64748B' }}>
                <DraftItemMeta item={item} />
              </Typography>
            </Box>
            <Typography sx={{ fontSize: ui.narrowPriceWidth <= 66 ? 10.8 : 11.5, fontWeight: 900, color: '#0F172A', whiteSpace: 'nowrap', flexShrink: 0, pl: 0.3 }}>
              {formatMoney(computeLineTotal(item, workspace.draft.generalDiscountPercent), item.currency)}
            </Typography>
          </Stack>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: `${quantityControlWidth}px ${ui.narrowPackageWidth}px minmax(0, 1fr) ${ui.narrowPriceWidth}px`,
              gap: `${ui.narrowRowGap}px`,
              alignItems: 'center',
              pl: ui.narrowPriceWidth <= 66 ? 3.1 : 4.1,
            }}
          >
            <Stack direction="row" spacing={0.25} alignItems="center" sx={{ minWidth: 0 }}>
              <IconButton
                size="small"
                disabled={workspace.readOnly}
                onClick={() => workspace.setItemPatch(item.key, { quantity: stepQuantity(item, -1) })}
                sx={{ width: ui.narrowControlHeight, height: ui.narrowControlHeight, border: '1px solid #D8E2F0', borderRadius: '6px', flexShrink: 0 }}
              >
                <Ionicons name="remove-outline" size={13} />
              </IconButton>
              <TextField
                size="small"
                value={item.quantity}
                onChange={(e) => workspace.setItemPatch(item.key, { quantity: normalizeQuantityInput(item, e.target.value) })}
                disabled={workspace.readOnly}
                error={quantityError}
                sx={{
                  width: quantityInputWidth,
                  flex: '0 0 auto',
                  ...compactInputSx,
                  '& .MuiInputBase-root': { minHeight: ui.narrowControlHeight, borderRadius: '6px' },
                  '& input': { textAlign: 'center', fontWeight: 800, fontSize: ui.narrowPriceWidth <= 66 ? 11 : 11.5, px: 0.25, py: 0 },
                }}
              />
              <IconButton
                size="small"
                disabled={workspace.readOnly}
                onClick={() => workspace.setItemPatch(item.key, { quantity: stepQuantity(item, 1) })}
                sx={{ width: ui.narrowControlHeight, height: ui.narrowControlHeight, border: '1px solid #D8E2F0', borderRadius: '6px', flexShrink: 0 }}
              >
                <Ionicons name="add-outline" size={13} />
              </IconButton>
            </Stack>

            {hasSinglePackage(item) ? (
              <Box
                sx={{
                  minHeight: `${ui.narrowControlHeight}px`,
                  px: `${ui.compactStaticFieldHorizontalPadding}px`,
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  justifySelf: 'start',
                  width: 'fit-content',
                  maxWidth: '100%',
                  bgcolor: '#F8FAFC',
                }}
              >
                <Typography sx={{ fontSize: ui.narrowPriceWidth <= 66 ? 10.5 : 11, fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap' }}>
                  {getPackageDisplayText(item)}
                </Typography>
              </Box>
            ) : (
              <TextField
                select
                size="small"
                value={packageValue}
                onChange={(e) => workspace.setItemPatch(item.key, { packageGuid: e.target.value === '__base__' ? null : e.target.value })}
                disabled={workspace.readOnly}
                fullWidth
                sx={{
                  ...compactInputSx,
                  '& .MuiInputBase-root': { minHeight: ui.narrowControlHeight, borderRadius: '6px' },
                  '& .MuiInputBase-input': { fontSize: ui.narrowPriceWidth <= 66 ? 10.5 : 11, fontWeight: 700, py: 0, px: 0.6 },
                }}
              >
                <MenuItem value="">{unitLabel(item.baseUnit)}</MenuItem>
                {item.packages.map((pack: any) => (
                  <MenuItem key={pack.guid} value={pack.guid}>
                    {packageLabel(pack)}
                  </MenuItem>
                ))}
              </TextField>
            )}

            <QuickLookupField
              kind="priceType"
              label=""
              dense
              placeholder="Вид цены"
              value={priceTypeValue}
              loadOptions={loadPriceTypeLookup}
              onSelect={(next) => workspace.setItemPriceType(item.key, next)}
              disabled={workspace.readOnly}
              beforeDetailsAdornment={workspace.isItemPriceTypeCustom(item.key) ? (
                <ResetAdornmentButton
                  title="Сбросить вид цены строки"
                  disabled={workspace.readOnly}
                  onClick={() => workspace.resetItemPriceType(item.key)}
                />
              ) : null}
              onOpenDetails={() => void openReferenceDetails('price-type', item.priceTypeGuid || workspace.draft.priceTypeGuid)}
              detailsDisabled={!(item.priceTypeGuid || workspace.draft.priceTypeGuid)}
            />

            <TextField
              size="small"
              value={displayedPrice}
              placeholder="0"
              onChange={(e) => {
                const manualPrice = normalizePriceInput(e.target.value, displayedPrice);
                workspace.setItemPatch(item.key, {
                  manualPrice,
                  priceTypeGuid: manualPrice.trim() ? null : workspace.draft.priceTypeGuid ?? null,
                  priceTypeName: manualPrice.trim() ? 'Произвольный' : workspace.draft.priceTypeName ?? null,
                });
              }}
              disabled={workspace.readOnly}
              error={priceError}
              sx={{
                ...compactInputSx,
                '& .MuiInputBase-root': { minHeight: ui.narrowControlHeight, borderRadius: '6px' },
                '& .MuiInputBase-input': { fontSize: ui.narrowPriceWidth <= 66 ? 11 : 11.5, fontWeight: 700, px: 0.45, py: 0 },
                '& .MuiInputBase-input::placeholder': { color: '#94A3B8', opacity: 1 },
              }}
            />
          </Box>

          {lineErrors.length ? (
            <Typography sx={{ pl: 4.1, fontSize: 9.5, color: '#DC2626', lineHeight: 1.2 }}>
              {lineErrors.join(' ')}
            </Typography>
          ) : null}
        </Stack>
      </Box>
    );
  }, [loadPriceTypeLookup, ui.compactStaticFieldHorizontalPadding, ui.narrowControlHeight, ui.narrowPackageWidth, ui.narrowPriceWidth, ui.narrowQtyWidth, ui.narrowRowGap, workspace]);

  return (
    <Box sx={{ backgroundColor: background, minHeight: '100%', px: ui.pageX / 8, pb: isSinglePane ? '82px' : ui.pageY / 8, pt: `${topInset + ui.stickyOffset}px`, overflowX: 'hidden' }}>
      <Stack direction={isSinglePane ? 'column' : 'row'} spacing={ui.stackGap / 8} sx={{ height: isSinglePane ? 'auto' : `calc(100vh - ${topInset + ui.stickyOffset + 8}px)`, minHeight: isSinglePane ? `calc(100vh - ${topInset + 14}px)` : undefined }}>
        {showOrdersPane ? <Paper ref={ordersPaneRef} sx={{ width: isSinglePane ? `calc(100% - ${ui.pageX * 2}px)` : desktopOrdersPaneWidth, mx: isSinglePane ? 'auto' : 0, alignSelf: isSinglePane ? 'center' : 'stretch', flexShrink: 0, minWidth: 0, height: isSinglePane ? `calc(100vh - ${topInset + 96}px)` : 'auto', borderRadius: `${ui.panelRadius}px`, border: '1px solid #D7E3F1', p: ui.panelPadding / 8, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Stack spacing={0.9}>
            <Typography sx={{ fontSize: ui.titleSize, fontWeight: 900, lineHeight: 1.1 }}>Заказы клиентов</Typography>
            <CompactTextField
              label="Поиск"
              value={workspace.filters.search}
              placeholder="Поиск"
              onChange={(value) => workspace.setFilters((prev) => ({ ...prev, search: value }))}
            />
            <CompactSelectField
              label="Статус"
              value={workspace.filters.status}
              onChange={(value) => workspace.setFilters((prev) => ({ ...prev, status: value }))}
              renderValue={(value) => value ? (workspace.statusLabels[value] || value) : 'Все статусы'}
            >
              <MenuItem value="">Все статусы</MenuItem>
              {Object.entries(workspace.statusLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
            </CompactSelectField>
            <QuickLookupField
              kind="filterCounterparty"
              label="Контрагент"
              value={filterCounterparty}
              placeholder="Все контрагенты"
              loadOptions={loadCounterpartyLookup}
              onSelect={selectFilterCounterparty}
              onOpenDetails={() => void openReferenceDetails('counterparty', filterCounterparty?.guid)}
              detailsDisabled={!filterCounterparty?.guid}
            />
            <Stack direction="row" spacing={0.55} alignItems="center">
              <Button
                variant="contained"
                color="secondary"
                onClick={() => void createDocumentFromList()}
                sx={{ flex: 1, textTransform: 'none', fontWeight: 900, borderRadius: '7px', bgcolor: '#0F172A', minHeight: 32 }}
              >
                <Stack direction="row" spacing={0.7} alignItems="center" justifyContent="center">
                  <DocumentPlusIcon color="#FFFFFF" size={17} />
                  <span>Новый заказ</span>
                </Stack>
              </Button>
              <ToolbarIconButton
                title="Сбросить фильтры"
                icon="refresh-outline"
                color="#475569"
                onClick={() => {
                  setFilterCounterparty(null);
                  workspace.clearFilters();
                }}
              />
            </Stack>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              <Chip size="small" label={`Всего ${workspace.statusCounts.all}`} sx={{ height: 24, fontSize: 11, fontWeight: 800 }} />
              <Chip size="small" label={`Черновики ${workspace.statusCounts.draft}`} sx={{ height: 24, fontSize: 11, fontWeight: 800 }} />
              <Chip size="small" label={`В очереди ${workspace.statusCounts.queued}`} sx={{ height: 24, fontSize: 11, fontWeight: 800 }} />
            </Stack>
          </Stack>
          <Divider sx={{ my: 0.8 }} />
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            <Stack spacing={0.45}>
              {workspace.orders.map((order) => (
                <Card
                  key={order.guid}
                  variant="outlined"
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
                    borderRadius: '7px',
                    borderColor: workspace.selectedGuid === order.guid ? '#2563EB' : '#D9E3F0',
                    background: workspace.selectedGuid === order.guid ? '#EFF6FF' : '#FFFFFF',
                    transition: 'background-color 140ms ease, border-color 140ms ease, transform 90ms ease',
                    '&:hover': { backgroundColor: workspace.selectedGuid === order.guid ? '#DBEAFE' : '#F8FAFC', borderColor: '#93C5FD' },
                    '&:active': { transform: 'scale(0.992)' },
                  }}
                >
                  <CardContent sx={{ px: 0.8, py: 0.65, '&:last-child': { pb: 0.65 } }}>
                    <Stack spacing={0.25}>
                      <Stack direction="row" justifyContent="space-between" spacing={1}>
                        <Typography sx={{ fontSize: 13, fontWeight: 900, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.number1c ? `Заказ ${order.number1c}` : `Черновик ${order.guid.slice(0, 8)}`}</Typography>
                        <Chip size="small" color={statusTone(order.status) as any} label={workspace.statusLabels[order.status] || order.status} sx={{ height: 20, fontSize: ui.chipFontSize, fontWeight: 800 }} />
                      </Stack>
                      <Typography sx={{ fontSize: 11, color: '#475569', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.counterparty?.name || 'Контрагент не выбран'}</Typography>
                      <Stack direction="row" spacing={0.45} useFlexGap flexWrap="wrap" alignItems="center">
                        <Typography sx={{ fontSize: 9, color: '#0F172A', fontWeight: 900, borderRadius: '999px', bgcolor: '#F1F5F9', px: 0.6, py: 0.15 }}>
                          {formatMoney(order.totalAmount || 0, order.currency)}
                        </Typography>
                        <Typography sx={{ fontSize: 9, color: '#475569', fontWeight: 800, borderRadius: '999px', bgcolor: '#F8FAFC', px: 0.6, py: 0.15 }}>
                          {order.items.length} поз.
                        </Typography>
                        <Typography sx={{ fontSize: 9, color: '#475569', fontWeight: 800, borderRadius: '999px', bgcolor: '#F8FAFC', px: 0.6, py: 0.15 }}>
                          Отгр. {formatDateOnly(order.deliveryDate)}
                        </Typography>
                      </Stack>
                      <Typography sx={{ fontSize: 10, color: '#94A3B8', lineHeight: 1.1 }}>Изм. {formatDateTime(order.updatedAt || order.queuedAt || order.sentTo1cAt)}</Typography>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
              {workspace.loadingOrders ? <CircularProgress size={18} /> : null}
              {workspace.hasMoreOrders ? <Button variant="outlined" onClick={() => void workspace.loadMoreOrders()} disabled={workspace.loadingMoreOrders} sx={{ textTransform: 'none' }}>{workspace.loadingMoreOrders ? 'Загружаю...' : 'Показать ещё'}</Button> : null}
            </Stack>
          </Box>
        </Paper> : null}

        {showEditorPane ? <Paper ref={editorPaneRef} sx={{ flex: 1, minWidth: 0, width: isSinglePane ? `calc(100% - ${ui.pageX * 2}px)` : 'auto', mx: isSinglePane ? 'auto' : 0, alignSelf: isSinglePane ? 'center' : 'stretch', minHeight: isSinglePane ? `calc(100vh - ${topInset + 96}px)` : 0, borderRadius: `${ui.panelRadius}px`, border: '1px solid #D7E3F1', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {!workspace.hasEditableDocument ? (
            <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', p: 2 }}>
              <Stack spacing={1.2} alignItems="center" sx={{ maxWidth: 360, textAlign: 'center' }}>
                <Typography sx={{ fontSize: 22, fontWeight: 900 }}>Создайте заказ</Typography>
                <Typography sx={{ color: '#64748B', fontSize: 13 }}>Откройте новый документ. Если есть черновик, он откроется автоматически.</Typography>
                <Button variant="contained" onClick={() => void createDocumentFromList()} sx={{ textTransform: 'none', fontWeight: 900, minHeight: 36, px: 2 }}>
                  <Stack direction="row" spacing={ui.toolbarGap / 10} alignItems="center">
                    <DocumentPlusIcon color="#FFFFFF" size={18} />
                    <span>Создать заказ</span>
                  </Stack>
                </Button>
              </Stack>
            </Box>
          ) : (
            <>
              <Box sx={{ position: 'sticky', top: 0, zIndex: 2, px: ui.panelPadding / 10, py: ui.panelPadding / 20, borderBottom: '1px solid #E2E8F0', background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(12px)' }}>
                <Stack spacing={ui.actionGap / 14}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
                      {isSinglePane ? (
                        <ToolbarIconButton title="К списку" icon="arrow-back-outline" color="#0F172A" buttonSize={ui.actionButtonSize} iconSize={ui.actionIconSize} onClick={() => setResponsivePane('orders')} />
                      ) : null}
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: ui.titleSize, fontWeight: 900, lineHeight: 1.1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</Typography>
                        {!workspace.draftMode ? <Chip size="small" label={workspace.statusLabels[workspace.selectedOrder?.status || ''] || workspace.selectedOrder?.status || '?'} sx={{ height: 20, fontSize: ui.chipFontSize, fontWeight: 800 }} /> : null}
                      </Stack>
                      <Typography sx={{ color: '#64748B', fontSize: ui.subtitleSize }}>{workspace.autosaveLabel}</Typography>
                    </Box>
                    </Stack>
                    {showInlineEditorErrors ? (
                      <Box
                        sx={{
                          flex: 1,
                          minWidth: 220,
                          maxWidth: '100%',
                          minHeight: Math.max(ui.actionButtonSize + 6, 42),
                          border: '1px solid #FECACA',
                          borderRadius: '10px',
                          background: '#FFF7F7',
                          display: 'grid',
                          gridTemplateColumns: '44px minmax(0, 1fr)',
                          overflow: 'hidden',
                          alignSelf: 'stretch',
                        }}
                      >
                        <Box
                          sx={{
                            background: '#FEE2E2',
                            color: '#DC2626',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Ionicons name="alert-circle-outline" size={18} />
                        </Box>
                        <Box sx={{ px: 1, py: 0.55, display: 'flex', alignItems: 'center', minWidth: 0 }}>
                          <Typography
                            sx={{
                              fontSize: 11,
                              lineHeight: 1.25,
                              color: '#991B1B',
                              whiteSpace: 'normal',
                              overflowWrap: 'anywhere',
                            }}
                          >
                            {inlineEditorErrorMessages.join(' ')}
                          </Typography>
                        </Box>
                      </Box>
                    ) : null}
                    <Stack direction="row" spacing={ui.actionGap / 16} justifyContent="flex-end" useFlexGap flexWrap={isSinglePane || effectiveEditorPaneWidth < 1160 ? 'wrap' : 'nowrap'}>
                      <ToolbarIconButton
                        title={toolbarUsesDeleteDraft ? 'Удалить черновик' : 'Отменить заказ'}
                        icon={toolbarUsesDeleteDraft ? 'trash-outline' : 'close-circle-outline'}
                        color="#DC2626"
                        buttonSize={ui.actionButtonSize}
                        iconSize={ui.actionIconSize}
                        onClick={() => {
                          if (toolbarUsesDeleteDraft) {
                            void workspace.deleteDraft();
                            return;
                          }
                          setPendingCancelOrder(null);
                          setConfirmCancelOpen(true);
                        }}
                        disabled={toolbarUsesDeleteDraft ? workspace.deletingDraft : (workspace.readOnly || workspace.cancelling)}
                        loading={toolbarUsesDeleteDraft ? workspace.deletingDraft : workspace.cancelling}
                      />
                      <ToolbarIconButton title="Шапка документа" icon="document-text-outline" buttonSize={ui.actionButtonSize} iconSize={ui.actionIconSize} onClick={() => setHeaderOpen(true)} />
                      <ToolbarIconButton title="Настройки даты" icon="calendar-outline" color="#2563EB" buttonSize={ui.actionButtonSize} iconSize={ui.actionIconSize} onClick={() => setSettingsOpen(true)} />
                      <ToolbarIconButton title="Инспектор" icon="information-circle-outline" color="#475569" buttonSize={ui.actionButtonSize} iconSize={ui.actionIconSize} onClick={() => setInspectorOpen(true)} />
                      <ToolbarIconButton title="Сохранить" icon="save-outline" color="#2563EB" buttonSize={ui.actionButtonSize} iconSize={ui.actionIconSize} onClick={() => void workspace.saveDraft({ reason: 'manual' })} disabled={workspace.readOnly || workspace.saving || !workspace.validation.canSave} loading={workspace.saving} />
                      <ToolbarIconButton title="Отправить в 1С" icon="cloud-upload-outline" color="#7C3AED" buttonSize={ui.actionButtonSize} iconSize={ui.actionIconSize} onClick={() => setConfirmSubmitOpen(true)} disabled={workspace.readOnly || workspace.submitting || !workspace.validation.canSave} loading={workspace.submitting} />
                    </Stack>
                  </Stack>
                  {showSectionSwitcher ? (
                    <Stack direction="row" spacing={0.6}>
                      <Button fullWidth variant={webEditorSection === 'header' ? 'contained' : 'outlined'} onClick={() => setWebEditorSection('header')} sx={{ minHeight: ui.fieldHeight - 2, textTransform: 'none', fontWeight: 900, borderRadius: '8px', fontSize: ui.fieldFontSize }}>Шапка</Button>
                      <Button fullWidth variant={webEditorSection === 'items' ? 'contained' : 'outlined'} onClick={() => setWebEditorSection('items')} sx={{ minHeight: ui.fieldHeight - 2, textTransform: 'none', fontWeight: 900, borderRadius: '8px', fontSize: ui.fieldFontSize }}>Товары</Button>
                    </Stack>
                  ) : null}
                  {(!showSectionSwitcher || webEditorSection === 'header') ? (
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
                      gap: ui.fieldGap / 10,
                      alignItems: 'center',
                    }}
                  >
                    <QuickLookupField
                      kind="organization"
                      label="Организация"
                      value={workspace.selections.organization}
                      loadOptions={loadOrganizationLookup}
                      onSelect={requestOrganizationChange}
                      disabled={workspace.readOnly}
                      onOpenDetails={() => void openReferenceDetails('organization', workspace.selections.organization?.guid)}
                      detailsDisabled={!workspace.selections.organization?.guid}
                    />
                    <QuickLookupField
                      kind="counterparty"
                      label="Контрагент"
                      value={workspace.selections.counterparty}
                      loadOptions={loadCounterpartyLookup}
                      onSelect={setCounterparty}
                      disabled={workspace.readOnly}
                      onOpenDetails={() => void openReferenceDetails('counterparty', workspace.selections.counterparty?.guid)}
                      detailsDisabled={!workspace.selections.counterparty?.guid}
                    />
                    <QuickLookupField
                      kind="agreement"
                      label="Соглашение"
                      value={workspace.selections.agreement}
                      loadOptions={loadAgreementLookup}
                      onSelect={setAgreement}
                      disabled={workspace.readOnly || !workspace.draft.counterpartyGuid}
                      onOpenDetails={() => void openReferenceDetails('agreement', workspace.selections.agreement?.guid)}
                      detailsDisabled={!workspace.selections.agreement?.guid}
                    />
                    <QuickLookupField
                      kind="contract"
                      label="Договор"
                      value={workspace.selections.contract}
                      loadOptions={loadContractLookup}
                      onSelect={setContract}
                      disabled={workspace.readOnly || !workspace.draft.counterpartyGuid}
                      onOpenDetails={() => void openReferenceDetails('contract', workspace.selections.contract?.guid)}
                      detailsDisabled={!workspace.selections.contract?.guid}
                    />
                    <QuickLookupField
                      kind="priceType"
                      label="Вид цены"
                      value={workspace.draft.priceTypeGuid ? { guid: workspace.draft.priceTypeGuid, name: workspace.draft.priceTypeName || 'Вид цены' } : null}
                      loadOptions={loadPriceTypeLookup}
                      onSelect={confirmHeaderPriceTypeChange}
                      disabled={workspace.readOnly}
                      beforeDetailsAdornment={workspace.isHeaderPriceTypeCustom ? (
                        <ResetAdornmentButton title="Сбросить вид цены к соглашению" disabled={workspace.readOnly} onClick={confirmHeaderPriceTypeReset} />
                      ) : null}
                      onOpenDetails={() => void openReferenceDetails('price-type', workspace.draft.priceTypeGuid)}
                      detailsDisabled={!workspace.draft.priceTypeGuid}
                    />
                    <QuickLookupField
                      kind="warehouse"
                      label="Склад"
                      value={workspace.selections.warehouse}
                      loadOptions={loadWarehouseLookup}
                      onSelect={setWarehouse}
                      disabled={workspace.readOnly}
                      onOpenDetails={() => void openReferenceDetails('warehouse', workspace.selections.warehouse?.guid)}
                      detailsDisabled={!workspace.selections.warehouse?.guid}
                    />
                    <QuickLookupField
                      kind="deliveryAddress"
                      label="Адрес доставки"
                      value={workspace.selections.deliveryAddress}
                      loadOptions={loadDeliveryAddressLookup}
                      onSelect={setDeliveryAddress}
                      disabled={workspace.readOnly || !workspace.draft.counterpartyGuid}
                      onOpenDetails={() => void openReferenceDetails('delivery-address', workspace.selections.deliveryAddress?.guid)}
                      detailsDisabled={!workspace.selections.deliveryAddress?.guid}
                    />
                    <DeliveryDateField value={workspace.draft.deliveryDate} onChange={(date) => workspace.patchDraft({ deliveryDate: date })} disabled={workspace.readOnly} />
                    <TextField
                      size="small"
                      placeholder="Комментарий"
                      value={workspace.draft.comment}
                      onChange={(event) => workspace.patchDraft({ comment: event.target.value })}
                      disabled={workspace.readOnly}
                      sx={{
                        gridColumn: isSinglePane ? 'span 1' : useWideEditorGrid ? 'span 2' : '1 / -1',
                        '& .MuiInputBase-root': { height: 30, borderRadius: '6px', fontSize: 11 },
                        '& .MuiInputBase-input': { py: 0, lineHeight: '30px' },
                      }}
                    />
                  </Box>
                  ) : null}
                </Stack>
              </Box>

              <Box ref={editorScrollRef} sx={{ flex: 1, overflow: 'auto', px: 1, py: 1 }}>
                <Stack spacing={1}>
                  {!showInlineEditorErrors && workspace.error ? <Alert severity="error">{workspace.error}</Alert> : null}
                  {!showInlineEditorErrors && workspace.validation.blockingMessage ? <Alert severity="warning">{workspace.validation.blockingMessage}</Alert> : null}
                  {workspace.draftMode && !workspace.draft.organizationGuid && !workspace.loadingSettings ? (
                    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1, borderColor: '#F59E0B', background: '#FFFBEB' }}>
                      <Stack spacing={ui.toolbarGap / 10}>
                        <Typography sx={{ fontSize: usePhoneCompactItems ? 12.5 : ui.sectionTitleSize, fontWeight: 900 }}>Не выбрана организация</Typography>
                        <Typography sx={{ color: '#92400E', fontSize: 12 }}>Выберите организацию в шапке документа или из списка ниже.</Typography>
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                          {(workspace.settings?.organizations || []).map((item) => (
                            <Button key={item.guid} variant="contained" onClick={() => void workspace.setOrganization(item)} sx={{ textTransform: 'none', fontWeight: 800, borderRadius: '8px', minHeight: 30 }}>{item.name}</Button>
                          ))}
                        </Stack>
                      </Stack>
                    </Paper>
                  ) : null}

                  {(!showSectionSwitcher || webEditorSection === 'items') ? <Paper variant="outlined" sx={{ borderRadius: usePhoneCompactItems ? 0 : '10px', p: usePhoneCompactItems ? 0 : ui.panelPadding / 10, borderColor: usePhoneCompactItems ? 'transparent' : undefined, boxShadow: usePhoneCompactItems ? 'none' : undefined, mx: usePhoneCompactItems ? -1 : 0 }}>
                    <Stack spacing={0.7}>
                      <Stack spacing={0.55}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={0.8}>
                          <Typography sx={{ fontSize: 16, fontWeight: 900 }}>Товары</Typography>
                          <Typography sx={{ fontWeight: 900, fontSize: usePhoneCompactItems ? 12.5 : ui.sectionTitleSize, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatMoney(workspace.localTotal, workspace.draft.currency)}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={0.35} alignItems="center" sx={{ minWidth: 0 }}>
                          <TextField
                            size="small"
                            placeholder="Поиск в строках"
                            value={itemsSearch}
                            onChange={(event) => setItemsSearch(event.target.value)}
                            sx={{
                              minWidth: 0,
                              maxWidth: isSinglePane ? '100%' : ui.toolbarSearchMaxWidth,
                              flex: 1,
                              '& .MuiInputBase-root': { height: usePhoneCompactItems ? 34 : ui.fieldHeight - 4, borderRadius: '6px', fontSize: usePhoneCompactItems ? 12 : ui.fieldFontSize },
                              '& .MuiInputBase-input': { py: 0.25, px: usePhoneCompactItems ? 1 : undefined },
                            }}
                          />
                          <Stack direction="row" spacing={0.35} alignItems="center" sx={{ flexShrink: 0 }}>
                            <ToolbarIconButton
                              title="Открыть подбор товаров"
                              icon="add-outline"
                              label={!useItemCards && !usePhoneCompactItems ? 'Добавить товар' : undefined}
                              color="#16A34A"
                              buttonSize={usePhoneCompactItems ? 28 : Math.max(ui.fieldHeight - 4, 27)}
                              iconSize={usePhoneCompactItems ? 14 : 15}
                              onClick={() => openPicker('product')}
                              disabled={!workspace.draft.counterpartyGuid || workspace.readOnly}
                            />
                            <ToolbarIconButton
                              title="Удалить все строки"
                              icon="trash-outline"
                              color="#DC2626"
                              buttonSize={usePhoneCompactItems ? 28 : undefined}
                              iconSize={usePhoneCompactItems ? 14 : undefined}
                              onClick={() => setConfirmClearItemsOpen(true)}
                              disabled={!workspace.draft.items.length || workspace.readOnly}
                            />
                          </Stack>
                        </Stack>
                      </Stack>
                      {useItemCards ? (
                        <Box sx={{ borderTop: '1px solid #E2E8F0' }}>
                          {!usePhoneCompactItems ? <Box
                            sx={{
                              display: 'grid',
                              gridTemplateColumns: `${28 + 22}px minmax(0, 1fr) ${ui.narrowQtyWidth}px ${ui.narrowPackageWidth}px minmax(0, 1fr) ${ui.narrowPriceWidth}px`,
                              gap: `${ui.narrowRowGap}px`,
                              alignItems: 'center',
                              px: 0.2,
                              py: 0.45,
                              color: '#64748B',
                              fontSize: 9.5,
                              fontWeight: 900,
                              textTransform: 'uppercase',
                              letterSpacing: '0.03em',
                            }}
                          >
                            <Box sx={{ gridColumn: '1 / 2' }}>№</Box>
                            <Box sx={{ gridColumn: '2 / 3' }}>Товар</Box>
                            <Box sx={{ gridColumn: '3 / 4' }}>Кол-во</Box>
                            <Box sx={{ gridColumn: '4 / 5' }}>Упак.</Box>
                            <Box sx={{ gridColumn: '5 / 6' }}>Вид</Box>
                            <Box sx={{ gridColumn: '6 / 7' }}>Цена</Box>
                          </Box> : null}
                          <Box sx={{ pb: usePhoneCompactItems ? `${ui.itemsBottomInset}px` : 0 }}>
                            {filteredDraftItems.map((item, index) => renderDraftItemCard(item, index + 1))}
                          </Box>
                        </Box>
                      ) : (
                      <Table size="small" sx={{
                        tableLayout: 'fixed',
                        '& .MuiTableCell-root': { px: ui.tableCellX, py: ui.tableCellY, fontSize: ui.fieldFontSize, lineHeight: 1.15, verticalAlign: 'top' },
                        '& .MuiTableHead-root .MuiTableCell-root': { py: 0.45, fontWeight: 800, color: '#475569', fontSize: ui.fieldFontSize },
                        '& .MuiTableCell-root:nth-of-type(8)': { display: 'none' },
                      }}>
                        <TableHead>
                          <TableRow>
                            <TableCell width={18}></TableCell>
                            <TableCell width={24}>№</TableCell>
                            <TableCell>Товар</TableCell>
                            <TableCell width={quantityColumnWidth}>Количество</TableCell>
                            <TableCell width={filteredDraftItems.some((item) => !hasSinglePackage(item)) ? (useCompactTable ? 120 : 145) : (useCompactTable ? 72 : 84)}>Упаковка</TableCell>
                            <TableCell width={useCompactTable ? 138 : 168}>Вид цены</TableCell>
                            <TableCell width={useCompactTable ? 88 : 102}>Цена</TableCell>
                            <TableCell width={80}>Скидка</TableCell>
                            <TableCell width={useCompactTable ? 78 : 94}>Итого</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {filteredDraftItems.map((item, index) => {
                            const rowNumber = index + 1;
                            const packageValue = item.packageGuid || (item.packages.length ? '' : '__base__');
                            const lineErrors = workspace.validation.itemMessages[item.key] || [];
                            const quantityError = !isValidQuantityValue(item);
                            const priceError = !isValidManualPriceValue(item.manualPrice);
                            const quantityInputWidth = getQuantityInputWidthPx(item.quantity, useCompactTable ? 44 : 52, useCompactTable ? 102 : 126);
                            const quantityControlWidth = getQuantityControlWidthPx(item.quantity, 28, useCompactTable ? 44 : 52, useCompactTable ? 102 : 126);
                            const priceTypeValue = item.manualPrice.trim()
                              ? { guid: '__manual__', name: 'Произвольный' }
                              : item.priceTypeGuid
                                ? { guid: item.priceTypeGuid, name: item.priceTypeName || workspace.draft.priceTypeName || 'Вид цены' }
                                : workspace.draft.priceTypeGuid
                                  ? { guid: workspace.draft.priceTypeGuid, name: workspace.draft.priceTypeName || 'Вид цены' }
                                  : null;
                            const displayedPrice = getDisplayedPriceValue(item.manualPrice, item.basePrice);
                            return (
                            <TableRow key={item.key} hover>
                              <TableCell>
                                <Tooltip title="Удалить строку" arrow>
                                  <span>
                                    <IconButton size="small" color="error" onClick={() => workspace.removeItem(item.key)} disabled={workspace.readOnly} sx={{ width: 20, height: 20, ml: -0.2 }}>
                                      <Ionicons name="close-outline" size={14} />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                              </TableCell>
                              <TableCell><Typography sx={{ fontSize: 11.5, color: '#64748B', fontWeight: 800, ml: -0.15 }}>{rowNumber}</Typography></TableCell>
                              <TableCell>
                                <Typography sx={{ fontSize: 11.5, fontWeight: 800, lineHeight: 1.12, display: '-webkit-box', WebkitLineClamp: ui.itemMaxLines, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>{item.productName}</Typography>
                                <Typography sx={{ fontSize: 10, color: '#64748B' }}>
                                  <DraftItemMeta item={item} />
                                </Typography>
                                {lineErrors.length ? <Typography sx={{ fontSize: 10, color: '#DC2626', mt: 0.25 }}>{lineErrors.join(' ')}</Typography> : null}
                              </TableCell>
                              <TableCell>
                                <Stack direction="row" alignItems="center" spacing={0.3} sx={{ width: quantityControlWidth }}>
                                  <IconButton size="small" disabled={workspace.readOnly} onClick={() => {
                                    workspace.setItemPatch(item.key, { quantity: stepQuantity(item, -1) });
                                  }} sx={{ width: 28, height: 28, border: '1px solid #D8E2F0', borderRadius: '6px' }}>
                                    <Ionicons name="remove-outline" size={14} />
                                  </IconButton>
                                  <TextField
                                    size="small"
                                    value={item.quantity}
                                    onChange={(e) => workspace.setItemPatch(item.key, { quantity: normalizeQuantityInput(item, e.target.value) })}
                                    disabled={workspace.readOnly}
                                    error={quantityError}
                                    sx={{ width: quantityInputWidth, ...compactInputSx, '& .MuiInputBase-root': { height: 28, borderRadius: '6px' }, '& input': { textAlign: 'center', fontSize: 10.5, fontWeight: 800, lineHeight: '28px', py: 0 } }}
                                  />
                                  <IconButton size="small" disabled={workspace.readOnly} onClick={() => {
                                    workspace.setItemPatch(item.key, { quantity: stepQuantity(item, 1) });
                                  }} sx={{ width: 28, height: 28, border: '1px solid #D8E2F0', borderRadius: '6px' }}>
                                    <Ionicons name="add-outline" size={14} />
                                  </IconButton>
                                </Stack>
                              </TableCell>
                              <TableCell>
                                {hasSinglePackage(item) ? (
                                  <Box
                                    sx={{
                                      minHeight: '28px',
                                      px: `${ui.compactStaticFieldHorizontalPadding}px`,
                                      border: '1px solid #CBD5E1',
                                      borderRadius: '6px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      bgcolor: '#F8FAFC',
                                      width: '100%',
                                      maxWidth: '100%',
                                      boxSizing: 'border-box',
                                    }}
                                  >
                                    <Typography sx={{ fontSize: 10.5, fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', lineHeight: '28px' }}>
                                      {getPackageDisplayText(item)}
                                    </Typography>
                                  </Box>
                                ) : (
                                  <TextField select size="small" value={packageValue} onChange={(e) => workspace.setItemPatch(item.key, { packageGuid: e.target.value === '__base__' ? null : e.target.value })} disabled={workspace.readOnly} fullWidth sx={{ ...compactInputSx, '& .MuiInputBase-root': { height: 28, borderRadius: '6px' }, '& .MuiInputBase-input': { fontSize: 10.5, fontWeight: 800, lineHeight: '28px', py: 0 } }}>
                                    <MenuItem value="">{unitLabel(item.baseUnit)}</MenuItem>
                                    {item.packages.map((pack) => <MenuItem key={pack.guid} value={pack.guid}>{packageLabel(pack)}</MenuItem>)}
                                  </TextField>
                                )}
                              </TableCell>
                              <TableCell>
                                <QuickLookupField
                                  kind="priceType"
                                  label=""
                                  dense
                                  placeholder="Вид цены"
                                  value={priceTypeValue}
                                  loadOptions={loadPriceTypeLookup}
                                  onSelect={(next) => workspace.setItemPriceType(item.key, next)}
                                  disabled={workspace.readOnly}
                                  beforeDetailsAdornment={workspace.isItemPriceTypeCustom(item.key) ? (
                                    <ResetAdornmentButton title="Сбросить вид цены строки" disabled={workspace.readOnly} onClick={() => workspace.resetItemPriceType(item.key)} />
                                  ) : null}
                                  onOpenDetails={() => void openReferenceDetails('price-type', item.priceTypeGuid || workspace.draft.priceTypeGuid)}
                                  detailsDisabled={!(item.priceTypeGuid || workspace.draft.priceTypeGuid)}
                                />
                              </TableCell>
                              <TableCell><TextField size="small" value={displayedPrice} placeholder="0" onChange={(e) => { const manualPrice = normalizePriceInput(e.target.value, displayedPrice); workspace.setItemPatch(item.key, { manualPrice, priceTypeGuid: manualPrice.trim() ? null : workspace.draft.priceTypeGuid ?? null, priceTypeName: manualPrice.trim() ? 'Произвольный' : workspace.draft.priceTypeName ?? null }); }} disabled={workspace.readOnly} error={priceError} sx={{ ...compactInputSx, '& .MuiInputBase-root': { height: 28, borderRadius: '6px' }, '& .MuiInputBase-input': { fontSize: 10.5, fontWeight: 800, py: 0, lineHeight: '28px' }, '& .MuiInputBase-input::placeholder': { color: '#94A3B8', opacity: 1 } }} /></TableCell>
                              <TableCell><TextField size="small" value={item.discountPercent} onChange={(e) => workspace.setItemPatch(item.key, { discountPercent: e.target.value })} disabled /></TableCell>
                              <TableCell><Typography sx={{ fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>{formatMoney(computeLineTotal(item, workspace.draft.generalDiscountPercent), item.currency)}</Typography></TableCell>
                            </TableRow>
                          );})}
                        </TableBody>
                      </Table>
                      )}
                    </Stack>
                  </Paper> : null}

                  <Box sx={{ display: 'none' }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Box>
                        <Typography sx={{ fontSize: 16, fontWeight: 900 }}>Добавить товары</Typography>
                      </Box>
                      <ToolbarIconButton
                        title="Открыть подбор товаров"
                        icon="add-circle-outline"
                        color="#2563EB"
                        onClick={() => openPicker('product')}
                        disabled={!workspace.draft.counterpartyGuid || workspace.readOnly}
                      />
                    </Stack>
                  </Box>
                </Stack>
              </Box>
            </>
          )}
        </Paper> : null}
      </Stack>

      <Drawer anchor={isPhoneDialog ? 'bottom' : 'right'} open={headerOpen} onClose={() => setHeaderOpen(false)}>
        <Box sx={{ width: isPhoneDialog ? '100vw' : 520, maxWidth: '100vw', height: isPhoneDialog ? '96vh' : '100%', borderTopLeftRadius: isPhoneDialog ? '18px' : 0, borderTopRightRadius: isPhoneDialog ? '18px' : 0, display: 'flex', flexDirection: 'column', backgroundColor: '#FFFFFF' }}>
          <Box sx={{ px: 1.5, py: 1.25, borderBottom: '1px solid #E2E8F0' }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 20, fontWeight: 900 }}>Шапка документа</Typography>
                <Typography sx={{ color: '#64748B', fontSize: 12 }}>Значения по умолчанию можно изменить вручную.</Typography>
              </Box>
              <Button variant="outlined" onClick={() => setHeaderOpen(false)} sx={{ textTransform: 'none', fontWeight: 800 }}>Закрыть</Button>
            </Stack>
          </Box>
          <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
            <Stack spacing={1}>
              {workspace.draftMode && !workspace.draft.organizationGuid && !workspace.loadingSettings ? (
                <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1, borderColor: '#F59E0B', background: '#FFFBEB' }}>
                  <Stack spacing={0.75}>
                    <Typography sx={{ fontWeight: 900 }}>Нет организации по умолчанию</Typography>
                    <Typography sx={{ color: '#92400E', fontSize: 12 }}>Выберите организацию. Она сохранится для следующих заказов.</Typography>
                    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                      {(workspace.settings?.organizations || []).map((item) => (
                        <Button key={item.guid} variant="contained" onClick={() => void workspace.setOrganization(item)} sx={{ textTransform: 'none', fontWeight: 800, minHeight: 30 }}>
                          {item.name}
                        </Button>
                      ))}
                    </Stack>
                  </Stack>
                </Paper>
              ) : null}

              <SelectionButton label="Организация" value={workspace.selections.organization?.name} onClick={() => openPicker('organization')} disabled={workspace.readOnly} />
              <Typography sx={{ color: '#64748B', fontSize: 11 }}>{workspace.documentHeaderDefaultsState.organization}</Typography>

              <QuickLookupField
                kind="counterparty"
                label="Контрагент"
                value={workspace.selections.counterparty}
                loadOptions={loadCounterpartyLookup}
                onSelect={setCounterparty}
                disabled={workspace.readOnly}
              />
              <Typography sx={{ color: '#64748B', fontSize: 11 }}>{workspace.documentHeaderDefaultsState.counterparty}</Typography>

              <Box>
                <SelectionButton label="Соглашение" value={workspace.selections.agreement?.name} onClick={() => openPicker('agreement')} disabled={workspace.readOnly || !workspace.draft.counterpartyGuid} />
                <Typography sx={{ color: '#64748B', fontSize: 11, mt: 0.35 }}>{workspace.documentHeaderDefaultsState.agreement}</Typography>
              </Box>
              <Box>
                <SelectionButton label="Договор" value={workspace.selections.contract?.number} onClick={() => openPicker('contract')} disabled={workspace.readOnly || !workspace.draft.counterpartyGuid} />
                <Typography sx={{ color: '#64748B', fontSize: 11, mt: 0.35 }}>{workspace.documentHeaderDefaultsState.contract}</Typography>
              </Box>
              <Box>
                <SelectionButton label="Вид цены" value={workspace.draft.priceTypeName} onClick={() => openPicker('priceType')} disabled={workspace.readOnly} />
                <Typography sx={{ color: '#64748B', fontSize: 11, mt: 0.35 }}>из соглашения или вручную</Typography>
              </Box>
              <Box>
                <QuickLookupField
                  kind="warehouse"
                  label="Склад"
                  value={workspace.selections.warehouse}
                  loadOptions={loadWarehouseLookup}
                  onSelect={setWarehouse}
                  disabled={workspace.readOnly}
                />
                <Typography sx={{ color: '#64748B', fontSize: 11, mt: 0.35 }}>{workspace.documentHeaderDefaultsState.warehouse}</Typography>
              </Box>
              <Box>
                <SelectionButton label="Адрес доставки" value={workspace.selections.deliveryAddress?.fullAddress} onClick={() => openPicker('deliveryAddress')} disabled={workspace.readOnly || !workspace.draft.counterpartyGuid} />
                <Typography sx={{ color: '#64748B', fontSize: 11, mt: 0.35 }}>{workspace.documentHeaderDefaultsState.deliveryAddress}</Typography>
              </Box>
              <Box>
                <DeliveryDateField value={workspace.draft.deliveryDate} onChange={(date) => workspace.patchDraft({ deliveryDate: date })} disabled={workspace.readOnly} />
                <Typography sx={{ color: '#64748B', fontSize: 11, mt: 0.35 }}>{workspace.documentHeaderDefaultsState.deliveryDate}</Typography>
              </Box>

              <TextField
                label="Комментарий"
                value={workspace.draft.comment}
                onChange={(e) => workspace.patchDraft({ comment: e.target.value })}
                multiline
                minRows={5}
                disabled={workspace.readOnly}
              />
              <TextField label="Скидки" value="Недоступно в этой версии" disabled />
            </Stack>
          </Box>
        </Box>
      </Drawer>

      <Drawer anchor={isPhoneDialog ? 'bottom' : 'right'} open={!!pickerKind} onClose={() => setPickerKind(null)}>
        <Box sx={{ width: isPhoneDialog ? '100vw' : pickerKind === 'product' ? 860 : 380, maxWidth: '100vw', height: isPhoneDialog ? '96vh' : '100%', borderTopLeftRadius: isPhoneDialog ? '18px' : 0, borderTopRightRadius: isPhoneDialog ? '18px' : 0, display: 'flex', flexDirection: 'column', backgroundColor: '#FFFFFF' }}>
          <Box sx={{ p: 1.25, borderBottom: '1px solid #D8E2F0', backgroundColor: '#FFFFFF' }}>
            <Stack spacing={1.25}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                <Typography sx={{ fontSize: 18, fontWeight: 900 }}>{pickerTitle}</Typography>
                {pickerLoading ? <CircularProgress size={18} /> : null}
              </Stack>
              <Stack direction={isPhoneDialog ? 'column' : 'row'} spacing={0.8} alignItems={isPhoneDialog ? 'stretch' : 'center'}>
                <TextField
                  size="small"
                  label="Поиск"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  disabled={pickerKind !== 'organization' && pickerKind !== 'filterCounterparty' && pickerKind !== 'counterparty' && pickerKind !== 'product' && pickerKind !== 'warehouse' && pickerKind !== 'priceType' && !draftCounterpartyGuid}
                  sx={{ flex: 1 }}
                />
                {pickerKind === 'product' ? (
                  <Chip
                    clickable
                    color={productInStockOnly ? 'success' : 'default'}
                    variant={productInStockOnly ? 'filled' : 'outlined'}
                    label="Только с остатком"
                    onClick={() => setProductInStockOnly((prev) => !prev)}
                    sx={{ height: 32, fontSize: 12, fontWeight: 900, borderRadius: '8px' }}
                  />
                ) : null}
              </Stack>
            </Stack>
          </Box>
          <Box onScroll={handlePickerScroll} sx={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}>
            {pickerNeedsCounterparty(pickerKind) && !draftCounterpartyGuid ? (
              <Typography sx={{ px: 2, py: 1.5, color: '#64748B', borderBottom: '1px solid #D8E2F0' }}>Сначала выберите контрагента.</Typography>
            ) : null}
            {!pickerLoading && pickerItems.length === 0 && !(pickerNeedsCounterparty(pickerKind) && !draftCounterpartyGuid) ? (
              <Typography sx={{ px: 2, py: 1.5, color: '#64748B', borderBottom: '1px solid #D8E2F0' }}>Ничего не найдено.</Typography>
            ) : null}
            {pickerItems.map((item: any, index) => {
              const alreadyInOrder = pickerKind === 'product' && workspace.draft.items.some((line) => line.productGuid === item.guid);
              return (
                <PickerListItem
                  key={getPickerItemKey(pickerKind, item, index)}
                  item={item}
                  kind={pickerKind}
                  isFirst={index === 0}
                  disabled={alreadyInOrder}
                  note={alreadyInOrder ? 'Уже в заказе' : undefined}
                  onSelect={(nextItem) => void handlePickerSelect(nextItem)}
                />
              );
            })}
          </Box>
          {pickerLoading && pickerItems.length ? <Box sx={{ height: 3, bgcolor: '#2563EB', opacity: 0.18 }} /> : null}
        </Box>
      </Drawer>
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
            {settingsDraft.deliveryDateMode === 'FIXED_DATE' ? <TextField type="date" label="Дата" InputLabelProps={{ shrink: true }} value={settingsDraft.fixedDeliveryDate} onChange={(e) => setSettingsDraft((prev) => ({ ...prev, fixedDeliveryDate: e.target.value }))} /> : null}
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
        <MenuItem onClick={openContextOrder}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Ionicons name="document-text-outline" size={16} color="#0F172A" />
            <Typography sx={{ fontSize: 13, fontWeight: 800 }}>Открыть</Typography>
          </Stack>
        </MenuItem>
        <MenuItem onClick={() => void runContextOrderDangerAction()} sx={{ color: '#DC2626' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Ionicons name={orderContextMenu?.order.status === 'DRAFT' ? 'trash-outline' : 'close-circle-outline'} size={16} color="#DC2626" />
            <Typography sx={{ fontSize: 13, fontWeight: 800 }}>
              {orderContextMenu?.order.status === 'DRAFT' ? 'Удалить черновик' : 'Отменить заказ'}
            </Typography>
          </Stack>
        </MenuItem>
      </Menu>

      <Dialog open={discardConfirm.open} onClose={() => closeDiscardConfirm(false)} maxWidth="xs" fullWidth fullScreen={isPhoneDialog}>
        <DialogTitle>{discardConfirm.mode === 'create' ? 'Отменить создание заказа?' : 'Отменить изменения?'}</DialogTitle>
        <DialogContent>
          <Stack spacing={1}>
            <Typography sx={{ color: '#475569', fontSize: 13 }}>
              {discardConfirm.mode === 'create'
                ? 'В новом документе есть ошибки, поэтому его нельзя сохранить автоматически. Отменить создание и перейти к другому документу?'
                : 'В текущем документе есть ошибки, поэтому изменения нельзя сохранить автоматически. Перейти без сохранения изменений?'}
            </Typography>
            {discardConfirm.blockingMessage ? (
              <Alert severity="warning" sx={{ py: 0.4, '& .MuiAlert-message': { fontSize: 12 } }}>
                {discardConfirm.blockingMessage}
              </Alert>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => closeDiscardConfirm(false)} sx={{ textTransform: 'none', fontWeight: 800 }}>Остаться</Button>
          <Button variant="contained" color="error" onClick={() => closeDiscardConfirm(true)} sx={{ textTransform: 'none', fontWeight: 800 }}>
            {discardConfirm.mode === 'create' ? 'Отменить создание' : 'Перейти без сохранения'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmSubmitOpen} onClose={() => setConfirmSubmitOpen(false)} maxWidth="xs" fullWidth fullScreen={isPhoneDialog}>
        <DialogTitle>Отправить в 1С?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#475569', fontSize: 13 }}>
            Документ будет поставлен в очередь обмена. После отправки часть полей станет недоступна для редактирования.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmSubmitOpen(false)} sx={{ textTransform: 'none', fontWeight: 800 }}>Остаться</Button>
          <Button variant="contained" color="secondary" onClick={() => void submitWithConfirm()} disabled={workspace.submitting} sx={{ textTransform: 'none', fontWeight: 800 }}>
            {workspace.submitting ? 'Отправляю...' : 'Отправить'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmCancelOpen} onClose={() => { setConfirmCancelOpen(false); setPendingCancelOrder(null); }} maxWidth="xs" fullWidth fullScreen={isPhoneDialog}>
        <DialogTitle>Отменить заказ?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#475569', fontSize: 13 }}>
            Заказ будет переведен в статус отмененного. Действие нельзя будет продолжить как обычное редактирование черновика.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setConfirmCancelOpen(false); setPendingCancelOrder(null); }} sx={{ textTransform: 'none', fontWeight: 800 }}>Остаться</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              const target = pendingCancelOrder ? { guid: pendingCancelOrder.guid, revision: pendingCancelOrder.revision } : undefined;
              setConfirmCancelOpen(false);
              setPendingCancelOrder(null);
              void workspace.cancelOrderConfirmed(target);
            }}
            disabled={workspace.cancelling}
            sx={{ textTransform: 'none', fontWeight: 800 }}
          >
            {workspace.cancelling ? 'Отменяю...' : 'Отменить заказ'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!pendingOrganization} onClose={() => setPendingOrganization(null)} maxWidth="xs" fullWidth fullScreen={isPhoneDialog}>
        <DialogTitle>Сменить организацию?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#475569', fontSize: 13 }}>
            Будут пересчитаны соглашение, договор, склад, вид цены и цены по строкам под выбранную организацию.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingOrganization(null)} sx={{ textTransform: 'none', fontWeight: 800 }}>Нет</Button>
          <Button
            variant="contained"
            onClick={() => {
              const next = pendingOrganization;
              setPendingOrganization(null);
              if (next) void setOrganization(next);
            }}
            sx={{ textTransform: 'none', fontWeight: 800 }}
          >
            Сменить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!pendingPriceTypeAction} onClose={() => setPendingPriceTypeAction(null)} maxWidth="xs" fullWidth fullScreen={isPhoneDialog}>
        <DialogTitle>{pendingPriceTypeAction?.type === 'reset-header' ? 'Сбросить вид цены?' : 'Сменить вид цены?'}</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#475569', fontSize: 13 }}>
            {pendingPriceTypeAction?.type === 'reset-header'
              ? 'Вид цены и ручные цены строк будут сброшены к значениям соглашения. Продолжить?'
              : 'Цены строк будут пересчитаны по выбранному виду цены. Ручные цены останутся произвольными. Продолжить?'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingPriceTypeAction(null)} sx={{ textTransform: 'none', fontWeight: 800 }}>Отмена</Button>
          <Button
            variant="contained"
            onClick={applyPendingPriceTypeAction}
            sx={{ textTransform: 'none', fontWeight: 800 }}
          >
            Продолжить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmClearItemsOpen} onClose={() => setConfirmClearItemsOpen(false)} maxWidth="xs" fullWidth fullScreen={isPhoneDialog}>
        <DialogTitle>Удалить все строки?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#475569', fontSize: 13 }}>
            Все товары будут удалены из документа. Действие можно отменить только вручную, добавив товары заново.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClearItemsOpen(false)} sx={{ textTransform: 'none', fontWeight: 800 }}>Отмена</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              setConfirmClearItemsOpen(false);
              workspace.clearItems();
            }}
            sx={{ textTransform: 'none', fontWeight: 800 }}
          >
            Удалить
          </Button>
        </DialogActions>
      </Dialog>

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
            <Typography sx={{ fontSize: 18, fontWeight: 900 }}>Инспектор заказа</Typography>
            <Paper variant="outlined" sx={{ borderRadius: '18px', p: 1.75 }}>
              <Stack spacing={0.75}>
                <Typography sx={{ fontWeight: 900 }}>Статус и 1С</Typography>
                <Typography sx={{ fontSize: 13, color: '#64748B' }}>Revision: {workspace.draft.revision || '—'}</Typography>
                <Typography sx={{ fontSize: 13, color: '#64748B' }}>Статус: {workspace.statusLabels[workspace.selectedOrder?.status || ''] || workspace.selectedOrder?.status || '—'}</Typography>
                <Typography sx={{ fontSize: 13, color: '#64748B' }}>Sync state: {workspace.syncLabels[workspace.selectedOrder?.syncState || ''] || workspace.selectedOrder?.syncState || '—'}</Typography>
                <Typography sx={{ fontSize: 13, color: '#64748B' }}>Организация: {workspace.selectedOrder?.organization?.name || '—'}</Typography>
                <Typography sx={{ fontSize: 13, color: '#64748B' }}>Документ 1С: {workspace.selectedOrder?.number1c || 'Еще не создан'}</Typography>
              </Stack>
            </Paper>
            <Paper variant="outlined" sx={{ borderRadius: '18px', p: 1.75 }}>
              <Stack spacing={1}>
                <Typography sx={{ fontWeight: 900 }}>История</Typography>
                {!workspace.selectedOrder?.events.length ? <Typography sx={{ fontSize: 13, color: '#64748B' }}>Событий пока нет.</Typography> : workspace.selectedOrder.events.map((event) => (
                  <Box key={event.id} sx={{ borderRadius: '14px', bgcolor: '#F8FAFC', px: 1.4, py: 1.2 }}>
                    <Typography sx={{ fontWeight: 800 }}>{event.eventType} • rev {event.revision}</Typography>
                    <Typography sx={{ fontSize: 10, color: '#64748B' }}>{event.source} • {formatDateTime(event.createdAt)}</Typography>
                  </Box>
                ))}
              </Stack>
            </Paper>
          </Stack>
        </Box>
      </Drawer>
    </Box>
  );
}
