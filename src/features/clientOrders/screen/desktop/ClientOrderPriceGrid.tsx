import React from 'react';
import {Alert, Box, Button, CircularProgress, Stack, TextField, Typography} from '@mui/material';
import type {ClientOrderProduct} from '@/utils/clientOrdersService';
import {WebProductImage, PRODUCT_IMAGE_PLACEHOLDER_URI} from '../../components/ProductImageGalleryDialog';
import {useCustomerPurchaseHistory} from '../../hooks/useCustomerPurchaseHistory';
import {buildNewItem, computeLineTotal, formatMoney, getDisplayedUnitPriceValue, isCancelledDraftItem, type DraftItem} from '../../lib/clientOrdersShared';
import {formatStockLabel, getPackageDisplayText, stockAvailableValue} from '../../lib/clientOrdersUi';
import {quickProductScopeKey} from './clientOrderQuickProductsModel';
import {priceGridQuantity} from './clientOrderPriceGridModel';

type Row = {guid: string; product?: ClientOrderProduct; line: DraftItem};
type Page = {key: string; products: ClientOrderProduct[]; offset: number; more: boolean};

function Quantity({row, disabled, onValue, move}: {row: Row; disabled: boolean; onValue: (value: string, final: boolean) => string | null; move: (direction: number) => void}) {
  const [value, setValue] = React.useState(row.line.quantity || '0');
  const [error, setError] = React.useState<string | null>(null);
  const focused = React.useRef(false);
  React.useEffect(() => {if (!focused.current) {setValue(row.line.quantity || '0'); setError(null);}}, [row.line.quantity]);
  return <TextField size="small" value={value} disabled={disabled || isCancelledDraftItem(row.line)} error={!!error}
    helperText={error} onFocus={event => {focused.current = true; event.target.select();}}
    onChange={event => {const next = event.target.value.replace('.', ','); setValue(next); setError(null); onValue(next, false);}}
    onBlur={() => {focused.current = false; setError(onValue(value, true));}}
    onKeyDown={event => {
      if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
      if (['Enter', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault(); const problem = onValue(value, true); setError(problem);
        if (!problem) move(event.key === 'ArrowUp' ? -1 : 1);
      }
      if (event.key === 'Escape') {event.preventDefault(); setValue(row.line.quantity || '0'); setError(null);}
    }}
    slotProps={{htmlInput: {'aria-label': `В заказе: ${row.line.productName}`, 'data-price-quantity': row.guid, inputMode: 'decimal'}, input: {sx: {borderRadius: 1, height: 38}}}}
    sx={{width: 110, '& input': {textAlign: 'right', py: 1}, '& fieldset': {borderColor: 'var(--co-line)'}}} />;
}

/** One price list for searching and editing the order; business state stays in the workspace. */
export function ClientOrderPriceGrid({workspace}: {workspace: any}) {
  const [query, setQuery] = React.useState('');
  const [inStock, setInStock] = React.useState(false);
  const [purchased, setPurchased] = React.useState(false);
  const [ordered, setOrdered] = React.useState(false);
  const [page, setPage] = React.useState<Page | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [retry, setRetry] = React.useState(0);
  const request = React.useRef(0);
  const root = React.useRef<HTMLDivElement | null>(null);
  const latest = React.useRef(workspace); latest.current = workspace;
  const scope = quickProductScopeKey(workspace);
  const hasContext = !!workspace.draft.organizationGuid && !!workspace.draft.counterpartyGuid;
  const disabled = !!(workspace.readOnly || workspace.mutationLocked || workspace.loadingDefaults || workspace.loadingDetail);
  const history = useCustomerPurchaseHistory({userId: workspace.offlineUserId, organizationGuid: workspace.draft.organizationGuid,
    counterpartyGuid: workspace.draft.counterpartyGuid, enabled: hasContext, online: workspace.online});
  const historyRevision = purchased ? history.snapshot?.fetchedAt || '' : '';
  const key = JSON.stringify([scope, query.trim(), inStock, purchased, historyRevision, ordered]);
  const currentKey = React.useRef(key); currentKey.current = key;
  const currentScope = React.useRef(scope); currentScope.current = scope;
  React.useEffect(() => {setQuery(''); setPage(null);}, [scope]);

  const load = React.useCallback(async (offset: number) => {
    if (!hasContext || workspace.mutationLocked || workspace.loadingDefaults || workspace.loadingDetail || ordered || (purchased && !history.ready)) return;
    const id = ++request.current; setLoading(true); setError(false);
    const w = latest.current, d = w.draft;
    try {
      const result = await w.searchProducts({search: query.trim(), organizationGuid: d.organizationGuid, counterpartyGuid: d.counterpartyGuid,
        agreementGuid: d.agreementGuid || undefined, warehouseGuid: d.warehouseGuid || undefined, priceTypeGuid: d.priceTypeGuid || undefined,
        inStockOnly: inStock, purchasedOnly: purchased, historyUserId: w.offlineUserId, historyFetchedAt: historyRevision || undefined,
        limit: 50, offset});
      if (id !== request.current || key !== currentKey.current) return;
      const products: ClientOrderProduct[] = result?.items || [];
      setPage(previous => ({key, products: [...new Map([...(offset && previous?.key === key ? previous.products : []), ...products].map(p => [p.guid.toLowerCase(), p])).values()],
        offset: offset + products.length, more: typeof result?.meta?.total === 'number' ? offset + products.length < result.meta.total : products.length === 50}));
    } catch {if (id === request.current && key === currentKey.current) setError(true);}
    finally {if (id === request.current && key === currentKey.current) setLoading(false);}
  }, [key, hasContext, workspace.mutationLocked, workspace.loadingDefaults, workspace.loadingDetail, ordered, purchased, history.ready, query, inStock, historyRevision]);
  React.useEffect(() => {
    request.current++; setPage(null); setLoading(false); setError(false);
    const timer = setTimeout(() => void load(0), 180);
    return () => {clearTimeout(timer); request.current++;};
  }, [load, retry]);

  const lines: DraftItem[] = workspace.draft.items;
  const byGuid = new Map(lines.map(line => [line.productGuid.toLowerCase(), line]));
  const rows: Row[] = ordered ? lines.filter(line => !isCancelledDraftItem(line)
    && `${line.productName} ${line.productCode || ''} ${line.productArticle || ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
    && (!inStock || (stockAvailableValue(line.stock) || 0) > 0)
    && (!purchased || history.dates.has(line.productGuid.toLowerCase())))
    .map(line => ({guid: line.productGuid, line}))
    : (page?.key === key ? page.products : []).map(product => ({guid: product.guid, product, line: byGuid.get(product.guid.toLowerCase()) || {...buildNewItem(product), quantity: '0'}}));

  const change = (row: Row, value: string, final: boolean): string | null => {
    const w = latest.current;
    if (disabled || w.readOnly || w.mutationLocked || w.loadingDefaults || w.loadingDetail || scope !== quickProductScopeKey(w)
      || key !== currentKey.current) return null;
    const line = w.draft.items.find((item: DraftItem) => item.productGuid.toLowerCase() === row.guid.toLowerCase());
    const result = priceGridQuantity(row.product, line, value);
    if (result.kind === 'error') return final ? result.message : null;
    if (result.kind === 'remove') {if (final && result.key) w.removeItem(result.key);}
    else if (result.kind === 'set') {if (line.quantity !== result.quantity) w.setItemPatch(result.key, {quantity: result.quantity});}
    else w.addProduct(row.product, {quantity: result.quantity});
    return null;
  };
  const move = (guid: string, direction: number) => {
    const index = rows.findIndex(row => row.guid === guid);
    const nextGuid = rows[index + direction]?.guid;
    requestAnimationFrame(() => {
      if (scope !== currentScope.current) return;
      const inputs = [...root.current?.querySelectorAll<HTMLInputElement>('input[data-price-quantity]') || []];
      const next = inputs.find(input => input.dataset.priceQuantity === nextGuid) || inputs[Math.min(Math.max(index, 0), inputs.length - 1)];
      next?.focus(); next?.select();
    });
  };
  return <Box ref={root} sx={{display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0}}>
    <Stack direction="row" useFlexGap spacing={1} sx={{px: 2, py: 1, alignItems: 'center', flexWrap: 'wrap'}}>
      <TextField size="small" placeholder="Название или артикул" value={query} onChange={event => setQuery(event.target.value)}
        disabled={!hasContext || workspace.loadingDefaults} slotProps={{htmlInput: {'aria-label': 'Поиск в прайсе'}}}
        sx={{flex: '1 1 240px', minWidth: 180, '& fieldset': {border: 0}, '& .MuiInputBase-root': {bgcolor: 'var(--co-panel)', borderRadius: 6}}} />
      {[{text: 'Клиент уже брал', value: purchased, set: setPurchased}, {text: 'В наличии', value: inStock, set: setInStock}, {text: 'В заказе', value: ordered, set: setOrdered}].map(filter =>
        <Button key={filter.text} aria-pressed={filter.value} onClick={() => filter.set(value => !value)} disabled={!hasContext}
          sx={{color: filter.value ? 'var(--co-accent)' : 'var(--co-muted)', bgcolor: filter.value ? 'var(--co-soft)' : 'transparent', whiteSpace: 'nowrap'}}>{filter.text}</Button>)}
    </Stack>
    {purchased && !history.ready ? <Stack direction="row" spacing={1} sx={{px: 2, py: 1, alignItems: 'center'}}>
      <Typography sx={{fontSize: 13, color: 'var(--co-muted)'}}>{history.loading ? 'Загрузка истории покупок…' : 'История покупок недоступна'}</Typography>
      {!history.loading ? <Button onClick={history.refresh}>Повторить</Button> : null}</Stack> : null}
    {error ? <Alert severity="warning" action={<Button onClick={() => setRetry(value => value + 1)}>Повторить</Button>}>Не удалось загрузить прайс</Alert> : null}
    <Box sx={{flex: 1, minHeight: 0, overflow: 'auto', px: 2}}>
      <Box component="table" sx={{width: '100%', minWidth: 620, borderCollapse: 'collapse', '& th': {position: 'sticky', top: 0, zIndex: 1, bgcolor: 'var(--co-surface)', color: 'var(--co-muted)', fontWeight: 500, fontSize: 12, textAlign: 'left', py: 1}, '& td': {py: 1, borderTop: '1px solid var(--co-line)', verticalAlign: 'middle', fontSize: 14}}}>
        <thead><tr><th>Товар</th><th>Ед.</th><th>Остаток</th><th>Цена</th><th>В заказе</th><th style={{textAlign: 'right'}}>Сумма</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.guid}>
          <td><Stack direction="row" spacing={1.25} sx={{alignItems: 'center', pr: 2}}>
            <WebProductImage src={row.line.imageThumbUrl || PRODUCT_IMAGE_PLACEHOLDER_URI} alt="" sx={{width: 38, height: 42, flexShrink: 0, borderRadius: 1}} />
            <Box><Typography sx={{fontSize: 14, fontWeight: 600}}>{row.line.productName}</Typography><Typography sx={{fontSize: 12, color: 'var(--co-muted)'}}>{row.line.productCode}</Typography></Box>
          </Stack></td>
          <td style={{paddingRight: 12}}>{getPackageDisplayText(row.line)}</td>
          <td style={{paddingRight: 12, color: 'var(--co-muted)'}}>{formatStockLabel(row.line.stock, row.line.baseUnit) || '—'}</td>
          <td style={{paddingRight: 12, whiteSpace: 'nowrap'}}>{formatMoney(Number(getDisplayedUnitPriceValue(row.line).replace(',', '.')), row.line.currency)}</td>
          <td style={{paddingRight: 12}}><Quantity key={`${scope}:${row.guid}`} row={row} disabled={disabled} onValue={(value, final) => change(row, value, final)} move={direction => move(row.guid, direction)} /></td>
          <td style={{textAlign: 'right', whiteSpace: 'nowrap'}}>{formatMoney(computeLineTotal(row.line, workspace.draft.generalDiscountPercent), row.line.currency)}</td>
        </tr>)}</tbody>
      </Box>
      {loading ? <Box sx={{display: 'flex', justifyContent: 'center', p: 2}}><CircularProgress size={20} /></Box> : null}
      {!loading && !error && !rows.length && hasContext && (!purchased || history.ready) ? <Typography sx={{py: 3, color: 'var(--co-muted)', fontSize: 14}}>{ordered ? 'В заказе нет позиций' : 'Товары не найдены'}</Typography> : null}
      {!ordered && page?.key === key && page.more ? <Button disabled={loading} onClick={() => void load(page.offset)} sx={{my: 1}}>Ещё товары</Button> : null}
    </Box>
  </Box>;
}
