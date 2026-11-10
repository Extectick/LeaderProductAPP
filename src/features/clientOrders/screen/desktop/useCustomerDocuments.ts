import React from 'react';
import type {ClientOrder} from '@/utils/clientOrdersService';
import type {ClientOrdersFilters} from '../../clientOrdersShared';

function customerFilters(customerGuid:string,organizationGuid:string,query:string,status:string):ClientOrdersFilters {
  return {search:query.trim(),statuses:status?[status]:[],counterpartyGuid:customerGuid,organizationGuid,
    amountMin:'',amountMax:'',deliveryDateFrom:'',deliveryDateTo:'',updatedFrom:'',updatedTo:'',itemsMin:'',itemsMax:'',
    syncState:'',warehouseGuid:'',priceTypeGuid:'',hasNumber1c:'',onlyProblems:false};
}
function sameFilters(actual:Partial<ClientOrdersFilters>|undefined,expected:ClientOrdersFilters){
  return !!actual&&Object.keys(expected).every(key=>{
    const field=key as keyof ClientOrdersFilters;
    return field==='statuses'?JSON.stringify(actual.statuses??[])===JSON.stringify(expected.statuses):actual[field]===expected[field];
  });
}
const sameGuid=(a?:string|null,b?:string|null)=>!!a&&!!b&&a.toLowerCase()===b.toLowerCase();

/** Owns only desktop list filters. The workspace retains requests, cache, local drafts and authorization. */
export function useCustomerDocuments({workspace,customerGuid,organizationGuid,enabled}:{
  workspace:any;customerGuid?:string;organizationGuid?:string;enabled:boolean;
}){
  const context=JSON.stringify([workspace.offlineUserId,customerGuid,organizationGuid]);
  const [controls,setControls]=React.useState({context,query:'',status:''});
  const query=controls.context===context?controls.query:'';
  const status=controls.context===context?controls.status:'';
  const desired=React.useMemo(()=>customerFilters(customerGuid??'',organizationGuid??'',query,status),[customerGuid,organizationGuid,query,status]);
  const scope=JSON.stringify([context,desired]);
  const active=enabled&&!!customerGuid&&!!organizationGuid;
  const matches=sameFilters(workspace.filters,desired);
  const hydrated=workspace.filtersHydrated!==false&&workspace.ordersCacheHydrated!==false;
  const busy=!!workspace.loadingOrders;
  // A new filter render can still carry the preceding page's offset/hasMore.
  // Wait for the workspace's reset/cache cycle before accepting pagination.
  const lifecycle=React.useRef({scope,ready:matches&&hydrated&&!busy,sawBusy:false,epoch:0});
  if(lifecycle.current.scope!==scope)lifecycle.current={scope,ready:false,sawBusy:false,epoch:lifecycle.current.epoch+1};
  if(!matches)lifecycle.current.ready=false;
  if(matches&&(!hydrated||busy))lifecycle.current.sawBusy=true;
  if(matches&&hydrated&&!busy&&lifecycle.current.sawBusy)lifecycle.current.ready=true;
  const epoch=lifecycle.current.epoch,ready=lifecycle.current.ready&&matches&&hydrated;
  const latest=React.useRef({workspace,active,matches,hydrated,ready,scope,epoch});latest.current={workspace,active,matches,hydrated,ready,scope,epoch};
  const mounted=React.useRef(true);
  React.useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const pending=React.useRef<{epoch:number;token:object}|null>(null);
  React.useEffect(()=>{
    // Persisted filter hydration can arrive after selection; reassert this view's
    // complete scope so legacy journal filters cannot silently hide documents.
    if(!active||matches)return;
    workspace.setFilters((previous:ClientOrdersFilters)=>sameFilters(previous,desired)?previous:desired);
  },[active,matches,desired,workspace.filters,workspace.setFilters]);
  const setQuery=React.useCallback((value:string)=>{
    if(!mounted.current||latest.current.scope!==scope||!latest.current.active)return;
    setControls({context,query:value,status});
  },[scope,context,status]);
  const setStatus=React.useCallback((value:string)=>{
    if(!mounted.current||latest.current.scope!==scope||!latest.current.active)return;
    setControls({context,query,status:value});
  },[scope,context,query]);
  const run=React.useCallback(async(append:boolean)=>{
    const now=latest.current,w=now.workspace;
    if(!mounted.current||now.epoch!==epoch||now.scope!==scope||!now.active||!now.matches||!now.hydrated||w.loadingOrders||w.loadingMoreOrders||pending.current?.epoch===epoch)return;
    if(append&&(!now.ready||!w.hasMoreOrders||w.ordersError||w.ordersAppendError))return;
    const token={};pending.current={epoch,token};
    try {await (append?w.loadMoreOrders():w.refreshOrders());}
    finally {if(pending.current?.token===token)pending.current=null;}
  },[scope,epoch]);
  // Defense in depth while changing accounts/filters: never expose another
  // customer or organization's rows, even during a retained-cache render.
  const rows:ClientOrder[]=active&&ready?(workspace.orders??[]).filter((order:ClientOrder)=>
    sameGuid(order.counterparty?.guid,customerGuid)&&sameGuid(order.organization?.guid,organizationGuid)):[];
  return {scope,rows,query,setQuery,status,setStatus,
    loading:active&&(!matches||!hydrated||busy||!ready),loadingMore:active&&ready&&!!workspace.loadingMoreOrders,
    error:active&&ready?(workspace.ordersError||workspace.ordersAppendError||null):null,
    hasMore:active&&ready&&!!workspace.hasMoreOrders,
    refresh:React.useCallback(()=>run(false),[run]),loadMore:React.useCallback(()=>run(true),[run])};
}
