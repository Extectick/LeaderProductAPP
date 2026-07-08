import {
  formatProductTransferLabel,
  formatStockInlineLabel,
  formatStockLabel,
  formatStockReserveLabel,
  getPickerItemMeta,
  isProductAlreadyInOrder,
  resolveProductPickerPressAction,
  toggleProductSelection,
  transferSelectedProductsToOrder,
} from '../src/features/clientOrders/lib/clientOrdersUi';
import {
  resolveStoredBooleanDefaultTrue,
  serializeStoredBoolean,
} from '../src/features/clientOrders/lib/clientOrdersPrefs';

describe('clientOrdersUi', () => {
  it('resolves saved picker flags with true as the missing-value default', () => {
    expect(resolveStoredBooleanDefaultTrue(null)).toBe(true);
    expect(resolveStoredBooleanDefaultTrue(undefined)).toBe(true);
    expect(resolveStoredBooleanDefaultTrue('1')).toBe(true);
    expect(resolveStoredBooleanDefaultTrue('0')).toBe(false);
    expect(serializeStoredBoolean(true)).toBe('1');
    expect(serializeStoredBoolean(false)).toBe('0');
  });

  it('shows organization and manager in agreement and contract picker metadata', () => {
    const item = {
      organization: { guid: 'org-guid', name: 'Организация' },
      managerGuid: 'manager-guid',
      managerName: 'Менеджер',
    };

    expect(getPickerItemMeta('agreement', item)).toBe('Организация: Организация • Менеджер: Менеджер');
    expect(getPickerItemMeta('contract', item)).toBe('Организация: Организация • Менеджер: Менеджер');
  });

  it('formats available stock and current manager reserve compactly', () => {
    const stock = { available: 100, freeAvailable: 80, myReserved: 20 };
    const unit = { symbol: 'шт' };

    expect(formatStockLabel(stock, unit)).toBe('100 шт (резерв 20 шт)');
    expect(formatStockReserveLabel(stock, unit)).toBe('резерв 20 шт');
    expect(formatStockInlineLabel(stock, unit)).toBe('100 шт (резерв 20 шт)');
  });

  it('hides non-positive manager reserve in stock labels', () => {
    const unit = { symbol: 'кг' };

    expect(formatStockReserveLabel({ available: 4, myReserved: 0 }, unit)).toBe('');
    expect(formatStockReserveLabel({ available: 4, myReserved: -3 }, unit)).toBe('');
    expect(formatStockInlineLabel({ available: 4, myReserved: -3 }, unit)).toBe('4 кг');
  });

  it('toggles product selection and ignores already added products', () => {
    const product = { guid: 'product-1', name: 'Товар 1' } as any;
    const orderItems = [{ productGuid: 'product-2' }];

    const selected = toggleProductSelection(new Map(), product, orderItems);
    expect(selected.has('product-1')).toBe(true);

    const unselected = toggleProductSelection(selected, product, orderItems);
    expect(unselected.has('product-1')).toBe(false);

    const blocked = toggleProductSelection(new Map(), { guid: 'product-2', name: 'Товар 2' } as any, orderItems);
    expect(blocked.size).toBe(0);
    expect(isProductAlreadyInOrder('product-2', orderItems)).toBe(true);
  });

  it('transfers selected products in selection order and skips duplicates', () => {
    const selection = new Map<string, any>([
      ['product-1', { guid: 'product-1', name: 'Товар 1' }],
      ['product-2', { guid: 'product-2', name: 'Товар 2' }],
      ['product-3', { guid: 'product-3', name: 'Товар 3' }],
    ]);
    const added: string[] = [];

    const keys = transferSelectedProductsToOrder(selection, [{ productGuid: 'product-2' }], (product) => {
      added.push(product.guid);
      return `line-${product.guid}`;
    });

    expect(added).toEqual(['product-1', 'product-3']);
    expect(keys).toEqual(['line-product-1', 'line-product-3']);
  });

  it('passes transfer options to added products', () => {
    const selection = new Map<string, any>([
      ['product-1', { guid: 'product-1', name: 'РўРѕРІР°СЂ 1' }],
    ]);
    const quantities: Array<string | number | undefined> = [];

    transferSelectedProductsToOrder(selection, [], (_product, options) => {
      quantities.push(options?.quantity);
      return 'line-product-1';
    }, { quantity: 0 });

    expect(quantities).toEqual([0]);
  });

  it('resolves product picker quick tap and long press actions', () => {
    const product = { guid: 'product-1', name: 'Product 1' } as any;
    const orderItems = [{ productGuid: 'product-2' }];

    expect(resolveProductPickerPressAction({ product, orderItems, selectedCount: 0 })).toBe('openEditor');
    expect(resolveProductPickerPressAction({ product, orderItems, selectedCount: 1 })).toBe('toggleSelection');
    expect(resolveProductPickerPressAction({ product, orderItems, selectedCount: 0, longPress: true })).toBe('toggleSelection');
    expect(resolveProductPickerPressAction({ product: { guid: 'product-2' } as any, orderItems, selectedCount: 0 })).toBe('ignore');
    expect(resolveProductPickerPressAction({ product, orderItems, selectedCount: 0, readOnly: true })).toBe('ignore');
  });

  it('formats product transfer button label', () => {
    expect(formatProductTransferLabel(1)).toBe('Перенести · 1 поз.');
    expect(formatProductTransferLabel(5)).toBe('Перенести · 5 поз.');
  });
});
