import type {ClientOrder} from '@/utils/clientOrdersService';
import {orderToDraft,type DraftItem,type DraftOrder} from '../clientOrdersShared';

type ReadOnlyItem=DraftItem & {readOnlyLineAmount?:number};
type ReadOnlyDraft=Omit<DraftOrder,'items'>&{items:ReadOnlyItem[]};
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);

/** The source DTO has actual document prices/amounts, not catalog defaults. */
export function clientOrderReadOnlyDraft(order:ClientOrder):ReadOnlyDraft{
 const currency=order.currency?.trim()||order.sourceCurrencyName?.trim()||'валюта не указана';
 const draft=orderToDraft({...order,currency});
 return {...draft,currency,items:draft.items.map((item,index)=>{
  const source=order.items[index];
  return {...item,currency,basePrice:finite(source.price)?source.price:item.basePrice,
   ...(finite(source.lineAmount)?{readOnlyLineAmount:source.lineAmount}:{}),
   imageThumbUrl:null,imagePreviewUrl:null,imageHash:null,images:[]};
 })};
}
