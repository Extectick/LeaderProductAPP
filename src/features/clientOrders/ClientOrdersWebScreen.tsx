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
  type DraftItem,
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
import { hasMorePage } from './lib/clientOrdersPaging';
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
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Ionicons } from '@expo/vector-icons';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnOrderState,
  type ColumnSizingState,
} from '@tanstack/react-table';
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
const PRODUCT_IMAGE_PLACEHOLDER_URI = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22 viewBox=%220 0 120 120%22%3E%3Crect width=%22120%22 height=%22120%22 rx=%2224%22 fill=%22%23EFF6FF%22/%3E%3Crect x=%2222%22 y=%2224%22 width=%2276%22 height=%2272%22 rx=%2216%22 fill=%22%23FFFFFF%22 stroke=%22%2393C5FD%22 stroke-width=%225%22/%3E%3Ccircle cx=%2248%22 cy=%2249%22 r=%2211%22 fill=%22%23BFDBFE%22/%3E%3Cpath d=%22M33 82l19-21 14 14 11-13 22 20H33z%22 fill=%22%232563EB%22 opacity=%22.72%22/%3E%3C/svg%3E';

function getDraftItemImageUri(item: DraftItem | any) {
  return item?.imageUrl || item?.pictureUrl || item?.photoUrl || item?.thumbnailUrl || PRODUCT_IMAGE_PLACEHOLDER_URI;
}

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
  return getQuantityInputWidthPx(value, minInputWidth, maxInputWidth) + buttonSize * 2 + 4;
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
  flat?: boolean;
};

function QuickLookupField<T extends { guid?: string | null }>(props: QuickLookupFieldProps<T>) {
  const { kind, label, value, placeholder, disabled, loadOptions, onSelect, onOpenDetails, detailsDisabled, detailsTooltip, beforeDetailsAdornment, dense, flat } = props;
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
  const inputDisabled = !!disabled && !onOpenDetails;
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
      const nextItems = result.items || [];
      setItems((prev) => (append ? [...prev, ...nextItems] : nextItems));
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
    void loadPage(useDefaultListing ? '' : query, offset, true);
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
          sx={[
            {
              '& .MuiInputBase-root': { height: dense ? 28 : 30, borderRadius: flat ? 0 : '6px', fontSize: 10.5, fontWeight: 800, alignItems: 'center', bgcolor: flat ? 'transparent' : disabled ? '#F8FAFC' : '#FFFFFF' },
              '& .MuiInputBase-input': { py: 0, lineHeight: dense ? '28px' : '34px' },
            },
            flat ? {
              '& .MuiOutlinedInput-notchedOutline': { border: 0 },
              '& .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderBottom: '1px solid #2563EB' },
            } : {},
          ]}
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
  const workspaceRef = React.useRef(workspace);
  workspaceRef.current = workspace;
  const topInset = useHeaderContentTopInset({ compact: true, hasSubtitle: false, extraGap: 2 });
  const pageTopInset = Math.max(0, topInset - 18);
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
  const pickerAppendLoadingRef = React.useRef(false);
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
  const [productImagePreview, setProductImagePreview] = React.useState<{ src: string; title: string; subtitle?: string | null } | null>(null);
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
    pickerRequestIdRef.current += 1;
    pickerAppendLoadingRef.current = false;
    setPickerKind(kind);
    setPickerSearch('');
    setPickerItems([]);
    setPickerOffset(0);
    setPickerHasMore(false);
  }, []);

  const loadPickerPage = React.useCallback(async (kind: PickerKind, search: string, offset = 0, append = false) => {
    if (append && pickerAppendLoadingRef.current) return;
    if (append) pickerAppendLoadingRef.current = true;
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
        setPickerOffset(offset + slice.length);
        setPickerHasMore(hasMorePage(slice.length, 25, offset, filtered.length));
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
      setPickerOffset(offset + nextItems.length);
      setPickerHasMore(hasMorePage(nextItems.length, 25, offset, result?.meta?.total));
    } finally {
      if (append) pickerAppendLoadingRef.current = false;
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
    void loadPickerPage(pickerKind, pickerSearch, pickerOffset, true);
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
    const created = await workspace.createDocument();
    if (!created) return;
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
              gridTemplateColumns: `${quantityControlWidth}px ${ui.narrowPackageWidth}px ${ui.narrowPriceWidth}px`,
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
  }, [ui.compactStaticFieldHorizontalPadding, ui.narrowControlHeight, ui.narrowPackageWidth, ui.narrowPriceWidth, ui.narrowQtyWidth, ui.narrowRowGap, workspace]);

  const draftItemsTableWidth = React.useMemo(() => {
    const horizontalChrome = isSinglePane ? 24 : 44;
    return Math.max(Math.floor(effectiveEditorPaneWidth - horizontalChrome), 560);
  }, [effectiveEditorPaneWidth, isSinglePane]);

  const draftItemsColumnLayout = React.useMemo(() => {
    const hasVariablePackages = draftItemsPackageLayoutKey.includes(':multi');
    const base = {
      actions: 30,
      product: useCompactTable ? 320 : 440,
      quantity: quantityColumnWidth,
      package: hasVariablePackages ? (useCompactTable ? 128 : 154) : (useCompactTable ? 86 : 98),
      price: useCompactTable ? 94 : 112,
      total: useCompactTable ? 96 : 116,
    };
    const min = {
      actions: 30,
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
  }, [draftItemsPackageLayoutKey, draftItemsTableWidth, quantityColumnWidth, useCompactTable]);

  const draftItemColumns = React.useMemo<ColumnDef<DraftItem>[]>(() => {
    const { width, min } = draftItemsColumnLayout;

    return [
      {
        id: 'actions',
        header: '',
        size: width.actions,
        minSize: min.actions,
        maxSize: width.actions,
        enableResizing: false,
        cell: ({ row }) => {
          const currentWorkspace = workspaceRef.current;
          return (
            <Box sx={{ width: '100%', display: 'grid', placeItems: 'center' }}>
              <Tooltip title="Удалить строку" arrow>
                <span>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => currentWorkspace.removeItem(row.original.key)}
                    disabled={currentWorkspace.readOnly}
                    sx={{
                      width: 22,
                      height: 22,
                      color: '#94A3B8',
                      borderRadius: 0,
                      bgcolor: 'transparent',
                      '&:hover': { color: '#DC2626', bgcolor: 'transparent' },
                    }}
                  >
                    <Ionicons name="close-outline" size={15} />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          );
        },
      },
      {
        accessorKey: 'productName',
        header: 'Товар',
        size: width.product,
        minSize: min.product,
        cell: ({ row }) => {
          const currentWorkspace = workspaceRef.current;
          const item = row.original;
          const lineErrors = currentWorkspace.validation.itemMessages[item.key] || [];
          const imageUri = getDraftItemImageUri(item);
          return (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, py: 0.1 }}>
              <Tooltip title="Открыть изображение" arrow>
                <Box
                  component="button"
                  type="button"
                  onClick={() => setProductImagePreview({
                    src: imageUri,
                    title: item.productName,
                    subtitle: item.productCode || item.productArticle || item.productSku || null,
                  })}
                  sx={{
                    p: 0,
                    border: 0,
                    bgcolor: 'transparent',
                    flexShrink: 0,
                    cursor: 'pointer',
                    borderRadius: '6px',
                    '&:focus-visible': { outline: '2px solid #2563EB', outlineOffset: 2 },
                  }}
                >
                  <Box
                    component="img"
                    src={imageUri}
                    alt={item.productName}
                    sx={{
                      width: useCompactTable ? 42 : 52,
                      height: useCompactTable ? 42 : 52,
                      display: 'block',
                      borderRadius: '6px',
                      border: '1px solid #E2E8F0',
                      bgcolor: '#F8FAFC',
                      objectFit: 'cover',
                    }}
                  />
                </Box>
              </Tooltip>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  sx={{
                    fontSize: useCompactTable ? 11.5 : 12.5,
                    fontWeight: 900,
                    lineHeight: 1.18,
                    color: '#0F172A',
                    display: '-webkit-box',
                    WebkitLineClamp: useCompactTable ? 2 : 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    wordBreak: 'break-word',
                  }}
                >
                  {item.productName}
                </Typography>
                <Typography component="div" sx={{ mt: 0.25, fontSize: 10.5, color: '#64748B', lineHeight: 1.18 }}>
                  <DraftItemMeta item={item} />
                </Typography>
                {lineErrors.length ? (
                  <Box sx={{ mt: 0.45, px: 0.75, py: 0.35, borderRadius: '9px', bgcolor: '#FEF2F2', border: '1px solid #FECACA' }}>
                    <Typography sx={{ fontSize: 10, color: '#B91C1C', lineHeight: 1.2, fontWeight: 700 }}>
                      {lineErrors.join(' ')}
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
          const quantityError = !isValidQuantityValue(item);
          const quantityInputWidth = getQuantityInputWidthPx(item.quantity, useCompactTable ? 38 : 44, useCompactTable ? 58 : 66);
          const quantityControlWidth = getQuantityControlWidthPx(item.quantity, 14, useCompactTable ? 38 : 44, useCompactTable ? 58 : 66);
          return (
            <Stack direction="row" alignItems="center" spacing={0.15} sx={{ width: quantityControlWidth, maxWidth: '100%', mx: 'auto' }}>
              <IconButton
                size="small"
                disabled={currentWorkspace.readOnly}
                onClick={() => currentWorkspace.setItemPatch(item.key, { quantity: stepQuantity(item, -1) })}
                sx={{ width: 14, height: 28, minWidth: 14, p: 0, border: 0, borderRadius: 0, bgcolor: 'transparent', color: '#64748B', '&:hover': { color: '#0F172A', bgcolor: 'transparent' } }}
              >
                <Typography sx={{ fontSize: 15, fontWeight: 500, lineHeight: 1 }}>−</Typography>
              </IconButton>
              <TextField
                size="small"
                value={item.quantity}
                onChange={(e) => currentWorkspace.setItemPatch(item.key, { quantity: normalizeQuantityInput(item, e.target.value) })}
                disabled={currentWorkspace.readOnly}
                error={quantityError}
                sx={{
                  width: quantityInputWidth,
                  ...compactInputSx,
                  '& .MuiInputBase-root': { height: 30, borderRadius: 0, bgcolor: 'transparent' },
                  '& .MuiOutlinedInput-notchedOutline': { border: 0 },
                  '& .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderBottom: '1px solid #2563EB' },
                  '& input': { textAlign: 'center', fontSize: 11, fontWeight: 900, lineHeight: '30px', py: 0, px: 0.25 },
                }}
              />
              <IconButton
                size="small"
                disabled={currentWorkspace.readOnly}
                onClick={() => currentWorkspace.setItemPatch(item.key, { quantity: stepQuantity(item, 1) })}
                sx={{ width: 14, height: 28, minWidth: 14, p: 0, border: 0, borderRadius: 0, bgcolor: 'transparent', color: '#64748B', '&:hover': { color: '#0F172A', bgcolor: 'transparent' } }}
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
          const packageValue = item.packageGuid || (item.packages.length ? '' : '__base__');
          if (hasSinglePackage(item)) {
            return (
              <Box sx={{ minHeight: 30, px: 1, border: 0, borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'transparent', width: '100%', boxSizing: 'border-box' }}>
                <Typography sx={{ fontSize: 10.8, fontWeight: 900, color: '#0F172A', whiteSpace: 'nowrap' }}>
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
              onChange={(e) => currentWorkspace.setItemPatch(item.key, { packageGuid: e.target.value === '__base__' ? null : e.target.value })}
              disabled={currentWorkspace.readOnly}
              fullWidth
              sx={{
                ...compactInputSx,
                '& .MuiInputBase-root': { height: 30, borderRadius: 0, bgcolor: 'transparent' },
                '& .MuiOutlinedInput-notchedOutline': { border: 0 },
                '& .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderBottom: '1px solid #2563EB' },
                '& .MuiInputBase-input': { fontSize: 10.8, fontWeight: 900, lineHeight: '30px', py: 0 },
              }}
            >
              <MenuItem value="">{unitLabel(item.baseUnit)}</MenuItem>
              {item.packages.map((pack) => <MenuItem key={pack.guid} value={pack.guid}>{packageLabel(pack)}</MenuItem>)}
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
          const displayedPrice = getDisplayedPriceValue(item.manualPrice, item.basePrice);
          const priceError = !isValidManualPriceValue(item.manualPrice);
          return (
            <TextField
              size="small"
              value={displayedPrice}
              placeholder="0"
              onChange={(e) => {
                const manualPrice = normalizePriceInput(e.target.value, displayedPrice);
                currentWorkspace.setItemPatch(item.key, {
                  manualPrice,
                  priceTypeGuid: manualPrice.trim() ? null : currentWorkspace.draft.priceTypeGuid ?? null,
                  priceTypeName: manualPrice.trim() ? 'Произвольный' : currentWorkspace.draft.priceTypeName ?? null,
                });
              }}
              disabled={currentWorkspace.readOnly}
              error={priceError}
              sx={{
                ...compactInputSx,
                '& .MuiInputBase-root': { height: 30, borderRadius: 0, bgcolor: 'transparent' },
                '& .MuiOutlinedInput-notchedOutline': { border: 0 },
                '& .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderBottom: '1px solid #2563EB' },
                '& .MuiInputBase-input': { fontSize: 11, fontWeight: 900, py: 0, lineHeight: '30px' },
                '& .MuiInputBase-input::placeholder': { color: '#94A3B8', opacity: 1 },
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
            <Typography sx={{ width: '100%', pr: 0.5, fontSize: 12, fontWeight: 900, color: '#0F172A', whiteSpace: 'nowrap', textAlign: 'right' }}>
              {formatMoney(computeLineTotal(row.original, currentWorkspace.draft.generalDiscountPercent), row.original.currency)}
            </Typography>
          );
        },
      },
    ];
  }, [draftItemsColumnLayout, useCompactTable]);

  const [draftItemsColumnSizing, setDraftItemsColumnSizing] = React.useState<ColumnSizingState>({});
  const [draftItemsColumnOrder, setDraftItemsColumnOrder] = React.useState<ColumnOrderState>([]);
  const draggedDraftItemsColumnRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    setDraftItemsColumnSizing({});
  }, [draftItemsTableWidth]);
  const draftItemsTable = useReactTable({
    data: filteredDraftItems,
    columns: draftItemColumns,
    getCoreRowModel: getCoreRowModel(),
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
    <Box sx={{ backgroundColor: '#FFFFFF', minHeight: '100%', pt: `${pageTopInset}px`, overflowX: 'hidden' }}>
      <Stack direction={isSinglePane ? 'column' : 'row'} spacing={0} sx={{ height: isSinglePane ? 'auto' : `calc(100vh - ${pageTopInset}px)`, minHeight: isSinglePane ? `calc(100vh - ${pageTopInset}px)` : undefined }}>
        {showOrdersPane ? <Paper ref={ordersPaneRef} elevation={0} sx={{ width: isSinglePane ? '100%' : 300, mx: 0, alignSelf: 'stretch', flexShrink: 0, minWidth: 0, height: isSinglePane ? `calc(100vh - ${pageTopInset}px)` : 'auto', borderRadius: 0, border: 0, borderRight: isSinglePane ? 0 : '1px solid #E2E8F0', p: 1.25, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: '#F8FAFC' }}>
          <Stack spacing={0.8}>
            <Typography sx={{ fontSize: 15, fontWeight: 900, lineHeight: 1.1 }}>Заказы</Typography>
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
            <Stack direction="row" spacing={0.45} flexWrap="wrap" useFlexGap>
              <Chip size="small" label={workspace.statusCounts.all} sx={{ height: 22, fontSize: 10.5, fontWeight: 900 }} />
              <Chip size="small" label={`Черн. ${workspace.statusCounts.draft}`} sx={{ height: 22, fontSize: 10.5, fontWeight: 800 }} />
              <Chip size="small" label={`Оч. ${workspace.statusCounts.queued}`} sx={{ height: 22, fontSize: 10.5, fontWeight: 800 }} />
            </Stack>
          </Stack>
          <Divider sx={{ my: 0.7 }} />
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
                          {order.itemsCount ?? order.items.length ?? 0} поз.
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

        {showEditorPane ? <Paper ref={editorPaneRef} elevation={0} sx={{ flex: 1, minWidth: 0, width: '100%', mx: 0, alignSelf: 'stretch', minHeight: isSinglePane ? `calc(100vh - ${pageTopInset}px)` : 0, borderRadius: 0, border: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', bgcolor: '#FFFFFF' }}>
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
              <Box sx={{ position: 'sticky', top: 0, zIndex: 2, px: 1.4, py: 1, borderBottom: '1px solid #E2E8F0', background: '#FFFFFF' }}>
                <Stack spacing={0.8}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
                      {isSinglePane ? (
                        <ToolbarIconButton title="К списку" icon="arrow-back-outline" color="#0F172A" buttonSize={ui.actionButtonSize} iconSize={ui.actionIconSize} onClick={() => {
                          void workspace.confirmDiscardIfNeeded().then((canLeave: boolean) => {
                            if (canLeave) setResponsivePane('orders');
                          });
                        }} />
                      ) : null}
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 18, fontWeight: 900, lineHeight: 1.1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</Typography>
                        {!workspace.draftMode ? <Chip size="small" label={workspace.statusLabels[workspace.selectedOrder?.status || ''] || workspace.selectedOrder?.status || '?'} sx={{ height: 20, fontSize: 10, fontWeight: 800 }} /> : null}
                      </Stack>
                      <Typography sx={{ color: '#64748B', fontSize: 11, fontWeight: 700 }}>{workspace.autosaveLabel}</Typography>
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
                    <Stack direction="row" spacing={0.45} justifyContent="flex-end" useFlexGap flexWrap={isSinglePane || effectiveEditorPaneWidth < 1160 ? 'wrap' : 'nowrap'}>
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
                      <ToolbarIconButton title="Сохранить" icon="save-outline" color="#2563EB" buttonSize={ui.actionButtonSize} iconSize={ui.actionIconSize} onClick={() => void workspace.saveDraft({ reason: 'manual' })} disabled={workspace.readOnly || workspace.saving || !workspace.validation.canSave} loading={workspace.saving} />
                      <ToolbarIconButton title="Отправить в 1С" icon="cloud-upload-outline" label={effectiveEditorPaneWidth >= 1180 ? 'В 1С' : undefined} color="#16A34A" buttonSize={ui.actionButtonSize} iconSize={ui.actionIconSize} onClick={() => setConfirmSubmitOpen(true)} disabled={workspace.readOnly || workspace.submitting || !workspace.validation.canSubmit} loading={workspace.submitting} />
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
                      gap: 0.6,
                      alignItems: 'center',
                      borderTop: '1px solid #E2E8F0',
                      pt: 0.75,
                      bgcolor: '#FFFFFF',
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
                        bgcolor: '#FFFFFF',
                        '& .MuiInputBase-root': { height: 30, borderRadius: '7px', fontSize: 11 },
                        '& .MuiInputBase-input': { py: 0, lineHeight: '30px' },
                      }}
                    />
                  </Box>
                  ) : null}
                </Stack>
              </Box>

              <Box ref={editorScrollRef} sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 1.4, py: 1, display: 'flex', flexDirection: 'column' }}>
                <Stack spacing={0.8} sx={{ flex: 1, minHeight: 0 }}>
                  {!showInlineEditorErrors && workspace.error ? <Alert severity="error">{workspace.error}</Alert> : null}
                  {!showInlineEditorErrors && workspace.validation.blockingMessage ? <Alert severity="warning">{workspace.validation.blockingMessage}</Alert> : null}
                  {workspace.draftMode && !workspace.draft.organizationGuid && !workspace.loadingSettings ? (
                    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1, borderColor: '#F59E0B', background: '#FFFBEB' }}>
                      <Stack spacing={0.7}>
                        <Typography sx={{ fontSize: 12.5, fontWeight: 900, color: '#92400E' }}>Выберите организацию</Typography>
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                          {(workspace.settings?.organizations || []).map((item) => (
                            <Button key={item.guid} variant="contained" onClick={() => void workspace.setOrganization(item)} sx={{ textTransform: 'none', fontWeight: 800, borderRadius: '8px', minHeight: 30 }}>{item.name}</Button>
                          ))}
                        </Stack>
                      </Stack>
                    </Paper>
                  ) : null}

                  {(!showSectionSwitcher || webEditorSection === 'items') ? (
                    <Paper
                      variant="outlined"
                      sx={{
                        borderRadius: 0,
                        p: usePhoneCompactItems ? 0 : 0,
                        borderColor: usePhoneCompactItems ? 'transparent' : '#E2E8F0',
                        boxShadow: 'none',
                        mx: usePhoneCompactItems ? -1 : -1.4,
                        overflow: 'hidden',
                        bgcolor: '#FFFFFF',
                        flex: usePhoneCompactItems ? undefined : 1,
                        minHeight: usePhoneCompactItems ? undefined : 0,
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      {usePhoneCompactItems ? (
                        <Box sx={{ borderTop: '1px solid #E2E8F0', pb: `${ui.itemsBottomInset}px` }}>
                          {filteredDraftItems.map((item, index) => renderDraftItemCard(item, index + 1))}
                        </Box>
                      ) : (
                        <Box sx={{ bgcolor: '#FFFFFF', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                            justifyContent="space-between"
                            useFlexGap
                            flexWrap="wrap"
                            sx={{
                              minHeight: 38,
                              bgcolor: '#F8FAFC',
                              borderBottom: '1px solid #E2E8F0',
                              px: 1,
                              py: 0.35,
                            }}
                          >
                            <Stack direction="row" spacing={0.6} alignItems="center" sx={{ minWidth: 0, flex: '1 1 560px' }}>
                              <TextField
                                size="small"
                                placeholder="Поиск товара"
                                value={itemsSearch}
                                onChange={(event) => setItemsSearch(event.target.value)}
                                InputProps={{
                                  startAdornment: <Ionicons name="search-outline" size={15} color="#64748B" />,
                                }}
                                sx={{
                                  minWidth: 260,
                                  maxWidth: 460,
                                  flex: '1 1 360px',
                                  '& .MuiInputBase-root': {
                                    height: 30,
                                    borderRadius: '4px',
                                    fontSize: 12,
                                    fontWeight: 800,
                                    bgcolor: '#FFFFFF',
                                    gap: 0.8,
                                    boxShadow: 'inset 0 0 0 1px #D8E2F0',
                                  },
                                  '& .MuiOutlinedInput-notchedOutline': { border: 0 },
                                  '& .MuiInputBase-root.Mui-focused': { boxShadow: 'inset 0 0 0 1px #2563EB, 0 0 0 3px rgba(37, 99, 235, 0.10)' },
                                  '& .MuiInputBase-input': { py: 0, lineHeight: '30px' },
                                }}
                              />
                              <ToolbarIconButton
                                title="Удалить все строки"
                                icon="trash-outline"
                                label="Очистить"
                                color="#DC2626"
                                buttonSize={30}
                                iconSize={15}
                                onClick={() => setConfirmClearItemsOpen(true)}
                                disabled={!workspace.draft.items.length || workspace.readOnly}
                              />
                              <ToolbarIconButton
                                title="Открыть подбор товаров"
                                icon="add-outline"
                                label="Добавить товар"
                                color="#16A34A"
                                buttonSize={30}
                                iconSize={15}
                                onClick={() => openPicker('product')}
                                disabled={!workspace.draft.counterpartyGuid || workspace.readOnly}
                              />
                            </Stack>

                            <Box
                              sx={{
                                px: 1.1,
                                py: 0.35,
                                borderRadius: '4px',
                                bgcolor: '#FFFFFF',
                                border: '1px solid #D8E2F0',
                                minWidth: 190,
                                textAlign: 'right',
                                flexShrink: 0,
                              }}
                            >
                              <Typography sx={{ fontSize: 9.5, fontWeight: 900, color: '#64748B', lineHeight: 1, textTransform: 'uppercase', letterSpacing: 0 }}>
                                Сумма заказа
                              </Typography>
                              <Typography sx={{ mt: 0.2, fontSize: 14, fontWeight: 900, color: '#2563EB', whiteSpace: 'nowrap', lineHeight: 1.15 }}>
                                {formatMoney(workspace.localTotal, workspace.draft.currency)}
                              </Typography>
                            </Box>
                          </Stack>

                          <Box
                            sx={{
                              flex: 1,
                              minHeight: filteredDraftItems.length ? 320 : 180,
                              overflowY: 'auto',
                              overflowX: 'hidden',
                              bgcolor: '#FFFFFF',
                            }}
                          >
                            {!filteredDraftItems.length ? (
                              <Box sx={{ py: 4, display: 'grid', placeItems: 'center', gap: 1.2, color: '#64748B' }}>
                                <Box
                                  component="img"
                                  src={PRODUCT_IMAGE_PLACEHOLDER_URI}
                                  alt=""
                                  sx={{ width: 72, height: 72, borderRadius: '18px', opacity: 0.9 }}
                                />
                                <Typography sx={{ fontSize: 14, fontWeight: 900, color: '#0F172A' }}>
                                  Товаров пока нет
                                </Typography>
                                <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#64748B' }}>
                                  Добавьте строку через подбор товаров.
                                </Typography>
                              </Box>
                            ) : (
                              <Box
                                component="table"
                                sx={{
                                  width: '100%',
                                  maxWidth: '100%',
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
                                            bgcolor: '#F8FAFC',
                                            borderBottom: '1px solid #D8E2F0',
                                            borderRight: '1px solid #E2E8F0',
                                            color: '#475569',
                                            fontSize: 10.5,
                                            fontWeight: 900,
                                            lineHeight: 1.1,
                                            py: 0.75,
                                            px: ui.tableCellX + 0.35,
                                            textTransform: 'uppercase',
                                            letterSpacing: 0,
                                            textAlign: header.column.id === 'total' ? 'right' : 'left',
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
                                                '&:hover': { bgcolor: '#BFDBFE' },
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
                                    return (
                                      <Box
                                        component="tr"
                                        key={row.id}
                                        sx={{
                                          bgcolor: hasRowErrors ? '#FFF7F7' : '#FFFFFF',
                                          transition: 'background-color 140ms ease',
                                          '&:hover td': { bgcolor: hasRowErrors ? '#FFF7F7' : '#FFFFFF' },
                                        }}
                                      >
                                        {row.getVisibleCells().map((cell) => (
                                          <Box
                                            component="td"
                                            key={cell.id}
                                            sx={{
                                              width: cell.column.getSize(),
                                              borderBottom: '1px solid #E2E8F0',
                                              borderRight: '1px solid #E2E8F0',
                                              px: ui.tableCellX + 0.35,
                                              py: 0.5,
                                              verticalAlign: 'middle',
                                              bgcolor: 'inherit',
                                              '&:last-of-type': { borderRight: 0 },
                                            }}
                                          >
                                            <Box
                                              sx={{
                                                minHeight: 56,
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

      <Dialog open={discardConfirm.open} onClose={() => closeDiscardConfirm('cancel')} maxWidth="xs" fullWidth fullScreen={isPhoneDialog}>
        <DialogTitle>Несохраненные изменения</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#475569', fontSize: 13 }}>
            Сохранить изменения перед выходом из документа?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => closeDiscardConfirm('cancel')} sx={{ textTransform: 'none', fontWeight: 800 }}>Остаться</Button>
          <Button color="error" onClick={() => closeDiscardConfirm('discard')} sx={{ textTransform: 'none', fontWeight: 800 }}>Не сохранять</Button>
          <Button variant="contained" onClick={() => closeDiscardConfirm('save')} sx={{ textTransform: 'none', fontWeight: 800 }}>Сохранить</Button>
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

      <Dialog
        open={!!productImagePreview}
        onClose={() => setProductImagePreview(null)}
        maxWidth="md"
        fullWidth
        fullScreen={isPhoneDialog}
      >
        <DialogTitle sx={{ pb: 0.75 }}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 16, fontWeight: 900, lineHeight: 1.2 }} noWrap>
                {productImagePreview?.title || 'Изображение товара'}
              </Typography>
              {productImagePreview?.subtitle ? (
                <Typography sx={{ mt: 0.35, fontSize: 11, fontWeight: 700, color: '#64748B' }}>
                  {productImagePreview.subtitle}
                </Typography>
              ) : null}
            </Box>
            <IconButton
              size="small"
              onClick={() => setProductImagePreview(null)}
              sx={{ mt: -0.4, width: 30, height: 30 }}
            >
              <Ionicons name="close-outline" size={19} />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ p: 2, pt: 1.25, bgcolor: '#F8FAFC' }}>
          <Box
            sx={{
              minHeight: isPhoneDialog ? '62vh' : 460,
              display: 'grid',
              placeItems: 'center',
              bgcolor: '#FFFFFF',
              border: '1px solid #D8E2F0',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            {productImagePreview ? (
              <Box
                component="img"
                src={productImagePreview.src}
                alt={productImagePreview.title}
                sx={{
                  maxWidth: '100%',
                  maxHeight: isPhoneDialog ? '70vh' : 560,
                  width: 'auto',
                  height: 'auto',
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
            ) : null}
          </Box>
        </DialogContent>
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
