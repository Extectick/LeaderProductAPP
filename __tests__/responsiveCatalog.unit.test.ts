import React from 'react';
import Renderer,{act} from 'react-test-renderer';

const mockPush=jest.fn(),mockLoad=jest.fn(),mockCache=jest.fn();
let mockWidth=1440;
const mockServices=[
  {id:1,key:'qrcodes',name:'QR генератор',route:'/services/qrcodes',visible:true,enabled:true,kind:'LOCAL'},
  {id:2,key:'help',name:'Помощь',route:'/services/help',visible:true,enabled:true,kind:'LOCAL'},
  {id:3,key:'appeals',name:'Обращения',route:'/services/appeals',visible:false,enabled:true,kind:'LOCAL'},
  {id:4,key:'stock_balances',name:'Остатки',route:'/services/stock_balances',visible:true,enabled:false,kind:'LOCAL'},
];
jest.mock('react-native',()=>({View:'View',Text:'Text',Pressable:'Pressable',FlatList:'FlatList',ScrollView:'ScrollView',StyleSheet:{create:(value:any)=>value},Platform:{OS:'web'},useWindowDimensions:()=>({width:mockWidth,height:900})}));
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush}),useFocusEffect:(callback:any)=>require('react').useEffect(callback,[callback])}));
jest.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({top:0,bottom:0})}));
jest.mock('../components/ui/AppScreenBlur',()=>({ScreenBlurTarget:'Screen'}));
jest.mock('../context/NotificationViewportContext',()=>({useNotificationViewport:()=>({headerBottomOffset:0})}));
jest.mock('../hooks/useIsAdmin',()=>({useIsAdmin:()=>({isAdmin:false,isCheckingAdmin:false})}));
jest.mock('../hooks/useThemeColor',()=>({useThemeColor:()=> '#18212D'}));
jest.mock('../context/ThemeContext',()=>({useTheme:()=>({theme:'light'})}));
jest.mock('../src/shared/network/useServerStatus',()=>({useServerStatus:()=>({isReachable:true})}));
jest.mock('../src/features/services/hooks/useServicesData',()=>({useServicesData:()=>({services:mockServices,loading:false,error:null,loadServices:mockLoad})}));
jest.mock('../src/features/navigation/lastServiceRouteStorage',()=>({saveWebCachedLastServiceRoute:(route:string)=>mockCache(route)}));
jest.mock('../src/features/services/ui/ServiceStateViews',()=>({ServicesEmptyView:'Empty',ServicesLoadingView:'Loading',ServicesErrorView:'Error'}));
jest.mock('@expo/vector-icons',()=>({Ionicons:'Icon'}));

import ServicesCatalogScreen from '../src/features/services/ui/ServicesCatalogScreen';
let tree:Renderer.ReactTestRenderer|undefined;
beforeEach(()=>{jest.clearAllMocks();mockWidth=1440;});
afterEach(async()=>{if(tree)await act(async()=>tree!.unmount());tree=undefined;});

test('catalog reflows by actual pane width and retains mounted row state',async()=>{
  await act(async()=>{tree=Renderer.create(React.createElement(ServicesCatalogScreen));});
  const screen=tree!.root.findByType('Screen' as any);
  const help=()=>tree!.root.findByProps({accessibilityLabel:'Помощь'});
  await act(async()=>help().props.onHoverIn());
  expect(tree!.root.findByProps({testID:'services-cell-help'}).props.style.width).toBe('50%');
  await act(async()=>screen.props.onLayout({nativeEvent:{layout:{width:820}}}));
  expect(tree!.root.findByProps({testID:'services-cell-help'}).props.style.width).toBe('100%');
  expect(help().props.style({pressed:false})[1].backgroundColor).not.toBe('transparent');
  await act(async()=>screen.props.onLayout({nativeEvent:{layout:{width:1020}}}));
  expect(tree!.root.findByProps({testID:'services-cell-help'}).props.style.width).toBe('50%');
  expect(help().props.style({pressed:false})[1].backgroundColor).not.toBe('transparent');
  expect(mockPush).not.toHaveBeenCalled();
});

test('Help is first while hidden, disabled and separate business services keep their access rules',async()=>{
  await act(async()=>{tree=Renderer.create(React.createElement(ServicesCatalogScreen));});
  const rows=tree!.root.findAllByType('Pressable' as any);
  expect(rows.map(row=>row.props.accessibilityLabel)).toEqual(['Помощь','QR генератор','Остатки']);
  expect(rows[2].props.disabled).toBe(true);
  await act(async()=>rows[2].props.onPress());
  expect(mockPush).not.toHaveBeenCalled();
  await act(async()=>rows[0].props.onPress());
  expect(mockPush).toHaveBeenCalledWith('/services/help');
  expect(mockCache).toHaveBeenCalledWith('/services/help');
});
