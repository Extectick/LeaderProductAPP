import React from 'react';
import Renderer, {act} from 'react-test-renderer';
jest.mock('@mui/material', () => Object.fromEntries(['Alert','Box','Button','CircularProgress','Stack','TextField','Typography'].map(name => [name, name])));
jest.mock('../src/features/clientOrders/components/ProductImageGalleryDialog', () => ({WebProductImage:'ProductImage', PRODUCT_IMAGE_PLACEHOLDER_URI:'image'}));
jest.mock('../src/features/clientOrders/hooks/useCustomerPurchaseHistory', () => ({useCustomerPurchaseHistory:()=>({ready:true, dates:new Map(), snapshot:{fetchedAt:'history-revision'}})}));
import {ClientOrderPriceGrid} from '../src/features/clientOrders/screen/desktop/ClientOrderPriceGrid';
import {priceGridQuantity} from '../src/features/clientOrders/screen/desktop/clientOrderPriceGridModel';
import {buildNewItem, computeLineTotal} from '../src/features/clientOrders/lib/clientOrdersShared';
import type {ClientOrderProduct} from '../utils/clientOrdersService';
const product: ClientOrderProduct={guid:'flour',name:'Мука',basePrice:95,baseUnit:{guid:'piece',name:'шт'}};
const weight: ClientOrderProduct={...product,guid:'weight',isWeight:true,baseUnit:{guid:'kg',name:'кг'}};

test('absolute quantities preserve existing line identity and zero removes instead of incrementing',()=>{
 const line={...buildNewItem(product),key:'line',quantity:'5',manualPrice:'100',packageGuid:'box'};
 expect(priceGridQuantity(product,line,'3')).toEqual({kind:'set',key:'line',quantity:'3'});
 expect(priceGridQuantity(product,line,'0')).toEqual({kind:'remove',key:'line'});
 expect(line).toMatchObject({quantity:'5',manualPrice:'100',packageGuid:'box'});
 expect(priceGridQuantity(product,undefined,'0')).toEqual({kind:'remove',key:undefined});
});
test('piece/weight validation rejects invalid values and cancelled rows',()=>{
 for(const value of ['1,5','-1','','NaN','1e3','9'.repeat(400)])expect(priceGridQuantity(product,undefined,value).kind).toBe('error');
 expect(priceGridQuantity(weight,undefined,'1.5')).toEqual({kind:'add',quantity:'1,5'});
 expect(priceGridQuantity(weight,undefined,'1,2345').kind).toBe('error');
 expect(priceGridQuantity(product,{...buildNewItem(product),isCancelled:true},'0').kind).toBe('error');
});
test('instruction example totals two price rows to845',()=>{
 expect(computeLineTotal(buildNewItem(product,{quantity:3}))+computeLineTotal(buildNewItem({...product,guid:'butter',basePrice:140},{quantity:4}))).toBe(845);
});
let tree:Renderer.ReactTestRenderer,workspace:any;
const fields=()=>tree.root.findAllByType('TextField' as any);
const search=()=>fields().find(n=>n.props.slotProps?.htmlInput?.['aria-label']==='Поиск в прайсе')!;
const qty=()=>fields().find(n=>n.props.slotProps?.htmlInput?.['data-price-quantity']==='flour')!;
const render=()=>React.createElement(ClientOrderPriceGrid,{workspace});
const key=(value='Enter')=>({key:value,nativeEvent:{isComposing:false},preventDefault:jest.fn()});
beforeEach(()=>{
 jest.useFakeTimers();workspace={offlineUserId:'test',online:true,draft:{guid:'order',organizationGuid:'org',counterpartyGuid:'client',warehouseGuid:'stock',items:[]},
 searchProducts:jest.fn().mockResolvedValue({items:[product],meta:{total:1}}),addProduct:jest.fn(),setItemPatch:jest.fn(),removeItem:jest.fn()};
});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());jest.useRealTimers();});
async function mount(){await act(async()=>{tree=Renderer.create(render());});await act(async()=>{jest.advanceTimersByTime(180);});}
test('valid typing sets live absolute amount and zero waits for confirmation',async()=>{
 workspace.draft.items=[{...buildNewItem(product),key:'line',quantity:'5'}];await mount();
 await act(async()=>qty().props.onChange({target:{value:'3'}}));expect(workspace.setItemPatch).toHaveBeenLastCalledWith('line',{quantity:'3'});
 await act(async()=>qty().props.onChange({target:{value:'0'}}));expect(workspace.removeItem).not.toHaveBeenCalled();
 await act(async()=>qty().props.onKeyDown(key()));expect(workspace.removeItem).toHaveBeenCalledWith('line');
});
test('old client request cannot populate new client price list',async()=>{
 let resolve!:(v:any)=>void;workspace.searchProducts.mockReturnValueOnce(new Promise(r=>resolve=r));await mount();
 workspace={...workspace,draft:{...workspace.draft,counterpartyGuid:'other'}};await act(async()=>tree.update(render()));
 await act(async()=>resolve({items:[product],meta:{total:1}}));expect(qty()).toBeUndefined();
});
test('stale row handler cannot edit after document switch or mutation lock',async()=>{
 await mount();const oldChange=qty().props.onChange;
 workspace={...workspace,mutationLocked:true};await act(async()=>tree.update(render()));
 await act(async()=>oldChange({target:{value:'3'}}));expect(workspace.addProduct).not.toHaveBeenCalled();
});
test('catalogue sends stock/history filters and paginates without duplicates',async()=>{
 workspace.searchProducts.mockResolvedValue({items:[product],meta:{total:3}});await mount();
 const button=(name:string)=>tree.root.findAllByType('Button' as any).find(n=>n.props.children===name)!;
 await act(async()=>button('В наличии').props.onClick());await act(async()=>jest.advanceTimersByTime(180));
 await act(async()=>button('Клиент уже брал').props.onClick());await act(async()=>jest.advanceTimersByTime(180));
 expect(workspace.searchProducts).toHaveBeenLastCalledWith(expect.objectContaining({inStockOnly:true,purchasedOnly:true,historyFetchedAt:'history-revision',limit:50,offset:0}));
 await act(async()=>button('Ещё товары').props.onClick());expect(workspace.searchProducts).toHaveBeenLastCalledWith(expect.objectContaining({offset:1}));
 expect(fields().filter(n=>n.props.slotProps?.htmlInput?.['data-price-quantity'])).toHaveLength(1);
});

test('live new quantity followed by Enter and blur does not add a duplicate or increment',async()=>{
 await mount();
 await act(async()=>qty().props.onChange({target:{value:'3'}}));
 expect(workspace.addProduct).toHaveBeenCalledTimes(1);
 expect(workspace.addProduct).toHaveBeenCalledWith(product,{quantity:'3'});
 workspace={...workspace,draft:{...workspace.draft,items:[{...buildNewItem(product,{quantity:'3'}),key:'added'}]}};
 await act(async()=>tree.update(render()));
 await act(async()=>qty().props.onKeyDown(key()));
 await act(async()=>qty().props.onBlur());
 expect(workspace.addProduct).toHaveBeenCalledTimes(1);expect(workspace.setItemPatch).not.toHaveBeenCalled();
 await act(async()=>qty().props.onChange({target:{value:'bad'}}));
 await act(async()=>qty().props.onBlur());
 expect(qty().props.error).toBe(true);expect(workspace.setItemPatch).not.toHaveBeenCalled();
});
