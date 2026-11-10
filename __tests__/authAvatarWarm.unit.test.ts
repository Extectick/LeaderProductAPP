import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
jest.mock('@/src/shared/avatar/avatarSource',()=>({primeOwnAvatar:jest.fn(),clearAvatarMemory:jest.fn()}));
jest.mock('@/utils/tokenService',()=>({getAccessToken:jest.fn(),getRefreshToken:jest.fn(),handleBackendUnavailable:jest.fn(),hasAuthSessionExpired:jest.fn(),logout:jest.fn(),onAuthSessionExpired:jest.fn(()=>()=>{}),refreshToken:jest.fn()}));
jest.mock('@/utils/userService',()=>({getProfile:jest.fn()}));
jest.mock('jwt-decode',()=>({jwtDecode:()=>({exp:9999999999})}));
jest.mock('@/utils/pushNotifications',()=>({unregisterPushToken:jest.fn()}));
jest.mock('@/utils/pushRegistration',()=>({startPushTokenRegistration:jest.fn(()=>()=>{})}));
jest.mock('@/utils/trackingV2Service',()=>({stopTrackingV2:jest.fn()}));
jest.mock('@/hooks/usePresenceHeartbeat',()=>({usePresenceHeartbeat:jest.fn()}));
jest.mock('@/src/shared/monitoring',()=>({addMonitoringBreadcrumb:jest.fn(),captureException:jest.fn(),setMonitoringUser:jest.fn()}));
import {AuthProvider,AuthContext} from '@/context/AuthContext';
import {primeOwnAvatar,clearAvatarMemory} from '@/src/shared/avatar/avatarSource';
import {getAccessToken,getRefreshToken,hasAuthSessionExpired,logout,onAuthSessionExpired,refreshToken,handleBackendUnavailable} from '@/utils/tokenService';
import {resetOwnProfileSession,persistOwnProfile} from '@/src/features/profile/model/ownProfileCache';
let context:any,screen:TestRenderer.ReactTestRenderer|undefined;
function Consumer(){context=React.useContext(AuthContext);return null;}
const cached={id:1,avatarAssetUrl:'/users/1/avatars/USER/synthetic',firstName:'Test'};
beforeEach(async()=>{
 jest.clearAllMocks();resetOwnProfileSession();await persistOwnProfile(null);await AsyncStorage.setItem('profile',JSON.stringify(cached));
 (getAccessToken as jest.Mock).mockResolvedValue('token');(getRefreshToken as jest.Mock).mockResolvedValue('refresh');(hasAuthSessionExpired as jest.Mock).mockReturnValue(false);(primeOwnAvatar as jest.Mock).mockResolvedValue(undefined);
 (refreshToken as jest.Mock).mockReset();(handleBackendUnavailable as jest.Mock).mockReset();
});
afterEach(async()=>{if(screen)await act(async()=>screen!.unmount());screen=undefined;});
const mount=async()=>{await act(async()=>{screen=TestRenderer.create(React.createElement(AuthProvider,null,React.createElement(Consumer)));});};
test('warms local avatar before exposing the restored profile and does not warm on ordinary updates',async()=>{
 let finish!:()=>void;(primeOwnAvatar as jest.Mock).mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));
 await mount();expect(primeOwnAvatar).toHaveBeenCalledWith(cached);expect(context.isLoading).toBe(true);expect(context.profile).toBeNull();
 await act(async()=>finish());expect(context.isLoading).toBe(false);expect(context.profile.id).toBe(1);expect(context.isAuthenticated).toBe(true);
 await act(async()=>context.setProfile({...cached,firstName:'Updated'}));expect(primeOwnAvatar).toHaveBeenCalledTimes(1);
});
test('session invalidation during local warm cannot resurrect the cached profile',async()=>{
 let finish!:()=>void;(primeOwnAvatar as jest.Mock).mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));
 await mount();resetOwnProfileSession();(hasAuthSessionExpired as jest.Mock).mockReturnValue(true);
 await act(async()=>finish());expect(context.profile).toBeNull();expect(context.isAuthenticated).toBe(false);expect(context.isLoading).toBe(false);
});
test('session invalidation during cached-profile persistence cannot authenticate the expired session',async()=>{
 const storageWrite=jest.mocked(AsyncStorage.setItem).getMockImplementation()!;
 let finish!:()=>Promise<void>;
 jest.mocked(AsyncStorage.setItem).mockImplementationOnce((key,value)=>new Promise<void>(resolve=>{
  finish=async()=>{await storageWrite(key,value);resolve();};
 }));
 await mount();
 expect(primeOwnAvatar).toHaveBeenCalledWith(cached);
 expect(finish).toBeDefined();expect(context.isLoading).toBe(true);
 // Token invalidation resets the session before waiting for storage cleanup.
 // The previous profile write may finish before the expiry notification.
 resetOwnProfileSession();(hasAuthSessionExpired as jest.Mock).mockReturnValue(true);
 await act(async()=>{await finish();});
 expect(context.isAuthenticated).toBe(false);
 const expired=jest.mocked(onAuthSessionExpired).mock.calls.at(-1)![0];
 await act(async()=>{expired({reason:'invalid_refresh',status:403,at:Date.now()});});
 expect(context.profile).toBeNull();expect(context.isLoading).toBe(false);
});
test('expiry during the offline check cannot reauthenticate the cached profile',async()=>{
 (getAccessToken as jest.Mock).mockResolvedValue(null);
 (refreshToken as jest.Mock).mockResolvedValue(null);
 let finish!:()=>void;
 (handleBackendUnavailable as jest.Mock).mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));
 await mount();expect(finish).toBeDefined();
 resetOwnProfileSession();(hasAuthSessionExpired as jest.Mock).mockReturnValue(true);
 const expired=jest.mocked(onAuthSessionExpired).mock.calls.at(-1)![0];
 await act(async()=>{expired({reason:'invalid_refresh',status:403,at:Date.now()});finish();});
 expect(context.isAuthenticated).toBe(false);expect(context.profile).toBeNull();expect(context.isLoading).toBe(false);
});
test('a late refresh from startup cannot clear a newly signed-in session',async()=>{
 await AsyncStorage.removeItem('profile');(getAccessToken as jest.Mock).mockResolvedValue(null);
 let finish!:(value:null)=>void;
 (refreshToken as jest.Mock).mockImplementationOnce(()=>new Promise<null>(resolve=>{finish=resolve;}));
 await mount();expect(finish).toBeDefined();
 const signedIn={...cached,id:2,firstName:'New account'};
 await act(async()=>{resetOwnProfileSession();await context.setProfile(signedIn);context.setAuthenticated(true);});
 await act(async()=>{finish(null);});
 expect(context.isAuthenticated).toBe(true);expect(context.profile).toEqual(signedIn);
 expect(handleBackendUnavailable).not.toHaveBeenCalled();expect(context.isLoading).toBe(false);
});
test('manual sign out clears in-memory avatar before clearing authentication',async()=>{
 await mount();await act(async()=>context.signOut());
 expect(clearAvatarMemory).toHaveBeenCalledTimes(1);expect((clearAvatarMemory as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((logout as jest.Mock).mock.invocationCallOrder[0]);
 expect(context.isAuthenticated).toBe(false);expect(context.profile).toBeNull();
});
