import {
  buildNewItem,
  buildPayload,
  computeLineTotal,
  displayedUnitPriceToBasePriceInput,
  getBelowCostWarning,
  getDisplayedReceiptPriceValue,
  getDisplayedUnitPriceValue,
  getDraftPackagesForProduct,
  mergeDraftPackagesForProduct,
  getOrderDisplayStatusLabel,
  getOrderDisplayStatusLabelWithQueue,
  getStockShortageMessage,
  mapOnecOrderStatus,
  normalizeDraftOrder,
  normalizePriceInput,
  normalizeQuantityInput,
  orderToDraft,
  validateDraft,
  type DraftItem,
  type DraftOrder,
} from '../src/features/clientOrders/clientOrdersShared';

function item(patch: Partial<DraftItem> = {}): DraftItem {
  return {
    key: 'line-1',
    lineGuid: 'line-guid-1',
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

  it('keeps selected package when converting an API order to draft and payload', () => {
    const orderDraft = orderToDraft({
      guid: 'order-guid',
      revision: 7,
      organization: { guid: 'organization-guid', name: 'Организация' },
      counterparty: { guid: 'counterparty-guid', name: 'Контрагент' },
      deliveryDate: '2026-06-28T00:00:00.000Z',
      currency: 'RUB',
      priceType: { guid: 'price-type-guid', name: 'Прайс' },
      items: [
        {
          lineGuid: 'line-guid-1',
          product: {
            guid: 'product-guid',
            name: 'Товар',
            code: 'UT-1',
          },
          quantity: 2,
          basePrice: 100,
          manualPrice: null,
          package: {
            guid: 'box-10',
            name: 'кор (10 кг)',
            multiplier: 10,
            isDefault: false,
          },
          unit: { guid: 'kg', name: 'Килограмм', symbol: 'кг' },
        },
      ],
    } as any);

    expect(orderDraft.items[0]).toMatchObject({
      lineGuid: 'line-guid-1',
      packageGuid: 'box-10',
      basePrice: 100,
    });
    expect(orderDraft.items[0].packages).toEqual([
      expect.objectContaining({ guid: 'box-10', multiplier: 10 }),
    ]);
    expect(computeLineTotal(orderDraft.items[0])).toBe(2000);

    const payload = buildPayload(orderDraft);
    expect(payload.items[0]).toMatchObject({
      lineGuid: 'line-guid-1',
      productGuid: 'product-guid',
      packageGuid: 'box-10',
      quantity: 2,
      basePrice: 100,
    });
  });

  it('does not treat selected 1C package unit as product base unit', () => {
    const orderDraft = orderToDraft({
      guid: 'order-guid',
      revision: 1,
      organization: { guid: 'organization-guid', name: 'Организация' },
      counterparty: { guid: 'counterparty-guid', name: 'Контрагент' },
      currency: 'RUB',
      items: [
        {
          lineGuid: 'line-guid-1',
          product: { guid: 'milk-guid', name: 'Молоко' },
          quantity: 4,
          basePrice: 125,
          package: {
            guid: 'box-12',
            name: 'кор (12 шт)',
            multiplier: 12,
          },
          unit: { guid: 'box-unit', name: 'Коробка', symbol: 'кор' },
        },
      ],
    } as any);

    expect(orderDraft.items[0].packageGuid).toBe('box-12');
    expect(orderDraft.items[0].baseUnit).toBeNull();
    expect(orderDraft.items[0].packagesLoaded).toBe(false);
    expect(orderDraft.items[0].packages).toEqual([
      expect.objectContaining({ guid: 'box-12', multiplier: 12 }),
    ]);
  });

  it('treats base unit package from API as no selected package', () => {
    const orderDraft = orderToDraft({
      guid: 'order-guid',
      revision: 1,
      organization: { guid: 'organization-guid', name: 'Организация' },
      counterparty: { guid: 'counterparty-guid', name: 'Контрагент' },
      currency: 'RUB',
      priceType: { guid: 'price-type-guid', name: 'Прайс' },
      items: [
        {
          lineGuid: 'line-guid-1',
          product: {
            guid: 'product-guid',
            name: 'Товар',
          },
          quantity: 3,
          basePrice: 125,
          package: {
            guid: 'base-package-guid',
            name: 'шт',
            multiplier: 1,
          },
          unit: { guid: 'base-package-guid', name: 'шт', symbol: 'шт' },
        },
      ],
    } as any);

    expect(orderDraft.items[0]).toMatchObject({
      packageGuid: null,
      quantity: '3',
      basePrice: 125,
    });
    expect(orderDraft.items[0].packages).toEqual([]);
    expect(buildPayload(orderDraft).items[0].packageGuid).toBeUndefined();
  });

  it('keeps selected 1C package when product metadata is merged', () => {
    const selectedFromDocument = {
      guid: 'box-10',
      name: 'кор (10 кг)',
      multiplier: 10,
      unit: { guid: 'kg', name: 'Килограмм', symbol: 'кг' },
    };
    const packages = mergeDraftPackagesForProduct(
      {
        baseUnit: { guid: 'kg', name: 'Килограмм', symbol: 'кг' },
        packages: [
          { guid: 'pack-2', name: 'пак (2 кг)', multiplier: 2, unit: { guid: 'kg', name: 'Килограмм', symbol: 'кг' } },
        ],
      } as any,
      [selectedFromDocument]
    );

    expect(packages.map((pack) => pack.guid)).toEqual(['pack-2', 'box-10']);
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

  it('allows saving draft but blocks submit without delivery date', () => {
    const result = validateDraft(draft({ deliveryDate: null }));

    expect(result.canSave).toBe(true);
    expect(result.canAutosave).toBe(true);
    expect(result.canSubmit).toBe(false);
    expect(result.blockingMessage).toBe('Заполните дату отгрузки.');
  });

  it('blocks submit without delivery address and delivery date before export', () => {
    const result = validateDraft(draft({ deliveryAddressGuid: '', deliveryDate: null }));

    expect(result.canSave).toBe(true);
    expect(result.canSubmit).toBe(false);
    expect(result.blockingMessage).toBe('Заполните адрес доставки, дату отгрузки.');
  });

  it('allows below-cost lines but returns warning that must be confirmed by UI', () => {
    const belowCostItem = item({ manualPrice: '70', receiptPrice: 80 });
    const result = validateDraft(draft({ items: [belowCostItem] }));

    expect(result.canSave).toBe(true);
    expect(result.canSubmit).toBe(true);
    expect(result.warningMessage).toBe('Есть товары с ценой ниже себестоимости.');
    expect(getBelowCostWarning(belowCostItem)).toBe('Цена ниже себестоимости: 70 ₽ < 80 ₽.');
  });

  it('blocks submit and shows line error when stock is insufficient', () => {
    const shortageItem = item({
      quantity: '4',
      packageGuid: 'box-10',
      stock: { available: 7 },
    });
    const result = validateDraft(draft({ items: [shortageItem] }));

    expect(result.canSave).toBe(true);
    expect(result.canAutosave).toBe(true);
    expect(result.canSubmit).toBe(false);
    expect(getStockShortageMessage(shortageItem)).toBe('Недостаточно остатка: требуется 40, доступно 7.');
    expect(result.itemMessages['line-1']).toContain('Недостаточно остатка: требуется 40, доступно 7.');
  });

  it('builds API payload with normalized quantity and manual price semantics', () => {
    const payload = buildPayload(draft({
      generalDiscountPercent: '5',
      paymentForm: 'Наличная',
      deliveryMethod: 'Самовывоз',
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
      priceTypeGuid: 'price-type-guid',
      paymentForm: 'Наличная',
      deliveryMethod: 'Самовывоз',
      currency: 'RUB',
      generalDiscountPercent: 5,
      items: [
        {
          lineGuid: 'line-guid-1',
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

  it('does not count cancelled lines as active editable order lines', () => {
    const cancelled = item({
      quantity: '0',
      basePrice: 0,
      isCancelled: true,
      cancelReason: 'Нет остатка',
      cancelledAmount: 500,
    });
    const active = item({ key: 'line-2', lineGuid: 'line-guid-2', quantity: '1', basePrice: 150 });
    const result = validateDraft(draft({ items: [cancelled, active] }));

    expect(computeLineTotal(cancelled)).toBe(0);
    expect(result.canSave).toBe(true);
    expect(result.canSubmit).toBe(true);
    expect(result.itemMessages['line-1']).toBeUndefined();
  });

  it('keeps cancelled line metadata in API payload', () => {
    const payload = buildPayload(draft({
      items: [
        item({
          isCancelled: true,
          cancelReasonGuid: 'reason-guid',
          cancelReasonName: 'Нет остатка',
          cancelReason: 'Нет остатка',
          cancelledAmount: 500,
        }),
        item({ key: 'line-2', lineGuid: 'line-guid-2' }),
      ],
    }));

    expect(payload.items[0]).toMatchObject({
      lineGuid: 'line-guid-1',
      isCancelled: true,
      cancelReasonGuid: 'reason-guid',
      cancelReasonName: 'Нет остатка',
      cancelReason: 'Нет остатка',
      cancelledAmount: 500,
    });
  });
});
