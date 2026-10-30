import {
  computeDraftMetrics,
  computeLineMarkupPercent,
  computeLineProfit,
  computeLineProfitabilityPercent,
  computeMarkupPercent,
  emptyDraft,
  getOrderMarkupPercent,
  type DraftItem,
} from '../src/features/clientOrders/clientOrdersShared';

function item(patch: Partial<DraftItem> = {}): DraftItem {
  return {
    key: 'line-1',
    lineGuid: 'line-guid-1',
    productGuid: 'product-1',
    productName: 'Товар',
    quantity: '1',
    packageGuid: null,
    manualPrice: '',
    discountPercent: '',
    comment: '',
    basePrice: 100,
    receiptPrice: 80,
    currency: 'RUB',
    packages: [{ guid: 'box', name: 'Коробка', multiplier: 10 }],
    ...patch,
  };
}

describe('client order markup presentation', () => {
  it('shows markup on cost instead of margin on revenue without changing profit', () => {
    const line = item({ basePrice: 179, receiptPrice: 140.34 });
    expect(computeLineProfit(line)).toBeCloseTo(38.66);
    expect(computeLineMarkupPercent(line)).toBeCloseTo(27.547385);
    expect(computeLineMarkupPercent(line)?.toFixed(1)).toBe('27.5');
    // Existing API/business margin retains its original meaning.
    expect(computeLineProfitabilityPercent(item())).toBe(20);
    expect(computeLineMarkupPercent(item())).toBe(25);
  });

  it('accounts for quantity, packages, manual price and discounts', () => {
    expect(computeLineMarkupPercent(item({ quantity: '2', packageGuid: 'box' }))).toBe(25);
    expect(computeLineMarkupPercent(item({ manualPrice: '120' }))).toBe(50);
    expect(computeLineMarkupPercent(item({ discountPercent: '10' }))).toBe(12.5);
    expect(computeLineMarkupPercent(item(), '10')).toBe(12.5);
    expect(computeLineMarkupPercent(item({ discountPercent: '10' }), '20')).toBe(12.5);
    expect(computeLineMarkupPercent(item({ basePrice: 240 }))).toBe(200);
  });

  it('shows negative markup and zero revenue correctly', () => {
    expect(computeLineMarkupPercent(item({ basePrice: 60 }))).toBe(-25);
    expect(computeLineMarkupPercent(item({ discountPercent: '100' }))).toBe(-100);
    expect(computeLineMarkupPercent(item({ basePrice: 80 }))).toBe(0);
  });

  it.each([
    { receiptPrice: undefined }, { receiptPrice: 0 }, { receiptPrice: -1 },
    { receiptPrice: NaN }, { receiptPrice: Infinity }, { quantity: '0' },
    { quantity: '' }, { isCancelled: true }, { basePrice: Infinity },
  ])('does not invent a percentage when cost cannot be calculated: %p', (patch) => {
    expect(computeLineMarkupPercent(item(patch))).toBeNull();
  });

  it('excludes rows with unknown cost and cancelled rows from document markup', () => {
    const metrics = computeDraftMetrics({ ...emptyDraft(), items: [
      item(),
      item({ key: 'unknown', basePrice: 1000, receiptPrice: undefined }),
      item({ key: 'cancelled', basePrice: 500, isCancelled: true }),
    ] });
    expect(metrics.total).toBe(1100);
    expect(metrics.profit).toBe(20);
    expect(metrics.profitBasisAmount).toBe(100);
    expect(computeMarkupPercent(metrics.profit, metrics.profitBasisAmount)).toBe(25);
    expect(getOrderMarkupPercent(metrics)).toBe(25);
  });

  it('uses the known-cost sales basis for API order cards and summaries', () => {
    expect(getOrderMarkupPercent({ profitAvailable: true, profit: 20, profitBasisAmount: 100, profitabilityPercent: 20 })).toBe(25);
    expect(getOrderMarkupPercent({ profitAvailable: true, profit: -80, profitBasisAmount: 0 })).toBe(-100);
    expect(getOrderMarkupPercent({ profitAvailable: false, profit: 20, profitBasisAmount: 100 })).toBeNull();
    expect(getOrderMarkupPercent({ profitAvailable: true, profit: null, profitBasisAmount: 100 })).toBeNull();
    expect(getOrderMarkupPercent({ profitAvailable: true, profit: 20, profitBasisAmount: 20, profitabilityPercent: 20 })).toBeNull();
  });

  it('converts legacy margin only when basis is absent, preserving unknown values', () => {
    expect(getOrderMarkupPercent({ profitAvailable: true, profit: 20, profitabilityPercent: 20 })).toBe(25);
    expect(getOrderMarkupPercent({ profitAvailable: true, profit: 0, profitabilityPercent: 0 })).toBe(0);
    for (const profitabilityPercent of [null, undefined, 100, 120, NaN, Infinity]) {
      expect(getOrderMarkupPercent({ profitAvailable: true, profit: 20, profitabilityPercent })).toBeNull();
    }
    expect(getOrderMarkupPercent(null)).toBeNull();
  });
});
