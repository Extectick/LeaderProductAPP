import React from 'react';
import {Skeleton, Typography} from '@mui/material';
import type {ClientOrderProduct} from '@/utils/clientOrdersService';
import {formatMoney} from '../../lib/clientOrdersShared';
import {formatStockLabel} from '../../lib/clientOrdersUi';
import {productMetricFreshness, productMetricPending} from '../../lib/productFreshness';

/** Metrics used by the active desktop catalog row, within its existing wrapping metadata line. */
export function WebProductPickerMetrics({item}: {item: ClientOrderProduct}) {
  const metrics = [
    {kind: 'price' as const, label: 'Цена продажи', value: formatMoney(item.basePrice, item.currency)},
    {kind: 'stock' as const, label: 'Остаток', value: formatStockLabel(item.stock, item.baseUnit) || '—'},
    {kind: 'cost' as const, label: 'Цена поступления', value: formatMoney(item.receiptPrice, item.currency)},
  ];
  return <>{metrics.map(metric => {
    const pending = productMetricPending(item, metric.kind);
    const presentation = productMetricFreshness(item, metric.kind, metric.label, metric.value);
    return <Typography key={metric.kind} component="span" title={pending ? `${metric.label}: загружается` : presentation.title}
      aria-label={pending ? `${metric.label}: загружается` : `${metric.label}: ${presentation.value}`} aria-busy={pending}
      sx={{fontSize: 12, color: 'var(--co-muted)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 0.4}}>
      {metric.label}: {pending ? <Skeleton component="span" width={56} height={16} /> : presentation.value}
    </Typography>;
  })}</>;
}
