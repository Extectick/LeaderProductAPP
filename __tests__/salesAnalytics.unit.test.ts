import { inSalesPeriod, isSale, movementRangeComplete, periodLabel, salesPeriod, salesPoints, salesCurrency, salesDayPrice } from '../src/features/stockBalances/salesAnalytics';
import type { StockMovement, StockPage } from '../src/features/stockBalances/products';
const item: StockMovement = { id:'1',direction:'expense',operationKind:'Реализация товаров и услуг',movementAt:'2026-10-22T23:00:00',
  document:{type:'РасходныйОрдерНаТовары',typeName:'Расходный ордер',guid:'d',number:'УТ-1',date:'2026-10-21'},
  baseDocuments:[],warehouse:{guid:'w',name:'Омск'},counterparty:'Клиент',quantity:6,price:1650,amount:9900,currency:'RUB',
  costStatus:'DOCUMENT',costBasis:'VAT_INCLUDED',costReason:'',characteristic:'',writeOffArticles:[] };
const period={from:'2026-10-01',to:'2026-10-22'};
it('calculates quantity-weighted daily prices, normalizing ruble codes',()=>{
  const points=salesPoints([item,{...item,id:'2',quantity:3,price:1200,currency:'643'}],period);
  expect(salesDayPrice(points[21],'₽')).toBe(1500);
  expect(salesDayPrice(points[0],'₽')).toBeNull();
  for(const value of ['RUB','RUR','643','руб.','₽']) expect(salesCurrency(value)).toBe('₽');
});
it('leaves unknown or mixed-currency day prices as gaps, preserving real zero',()=>{
  const day=(rows:StockMovement[])=>salesPoints(rows,period)[21];
  expect(salesDayPrice(day([{...item,price:0}]),'₽')).toBe(0);
  for(const second of [{price:null},{price:Number.NaN},{price:-1},{currency:'USD'}])
    expect(salesDayPrice(day([item,{...item,id:'2',...second}]),'₽')).toBeNull();
  expect(salesDayPrice(day([item]),'')).toBeNull();
});
it('uses inclusive local calendar periods across year and leap boundaries',()=>{
  expect(salesPeriod('week',new Date(2026,0,1))).toEqual({from:'2025-12-26',to:'2026-01-01'});
  expect(salesPeriod('previous',new Date(2024,2,31))).toEqual({from:'2024-02-01',to:'2024-02-29'});
  expect(salesPeriod('current',new Date(2026,9,22))).toEqual(period);
  expect(salesPeriod('month',new Date(2026,9,22))).toEqual({from:'2026-09-23',to:'2026-10-22'});
  expect(periodLabel(period)).toBe('1.10–22.10');
});
it('uses physical shipment date without UTC shift and excludes dates outside period',()=>{
  expect(inSalesPeriod(item,period)).toBe(true);
  expect(inSalesPeriod({...item,movementAt:'2026-10-23T00:00:00'},period)).toBe(false);
  expect(inSalesPeriod({...item,movementAt:'2026-09-30T23:59:59'},period)).toBe(false);
});
it('never counts transfers, writeoffs, returns or orders as sales',()=>{
  for(const type of ['ПеремещениеТоваров','СписаниеНедостачТоваров','ВозвратТоваровПоставщику','ЗаказКлиента']){
    expect(isSale({...item,operationKind:type,document:{...item.document,type}})).toBe(false);
  }
  expect(isSale({...item,direction:'receipt'})).toBe(false);
  expect(isSale({...item,baseDocuments:[{...item.document,type:'ПеремещениеТоваров'}]})).toBe(false);
  expect(isSale({...item,operationKind:'Расходный ордер',baseDocuments:[{...item.document,type:'РеализацияТоваровУслуг'}]})).toBe(true);
});
it('fills zero days, preserves all day documents and deduplicates movement ids',()=>{
  const second={...item,id:'2',quantity:3,price:null,amount:null,costStatus:'UNAVAILABLE' as const};
  const points=salesPoints([item,item,second],period);
  expect(points).toHaveLength(22); expect(points[0].quantity).toBe(0);
  expect(points[21].quantity).toBe(9); expect(points[21].documents).toEqual([item,second]);
  expect(points[21].documents[1].amount).toBeNull();
});
it('never treats a paginated prefix as a complete period',()=>{
  const page={items:[item],hasMore:true,nextCursor:'next'} as StockPage<StockMovement>;
  expect(movementRangeComplete(null,period)).toBe(false);
  expect(movementRangeComplete(page,period)).toBe(false);
  expect(movementRangeComplete({...page,hasMore:false},period)).toBe(true);
  expect(movementRangeComplete({...page,items:[item,{...item,id:'old',movementAt:'2026-09-30T12:00:00'}]},period)).toBe(true);
});
