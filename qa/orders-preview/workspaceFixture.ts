import React from 'react';
import {Asset} from 'expo-asset';
import {computeDraftMetrics, validateDraft, STATUS_LABELS, SYNC_LABELS, type DraftOrder, type DraftItem} from '../../src/features/clientOrders/clientOrdersShared';

const imageSource = require('../../assets/images/icon.png');
export const fixtureThumbnail = typeof imageSource === 'string' ? imageSource : Asset.fromModule(imageSource).uri;
const picture = fixtureThumbnail;
export const organization={guid:'11111111-1111-4111-8111-111111111111',name:'Демо Компания'};
export const counterparties=[{guid:'22222222-2222-4222-8222-222222222221',name:'Тестовый магазин №1',inn:'0000000000'},{guid:'22222222-2222-4222-8222-222222222222',name:'Кофейня «Демо»',inn:'0000000000'},{guid:'22222222-2222-4222-8222-222222222223',name:'Демонстрационный супермаркет',inn:'0000000000'}];
const warehouse={guid:'33333333-3333-4333-8333-333333333333',name:'Демо склад Новосибирск'};
const agreement={guid:'44444444-4444-4444-8444-444444444444',name:'Основное соглашение'};
const contract={guid:'55555555-5555-4555-8555-555555555555',name:'Демо договор',number:'ДЕМО-2026'};
const deliveryAddress={guid:'66666666-6666-4666-8666-666666666666',name:'Адрес магазина',fullAddress:'Демонстрационный адрес, 1'};
const priceType={guid:'77777777-7777-4777-8777-777777777777',name:'Оптовая цена'};
const unit={guid:'unit-demo',name:'Штука',symbol:'шт'};
export const products = ['Молоко 3,5% · 1 л','Сливки 20% · 500 мл','Масло сливочное 82,5% · 180 г','Сыр полутвёрдый · 200 г','Йогурт натуральный · 250 г','Творог 5% · 200 г','Кефир 2,5% · 900 мл','Ряженка 4% · 450 мл','Сметана 15% · 300 г','Напиток овсяный · 1 л','Молоко безлактозное · 1 л','Масло топлёное · 250 г'].map((name,index)=>({
 guid:`88888888-8888-4888-8888-${String(index+1).padStart(12,'0')}`,name,code:`ДЕМО-${101+index}`,basePrice:[109.9,184.5,159,219,64,99][index%6],receiptPrice:[85,150,120,185,48,75][index%6],currency:'RUB',baseUnit:unit,
 packages:[{guid:`pack-${index}`,name:'Коробка',multiplier:12,isDefault:false,unit}],stock:{quantity:240+index*36,available:240+index*36,freeAvailable:240+index*36,reserved:0},
 imageThumbUrl:picture,imagePreviewUrl:picture,images:[{id:`image-${index}`,fileGuid:`photo-${index}`,thumbUrl:picture,previewUrl:picture,isMain:true,hash:`local-${index}`}],priceType,
}));
const makeItem=(product:any,index:number,quantity='12'):DraftItem=>({key:`demo-line-${index}`,lineGuid:`line-${index}`,productGuid:product.guid,productName:product.name,productCode:product.code,quantity,manualPrice:'',discountPercent:'',comment:'',basePrice:product.basePrice,receiptPrice:product.receiptPrice,currency:'RUB',baseUnit:unit,packages:product.packages,packagesLoaded:true,stock:product.stock,imageThumbUrl:picture,imagePreviewUrl:picture,images:product.images});
const makeDraft=(guid='demo-draft'):DraftOrder=>({guid,clientRevision:1,revision:1,organizationGuid:organization.guid,counterpartyGuid:counterparties[0].guid,agreementGuid:agreement.guid,contractGuid:contract.guid,warehouseGuid:warehouse.guid,deliveryAddressGuid:deliveryAddress.guid,deliveryDate:'2026-11-08',paymentForm:null,deliveryMethod:'ДоКлиента',comment:'',currency:'RUB',priceTypeGuid:priceType.guid,priceTypeName:priceType.name,generalDiscountPercent:'',invoiceRequested:false,items:products.slice(0,3).map((product,index)=>makeItem(product,index,['24','12','36'][index]))});
const toOrder=(guid:string,index:number,status='DRAFT',syncState='DRAFT',extra:any={})=>({guid,clientOrderId:`DEMO-${1042+index}`,number1c:status==='SENT_TO_1C'?`ДЕМО-${1042+index}`:null,source:'APP',origin:'local',revision:1,status,syncState,currency:'RUB',createdAt:'2026-11-07T10:30:00Z',updatedAt:'2026-11-07T11:15:00Z',deliveryDate:'2026-11-08',totalAmount:computeDraftMetrics(makeDraft(guid)).total,itemsCount:3,items:makeDraft(guid).items,events:[],organization,counterparty:counterparties[index%3],warehouse,agreement,contract,deliveryAddress,priceType,invoiceRequested:false,...extra});
const initialOrders=[toOrder('demo-draft',0),toOrder('demo-queue',1,'QUEUED','QUEUED',{queuePosition:1}),toOrder('demo-error',2,'DRAFT','ERROR',{lastExportError:'Демонстрационная ошибка: недостаточно остатка'}),toOrder('demo-sent',3,'SENT_TO_1C','SYNCED',{isPostedIn1c:true,readOnly:true,readOnlyReason:'Документ проведён в 1С'}),toOrder('demo-extra',4)];
const EMPTY_FILTERS={search:'',statuses:[] as string[],counterpartyGuid:'',amountMin:'',amountMax:'',deliveryDateFrom:'',deliveryDateTo:'',updatedFrom:'',updatedTo:'',itemsMin:'',itemsMax:'',syncState:'',organizationGuid:'',warehouseGuid:'',priceTypeGuid:'',hasNumber1c:'',onlyProblems:false};
const references:any={organization,counterparty:counterparties[0],agreement,contract,warehouse,deliveryAddress,priceType};
const page=(items:any[])=>async(args:any={})=>{const filtered=items.filter(item=>!args.search||`${item.name||item.number||''} ${item.code||''}`.toLocaleLowerCase().includes(String(args.search).toLocaleLowerCase()));return {items:filtered.slice(args.offset||0,(args.offset||0)+(args.limit||50)),meta:{total:filtered.length}};};
// Opt-in synthetic scenarios for shared list loading/pagination/error QA.
let customerRequestCount=0;
const searchCustomers=async(args:any={})=>{
 const query=new URLSearchParams(location.search),count=Math.min(120,Math.max(3,Number(query.get('customers'))||3));
 const items=count===3?counterparties:Array.from({length:count},(_,index)=>({...counterparties[index%3],guid:`qa-customer-${index}`,name:`Демо клиент ${String(index+1).padStart(3,'0')}`}));
 const requests=((globalThis as any).__customerRequests??=[]);requests.push({offset:args.offset||0,search:args.search||''});
 const request=++customerRequestCount,delay=Math.min(3000,Math.max(0,Number(query.get('customerDelay'))||0));
 if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
 if(query.get('customerFailure')==='once'&&request===1)throw new Error('Synthetic list failure');
 return page(items)(args);
};
const searches={searchCounterparties:searchCustomers,searchAgreements:page([agreement]),searchContracts:page([contract]),searchWarehouses:page([warehouse]),searchDeliveryAddresses:page([deliveryAddress]),searchProducts:page(products),searchPriceTypes:page([priceType])};
const noHeaderLoading=Object.fromEntries(Object.keys(references).map(key=>[key,false]));
const noHeaderDefaults=Object.fromEntries(Object.keys(references).map(key=>[key,'Выбрано в демонстрационном заказе']));
const initialSettings={organizations:[organization],preferredOrganization:organization,deliveryDateMode:'NEXT_DAY',deliveryDateOffsetDays:1,resolvedDeliveryDate:'2026-11-08',currency:'RUB'};
const params=()=>new URLSearchParams(location.search);
const initialId=()=>params().get('orderGuid')||({readonly:'demo-sent',queued:'demo-queue',error:'demo-error'} as Record<string,string>)[params().get('mode')||'']||'demo-draft';
const fixtureGlobal=globalThis as any;

export function useClientOrdersWorkspace(_options?:any):any {
 const [allOrders,setOrders]=React.useState<any[]>(initialOrders);
 const [selectedGuid,setSelectedGuid]=React.useState(initialId);
 const [draft,setDraft]=React.useState<DraftOrder>(()=>makeDraft(initialId()));
 const [selections,setSelections]=React.useState<any>(references);
 const [filters,setFilters]=React.useState(EMPTY_FILTERS);
 const [loadingOrders,setLoadingOrders]=React.useState(false);
 React.useEffect(()=>{setLoadingOrders(true);const timer=setTimeout(()=>setLoadingOrders(false),120);return()=>clearTimeout(timer);},[filters]);
 const [settings,setSettings]=React.useState<any>(initialSettings);
 const [online,setOnline]=React.useState(()=>params().get('offline')!=='1');
 const [dirty,setDirty]=React.useState(false);
 const [ordersError,setOrdersError]=React.useState<string|null>(null);
 const [saved,setSaved]=React.useState(true);
 const [loadingDefaults,setLoadingDefaults]=React.useState(false);
 const [mutationBusy,setMutationLocked]=React.useState(false);
 const defaultsRequest=React.useRef(0);
 React.useEffect(()=>()=>{defaultsRequest.current++;},[]);
 const draftRef=React.useRef(draft);draftRef.current=draft;
 const ordersRef=React.useRef(allOrders);ordersRef.current=allOrders;
 const selectedOrder=allOrders.find(order=>order.guid===selectedGuid)||null;
 const readOnly=!!selectedOrder?.readOnly;
 const patchDraft=React.useCallback((patch:Partial<DraftOrder>|((draft:DraftOrder)=>DraftOrder))=>{setDraft(current=>typeof patch==='function'?patch(current):({...current,...patch}));setDirty(true);setSaved(false);},[]);
 React.useEffect(()=>{if(saved)return;const id=setTimeout(()=>setSaved(true),450);return()=>clearTimeout(id);},[draft,saved]);
 const setItemPatch=React.useCallback((key:string,patch:Partial<DraftItem>)=>{setDraft(current=>({...current,items:current.items.map(item=>item.key===key?{...item,...patch}:item)}));setDirty(true);setSaved(false);},[]);
 const selectOrder=React.useCallback(async(guid:string)=>{defaultsRequest.current++;setLoadingDefaults(false);const order=ordersRef.current.find(item=>item.guid===guid);if(!order)return false;setSelectedGuid(guid);setDraft(makeDraft(guid));setSelections({...references,counterparty:order.counterparty});setDirty(false);setSaved(true);return true;},[]);
 const createDocument=React.useCallback(async()=>{defaultsRequest.current++;setLoadingDefaults(false);const guid=`demo-new-${Date.now()}`;const order=toOrder(guid,0);setOrders(current=>[order,...current]);setSelectedGuid(guid);setDraft({...makeDraft(guid),counterpartyGuid:'',items:[]});setSelections({...references,counterparty:null});setDirty(false);return true;},[]);
 const nextLine=React.useRef(100);
 const addProduct=React.useCallback((product:any,options:any={})=>{const item=makeItem(product,++nextLine.current,String(options.quantity??1));setDraft(current=>current.items.some(existing=>existing.productGuid===product.guid)?current:({...current,items:[...current.items,item]}));setDirty(true);setSaved(false);return item.key;},[]);
 const choose=React.useCallback((kind:string,field:string,item:any)=>{setSelections((current:any)=>({...current,[kind]:item}));patchDraft({[field]:item?.guid||''} as any);},[patchDraft]);
 // Emulate the real pair-change boundary: dependent values clear before async defaults.
 const choosePair=React.useCallback(async(kind:'organization'|'counterparty',item:any)=>{
  const request=++defaultsRequest.current;
  const nextOrganization=kind==='organization'?item?.guid||'':draftRef.current.organizationGuid;
  const nextCounterparty=kind==='counterparty'?item?.guid||'':draftRef.current.counterpartyGuid;
  choose(kind,kind==='organization'?'organizationGuid':'counterpartyGuid',item);
  patchDraft({agreementGuid:'',contractGuid:'',warehouseGuid:'',deliveryAddressGuid:'',priceTypeGuid:null,priceTypeName:null});
  setSelections((current:any)=>({...current,agreement:null,contract:null,warehouse:null,deliveryAddress:null}));
  if(!nextOrganization||!nextCounterparty){setLoadingDefaults(false);return;}
  setLoadingDefaults(true);
  await new Promise(resolve=>setTimeout(resolve,params().get('defaults')==='slow'?800:120));
  if(defaultsRequest.current!==request)return;
  const missing=params().get('defaults')==='missing';
  patchDraft({agreementGuid:agreement.guid,contractGuid:missing?'':contract.guid,warehouseGuid:warehouse.guid,deliveryAddressGuid:missing?'':deliveryAddress.guid,priceTypeGuid:priceType.guid,priceTypeName:priceType.name});
  setSelections((current:any)=>({...current,agreement,contract:missing?null:contract,warehouse,deliveryAddress:missing?null:deliveryAddress}));
  setLoadingDefaults(false);
 },[choose,patchDraft]);
 const saveDraft=React.useCallback(async()=>{setSaved(true);setDirty(false);return {guid:draftRef.current.guid};},[]);
 const submitOrder=React.useCallback(async()=>{setOrders(current=>current.map(order=>order.guid===draftRef.current.guid?{...order,totalAmount:computeDraftMetrics(draftRef.current).total,status:'QUEUED',syncState:'QUEUED',readOnly:false,lastExportError:null}:order));setDirty(false);fixtureGlobal.__ordersFixture.actions.push('mock-submit');return true;},[]);
 const copyOrder=React.useCallback(async()=>{const current=draftRef.current;const guid=`demo-copy-${Date.now()}`;setOrders(value=>[toOrder(guid,0),...value]);setSelectedGuid(guid);setDraft({...current,guid});setDirty(true);return true;},[]);
 const unqueueOrder=React.useCallback(async()=>{setOrders(current=>current.map(order=>order.guid===draftRef.current.guid?{...order,status:'DRAFT',syncState:'DRAFT'}:order));return true;},[]);
 const removeItem=React.useCallback((key:string)=>{setDraft(current=>({...current,items:current.items.filter(item=>item.key!==key)}));setDirty(true);setSaved(false);},[]);
 const methods=React.useMemo(()=>({
  ...searches,patchDraft,setItemPatch,selectOrder,createDocument,createNewOrder:createDocument,addProduct,removeItem,saveDraft,submitOrder,copyOrder,unqueueOrder,
  setOrganization:(value:any)=>choosePair('organization',value),setCounterparty:(value:any)=>choosePair('counterparty',value),setAgreement:(value:any)=>choose('agreement','agreementGuid',value),setContract:(value:any)=>choose('contract','contractGuid',value),setWarehouse:(value:any)=>choose('warehouse','warehouseGuid',value),setDeliveryAddress:(value:any)=>choose('deliveryAddress','deliveryAddressGuid',value),setHeaderPriceType:(value:any)=>{choose('priceType','priceTypeGuid',value);patchDraft({priceTypeName:value?.name});},resetHeaderPriceTypeToDefault:()=>patchDraft({priceTypeGuid:priceType.guid,priceTypeName:priceType.name}),
  setItemPackage:(key:string,packageGuid:string|null)=>setItemPatch(key,{packageGuid}),clearItems:()=>patchDraft({items:[]}),clearFilters:()=>setFilters(EMPTY_FILTERS),
  saveUserSettings:async(value:any)=>{setSettings((current:any)=>({...current,...value}));return {...initialSettings,...value};},
  refreshOrders:async()=>{},loadMoreOrders:async()=>{},refreshAll:async()=>{},confirmDiscardIfNeeded:async()=>true,
  syncDeviceDrafts:async()=>{setOrders(current=>current.map(order=>order.syncState==='QUEUED'?{...order,status:'SENT_TO_1C',syncState:'SYNCED',number1c:'ДЕМО-1050'}:order));fixtureGlobal.__ordersFixture.actions.push('mock-sync');},
  cancelOrderConfirmed:async()=>{setOrders(current=>current.map(order=>order.guid===draftRef.current.guid?{...order,status:'CANCELLED'}:order));return true;},restoreOrder:unqueueOrder,
  deleteDraft:async(guid:string)=>{setOrders(current=>current.filter(order=>order.guid!==guid));return true;},applyInvoiceRequestResult:()=>{},
 }),[addProduct,choose,choosePair,copyOrder,createDocument,patchDraft,removeItem,saveDraft,selectOrder,setItemPatch,submitOrder,unqueueOrder]);
 const validation=validateDraft(draft),metrics=computeDraftMetrics(draft);
 const orders=allOrders.filter(order=>(!filters.search||`${order.counterparty.name} ${order.number1c||order.clientOrderId}`.toLowerCase().includes(filters.search.toLowerCase()))&&(!filters.statuses.length||filters.statuses.includes(order.status))&&(!filters.syncState||filters.syncState===order.syncState)&&(!filters.onlyProblems||order.syncState==='ERROR')&&(!filters.counterpartyGuid||filters.counterpartyGuid===order.counterparty.guid));
 fixtureGlobal.__ordersFixture={...(fixtureGlobal.__ordersFixture||{}),actions:fixtureGlobal.__ordersFixture?.actions||[],setOnline,setMutationLocked,selectOrder,state:{selectedGuid,draft,filters,online,readOnly,dirty,loadingDefaults,mutationLocked:mutationBusy,orderCount:allOrders.length}};
 fixtureGlobal.__ordersQa=fixtureGlobal.__ordersFixture;
 return {...methods,allOrders,orders,selectedGuid,selectedOrder,draft,selections,filters,setFilters,settings,setOrdersError,ordersError,offlineUserId:'orders-qa-synthetic',online,readOnly,dirty,hasEditableDocument:true,draftMode:!selectedOrder?.number1c,mutationLocked:mutationBusy,
  selectedOrderQueued:selectedOrder?.syncState==='QUEUED',selectedOrderSynced:selectedOrder?.syncState==='SYNCED',selectedOrderHas1cError:selectedOrder?.syncState==='ERROR',
  documentHeaderDefaultsState:noHeaderDefaults,documentHeaderLoadingState:{...noHeaderLoading,...Object.fromEntries(['agreement','contract','priceType','warehouse','deliveryAddress','deliveryDate'].map(key=>[key,loadingDefaults]))},isHeaderPriceTypeCustom:false,
  validation,canSubmitOrder:!readOnly&&validation.canSubmit,localTotal:metrics.total,localProfit:metrics.profit,localWeight:metrics.weight,localProfitAvailable:true,
  statusCounts:{all:allOrders.length,draft:allOrders.filter(order=>order.status==='DRAFT').length,queued:1,error:1,errors:1},statusLabels:STATUS_LABELS,syncLabels:SYNC_LABELS,
  queuedDeviceDraftsCount:1,deviceDraftsCount:2,hasMoreOrders:false,ordersConnectionNotice:online?null:'Офлайн · обновление после подключения',
  autosaveLabel:saved?'Сохранено на устройстве':'Сохранение…',autosaveState:saved?'saved':'saving',autosaveError:null,
  error:selectedOrder?.syncState==='ERROR'?selectedOrder.lastExportError:null,
  filtersHydrated:true,ordersCacheHydrated:true,loadingOrders,loadingMoreOrders:false,loadingDetail:false,loadingDefaults,loadingSettings:false,savingSettings:false,saving:false,submitting:false,copying:false,cancelling:false,deletingDraft:false,syncingDeviceDrafts:false,
 };
}
