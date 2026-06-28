import {
  buildNewItem,
  buildPayload,
  computeLineTotal,
  displayedUnitPriceToBasePriceInput,
  getBelowCostWarning,
  getDisplayedReceiptPriceValue,
  getDisplayedUnitPriceValue,
  getDraftPackagesForProduct,
  getOrderDisplayStatusLabel,
  getOrderDisplayStatusLabelWithQueue,
  mapOnecOrderStatus,
  normalizeDraftOrder,
  normalizePriceInput,
  normalizeQuantityInput,
  validateDraft,
  type DraftItem,
  type DraftOrder,
} from '../src/features/clientOrders/clientOrdersShared';

function item(patch: Partial<DraftItem> = {}): DraftItem {
  return {
    key: 'line-1',
    productGuid: 'product-guid',
    productName: 'Товар',
    quantity: '2',
    packageGuid: null,
    manualPrice: '',
    discountPercent: '',
    comment: '',
    basePrice: 100,
    receiptPrice: 80,
    currency: 'RUB',
    baseUnit: { guid: 'kg', name: 'Килограмм', symbol: 'кг' },
    packages: [
      {
        guid: 'box-10',
        name: 'кор (10 кг)',
        multiplier: 10,
        unit: { guid: 'kg', name: 'Килограмм', symbol: 'кг' },
      },
    ],
    ...patch,
  };
}

function draft(patch: Partial<DraftOrder> = {}): DraftOrder {
  return normalizeDraftOrder({
    revision: 1,
    organizationGuid: 'organization-guid',
    counterpartyGuid: 'counterparty-guid',
    agreementGuid: 'agreement-guid',
    contractGuid: 'contract-guid',
    warehouseGuid: 'warehouse-guid',
    deliveryAddressGuid: 'delivery-address-guid',
    deliveryDate: '2026-06-28T00:00:00.000Z',
    comment: '',
    currency: 'RUB',
    priceTypeGuid: 'price-type-guid',
    priceTypeName: 'Прайс',
    generalDiscountPercent: '',
    items: [item()],
    ...patch,
  });
}

describe('clientOrdersShared statuses', () => {
  it('maps 1C current state before legacy app status', () => {
    expect(mapOnecOrderStatus('В процессе отгрузки')).toBe('SHIPPING_IN_PROGRESS');
    expect(mapOnecOrderStatus('Закрыт')).toBe('CLOSED');
    expect(mapOnecOrderStatus('К отгрузке')).toBe('TO_SHIP');

    expect(getOrderDisplayStatusLabel({
      status: 'CONFIRMED',
      number1c: 'НОУТ-070624',
      origin: 'onec',
      currentState1c: 'Закрыт',
      status1c: null,
      documentStatus1c: 'К отгрузке',
    } as any)).toBe('Закрыт');
  });

  it('shows queue position only for queued orders', () => {
    expect(getOrderDisplayStatusLabelWithQueue({
      status: 'QUEUED',
      syncState: 'QUEUED',
      queuePosition: 3,
    } as any)).toBe('В очереди: 3');

    expect(getOrderDisplayStatusLabelWithQueue({
      status: 'CLOSED',
      syncState: 'SYNCED',
      queuePosition: 3,
      currentState1c: 'Закрыт',
      number1c: 'НОУТ-1',
      origin: 'onec',
    } as any)).toBe('Закрыт');
  });
});

describe('clientOrdersShared item inputs and packages', () => {
  it('normalizes decimal quantity input for weight goods and rejects decimals for piece goods', () => {
    expect(normalizeQuantityInput(item(), '1.25')).toBe('1,25');
    expect(normalizeQuantityInput(item({ quantity: '3', baseUnit: { guid: 'pcs', name: 'Штука', symbol: 'шт' } }), '1.25')).toBe('3');
  });

  it('normalizes price input shape without changing comma separator', () => {
    expect(normalizePriceInput('123,45')).toBe('123,45');
    expect(normalizePriceInput('123.45')).toBe('123.45');
    expect(normalizePriceInput('123,456', '12')).toBe('12');
  });

  it('does not show base-unit package as extra package and keeps default package empty for base-unit products', () => {
    const product = {
      guid: 'product-guid',
      name: 'Филе',
      basePrice: 402,
      receiptPrice: 346.01,
      baseUnit: { guid: 'kg', name: 'Килограмм', symbol: 'кг' },
      packages: [
        { guid: 'kg-pack', name: 'КГ', multiplier: 1, unit: { guid: 'kg', name: 'Килограмм', symbol: 'кг' } },
        { guid: 'box-10', name: 'кор (10 кг)', multiplier: 10, unit: { guid: 'kg', name: 'Килограмм', symbol: 'кг' } },
      ],
    };

    expect(getDraftPackagesForProduct(product as any).map((pack) => pack.guid)).toEqual(['box-10']);
    const newItem = buildNewItem(product as any);
    expect(newItem.packageGuid).toBeNull();
    expect(newItem.basePrice).toBe(402);
    expect(newItem.receiptPrice).toBe(346.01);
  });

  it('displays price and receipt price in selected package and converts displayed price back to base price', () => {
    const packed = item({ packageGuid: 'box-10', basePrice: 100, receiptPrice: 80 });

    expect(getDisplayedUnitPriceValue(packed)).toBe('1000');
    expect(getDisplayedReceiptPriceValue(packed)).toBe('800');
    expect(displayedUnitPriceToBasePriceInput('1200', packed)).toBe('120');
  });
});

describe('clientOrdersShared validation and payload', () => {
  it('blocks submit for zero quantity and zero price but allows saving draft', () => {
    const result = validateDraft(draft({ items: [item({ quantity: '0', basePrice: 0 })] }));

    expect(result.canSave).toBe(true);
    expect(result.canSubmit).toBe(false);
    expect(result.blockingMessage).toBe('Исправьте ошибки в строках заказа.');
    expect(result.itemMessages['line-1']).toEqual([
      'Количество должно быть больше 0.',
      'Цена должна быть больше 0.',
    ]);
  });

  it('blocks save and submit when selected package is missing', () => {
    const result = validateDraft(draft({ items: [item({ packageGuid: 'missing-package' })] }));

    expect(result.canSave).toBe(false);
    expect(result.canAutosave).toBe(false);
    expect(result.canSubmit).toBe(false);
    expect(result.blockingMessage).toBe('Исправьте строки с недоступной упаковкой.');
  });

  it('allows below-cost lines but returns warning that must be confirmed by UI', () => {
    const belowCostItem = item({ manualPrice: '70', receiptPrice: 80 });
    const result = validateDraft(draft({ items: [belowCostItem] }));

    expect(result.canSave).toBe(true);
    expect(result.canSubmit).toBe(true);
    expect(result.warningMessage).toBe('Есть товары с ценой ниже себестоимости.');
    expect(getBelowCostWarning(belowCostItem)).toBe('Цена ниже себестоимости: 70 ₽ < 80 ₽.');
  });

  it('builds API payload with normalized quantity and manual price semantics', () => {
    const payload = buildPayload(draft({
      generalDiscountPercent: '5',
      items: [
        item({
          quantity: '2,5',
          packageGuid: 'box-10',
          manualPrice: '120,50',
          discountPercent: '3',
          comment: 'строка',
          priceTypeGuid: 'price-type-guid',
        }),
      ],
    }));

    expect(payload).toMatchObject({
      organizationGuid: 'organization-guid',
      counterpartyGuid: 'counterparty-guid',
      currency: 'RUB',
      generalDiscountPercent: 5,
      items: [
        {
          productGuid: 'product-guid',
          packageGuid: 'box-10',
          quantity: 2.5,
          manualPrice: 120.5,
          discountPercent: 3,
          comment: 'строка',
        },
      ],
    });
    expect(payload.items[0].priceTypeGuid).toBeUndefined();
  });

  it('computes totals using package multiplier and discount', () => {
    expect(computeLineTotal(item({ quantity: '2', packageGuid: 'box-10', basePrice: 100 }), '10')).toBe(1800);
  });
});
