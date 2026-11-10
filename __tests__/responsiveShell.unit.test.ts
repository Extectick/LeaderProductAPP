import React from 'react';
import Renderer,{act} from 'react-test-renderer';

let mockWidth=1440,mockOS='web',mockPath='/services/help',mockMounts=0;
const mockRouter={replace:jest.fn(),push:jest.fn()};
const mockMemory={lastServiceRoute:'/services/help',clearLastServiceRoute:jest.fn(),resolveLastServiceRoute:jest.fn()};
const helpService={id:9,key:'help',name:'Помощь',route:'/services/help',icon:'chatbubbles-outline',gradientStart:'#2563EB',gradientEnd:'#38BDF8',visible:true,enabled:true,kind:'CLOUD'};
let mockAdmin=false,mockCheckingAdmin=false,mockReachable=true,mockDark=false,mockServices:any[]=[helpService];
const mockSaveService=jest.fn();
const mockConfirm=jest.fn((navigate:()=>void)=>{navigate();return true;});
jest.mock('react-native',()=>({View:'View',Text:'Text',Image:'Image',ScrollView:'ScrollView',Pressable:'Pressable',StyleSheet:{create:(value:any)=>value},Platform:{get OS(){return mockOS;}},useWindowDimensions:()=>({width:mockWidth,height:900})}));
jest.mock('expo-router',()=>({
  useRouter:()=>mockRouter,usePathname:()=>mockPath,Redirect:'Redirect',
  Slot:()=>{const React=require('react');const [draft,setDraft]=React.useState('');React.useEffect(()=>{mockMounts++;},[]);return React.createElement('Draft',{value:draft,onChange:setDraft});},
}));
jest.mock('../src/features/navigation/LastServiceRouteContext',()=>({LastServiceRouteProvider:({children}:any)=>children,useOptionalLastServiceRoute:()=>mockMemory,useLastServiceRoute:()=>mockMemory}));
jest.mock('../src/features/navigation/UnsavedChangesContext',()=>({UnsavedChangesProvider:({children}:any)=>children,useOptionalUnsavedChanges:()=>({confirmNavigation:mockConfirm})}));
jest.mock('../components/Navigation/TabBarVisibilityContext',()=>({TabBarVisibilityProvider:({children}:any)=>children}));
jest.mock('../components/Navigation/WebSidebar',()=>({__esModule:true,default:'Sidebar'}));
jest.mock('../hooks/useThemeColor',()=>({useThemeColor:(overrides:any)=>overrides.light??'#18212D'}));
jest.mock('../context/ThemeContext',()=>({useTheme:()=>({theme:mockDark?'dark':'light'})}));
jest.mock('../hooks/useIsAdmin',()=>({useIsAdmin:()=>({isAdmin:mockAdmin,isCheckingAdmin:mockCheckingAdmin})}));
jest.mock('../src/features/services/hooks/useServicesData',()=>({useServicesData:()=>({services:mockServices})}));
jest.mock('../src/shared/network/useServerStatus',()=>({useServerStatus:()=>({isReachable:mockReachable})}));
jest.mock('../src/features/navigation/lastServiceRouteStorage',()=>({saveWebCachedLastServiceRoute:(route:string)=>mockSaveService(route)}));
jest.mock('@expo/vector-icons',()=>({Ionicons:'Icon'}));

import Navigation from '../components/Navigation/Navigation';
import HomeScreen from '../app/(main)/home';
const WebSidebar=jest.requireActual('../components/Navigation/WebSidebar').default;
let tree:Renderer.ReactTestRenderer|undefined;
beforeEach(()=>{jest.clearAllMocks();mockWidth=1440;mockOS='web';mockPath='/services/help';mockMounts=0;mockAdmin=false;mockCheckingAdmin=false;mockReachable=true;mockDark=false;mockServices=[helpService];mockConfirm.mockImplementation(navigate=>{navigate();return true;});});
afterEach(async()=>{if(tree)await act(async()=>tree!.unmount());tree=undefined;});

test('resizing preserves the router outlet and a live draft without navigation retries',async()=>{
  await act(async()=>{tree=Renderer.create(React.createElement(Navigation));});
  await act(async()=>tree!.root.findByType('Draft' as any).props.onChange('Черновик обращения'));
  for(const width of [390,1024,767,768,1440]){
    mockWidth=width;
    await act(async()=>tree!.update(React.createElement(Navigation)));
    expect(tree!.root.findByType('Draft' as any).props.value).toBe('Черновик обращения');
  }
  expect(mockMounts).toBe(1);
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(mockRouter.push).not.toHaveBeenCalled();
});

test('old home bookmarks resolve to the same service catalog',async()=>{
  await act(async()=>{tree=Renderer.create(React.createElement(HomeScreen));});
  expect(tree!.root.findByType('Redirect' as any).props.href).toBe('/services');
});

test('native startup keeps last-service restoration',async()=>{
  mockOS='android';mockPath='/services';
  await act(async()=>{tree=Renderer.create(React.createElement(Navigation));});
  expect(mockRouter.replace).toHaveBeenCalledWith('/services/help');
});

test('sidebar opens Home explicitly and protects unsaved edits',async()=>{
  await act(async()=>{tree=Renderer.create(React.createElement(WebSidebar));});
  mockConfirm.mockReturnValueOnce(false);
  await act(async()=>tree!.root.findByProps({accessibilityLabel:'Главная'}).props.onPress());
  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(mockMemory.clearLastServiceRoute).not.toHaveBeenCalled();
  await act(async()=>mockConfirm.mock.calls[0][0]());
  expect(mockRouter.push).toHaveBeenCalledWith('/services');
  expect(mockMemory.clearLastServiceRoute).toHaveBeenCalledTimes(1);
});

test('Help and admin shortcuts respect their service and role access',async()=>{
  await act(async()=>{tree=Renderer.create(React.createElement(WebSidebar));});
  expect(tree!.root.findAllByProps({accessibilityLabel:'Помощь'})).toHaveLength(1);
  expect(tree!.root.findAllByProps({accessibilityLabel:'Админка'})).toHaveLength(0);
  mockServices=[{...helpService,visible:false}];mockAdmin=true;
  await act(async()=>tree!.update(React.createElement(WebSidebar)));
  expect(tree!.root.findAllByProps({accessibilityLabel:'Помощь'})).toHaveLength(0);
  expect(tree!.root.findAllByProps({accessibilityLabel:'Админка'})).toHaveLength(1);
});

test('medium window forces a compact rail without changing the saved expanded preference',async()=>{
  await act(async()=>{tree=Renderer.create(React.createElement(WebSidebar));});
  await act(async()=>tree!.root.findByProps({accessibilityLabel:'Развернуть меню'}).props.onPress());
  expect(tree!.root.findByProps({testID:'web-sidebar'}).props.style[1].width).toBe(216);
  await act(async()=>tree!.update(React.createElement(WebSidebar,{compact:true})));
  expect(tree!.root.findByProps({testID:'web-sidebar'}).props.style[1].width).toBe(72);
  await act(async()=>tree!.update(React.createElement(WebSidebar,{compact:false})));
  expect(tree!.root.findByProps({testID:'web-sidebar'}).props.style[1].width).toBe(216);
});


test('sidebar mirrors the visible catalog, keeps matching category icons/colors and has one admin entry',async()=>{
  mockAdmin=true;
  mockServices=[helpService,
    {id:1,key:'qrcodes',name:'QR',route:'/services/qrcodes',icon:'qr-code-outline',gradientStart:'#5B21B6',gradientEnd:'#7C3AED',visible:true,enabled:true,kind:'LOCAL'},
    {id:2,key:'stock_balances',name:'Остатки',route:'/services/stock_balances',icon:'cube-outline',visible:true,enabled:false,kind:'CLOUD'},
    {id:3,key:'tasks',name:'Задачи',route:'/tasks',icon:'list-outline',visible:true,enabled:true,kind:'CLOUD'},
    {id:4,key:'tracking',name:'Скрыто',route:'/services/tracking',visible:false,enabled:true,kind:'CLOUD'},
    {id:5,key:'future',name:'Новая версия',route:'/future',visible:true,enabled:true,kind:'LOCAL'},
    {id:6,key:'admin',name:'Дубликат админки',route:'/admin',visible:true,enabled:true,kind:'LOCAL'},
  ];
  await act(async()=>{tree=Renderer.create(React.createElement(WebSidebar));});
  const list=tree!.root.findByProps({testID:'web-sidebar-services'});
  expect(list.findAllByType('Pressable' as any).map(node=>node.props.accessibilityLabel)).toEqual(['Главная','Помощь','QR','Остатки','Задачи','Новая версия']);
  expect(tree!.root.findAllByProps({testID:'sidebar-admin'})).toHaveLength(1);
  expect(tree!.root.findAllByProps({accessibilityLabel:'Скрыто'})).toHaveLength(0);
  const icon=tree!.root.findByProps({testID:'sidebar-icon-qrcodes'}).findByType('Icon' as any);
  expect(icon.props).toMatchObject({name:'qr-code-outline',color:'#5B21B6'});
  expect(tree!.root.findByProps({testID:'sidebar-icon-qrcodes'}).props.style.backgroundColor).toBeUndefined();
  expect(icon.props.dataSet).toBeUndefined();
  const disabled=tree!.root.findByProps({testID:'sidebar-stock_balances'}),unsupported=tree!.root.findByProps({testID:'sidebar-future'});
  expect(disabled.props.disabled).toBe(true);expect(unsupported.props.disabled).toBe(true);
  await act(async()=>{disabled.props.onPress();unsupported.props.onPress();});
  expect(mockRouter.push).not.toHaveBeenCalled();
  const qr=tree!.root.findByProps({testID:'sidebar-qrcodes'});
  await act(async()=>qr.props.onPress());
  expect(mockRouter.push).toHaveBeenCalledWith('/services/qrcodes');expect(mockSaveService).toHaveBeenCalledWith('/services/qrcodes');
  mockCheckingAdmin=true;await act(async()=>tree!.update(React.createElement(WebSidebar)));
  expect(tree!.root.findAllByProps({testID:'sidebar-admin'})).toHaveLength(0);
});

test('offline web service navigation respects LOCAL capability without granting disabled or hidden access',async()=>{
  mockReachable=false;
  mockServices=[helpService,{...helpService,id:1,key:'qrcodes',name:'QR',route:'/services/qrcodes',kind:'LOCAL'}];
  await act(async()=>{tree=Renderer.create(React.createElement(WebSidebar));});
  const help=tree!.root.findByProps({testID:'sidebar-help'}),qr=tree!.root.findByProps({testID:'sidebar-qrcodes'});
  expect(help.props.disabled).toBe(true);expect(qr.props.disabled).toBe(false);
  await act(async()=>help.props.onPress());expect(mockRouter.push).not.toHaveBeenCalled();
  await act(async()=>qr.props.onPress());expect(mockRouter.push).toHaveBeenCalledWith('/services/qrcodes');
});

test('collapsed sidebar labels appear immediately for hover and keyboard focus, then dismiss on scroll or expansion',async()=>{
  await act(async()=>{tree=Renderer.create(React.createElement(WebSidebar));});
  const help=()=>tree!.root.findByProps({testID:'sidebar-help'}),event={currentTarget:{getBoundingClientRect:()=>({right:60,top:160,height:48})}};
  await act(async()=>help().props.onHoverIn(event));
  const tooltip=()=>tree!.root.findByProps({testID:'web-sidebar-tooltip'});
  expect(tooltip().props.style).toMatchObject({position:'fixed',left:68,top:166});
  expect(tooltip().props.pointerEvents).toBe('none');expect(tooltip().findByType('Text' as any).props.children).toBe('Помощь');
  await act(async()=>help().props.onHoverOut());expect(tree!.root.findAllByProps({testID:'web-sidebar-tooltip'})).toHaveLength(0);
  await act(async()=>help().props.onFocus(event));expect(tooltip()).toBeTruthy();
  await act(async()=>tree!.root.findByProps({testID:'web-sidebar-services'}).props.onScroll());
  expect(tree!.root.findAllByProps({testID:'web-sidebar-tooltip'})).toHaveLength(0);
  await act(async()=>help().props.onFocus(event));
  await act(async()=>tree!.root.findByProps({accessibilityLabel:'Развернуть меню'}).props.onPress());
  expect(tree!.root.findAllByProps({testID:'web-sidebar-tooltip'})).toHaveLength(0);
  await act(async()=>help().props.onHoverIn(event));
  expect(tree!.root.findAllByProps({testID:'web-sidebar-tooltip'})).toHaveLength(0);
});
