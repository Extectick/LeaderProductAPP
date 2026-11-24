import {mergeDefaultSuggestions, defaultsNeedRefresh} from '../src/features/clientOrders/lib/defaultSuggestions';
import {emptyDraft} from '../src/features/clientOrders/clientOrdersShared';
const context={organizationGuid:'org',counterpartyGuid:'customer'};
const draft=()=>({...emptyDraft(),...context});
const selections:any={organization:{guid:'org',name:'Org'},counterparty:{guid:'customer',name:'Customer'},agreement:null,contract:null,warehouse:null,deliveryAddress:null};
const local:any={pending:true,restrictionsKnown:false,readState:{verificationRequired:true,refreshPending:false,stale:true},
 agreement:{guid:'a',name:'Agreement',priceType:{guid:'p',name:'Special'}},contract:{guid:'c',name:'Contract'},warehouse:{guid:'w',name:'Warehouse'},deliveryAddress:{guid:'d',name:'Address'}};

test('applies sanitized local references without treating unknown restrictions as permission',()=>{
 const result=mergeDefaultSuggestions(draft(),selections,{...local,counterparty:{guid:'customer',name:'Customer',hasDebt:null,shipmentProhibited:null}},new Set(),context);
 expect(result.draft).toMatchObject({agreementGuid:'a',contractGuid:'c',warehouseGuid:'w',priceTypeGuid:'p',deliveryAddressGuid:'d'});
 expect(result.selections.counterparty).toMatchObject({hasDebt:null,shipmentProhibited:null});
 expect(defaultsNeedRefresh(local)).toBe(true);
});
test('comment/item edits do not block empty untouched header fields',()=>{
 const current={...draft(),comment:'Typed during wait'};
 const result=mergeDefaultSuggestions(current,selections,local,new Set(),context);
 expect(result.draft.comment).toBe(current.comment);expect(result.draft.warehouseGuid).toBe('w');
});
test('explicit clear/same-value selections are fenced independently',()=>{
 const result=mergeDefaultSuggestions(draft(),selections,local,new Set(['warehouseGuid','priceTypeGuid','deliveryAddressGuid']),context);
 expect(result.draft).toMatchObject({agreementGuid:'a',contractGuid:'c',warehouseGuid:'',priceTypeGuid:null,deliveryAddressGuid:''});
});
test('does not overwrite known/manual values or borrow another agreement price type',()=>{
 const current={...draft(),warehouseGuid:'manual',agreementGuid:'other',priceTypeGuid:'manual-price',priceTypeName:'Manual'};
 const result=mergeDefaultSuggestions(current,selections,local,new Set(),context);
 expect(result.draft).toMatchObject({warehouseGuid:'manual',agreementGuid:'other',priceTypeGuid:'manual-price',priceTypeName:'Manual'});
});
test('manual item prices and unrelated draft content survive incoming defaults',()=>{
 const current={...draft(),items:[{key:'line',manualPrice:'17',priceTypeGuid:'manual',quantity:'3'} as any]};
 const result=mergeDefaultSuggestions(current,selections,local,new Set(),context);
 expect(result.draft.items[0]).toBe(current.items[0]);
});
test('a delayed header default preserves an explicit line type even when its price is automatic',()=>{
 const current={...draft(),items:[{key:'line',manualPrice:'',priceTypeGuid:'special',priceTypeName:'Сырнев'} as any]};
 const result=mergeDefaultSuggestions(current,selections,local,new Set(),context);
 expect(result.draft.priceTypeGuid).toBe(local.agreement.priceType.guid);
 expect(result.draft.items[0]).toBe(current.items[0]);
});
test('wrong customer/org results cannot change draft or selections',()=>{
 const current=draft();const result=mergeDefaultSuggestions(current,selections,local,new Set(),{...context,counterpartyGuid:'other'});
 expect(result.draft).toBe(current);expect(result.selections).toBe(selections);
});
test('unknown restrictions alone do not suppress references or cause endless reference retry',()=>{
 const value={...local,pending:false,incomplete:false,readState:{...local.readState,stale:false}};
 expect(defaultsNeedRefresh(value)).toBe(false);
 expect(mergeDefaultSuggestions(draft(),selections,value,new Set(),context).draft.contractGuid).toBe('c');
});
