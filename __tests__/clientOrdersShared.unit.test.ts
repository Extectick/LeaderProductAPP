import {
  buildNewItem,
  buildCopyPayload,
  buildPayload,
  canComputeDraftProfit,
  canComputeLineProfit,
  computeDraftMetrics,
  computeDraftWeight,
  computeLineProfit,
  computeLineTotal,
  estimateClientOrdersDocumentBottomBarHeight,
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
  normalizeClientOrderDeliveryMethod,
  normalizeClientOrderPaymentForm,
  normalizePriceInput,
  normalizeQuantityInput,
  orderToDraft,
  resolveClientOrdersDocumentBottomBarLayout,
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
    invoiceRequested: false,
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

describe('clientOrdersShared document bottom bar layout', () => {
  it('keeps a two-column inline summary on Realme C53-sized logical widths', () => {
    expect(resolveClientOrdersDocumentBottomBarLayout(360, 1)).toBe('compact');
    expect(resolveClientOrdersDocumentBottomBarLayout(389, 1)).toBe('compact');
    expect(resolveClientOrdersDocumentBottomBarLayout(390, 1)).toBe('regular');
  });

  it('stacks controls only for very narrow windows or accessibility font scaling', () => {
    expect(resolveClientOrdersDocumentBottomBarLayout(339, 1)).toBe('stacked');
    expect(resolveClientOrdersDocumentBottomBarLayout(360, 1.3)).toBe('stacked');
    expect(resolveClientOrdersDocumentBottomBarLayout(Number.NaN, 1)).toBe('stacked');
  });

  it('includes the Android navigation inset in the initial scroll reserve', () => {
    expect(estimateClientOrdersDocumentBottomBarHeight({
      layout: 'compact',
      safeBottom: 48,
      fontScale: 1,
    })).toBe(138);
    expect(estimateClientOrdersDocumentBottomBarHeight({
      layout: 'stacked',
      safeBottom: 48,
      fontScale: 1.3,
    })).toBeGreaterThan(138);
  });

  it('shows debt instead of shipment status only while the 1C document is not posted', () => {
    expect(getOrderDisplayStatusLabelWithQueue({
      status: 'SENT_TO_1C',
      syncState: 'ERROR',
      origin: 'device',
      currentState1c: 'К отгрузке',
      shipmentProhibited: true,
      isPostedIn1c: false,
    } as any)).toBe('Долг');

    expect(getOrderDisplayStatusLabel({
      status: 'CONFIRMED',
      currentState1c: 'Закрыт',
      shipmentProhibited: true,
      isPostedIn1c: true,
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

  it('computes order weight from selected package weight or base unit fallback', () => {
    const withPackageWeight = item({
      quantity: '3',
      packageGuid: 'box-10',
      productWeight: 1,
      packages: [{ guid: 'box-10', name: 'box', multiplier: 10, weight: 10 }],
    });
    const withFallbackWeight = item({
      key: 'line-2',
      quantity: '2',
      packageGuid: 'box-10',
      productWeight: 1.2,
      packages: [{ guid: 'box-10', name: 'box', multiplier: 10 }],
    });

    expect(computeDraftWeight(draft({ items: [withPackageWeight] }))).toBe(30);
    expect(computeDraftWeight(draft({ items: [withFallbackWeight] }))).toBe(24);
  });

  it('hides 1/1 packages when unit guid differs but unit label matches the base unit', () => {
    const product = {
      guid: 'product-guid',
      name: 'Piece product',
      baseUnit: { guid: 'base-pcs-unit', name: 'Штука', symbol: 'шт' },
      packages: [
        { guid: 'pce-pack', name: 'PCE', multiplier: 1, unit: { guid: 'package-pce-unit', name: 'PCE', symbol: 'PCE' } },
        { guid: 'box-12', name: 'Box 12', multiplier: 12, unit: { guid: 'base-pcs-unit', name: 'Штука', symbol: 'шт' } },
      ],
    };

    expect(getDraftPackagesForProduct(product as any).map((pack) => pack.guid)).toEqual(['box-12']);
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
            weight: 1.2,
            weightUnit: { guid: 'kg', name: 'kg', symbol: 'kg' },
          },
          quantity: 2,
          basePrice: 100,
          receiptPrice: 80,
          manualPrice: null,
          package: {
            guid: 'box-10',
            name: 'кор (10 кг)',
            multiplier: 10,
            weight: 12,
            weightUnit: { guid: 'kg', name: 'kg', symbol: 'kg' },
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
      receiptPrice: 80,
      productWeight: 1.2,
    });
    expect(orderDraft.items[0].packages).toEqual([
      expect.objectContaining({ guid: 'box-10', multiplier: 10, weight: 12 }),
    ]);
    expect(computeLineTotal(orderDraft.items[0])).toBe(2000);
    expect(computeLineProfit(orderDraft.items[0])).toBe(400);
    expect(computeDraftWeight(orderDraft)).toBe(24);

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

  it('does not substitute the sale price when a reopened order has no receipt price', () => {
    const orderDraft = orderToDraft({
      guid: 'order-guid',
      revision: 1,
      organization: { guid: 'organization-guid', name: 'Организация' },
      counterparty: { guid: 'counterparty-guid', name: 'Контрагент' },
      currency: 'RUB',
      items: [{
        product: { guid: 'product-guid', name: 'Товар' },
        quantity: 1,
        basePrice: 100,
      }],
    } as any);

    expect(orderDraft.items[0].basePrice).toBe(100);
    expect(orderDraft.items[0].receiptPrice).toBeNull();
  });

  it('builds a structural copy payload even when price and package are invalid', () => {
    const source = draft({
      items: [item({
        packageGuid: 'missing-package',
        basePrice: null,
        stock: { available: 0 },
      })],
    });

    expect(validateDraft(source).canSave).toBe(false);
    expect(() => buildCopyPayload(source)).not.toThrow();
    expect(buildCopyPayload(source).items[0]).toMatchObject({
      packageGuid: 'missing-package',
      basePrice: undefined,
    });
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
      invoiceRequested: true,
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
      invoiceRequested: true,
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

  it('computes document metrics in one aggregate pass', () => {
    expect(computeDraftMetrics(draft({
      generalDiscountPercent: '10',
      items: [item({ quantity: '2', packageGuid: 'box-10', basePrice: 100, receiptPrice: 80 })],
    }))).toEqual({ total: 1800, profit: 200, weight: 0, activeItems: 1, profitAvailable: true });
  });

  it('preserves item references when normalizing a header-only change', () => {
    const previous = draft({ items: [item(), item({ key: 'line-2', lineGuid: 'line-guid-2' })] });
    const next = normalizeDraftOrder({ ...previous, comment: 'updated' }, previous);

    expect(next.items).toBe(previous.items);
    expect(next.items[0]).toBe(previous.items[0]);
    expect(next.items[1]).toBe(previous.items[1]);
  });

  it('returns the same draft when normalization makes no change', () => {
    const previous = draft();
    expect(normalizeDraftOrder(previous, previous)).toBe(previous);
  });

  it('reuses unchanged lines when one item is patched', () => {
    const previous = draft({ items: [item(), item({ key: 'line-2', lineGuid: 'line-guid-2' })] });
    const next = normalizeDraftOrder({
      ...previous,
      items: previous.items.map((line) => line.key === 'line-1' ? { ...line, quantity: '3' } : line),
    }, previous);

    expect(next.items).not.toBe(previous.items);
    expect(next.items[0]).not.toBe(previous.items[0]);
    expect(next.items[1]).toBe(previous.items[1]);
  });

  it('maps read-only 1C payment and delivery values to application choices', () => {
    expect(normalizeClientOrderPaymentForm('Безналичная')).toBeNull();
    expect(normalizeClientOrderPaymentForm('Наличная')).toBe('Наличная');
    expect(normalizeClientOrderDeliveryMethod('СиламиПеревозчика')).toBe('ДоКлиента');
    expect(normalizeClientOrderDeliveryMethod('Силами перевозчика по адресу')).toBe('ДоКлиента');
    expect(normalizeClientOrderDeliveryMethod('Самовывоз')).toBe('Самовывоз');

    expect(normalizeDraftOrder(draft({
      paymentForm: 'Безналичная',
      deliveryMethod: 'СиламиПеревозчика',
    }))).toMatchObject({
      paymentForm: null,
      deliveryMethod: 'ДоКлиента',
    });
  });

  it('does not expose line profit until receipt price is known', () => {
    expect(canComputeLineProfit(item({ receiptPrice: null }))).toBe(false);
    expect(canComputeLineProfit(item({ receiptPrice: 0 }))).toBe(false);
    expect(canComputeLineProfit(item({ receiptPrice: 80 }))).toBe(true);
  });

  it('exposes document profit only when every active line has a receipt price', () => {
    const priced = item({ receiptPrice: 80 });
    const pending = item({ key: 'line-2', lineGuid: 'line-guid-2', receiptPrice: null });
    const cancelled = item({
      key: 'line-3',
      lineGuid: 'line-guid-3',
      receiptPrice: null,
      isCancelled: true,
    });

    expect(canComputeDraftProfit(draft({ items: [priced, pending] }))).toBe(false);
    expect(canComputeDraftProfit(draft({ items: [priced, cancelled] }))).toBe(true);
    expect(canComputeDraftProfit(draft({ items: [cancelled] }))).toBe(false);
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
