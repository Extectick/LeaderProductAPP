import { availableQuantity, incomingCostText, incomingCostHint } from '../src/features/stockBalances/incomingCost';
import { stockMoney } from '../src/features/stockBalances/stockMoney';
const cost = { price:1290,currency:'руб.',source:'RECEIPT_PRICE' as const,updatedAt:'2026-10-22T16:00:00' };
it('formats current common price and storage unit without warehouse ranges',()=>{
  expect(incomingCostText(cost,'кг').replace(/\u00a0/g,' ')).toBe('1 290 ₽/кг');
  expect(incomingCostText({...cost,price:442.78},'шт')).toBe('442,78 ₽/шт');
  expect(incomingCostText(cost,'кг')).not.toContain('–');
});
it('does not show unknown, negative, invalid or old-cache costs as zero',()=>{
  for(const item of [undefined,null,{...cost,price:0},{...cost,price:-1},{...cost,price:NaN}])expect(incomingCostText(item,'кг')).toBe('—');
  expect(incomingCostHint(null)).toContain('недоступна');
});
it.each(['643', ' 643 ', 'RUB', 'rub', 'RUR', 'руб.', '₽'])('renders ruble currency %s as a symbol, not a code', currency=>{
  expect(incomingCostText({...cost,price:442.78,currency},'шт')).toBe('442,78 ₽/шт');
  expect(incomingCostText({...cost,price:1290,currency},'кг').replace(/\u00a0/g,' ')).toBe('1 290 ₽/кг');
});
it('does not replace another currency with rubles',()=>{
  expect(stockMoney(12.5,'USD')).toBe('12,5 USD');
  expect(stockMoney(643,'RUB')).toBe('643 ₽');
});
it('preserves manager availability, including an unknown value and zero',()=>{
  expect(availableQuantity({available:5,myReserved:2})).toBe(7);
  expect(availableQuantity({available:5,availableForManager:0})).toBe(0);
  expect(availableQuantity({available:null,myReserved:2})).toBeNull();
});
