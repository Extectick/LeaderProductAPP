import React from 'react';
import {Alert, Box, Button, CircularProgress, ClickAwayListener, Stack, TextField, Typography} from '@mui/material';
import {Ionicons} from '@expo/vector-icons';
import type {ClientOrderProduct} from '@/utils/clientOrdersService';
import {WebProductImage, PRODUCT_IMAGE_PLACEHOLDER_URI} from '../../components/ProductImageGalleryDialog';
import {formatMoney, isCancelledDraftItem} from '../../lib/clientOrdersShared';
import {formatStockLabel, getPackageDisplayText, unitLabel} from '../../lib/clientOrdersUi';
import {findQuickProductLine, quickProductAddition, quickProductScopeKey, quickProductTemplate} from './clientOrderQuickProductsModel';

type SearchSnapshot = {scope: string; query: string; items: ClientOrderProduct[]};

/** Fast keyboard entry on the document itself. The existing workspace owns every mutation. */
export function ClientOrderQuickProducts({workspace, onOpenCatalog}: {workspace: any; onOpenCatalog?: () => void}) {
  const [query, setQuery] = React.useState('');
  const [quantity, setQuantity] = React.useState('1');
  const [snapshot, setSnapshot] = React.useState<SearchSnapshot | null>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [searchError, setSearchError] = React.useState(false);
  const [retry, setRetry] = React.useState(0);
  const [quantityError, setQuantityError] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState('');
  const searchRef = React.useRef<HTMLInputElement | null>(null);
  const quantityRef = React.useRef<HTMLInputElement | null>(null);
  const latest = React.useRef(workspace); latest.current = workspace;
  const request = React.useRef(0);
  const adding = React.useRef(false);
  const scope = quickProductScopeKey(workspace);
  const currentScope = React.useRef(scope); currentScope.current = scope;
  const queryText = query.trim();
  const currentQuery = React.useRef(queryText); currentQuery.current = queryText;
  const disabled = !!(workspace.readOnly || workspace.mutationLocked || workspace.loadingDetail || workspace.loadingDefaults);
  const hasContext = !!workspace.draft.organizationGuid && !!workspace.draft.counterpartyGuid;
  const results = snapshot?.scope === scope && snapshot.query === queryText ? snapshot.items : [];
  const activeProduct = results[activeIndex];
  const activeLine = React.useMemo(() => activeProduct ? quickProductTemplate(activeProduct, workspace.draft.items) : null, [activeProduct, workspace.draft.items]);
  const existingLine = activeProduct ? findQuickProductLine(activeProduct, workspace.draft.items) : undefined;
  const listId = `quick-products-${React.useId().replace(/:/g, '')}`;

  React.useEffect(() => {
    setQuery(''); setSnapshot(null); setActiveIndex(0); setQuantity('1'); setQuantityError(null); setFeedback(''); setOpen(false);
  }, [scope]);

  React.useEffect(() => {
    const id = ++request.current;
    setSnapshot(null); setActiveIndex(0); setSearchError(false); setQuantityError(null);
    if (!hasContext || disabled || !queryText) {setLoading(false); return;}
    setLoading(true);
    const timer = setTimeout(() => {
      const w = latest.current, d = w.draft;
      Promise.resolve().then(() => w.searchProducts({search: queryText, organizationGuid: d.organizationGuid,
        counterpartyGuid: d.counterpartyGuid, agreementGuid: d.agreementGuid || undefined,
        warehouseGuid: d.warehouseGuid || undefined, priceTypeGuid: d.priceTypeGuid || undefined,
        inStockOnly: false, limit: 12, offset: 0,
      })).then(result => {
        if (id !== request.current || scope !== currentScope.current || queryText !== currentQuery.current) return;
        setSnapshot({scope, query: queryText, items: result?.items || []}); setLoading(false);
      }, () => {
        if (id !== request.current || scope !== currentScope.current || queryText !== currentQuery.current) return;
        setSearchError(true); setLoading(false);
      });
    }, 180);
    return () => {clearTimeout(timer); request.current++;};
  }, [scope, queryText, hasContext, disabled, retry]);

  const add = () => {
    const w = latest.current;
    if (adding.current || !activeProduct || !hasContext || disabled || w.readOnly || w.mutationLocked || w.loadingDefaults || w.loadingDetail || scope !== quickProductScopeKey(w)
      || snapshot?.scope !== scope || snapshot.query !== currentQuery.current) return;
    const action = quickProductAddition(activeProduct, w.draft.items, quantity);
    if (action.kind === 'error') {setQuantityError(action.message); quantityRef.current?.focus(); return;}
    adding.current = true;
    if (action.kind === 'increment') w.setItemPatch(action.key, {quantity: action.quantity});
    else w.addProduct(activeProduct, {quantity: action.quantity});
    setFeedback(`${action.kind === 'increment' ? 'Количество увеличено' : 'Добавлено'}: ${activeProduct.name}`);
    setQuery(''); setSnapshot(null); setQuantity('1'); setQuantityError(null); setOpen(false);
    requestAnimationFrame(() => {adding.current = false; searchRef.current?.focus();});
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === 'Escape') {event.preventDefault(); setOpen(false); return;}
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setOpen(true);
      setActiveIndex(index => Math.max(0, Math.min(results.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
    }
    if (event.key === 'Enter') {event.preventDefault(); add();}
  };

  if (workspace.readOnly) return null;
  return <ClickAwayListener onClickAway={() => setOpen(false)}>
    <Box data-testid="quick-products" sx={{position: 'relative', minWidth: 0}}>
      <Typography sx={{fontSize: 15, fontWeight: 600, mb: 1}}>Добавить товар</Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{alignItems: 'flex-start', flexWrap: 'wrap'}}>
        <TextField inputRef={searchRef} value={query} fullWidth disabled={disabled || !hasContext}
          placeholder={hasContext ? 'Название, артикул или код товара' : 'Сначала выберите клиента'}
          onFocus={() => setOpen(true)} onChange={event => {setQuery(event.target.value); setOpen(true); setFeedback('');}}
          onKeyDown={onKeyDown} size="small" sx={{flex: '1 1 240px', minWidth: 180}}
          slotProps={{htmlInput: {'aria-label': 'Найти товар', role: 'combobox', 'aria-autocomplete': 'list',
            'aria-expanded': open && !!queryText, 'aria-controls': listId,
            'aria-activedescendant': open && activeProduct ? `${listId}-${activeIndex}` : undefined},
            input: {startAdornment: <Ionicons name="search-outline" size={20} color="var(--co-muted)" style={{marginRight: 8}} />,
              endAdornment: loading ? <CircularProgress size={18} /> : undefined}}} />
        <TextField inputRef={quantityRef} label="Количество" value={quantity} disabled={disabled || !hasContext}
          onChange={event => {setQuantity(event.target.value.replace('.', ',')); setQuantityError(null);}}
          onKeyDown={event => {if (!event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229 && event.key === 'Enter') {event.preventDefault(); add();}}}
          error={!!quantityError} size="small" sx={{width: 118}}
          slotProps={{htmlInput: {'aria-label': 'Количество для добавления', inputMode: 'decimal'},
            input: {endAdornment: activeLine ? <Typography noWrap sx={{fontSize: 12, color: 'var(--co-muted)', maxWidth: 50}}>{getPackageDisplayText(activeLine)}</Typography> : undefined}}} />
        <Button variant="contained" disabled={disabled || !activeProduct || isCancelledDraftItem(existingLine)} onClick={add} sx={{minHeight: 40}}>
          {existingLine ? 'Добавить ещё' : 'Добавить'}
        </Button>
        {onOpenCatalog ? <Button onClick={onOpenCatalog} disabled={disabled || !hasContext} sx={{minHeight: 40}}>Каталог</Button> : null}
      </Stack>
      {quantityError ? <Typography role="alert" sx={{fontSize: 12, color: 'var(--co-danger)', mt: 0.75}}>{quantityError}</Typography> : null}
      <Typography role="status" aria-live="polite" sx={{fontSize: 12, color: feedback ? 'var(--co-success)' : 'var(--co-muted)', mt: 0.75, minHeight: 18}}>
        {feedback || (workspace.loadingDefaults ? 'Подбираем условия клиента…' : existingLine ? `В заказе ${existingLine.quantity} ${getPackageDisplayText(existingLine)}. Добавится указанное количество в той же упаковке.` : 'Найдите товар → укажите количество → Enter. Упаковку можно изменить в строке заказа.')}
      </Typography>
      {open && queryText && !disabled && hasContext ? <Box sx={{position: 'absolute', zIndex: 10, top: '100%', left: 0, right: 0,
        maxHeight: 'min(360px, 45vh)', overflowY: 'auto', bgcolor: 'var(--co-surface)', border: '1px solid var(--co-line)',
        borderRadius: 2, boxShadow: '0 12px 28px rgba(0,0,0,.12)'}}>
        {searchError ? <Alert severity="warning" action={<Button onClick={() => setRetry(value => value + 1)}>Повторить</Button>}>Не удалось найти товары. {workspace.online ? 'Попробуйте ещё раз.' : 'Проверьте подключение.'}</Alert>
          : loading ? <Typography role="status" sx={{p: 2, fontSize: 14, color: 'var(--co-muted)'}}>Ищем товары…</Typography>
          : !results.length ? <Typography role="status" sx={{p: 2, fontSize: 14, color: 'var(--co-muted)'}}>Ничего не найдено. Попробуйте другой запрос.</Typography> : null}
        <Box role="listbox" id={listId} aria-label="Найденные товары">
          {results.map((product, index) => {
            const existing = findQuickProductLine(product, workspace.draft.items), cancelled = isCancelledDraftItem(existing);
            return <Box component="button" type="button" role="option" id={`${listId}-${index}`} key={product.guid}
              aria-selected={index === activeIndex} aria-disabled={cancelled} disabled={cancelled}
              onClick={() => {setActiveIndex(index); setQuantityError(null); quantityRef.current?.focus(); quantityRef.current?.select();}}
              sx={{width: '100%', border: 0, borderBottom: '1px solid var(--co-line)', display: 'flex', alignItems: 'center', gap: 1.5,
                px: 1.5, py: 1, minHeight: 62, textAlign: 'left', cursor: cancelled ? 'default' : 'pointer', color: 'var(--co-text)',
                bgcolor: index === activeIndex ? 'var(--co-soft)' : 'transparent', opacity: cancelled ? 0.5 : 1, '&:hover': {bgcolor: 'var(--co-soft)'}}}>
              <WebProductImage src={product.imageThumbUrl || product.images?.[0]?.thumbUrl || PRODUCT_IMAGE_PLACEHOLDER_URI} alt="" sx={{width: 40, height: 44, flexShrink: 0, borderRadius: 1}} />
              <Box sx={{flex: 1, minWidth: 0}}><Typography sx={{fontSize: 14, fontWeight: 600}}>{product.name}</Typography>
                <Typography sx={{fontSize: 12, color: 'var(--co-muted)'}}>{[product.code || product.article, formatStockLabel(product.stock, product.baseUnit), cancelled ? 'Строка отменена' : existing ? `В заказе: ${existing.quantity} ${getPackageDisplayText(existing)}` : null].filter(Boolean).join(' · ')}</Typography>
              </Box>
              <Box sx={{textAlign: 'right', flexShrink: 0}}><Typography sx={{fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap'}}>{formatMoney(product.basePrice, product.currency)}</Typography>
                {product.baseUnit ? <Typography sx={{fontSize: 12, color: 'var(--co-muted)'}}>за {unitLabel(product.baseUnit)}</Typography> : null}</Box>
            </Box>;
          })}
        </Box>
      </Box> : null}
    </Box>
  </ClickAwayListener>;
}
