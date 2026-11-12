jest.mock('@/utils/apiClient',()=>({apiClient:jest.fn()}));
import AsyncStorage from '@react-native-async-storage/async-storage';
import {apiClient} from '@/utils/apiClient';
import {getProfile,getProfileById,uploadProfileAvatar,createProfile} from '@/utils/userService';
import {persistOwnProfile,resetOwnProfileSession} from '@/src/features/profile/model/ownProfileCache';
const api=apiClient as jest.Mock;
let old:{id:number;avatarUrl:string;avatarAssetUrl:string},updated:typeof old;
beforeEach(async()=>{resetOwnProfileSession();await persistOwnProfile(null);jest.clearAllMocks();api.mockReset();old={id:1,avatarUrl:'old-signed-url',avatarAssetUrl:'/users/1/avatars/EMPLOYEE/old'};updated={...old,avatarUrl:'new-signed-url',avatarAssetUrl:'/users/1/avatars/EMPLOYEE/new'};});
test('home and profile entry share HTTP and explicit refresh asks for new metadata',async()=>{
 let resolve!:(value:unknown)=>void;api.mockReturnValueOnce(new Promise(r=>{resolve=r;}));
 const home=getProfile(),screen=getProfileById();expect(api).toHaveBeenCalledTimes(1);
 resolve({ok:true,data:{profile:old}});expect(await home).toEqual(old);expect(await screen).toEqual(old);
 await getProfileById();expect(api).toHaveBeenCalledTimes(1);
 api.mockResolvedValueOnce({ok:true,data:{profile:updated}});expect(await getProfileById(undefined,{force:true})).toEqual(updated);expect(api).toHaveBeenCalledTimes(2);
});
test('upload result wins over a read started before the photo changed',async()=>{
 let resolve!:(value:unknown)=>void;api.mockReturnValueOnce(new Promise(r=>{resolve=r;}));
 const background=getProfile();api.mockResolvedValueOnce({ok:true,data:{profile:updated}});
 expect(await uploadProfileAvatar('EMPLOYEE',{uri:'file:///avatar.jpg'})).toEqual(updated);
 resolve({ok:true,data:{profile:old}});expect(await background).toEqual(updated);
 expect(JSON.parse((await AsyncStorage.getItem('profile'))!).avatarAssetUrl).toBe(updated.avatarAssetUrl);
});
test('other users never enter the own-profile cache',async()=>{
 api.mockResolvedValueOnce({ok:true,data:{profile:old}});await getProfile();
 api.mockResolvedValueOnce({ok:true,data:{profile:{...updated,id:2}}});await getProfileById(2);
 expect(await getProfile()).toEqual(old);expect(JSON.parse((await AsyncStorage.getItem('profile'))!).id).toBe(1);
});

test('creating a profile cannot reuse an older in-flight read as its post-write refresh',async()=>{
 let finish!:(value:unknown)=>void;api.mockReturnValueOnce(new Promise(r=>{finish=r;}));
 const before=getProfile();api.mockResolvedValueOnce({ok:true}).mockResolvedValueOnce({ok:true,data:{profile:updated}});
 expect(await createProfile('EMPLOYEE',{} as any)).toEqual(updated);expect(api).toHaveBeenCalledTimes(3);
 finish({ok:true,data:{profile:old}});expect(await before).toEqual(updated);
});
