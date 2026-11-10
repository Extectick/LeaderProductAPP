import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {TextInput} from 'react-native';
jest.mock('@mui/material', () => Object.fromEntries(['Alert','Box','Button','CircularProgress','MenuItem','Stack','TextField','Typography'].map(name=>[name,name])));
jest.mock('../context/ThemeContext',()=>({useTheme:()=>({theme:'light'})}));
jest.mock('expo-router/react-navigation',()=>({useIsFocused:()=>true}));
jest.mock('../components/ui/AppScreenBlur',()=>({AppBlurActivityContext:require('react').createContext(true),AppEdgeBlur:'EdgeBlur'}));
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
import {ClientOrderCustomerStart} from '../src/features/clientOrders/screen/desktop/ClientOrderCustomerStart';
import {AppSearchField} from '../components/ui/AppSearchField';
import {AppListPanelActionButton} from '../components/ui/AppListPanel';
import {ClientOrderOrganizationPicker} from '../src/features/clientOrders/screen/desktop/ClientOrderOrganizationPicker';
import {ClientOrderCustomerDocuments} from '../src/features/clientOrders/screen/desktop/ClientOrderCustomerDocuments';
import {ClientOrderDeliveryPoints} from '../src/features/clientOrders/screen/desktop/ClientOrderDeliveryPoints';
import {AppActionMenuItem} from '../components/ui/AppActionMenu';

let tree: Renderer.ReactTestRenderer;
const workspace=()=>({offlineUserId:'test',settings:{organizations:[{guid:'one',name:'Первая'},{guid:'two',name:'Вторая'}]},
  draft:{},filters:{},setFilters:jest.fn(),orders:[] as any[],loadingOrders:false,refreshOrders:jest.fn(),loadMoreOrders:jest.fn(),selectOrder:jest.fn().mockResolvedValue(true),searchCounterparties:jest.fn().mockResolvedValue({items:[]}),searchDeliveryAddresses:jest.fn().mockResolvedValue({items:[]})});
beforeEach(()=>jest.useFakeTimers());
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());jest.useRealTimers();});
test('desktop shared search and clear keep the selected organization in the real search request',async()=>{
  const w=workspace();
  await act(async()=>{tree=Renderer.create(React.createElement(ClientOrderCustomerStart,{workspace:w,onOpenOrder:jest.fn(),desktop:true}));});
  const field=()=>tree.root.findAllByType(TextInput).find(n=>n.props.accessibilityLabel==='Найти клиента')!;
  await act(async()=>field().props.onChangeText('ИНН 123'));
  await act(async()=>jest.advanceTimersByTime(180));
  expect(w.searchCounterparties).toHaveBeenLastCalledWith(expect.objectContaining({search:'ИНН 123',organizationGuid:'one',offset:0}));
  const organization=tree.root.findByType(ClientOrderOrganizationPicker);
  await act(async()=>organization.props.onChange('two'));
  await act(async()=>jest.advanceTimersByTime(180));
  expect(w.searchCounterparties).toHaveBeenLastCalledWith(expect.objectContaining({search:'ИНН 123',organizationGuid:'two'}));
  await act(async()=>tree.root.findAllByType(AppSearchField).find(n=>n.props.label==='Найти клиента')!.findByProps({accessibilityLabel:'Очистить поиск'}).props.onPress());
  await act(async()=>jest.advanceTimersByTime(180));
  expect(field().props.value).toBe('');
  expect(w.searchCounterparties).toHaveBeenLastCalledWith(expect.objectContaining({search:'',organizationGuid:'two',offset:0}));
  await act(async()=>tree.update(React.createElement(ClientOrderCustomerStart,{workspace:{...w,mutationLocked:true},onOpenOrder:jest.fn(),desktop:true})));
  expect(field().props.editable).toBe(false);
});
test('compact web keeps its existing field and query when changing layout',async()=>{
  const w=workspace(),render=(desktop:boolean)=>React.createElement(ClientOrderCustomerStart,{workspace:w,onOpenOrder:jest.fn(),desktop});
  await act(async()=>{tree=Renderer.create(render(false));});
  expect(tree.root.findAllByType(AppSearchField)).toHaveLength(0);
  const search=tree.root.findAllByType('TextField' as any).find(n=>!n.props.select)!;
  expect(search.props.placeholder).toBe('Клиент, ИНН или адрес из журнала');
  await act(async()=>search.props.onChange({target:{value:'Клиент'}}));
  await act(async()=>tree.update(render(true)));
  expect(tree.root.findAllByType(TextInput).find(n=>n.props.accessibilityLabel==='Найти клиента')!.props.value).toBe('Клиент');
  await act(async()=>tree.update(render(false)));
  expect(tree.root.findAllByType('TextField' as any).find(n=>!n.props.select)!.props.value).toBe('Клиент');
});

test('customer menu refresh restarts pagination and no desktop journal entry remains',async()=>{
  const w=workspace();
  w.searchCounterparties.mockResolvedValue({items:Array.from({length:30},(_,id)=>({guid:`customer-${id}`,name:`Клиент ${id}`})),meta:{total:60}});
  await act(async()=>{tree=Renderer.create(React.createElement(ClientOrderCustomerStart,{workspace:w,onOpenOrder:jest.fn(),desktop:true}));});
  await act(async()=>jest.advanceTimersByTime(180));
  const more=tree.root.findByProps({accessibilityLabel:'Показать ещё'});
  await act(async()=>more.props.onPress());
  await act(async()=>jest.advanceTimersByTime(180));
  expect(w.searchCounterparties).toHaveBeenLastCalledWith(expect.objectContaining({offset:30}));
  await act(async()=>tree.root.findByProps({accessibilityLabel:'Меню клиентов'}).props.onPress());
  await act(async()=>tree.root.findAllByType(AppActionMenuItem).find(node=>node.props.label==='Обновить список')!.props.onPress());
  await act(async()=>jest.advanceTimersByTime(180));
  expect(w.searchCounterparties).toHaveBeenLastCalledWith(expect.objectContaining({offset:0}));
  await act(async()=>tree.root.findByProps({accessibilityLabel:'Меню клиентов'}).props.onPress());
  expect(tree.root.findAllByType(AppActionMenuItem).some(node=>node.props.label==='Журнал заказов')).toBe(false);
  expect(tree.root.findByType(AppListPanelActionButton).props.disabled).toBe(true);
});

 test('desktop loads 60 customers, shows names only and pages early without a search debounce',async()=>{
  const w=workspace();
  w.searchCounterparties.mockImplementation(async({offset}:any)=>({items:Array.from({length:60},(_,id)=>({guid:`c-${offset+id}`,name:`Клиент ${offset+id}`,inn:'1234567890',fullName:'Полное имя'}))}));
  await act(async()=>{tree=Renderer.create(React.createElement(ClientOrderCustomerStart,{workspace:w,onOpenOrder:jest.fn(),desktop:true}));});
  await act(async()=>jest.advanceTimersByTime(180));
  expect(w.searchCounterparties).toHaveBeenLastCalledWith(expect.objectContaining({limit:60,offset:0}));
  const row=tree.root.findAllByType('Box' as any).find(n=>n.props.title==='Клиент 0')!;
  expect(row.findAllByType('Typography' as any)).toHaveLength(1);
  expect(row.findByType('Typography' as any).props.children).toBe('Клиент 0');
  const list=tree.root.findByProps({testID:'client-orders-customer-list'});
  await act(async()=>list.props.onScroll({nativeEvent:{layoutMeasurement:{height:800},contentSize:{height:3100},contentOffset:{y:1600}}}));
  await act(async()=>jest.advanceTimersByTime(0));
  expect(w.searchCounterparties).toHaveBeenLastCalledWith(expect.objectContaining({limit:60,offset:60}));
  expect(w.searchCounterparties).toHaveBeenCalledTimes(2);
 });
 test('compact web retains 30 customers per page and secondary customer details',async()=>{
  const w=workspace();w.searchCounterparties.mockResolvedValue({items:[{guid:'c',name:'Клиент',inn:'1234567890'}]});
  await act(async()=>{tree=Renderer.create(React.createElement(ClientOrderCustomerStart,{workspace:w,onOpenOrder:jest.fn(),desktop:false}));});
  await act(async()=>jest.advanceTimersByTime(180));
  expect(w.searchCounterparties).toHaveBeenLastCalledWith(expect.objectContaining({limit:30,offset:0}));
  const row=tree.root.findAllByType('Box' as any).find(n=>n.props.title==='Клиент')!;
  expect(row.findAllByType('Typography' as any)).toHaveLength(2);
 });

 test('desktop delivery selection unlocks creation, and organization changes reset it',async()=>{
  const w=workspace();
  w.searchCounterparties.mockResolvedValue({items:[{guid:'c',name:'Клиент'}]});
  w.searchDeliveryAddresses.mockResolvedValue({items:[{guid:'p',name:'Магазин',fullAddress:'Ленина, 10',counterpartyGuid:'c'}]});
  await act(async()=>{tree=Renderer.create(React.createElement(ClientOrderCustomerStart,{workspace:w,onOpenOrder:jest.fn(),desktop:true}));});
  await act(async()=>jest.advanceTimersByTime(180));
  const selectCustomer=()=>tree.root.findAllByType('Box' as any).find(n=>n.props.title==='Клиент')!;
  await act(async()=>selectCustomer().props.onClick());
  await act(async()=>jest.advanceTimersByTime(180));
  expect(w.searchDeliveryAddresses).toHaveBeenLastCalledWith(expect.objectContaining({counterpartyGuid:'c',organizationGuid:'one',offset:0}));
  const points=()=>tree.root.findByType(ClientOrderDeliveryPoints);
  await act(async()=>points().props.onSelect(points().props.items[0]));
  expect(points().props.selectedGuid).toBe('p');
  expect(tree.root.findByType(AppListPanelActionButton).props.disabled).toBe(false);
  await act(async()=>tree.root.findByType(ClientOrderOrganizationPicker).props.onChange('two'));
  expect(points().props.items).toHaveLength(0);
  expect(points().props.selectedGuid).toBeUndefined();
  expect(tree.root.findByType(AppListPanelActionButton).props.disabled).toBe(true);
 });
 test('delivery errors retry only the delivery request without reloading customers',async()=>{
  const w=workspace();w.searchCounterparties.mockResolvedValue({items:[{guid:'c',name:'Клиент'}]});
  w.searchDeliveryAddresses.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({items:[]});
  await act(async()=>{tree=Renderer.create(React.createElement(ClientOrderCustomerStart,{workspace:w,onOpenOrder:jest.fn(),desktop:true}));});
  await act(async()=>jest.advanceTimersByTime(180));
  await act(async()=>tree.root.findAllByType('Box' as any).find(n=>n.props.title==='Клиент')!.props.onClick());
  await act(async()=>jest.advanceTimersByTime(180));
  const points=()=>tree.root.findByType(ClientOrderDeliveryPoints);
  expect(points().props.error).toBe('Не удалось загрузить точки доставки');
  const calls=w.searchCounterparties.mock.calls.length;
  await act(async()=>points().props.onRetry());
  await act(async()=>jest.advanceTimersByTime(180));
  expect(points().props.error).toBe('');
  expect(w.searchDeliveryAddresses).toHaveBeenCalledTimes(2);
  expect(w.searchCounterparties).toHaveBeenCalledTimes(calls);
 });

 test('desktop selects documents immediately and opens them through the existing workspace',async()=>{
  const w=workspace(),open=jest.fn();
  w.searchCounterparties.mockResolvedValue({items:[{guid:'c',name:'Клиент'}]});
  const render=(active=true)=>React.createElement(ClientOrderCustomerStart,{workspace:w,onOpenOrder:open,desktop:true,active});
  await act(async()=>{tree=Renderer.create(render());});
  await act(async()=>jest.advanceTimersByTime(180));
  await act(async()=>tree.root.findAllByType('Box' as any).find(n=>n.props.title==='Клиент')!.props.onClick());
  const docs=()=>tree.root.findByType(ClientOrderCustomerDocuments);
  expect(docs().props.customerName).toBe('Клиент');expect(docs().props.active).toBe(true);
  expect(w.setFilters).toHaveBeenCalled();
  const update=w.setFilters.mock.calls.at(-1)![0];w.filters=update(w.filters);
  w.loadingOrders=true;await act(async()=>tree.update(render()));
  w.loadingOrders=false;w.orders=[{guid:'doc',status:'DRAFT',counterparty:{guid:'c'},organization:{guid:'one'},createdAt:'2026-11-09T00:00:00Z'}];
  await act(async()=>tree.update(render()));
  expect(docs().props.documents.rows.map((x:any)=>x.guid)).toEqual(['doc']);
  await act(async()=>docs().props.onOpen('doc'));
  expect(w.selectOrder).toHaveBeenCalledWith('doc');expect(open).toHaveBeenCalledWith('doc');
  await act(async()=>tree.update(render(false)));await act(async()=>tree.update(render()));
  expect(docs().props.customerName).toBe('Клиент');
 });
 test('new order first reveals delivery selection without creating an incomplete order',async()=>{
  const w=workspace();w.searchCounterparties.mockResolvedValue({items:[{guid:'c',name:'Клиент'}]});
  await act(async()=>{tree=Renderer.create(React.createElement(ClientOrderCustomerStart,{workspace:w,onOpenOrder:jest.fn(),desktop:true}));});
  await act(async()=>jest.advanceTimersByTime(180));
  await act(async()=>tree.root.findAllByType('Box' as any).find(n=>n.props.title==='Клиент')!.props.onClick());
  expect(tree.root.findByType(AppListPanelActionButton).props.disabled).toBe(false);
  await act(async()=>tree.root.findByType(AppListPanelActionButton).props.onPress());
  expect(tree.root.findByType(ClientOrderDeliveryPoints).props.active).toBe(true);
 });
