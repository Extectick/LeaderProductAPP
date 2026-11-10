import React,{memo,useContext} from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
jest.mock('@react-native-async-storage/async-storage',()=>({getItem:jest.fn(async()=>null),setItem:jest.fn(async()=>{}),removeItem:jest.fn(async()=>{})}));
jest.mock('../utils/tokenService',()=>({getAccessToken:async()=>null,getRefreshToken:async()=>null,onAuthSessionExpired:()=>()=>{},logout:jest.fn(async()=>{})}));
jest.mock('../utils/userService',()=>({getProfile:jest.fn(async()=>null)}));
jest.mock('../utils/pushNotifications',()=>({unregisterPushToken:jest.fn(async()=>{})}));
jest.mock('../utils/pushRegistration',()=>({startPushTokenRegistration:()=>()=>{}}));
jest.mock('../hooks/usePresenceHeartbeat',()=>({usePresenceHeartbeat:()=>{}}));
jest.mock('../utils/trackingV2Service',()=>({stopTrackingV2:jest.fn(async()=>{})}));
jest.mock('../src/shared/monitoring',()=>({addMonitoringBreadcrumb:jest.fn(),captureException:jest.fn(),setMonitoringUser:jest.fn(async()=>{})}));
import {ThemeContext,ThemeProvider} from '../context/ThemeContext';
import {AuthContext,AuthProvider} from '../context/AuthContext';
import {Colors} from '../constants/Colors';
import {logout} from '../utils/tokenService';

test('navigation rerenders do not invalidate Help theme consumers; real and custom themes still update',async()=>{
  let value!:React.ContextType<typeof ThemeContext>,renders=0,view!:TestRenderer.ReactTestRenderer;
  const Consumer=memo(function Consumer(){value=useContext(ThemeContext);renders++;return null;});
  const tree=()=>React.createElement(ThemeProvider,{children:React.createElement(Consumer)});
  try{
    await act(async()=>{view=TestRenderer.create(tree());});
    const before=value,count=renders;
    await act(async()=>view.update(tree()));
    expect(value).toBe(before);expect(renders).toBe(count);
    await act(async()=>value.setTheme('dark'));
    expect(value.theme).toBe('dark');expect(renders).toBe(count+1);
    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith('@theme','dark');
    await act(async()=>value.addTheme('custom',Colors.dark));
    await act(async()=>value.setTheme('custom'));
    expect(value.theme).toBe('custom');expect(value.themes.custom).toBe(Colors.dark);
    const current=value;
    await act(async()=>value.setTheme('missing'));
    expect(value).toBe(current);
  }finally{if(view)await act(async()=>view.unmount());}
});

test('navigation rerenders do not invalidate Help auth consumers; profile, login and logout remain live',async()=>{
  let value!:NonNullable<React.ContextType<typeof AuthContext>>,renders=0,view!:TestRenderer.ReactTestRenderer;
  const Consumer=memo(function Consumer(){value=useContext(AuthContext)!;renders++;return null;});
  const tree=()=>React.createElement(AuthProvider,{children:React.createElement(Consumer)});
  try{
    await act(async()=>{view=TestRenderer.create(tree());});
    expect(value.isLoading).toBe(false);
    const before=value,count=renders,signOut=value.signOut;
    await act(async()=>view.update(tree()));
    expect(value).toBe(before);expect(renders).toBe(count);
    await act(async()=>{value.setAuthenticated(true);await value.setProfile({id:121,name:'QA'} as any);});
    expect(value.isAuthenticated).toBe(true);expect(value.profile?.id).toBe(121);
    expect(value.signOut).toBe(signOut);
    await act(async()=>signOut());
    expect(logout).toHaveBeenCalledTimes(1);
    expect(value.isAuthenticated).toBe(false);expect(value.profile).toBeNull();
  }finally{if(view)await act(async()=>view.unmount());}
});
