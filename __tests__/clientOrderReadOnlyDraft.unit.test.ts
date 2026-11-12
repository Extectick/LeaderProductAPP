import {clientOrderReadOnlyDraft} from '../src/features/clientOrders/lib/clientOrderReadOnlyDraft';
import {formatMoney,getDisplayedUnitPriceValue} from '../src/features/clientOrders/clientOrdersShared';
import type {ClientOrder} from '../utils/clientOrdersService';
const order={guid:'b8b8cb5c-d9b9-11f1-9d3e-f6ac37589664',sourceBaseKey:'torg2026',source:'personal',readOnly:true,currency:'EUR',items:[{product:{guid:'11111111-1111-4111-8111-111111111111',name:'Товар',imageThumbUrl:'https://other-base/image'},quantity:2,price:50,lineAmount:95}],events:[],totalAmount:95} as ClientOrder;

test('source currency, actual price and line amount survive the normal editor conversion without catalog enrichment',()=>{
 const draft=clientOrderReadOnlyDraft(order);expect(draft.currency).toBe('EUR');expect(draft.items[0].currency).toBe('EUR');expect(draft.items[0].readOnlyLineAmount).toBe(95);expect(getDisplayedUnitPriceValue(draft.items[0])).toBe('50');
 expect(draft.items[0].receiptPrice).toBeNull();expect(draft.items[0].imageThumbUrl).toBeNull();expect(draft.items[0].images).toEqual([]);expect(order.items[0].product.imageThumbUrl).toBe('https://other-base/image');
});

test('unknown currency is not silently presented as RUB and non-ISO source labels stay displayable',()=>{
 const unknown=clientOrderReadOnlyDraft({...order,currency:''});expect(unknown.currency).toBe('валюта не указана');expect(formatMoney(95,unknown.currency)).not.toContain('₽');
 const source=clientOrderReadOnlyDraft({...order,currency:'Доллар США'});expect(formatMoney(95,source.currency)).toContain('Доллар США');
});

test('actual zero amounts and prices remain zero rather than being replaced by catalog values',()=>{
 const zero=clientOrderReadOnlyDraft({...order,items:[{...order.items[0],basePrice:99,price:0,lineAmount:0}]});expect(zero.items[0].basePrice).toBe(0);expect(zero.items[0].readOnlyLineAmount).toBe(0);expect(getDisplayedUnitPriceValue(zero.items[0])).toBe('0');
});
