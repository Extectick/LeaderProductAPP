import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {Platform} from 'react-native';

const mockRouter={replace:jest.fn(),back:jest.fn(),push:jest.fn(),canGoBack:jest.fn()};
const mockMemory={lastServiceRoute:'/services/help',clearLastServiceRoute:jest.fn(),resolveLastServiceRoute:jest.fn()};
let mockPath='/admin',mockModel:any={loading:false,error:null,reload:jest.fn()};
jest.mock('expo-router',()=>({useRouter:()=>mockRouter,usePathname:()=>mockPath,Slot:'Slot',Redirect:'Redirect'}));
jest.mock('../hooks/useIsAdmin',()=>({useIsAdmin:()=>({isAdmin:true,isCheckingAdmin:false})}));
jest.mock('../context/AuthContext',()=>({AuthContext:require('react').createContext({profile:{id:1,firstName:'Анна'}})}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpTheme:()=>({background:'#fff'})}));
jest.mock('../src/features/admin/redesign/LiveAdminProvider',()=>({LiveAdminProvider:({children}:any)=>children}));
jest.mock('../src/features/admin/redesign/AdminDataContext',()=>({useAdminData:()=>mockModel}));
jest.mock('../src/features/admin/redesign/AdminDirectory',()=>({__esModule:true,default:'AdminDirectory'}));
jest.mock('../src/features/admin/redesign/AdminDesignPrimitives',()=>({DesignButton:'DesignButton'}));
jest.mock('../src/features/navigation/LastServiceRouteContext',()=>({LastServiceRouteProvider:({children}:any)=>children,useOptionalLastServiceRoute:()=>mockMemory}));
jest.mock('../src/features/navigation/UnsavedChangesContext',()=>({UnsavedChangesProvider:({children}:any)=>children}));
jest.mock('../components/Navigation/TabBarVisibilityContext',()=>({TabBarVisibilityProvider:({children}:any)=>children}));
jest.mock('../components/Navigation/MobileTabs',()=>({__esModule:true,default:()=>null}));
jest.mock('../components/Navigation/WebSidebar',()=>({__esModule:true,default:()=>null}));
import AdminScreen from '../src/features/admin/screen/AdminScreen';
import Navigation from '../components/Navigation/Navigation';

let tree:Renderer.ReactTestRenderer|undefined;
beforeEach(()=>{jest.clearAllMocks();mockPath='/admin';mockModel={loading:false,error:null,reload:jest.fn()};mockMemory.resolveLastServiceRoute.mockResolvedValue('/services/help');});
afterEach(async()=>{if(tree)await act(async()=>tree!.unmount());tree=undefined;jest.restoreAllMocks();});

test.each([true,false])('admin exit opens the catalogue even with previous Help history (%s)',async canGoBack=>{
  mockRouter.canGoBack.mockReturnValue(canGoBack);
  await act(async()=>{tree=Renderer.create(React.createElement(AdminScreen));});
  await act(async()=>tree!.root.findByType('AdminDirectory' as any).props.onExit());
  expect(mockMemory.clearLastServiceRoute).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).toHaveBeenCalledWith('/services');
  expect(mockRouter.back).not.toHaveBeenCalled();
  expect(mockMemory.clearLastServiceRoute.mock.invocationCallOrder[0]).toBeLessThan(mockRouter.replace.mock.invocationCallOrder[0]);
});

test('returning from a failed admin load also clears the remembered service',async()=>{
  mockModel.error='Сеть недоступна';
  await act(async()=>{tree=Renderer.create(React.createElement(AdminScreen));});
  await act(async()=>tree!.root.findByProps({label:'Вернуться к сервисам'}).props.onPress());
  expect(mockMemory.clearLastServiceRoute).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).toHaveBeenCalledWith('/services');
});

test.each(['/admin','/(main)/admin/','/admin/users'])('web return from %s stays in the catalogue despite stale Help memory',async path=>{
  jest.replaceProperty(Platform,'OS','web');mockPath=path;
  await act(async()=>{tree=Renderer.create(React.createElement(Navigation));});
  mockPath='/services';
  await act(async()=>tree!.update(React.createElement(Navigation)));
  expect(mockMemory.clearLastServiceRoute).toHaveBeenCalledTimes(1);
  expect(mockMemory.resolveLastServiceRoute).not.toHaveBeenCalled();
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

test('ordinary web service-tab restore still works outside the admin return',async()=>{
  jest.replaceProperty(Platform,'OS','web');mockPath='/profile';
  await act(async()=>{tree=Renderer.create(React.createElement(Navigation));});
  mockPath='/services';
  await act(async()=>tree!.update(React.createElement(Navigation)));
  expect(mockRouter.replace).toHaveBeenCalledWith('/services/help');
});
