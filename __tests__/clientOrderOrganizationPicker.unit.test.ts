import React from 'react';
import Renderer,{act} from 'react-test-renderer';
jest.mock('@expo/vector-icons',()=>({Ionicons:'Icon'}));
jest.mock('../context/ThemeContext',()=>({useTheme:()=>({theme:'light'})}));
import {ClientOrderOrganizationPicker} from '../src/features/clientOrders/screen/desktop/ClientOrderOrganizationPicker';
import {AppDesktopDialog} from '../components/ui/AppDesktopDialog';
const organizations=[{guid:'one',name:'Первая организация'},{guid:'two',name:'Вторая организация'}];
let tree:Renderer.ReactTestRenderer;
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());});

test('opens shared dialog, marks current organization and selects once before closing',async()=>{
 const change=jest.fn();
 await act(async()=>{tree=Renderer.create(React.createElement(ClientOrderOrganizationPicker,{organizations,value:organizations[0],onChange:change}));});
 await act(async()=>tree.root.findByProps({testID:'client-orders-organization-picker'}).props.onPress());
 expect(tree.root.findByType(AppDesktopDialog).props.title).toBe('Выберите организацию');
 expect(tree.root.findByProps({testID:'client-orders-organization-one'}).props.accessibilityState.checked).toBe(true);
 await act(async()=>tree.root.findByProps({testID:'client-orders-organization-two'}).props.onPress());
 expect(change).toHaveBeenCalledWith('two');expect(change).toHaveBeenCalledTimes(1);
 expect(tree.root.findAllByType(AppDesktopDialog)).toHaveLength(0);
});

test('current selection and dismissal close without resetting the caller selection',async()=>{
 const change=jest.fn();
 await act(async()=>{tree=Renderer.create(React.createElement(ClientOrderOrganizationPicker,{organizations,value:organizations[0],onChange:change}));});
 await act(async()=>tree.root.findByProps({testID:'client-orders-organization-picker'}).props.onPress());
 await act(async()=>tree.root.findByProps({testID:'client-orders-organization-one'}).props.onPress());
 expect(change).not.toHaveBeenCalled();
 await act(async()=>tree.root.findByProps({testID:'client-orders-organization-picker'}).props.onPress());
 await act(async()=>tree.root.findByType(AppDesktopDialog).props.onClose());
 expect(change).not.toHaveBeenCalled();expect(tree.root.findAllByType(AppDesktopDialog)).toHaveLength(0);
});

test('locking closes a visible picker and prevents reopening',async()=>{
 const change=jest.fn(),render=(disabled=false)=>React.createElement(ClientOrderOrganizationPicker,{organizations,onChange:change,disabled});
 await act(async()=>{tree=Renderer.create(render());});
 await act(async()=>tree.root.findByProps({testID:'client-orders-organization-picker'}).props.onPress());
 await act(async()=>tree.update(render(true)));
 expect(tree.root.findAllByType(AppDesktopDialog)).toHaveLength(0);
 await act(async()=>tree.root.findByProps({testID:'client-orders-organization-picker'}).props.onPress());
 expect(tree.root.findAllByType(AppDesktopDialog)).toHaveLength(0);expect(change).not.toHaveBeenCalled();
});

test('one organization is read-only and an empty catalog has no control',async()=>{
 await act(async()=>{tree=Renderer.create(React.createElement(ClientOrderOrganizationPicker,{organizations:[organizations[0]],onChange:jest.fn()}));});
 expect(tree.root.findAllByProps({testID:'client-orders-organization-picker'})).toHaveLength(0);
 expect(tree.root.findByProps({testID:'client-orders-organization-value'})).toBeDefined();
 await act(async()=>tree.update(React.createElement(ClientOrderOrganizationPicker,{organizations:[],onChange:jest.fn()})));
 expect(tree.toJSON()).toBeNull();
});
