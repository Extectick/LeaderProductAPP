import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {useCustomerDocuments} from '../src/features/clientOrders/screen/desktop/useCustomerDocuments';
let tree:Renderer.ReactTestRenderer,result:ReturnType<typeof useCustomerDocuments>;
let customerGuid='customer-a',organizationGuid='org-a',enabled=true,workspace:any;
const filters=(customer='customer-a',organization='org-a')=>({search:'',statuses:[],counterpartyGuid:customer,organizationGuid:organization,
 amountMin:'',amountMax:'',deliveryDateFrom:'',deliveryDateTo:'',updatedFrom:'',updatedTo:'',itemsMin:'',itemsMax:'',syncState:'',warehouseGuid:'',priceTypeGuid:'',hasNumber1c:'',onlyProblems:false});
const row=(guid:string,customer='customer-a',organization='org-a')=>({guid,counterparty:{guid:customer},organization:{guid:organization}});
function Harness(){result=useCustomerDocuments({workspace,customerGuid,organizationGuid,enabled});return null;}
const render=async()=>{await act(async()=>{if(tree)tree.update(React.createElement(Harness));else tree=Renderer.create(React.createElement(Harness));});};
const cycle=async()=>{workspace.loadingOrders=true;await render();workspace.loadingOrders=false;await render();};
beforeEach(()=>{customerGuid='customer-a';organizationGuid='org-a';enabled=true;workspace={offlineUserId:'user-a',filters:filters(),filtersHydrated:true,ordersCacheHydrated:true,orders:[],loadingOrders:false,
 hasMoreOrders:true,loadingMoreOrders:false,refreshOrders:jest.fn().mockResolvedValue(undefined),loadMoreOrders:jest.fn().mockResolvedValue(undefined),
 setFilters:jest.fn((update:any)=>{workspace.filters=typeof update==='function'?update(workspace.filters):update;})};});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=undefined as any;});

test('selection replaces unrelated persisted filters and reasserts scope after late hydration',async()=>{
 workspace.filters={...filters('other'),search:'legacy',statuses:['DRAFT'],amountMin:'900',onlyProblems:true};await render();
 expect(workspace.filters).toEqual(filters());expect(result.rows).toEqual([]);expect(result.loading).toBe(true);
 await cycle();expect(result.loading).toBe(false);
 workspace.filters={...filters('old'),warehouseGuid:'old-warehouse'};await render();expect(workspace.filters).toEqual(filters());
 await cycle();expect(result.loading).toBe(false);
});
test('only selected customer and organization documents survive, including local drafts',async()=>{
 workspace.orders=[row('device-order-a'),row('server-a'),row('foreign-customer','b'),row('foreign-org','customer-a','b')];await render();
 expect(result.rows.map(x=>x.guid)).toEqual(['device-order-a','server-a']);
 const oldLoad=result.loadMore;customerGuid='customer-b';await render();expect(result.rows).toEqual([]);
 await act(async()=>oldLoad());expect(workspace.loadMoreOrders).not.toHaveBeenCalled();
 workspace.orders=[row('new','customer-b')];await cycle();expect(result.rows.map(x=>x.guid)).toEqual(['new']);
});
test('a new scope cannot page with the previous offset before its reset/cache cycle',async()=>{
 await render();organizationGuid='org-b';await render();await render();
 await act(async()=>result.loadMore());expect(workspace.loadMoreOrders).not.toHaveBeenCalled();
 workspace.ordersCacheHydrated=false;await render();workspace.ordersCacheHydrated=true;await cycle();
 await act(async()=>result.loadMore());expect(workspace.loadMoreOrders).toHaveBeenCalledTimes(1);
});
test('search and status survive hidden editor but reset on customer/account changes',async()=>{
 await render();await act(async()=>result.setQuery('123'));await render();await cycle();
 expect(workspace.filters.search).toBe('123');await act(async()=>result.setStatus('DRAFT'));await render();await cycle();
 expect(workspace.filters.statuses).toEqual(['DRAFT']);enabled=false;await render();expect(result.query).toBe('123');
 await act(async()=>result.loadMore());expect(workspace.loadMoreOrders).not.toHaveBeenCalled();enabled=true;await render();expect(result.status).toBe('DRAFT');
 workspace.offlineUserId='user-b';await render();expect(result.query).toBe('');expect(result.status).toBe('');expect(result.rows).toEqual([]);
});
test('errors block automatic append, while explicit refresh uses the workspace recovery',async()=>{
 workspace.ordersAppendError='Сеть';await render();expect(result.error).toBe('Сеть');
 await act(async()=>result.loadMore());expect(workspace.loadMoreOrders).not.toHaveBeenCalled();
 await act(async()=>result.refresh());expect(workspace.refreshOrders).toHaveBeenCalledTimes(1);
});
test('overlapping page events and unmounted callbacks cannot request extra pages',async()=>{
 let complete!:()=>void;workspace.loadMoreOrders=jest.fn(()=>new Promise<void>(resolve=>{complete=resolve;}));await render();
 let first!:Promise<void>;await act(async()=>{first=result.loadMore();void result.loadMore();});expect(workspace.loadMoreOrders).toHaveBeenCalledTimes(1);
 await act(async()=>{complete();await first;});const old=result.refresh;await act(async()=>tree.unmount());tree=undefined as any;
 await old();expect(workspace.refreshOrders).not.toHaveBeenCalled();
});
test('same GUIDs after account switch cannot expose the preceding account cache',async()=>{
 workspace.orders=[row('account-a-document')];await render();expect(result.rows).toHaveLength(1);
 workspace.offlineUserId='user-b';await render();expect(result.rows).toEqual([]);
 await act(async()=>result.loadMore());expect(workspace.loadMoreOrders).not.toHaveBeenCalled();
 workspace.orders=[];workspace.ordersCacheHydrated=false;await render();workspace.ordersCacheHydrated=true;await cycle();
 expect(result.rows).toEqual([]);expect(result.loading).toBe(false);
});
