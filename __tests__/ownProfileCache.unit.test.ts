import AsyncStorage from '@react-native-async-storage/async-storage';
import type {Profile} from '@/src/entities/user/types';
import {acceptOwnProfile,beginOwnProfileMutation,commitOwnProfileMutation,currentOwnProfile,isCurrentOwnProfile,ownProfileFence,persistOwnProfile,readOwnProfile,resetOwnProfileSession} from '../src/features/profile/model/ownProfileCache';
const profile=(id:number,avatar:string|null)=>({id,avatarUrl:avatar,avatarAssetUrl:avatar} as Profile);
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return{promise,resolve};};
beforeEach(async()=>{resetOwnProfileSession();await persistOwnProfile(null);jest.clearAllMocks();jest.useFakeTimers();jest.setSystemTime(1000);});
afterEach(()=>jest.useRealTimers());
test('deduplicates parallel mounts and reuses fresh metadata; explicit refresh bypasses cooldown',async()=>{
 const wait=deferred<Profile>(),request=jest.fn().mockReturnValueOnce(wait.promise).mockResolvedValue(profile(1,'v2'));
 const a=readOwnProfile(request),b=readOwnProfile(request);expect(request).toHaveBeenCalledTimes(1);
 wait.resolve(profile(1,'v1'));expect(await a).toBe(await b);
 await readOwnProfile(request);expect(request).toHaveBeenCalledTimes(1);
 expect((await readOwnProfile(request,true))?.avatarUrl).toBe('v2');expect(request).toHaveBeenCalledTimes(2);
 jest.setSystemTime(32000);await readOwnProfile(request);expect(request).toHaveBeenCalledTimes(3);
});
test('an old read cannot overwrite a completed avatar upload in memory or persistent storage',async()=>{
 const wait=deferred<Profile>();const read=readOwnProfile(()=>wait.promise);
 const uploaded=profile(1,'new');await commitOwnProfileMutation(uploaded,beginOwnProfileMutation());
 wait.resolve(profile(1,'old'));expect(await read).toBe(uploaded);
 expect(currentOwnProfile()).toBe(uploaded);
 expect(JSON.parse((await AsyncStorage.getItem('profile'))!).avatarUrl).toBe('new');
});
test('late response after logout and login to the same account is discarded',async()=>{
 const wait=deferred<Profile>();const read=readOwnProfile(()=>wait.promise);
 resetOwnProfileSession();const loggedIn=profile(1,'new-session');acceptOwnProfile(loggedIn,true);await persistOwnProfile(loggedIn);
 wait.resolve(profile(1,'old-session'));expect(await read).toBeNull();
 expect(currentOwnProfile()).toBe(loggedIn);
 expect(JSON.parse((await AsyncStorage.getItem('profile'))!).avatarUrl).toBe('new-session');
});
test('mutation response from another account cannot enter the new account cache',async()=>{
 const fence=beginOwnProfileMutation();resetOwnProfileSession();const current=profile(2,'other');acceptOwnProfile(current,true);
 expect(await commitOwnProfileMutation(profile(1,'old'),fence)).toBeNull();expect(currentOwnProfile()).toBe(current);
});
test('known old objects cannot be reapplied by a late React continuation; explicit null removes photo',async()=>{
 const old=profile(1,'old');acceptOwnProfile(old,true);
 const removed=profile(1,null);await commitOwnProfileMutation(removed,beginOwnProfileMutation());
 expect(isCurrentOwnProfile(old)).toBe(false);expect(acceptOwnProfile(old)).toBe(false);
 expect((await readOwnProfile(jest.fn()))?.avatarAssetUrl).toBeNull();
});
test('offline failure does not clear the cached identity or image',async()=>{
 const value=profile(1,'cached');acceptOwnProfile(value,true);await persistOwnProfile(value);
 await expect(readOwnProfile(async()=>{throw Error('offline');},true)).rejects.toThrow('offline');
 expect(currentOwnProfile()).toBe(value);expect(JSON.parse((await AsyncStorage.getItem('profile'))!).avatarUrl).toBe('cached');
});
test('queued storage commits preserve the newest profile and logout removes a pending write',async()=>{
 const wait=deferred<void>(),setter=jest.spyOn(AsyncStorage,'setItem');setter.mockImplementationOnce(async()=>wait.promise);
 const old=profile(1,'old');acceptOwnProfile(old);const writing=persistOwnProfile(old);await Promise.resolve();
 resetOwnProfileSession();const clearing=persistOwnProfile(null);wait.resolve();await Promise.all([writing,clearing]);
 expect(await AsyncStorage.getItem('profile')).toBeNull();setter.mockRestore();
});

test('a full local cache does not turn a successful server photo update into a failed upload',async()=>{
 const setter=jest.spyOn(AsyncStorage,'setItem').mockRejectedValueOnce(new Error('quota'));
 const uploaded=profile(1,'uploaded');
 expect(await commitOwnProfileMutation(uploaded,beginOwnProfileMutation())).toBe(uploaded);
 expect(currentOwnProfile()).toBe(uploaded);setter.mockRestore();
});
