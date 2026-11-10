import React from 'react';
import Renderer, {act} from 'react-test-renderer';
jest.mock('@mui/material', () => Object.fromEntries(['Alert','Box','Button','CircularProgress','ClickAwayListener','Stack','TextField','Typography'].map(name => [name, name])));
jest.mock('@expo/vector-icons', () => ({Ionicons: 'Icon'}));
jest.mock('../src/features/clientOrders/components/ProductImageGalleryDialog', () => ({WebProductImage: 'ProductImage', PRODUCT_IMAGE_PLACEHOLDER_URI: 'fixture-image'}));
import {ClientOrderQuickProducts} from '../src/features/clientOrders/screen/desktop/ClientOrderQuickProducts';
import {quickProductAddition} from '../src/features/clientOrders/screen/desktop/clientOrderQuickProductsModel';
import {buildNewItem} from '../src/features/clientOrders/lib/clientOrdersShared';
import type {ClientOrderProduct} from '../utils/clientOrdersService';

const product: ClientOrderProduct = {guid: 'milk-guid', name: 'Молоко', baseUnit: {guid: 'unit', name: 'шт'}, packages: [{guid: 'box',name:'Коробка 12 шт',multiplier:12}], basePrice: 100};
const weight: ClientOrderProduct = {...product, guid: 'weight-guid', isWeight: true, baseUnit:{guid:'kg',name:'кг'}};
const deferred = () => {let resolve!: (value: any) => void; const promise = new Promise<any>(r => {resolve = r;}); return {promise, resolve};};

test('quick add requires positive integer quantity for pieces and allows bounded decimal weights', () => {
  expect(quickProductAddition(product, [], '2')).toEqual({kind: 'add', quantity: '2'});
  for (const input of ['0','-1','1.5','','abc', '9'.repeat(400)]) expect(quickProductAddition(product, [], input).kind).toBe('error');
  expect(quickProductAddition(weight, [], '0.125')).toEqual({kind: 'add', quantity: '0,125'});
  expect(quickProductAddition(weight, [], '0,1234').kind).toBe('error');
});

test('repeat addition increments the existing package rather than creating duplicates or replacing price', () => {
  const line = {...buildNewItem(product), key: 'line', packageGuid: 'box', quantity: '9', manualPrice:'123'};
  expect(quickProductAddition(product, [line], '1')).toEqual({kind: 'increment', key:'line', quantity:'10'});
  expect(line).toMatchObject({packageGuid:'box', quantity:'9', manualPrice:'123'});
  expect(quickProductAddition(weight, [{...buildNewItem(weight),key:'kg',quantity:'0,1'}], '0,2')).toEqual({kind:'increment',key:'kg',quantity:'0,3'});
});

test('cancelled or invalid existing quantities cannot be silently reopened or replaced', () => {
  expect(quickProductAddition(product, [{...buildNewItem(product), isCancelled:true}], '2').kind).toBe('error');
  expect(quickProductAddition(product, [{...buildNewItem(product),quantity:'invalid'}], '2').kind).toBe('error');
});

let tree: Renderer.ReactTestRenderer;
let workspace: any;
const fields = () => tree.root.findAllByType('TextField' as any);
const search = () => fields().find(node => node.props.slotProps?.htmlInput?.['aria-label'] === 'Найти товар')!;
const qty = () => fields().find(node => node.props.label === 'Количество')!;
const add = () => tree.root.findAllByType('Button' as any).find(node => node.props.children === 'Добавить')!;
const render = () => React.createElement(ClientOrderQuickProducts,{workspace});
const enter = () => ({key:'Enter', nativeEvent:{isComposing:false}, preventDefault:jest.fn()});
beforeEach(() => {
  jest.useFakeTimers();
  workspace = {offlineUserId:1, draft:{guid:'order',organizationGuid:'organization',counterpartyGuid:'customer',warehouseGuid:'warehouse',agreementGuid:'agreement',priceTypeGuid:'price',items:[]},
    searchProducts:jest.fn().mockResolvedValue({items:[product]}),addProduct:jest.fn(),setItemPatch:jest.fn(),online:true};
});
afterEach(async () => {if(tree) await act(async () => tree.unmount());jest.useRealTimers();});
async function searchFor(query='молоко') {
  await act(async () => search().props.onChange({target:{value:query}}));
  await act(async () => {jest.advanceTimersByTime(180);});
}

test('search is scoped and Enter transfers an explicit positive quantity then returns to an empty search', async () => {
  await act(async () => {tree=Renderer.create(render());});
  expect(workspace.searchProducts).not.toHaveBeenCalled();
  await searchFor();
  expect(workspace.searchProducts).toHaveBeenCalledWith(expect.objectContaining({search:'молоко',organizationGuid:'organization',counterpartyGuid:'customer',warehouseGuid:'warehouse',agreementGuid:'agreement',priceTypeGuid:'price',limit:12}));
  await act(async () => qty().props.onChange({target:{value:'12'}}));
  await act(async () => qty().props.onKeyDown(enter()));
  expect(workspace.addProduct).toHaveBeenCalledWith(product,{quantity:'12'});
  expect(search().props.value).toBe(''); expect(qty().props.value).toBe('1');
});

test('zero and IME confirmation cannot add an item', async () => {
  await act(async () => {tree=Renderer.create(render());}); await searchFor();
  await act(async () => qty().props.onChange({target:{value:'0'}}));
  await act(async () => qty().props.onKeyDown(enter()));
  expect(workspace.addProduct).not.toHaveBeenCalled(); expect(qty().props.error).toBe(true);
  await act(async () => qty().props.onChange({target:{value:'2'}}));
  await act(async () => search().props.onKeyDown({...enter(),nativeEvent:{isComposing:true}}));
  expect(workspace.addProduct).not.toHaveBeenCalled();
});

test('a late old-client response never enables adding in the new client context', async () => {
  const old=deferred();workspace.searchProducts.mockReturnValueOnce(old.promise);
  await act(async () => {tree=Renderer.create(render());}); await searchFor();
  workspace={...workspace,draft:{...workspace.draft,counterpartyGuid:'other-customer'}};
  await act(async () => tree.update(render()));
  await act(async () => old.resolve({items:[product]}));
  expect(add().props.disabled).toBe(true);
  await act(async () => {jest.advanceTimersByTime(180);});
  expect(search().props.value).toBe('');
  expect(workspace.searchProducts).toHaveBeenCalledTimes(1);
  expect(add().props.disabled).toBe(true);
  expect(workspace.addProduct).not.toHaveBeenCalled();
});

test('a response for an older query is ignored even when it resolves after the new query', async () => {
  const old=deferred();workspace.searchProducts.mockReturnValueOnce(old.promise).mockResolvedValueOnce({items:[]});
  await act(async () => {tree=Renderer.create(render());}); await searchFor('молоко'); await searchFor('сыр');
  await act(async () => old.resolve({items:[product]}));
  expect(add().props.disabled).toBe(true);expect(search().props.value).toBe('сыр');
});

test.each(['mutationLocked','loadingDefaults','loadingDetail','readOnly'])('%s fences live and retained stale add handlers', async flag => {
  await act(async () => {tree=Renderer.create(render());}); await searchFor();
  const previousClick=add().props.onClick;
  workspace={...workspace,[flag]:true};await act(async () => tree.update(render()));
  await act(async () => previousClick());
  expect(workspace.addProduct).not.toHaveBeenCalled();
});
