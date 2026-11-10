jest.mock('@/utils/config',()=>({API_BASE_URL:'https://api.example.test'}));
jest.mock('@/utils/tokenService',()=>({getAccessToken:jest.fn(),getAccessTokenForRequest:jest.fn(),refreshToken:jest.fn(),onAuthSessionExpired:jest.fn()}));
jest.mock('jwt-decode',()=>({jwtDecode:(token:string)=>({userId:token==='two'?2:token==='one'?1:0})}));
jest.mock('@/src/shared/avatar/avatarStorage',()=>({readAvatarFile:jest.fn(),downloadAvatarFile:jest.fn(),removeAvatarFile:jest.fn()}));
import {avatarAsset,loadAvatar,peekAvatar,clearAvatarMemory} from '../src/shared/avatar/avatarSource';
import {getAccessToken,getAccessTokenForRequest,refreshToken} from '../utils/tokenService';
import {readAvatarFile,downloadAvatarFile,removeAvatarFile} from '../src/shared/avatar/avatarStorage';
const uri='/users/1/avatars/EMPLOYEE/'+'a'.repeat(64);
beforeEach(()=>{clearAvatarMemory();jest.clearAllMocks();(getAccessToken as jest.Mock).mockResolvedValue('one');(getAccessTokenForRequest as jest.Mock).mockResolvedValue('one');(readAvatarFile as jest.Mock).mockResolvedValue(null);(downloadAvatarFile as jest.Mock).mockResolvedValue('file://avatar');});
test('unchanged revision and concurrent Home/Profile consumers download only once',async()=>{
 const [a,b]=await Promise.all([loadAvatar(uri,1),loadAvatar(uri,1)]);expect(a).toBe(b);
 expect(await loadAvatar(uri,1)).toBe(a);expect(peekAvatar(uri,1)).toBe(a);
 expect(downloadAvatarFile).toHaveBeenCalledTimes(1);
});
test('restart restores disk cache without a download and new revision loads new bytes',async()=>{
 (readAvatarFile as jest.Mock).mockResolvedValueOnce('file://persisted');
 expect((await loadAvatar(uri,1))?.uri).toBe('file://persisted');expect(downloadAvatarFile).not.toHaveBeenCalled();
 await loadAvatar(uri.replace(/a{64}$/,'b'.repeat(64)),1);expect(downloadAvatarFile).toHaveBeenCalledTimes(1);
});
test('viewer and environment are part of cache identity; account change rejects late result',async()=>{
 let finish!:(value:string)=>void;(downloadAvatarFile as jest.Mock).mockImplementation(()=>new Promise(r=>{finish=r;}));
 const pending=loadAvatar(uri,1);for(let i=0;i<12;i++)await Promise.resolve();
 (getAccessToken as jest.Mock).mockResolvedValue('two');finish('file://old');
 expect(await pending).toBeNull();expect(peekAvatar(uri,2)).toBeNull();
 expect(avatarAsset(uri,1)?.key).not.toBe(avatarAsset(uri,2)?.key);
});
test('never attaches app credentials to external/legacy URLs or malformed asset paths',async()=>{
 for(const value of ['https://other.test'+uri,'https://api.example.test.evil.test'+uri,'https://u:p@api.example.test'+uri,uri+'?redirect=elsewhere',uri.replace('/1/','/../1/')])expect(avatarAsset(value,1)).toBeNull();
 expect(await loadAvatar('https://cdn.test/photo.jpg',1)).toEqual({uri:'https://cdn.test/photo.jpg'});
 expect(getAccessTokenForRequest).not.toHaveBeenCalled();expect(downloadAvatarFile).not.toHaveBeenCalled();
});
test('expired token retries once; repeated failures are not downloaded on every remount',async()=>{
 (downloadAvatarFile as jest.Mock).mockRejectedValue(Object.assign(Error(),{status:401}));(refreshToken as jest.Mock).mockResolvedValue('one');
 expect(await loadAvatar(uri,1)).toBeNull();expect(downloadAvatarFile).toHaveBeenCalledTimes(2);
 await loadAvatar(uri,1);expect(downloadAvatarFile).toHaveBeenCalledTimes(2);expect(refreshToken).toHaveBeenCalledTimes(1);
});
test('corrupt decoded image can explicitly discard only its version and reload',async()=>{
 await loadAvatar(uri,1);await loadAvatar(uri,1,true);
 expect(removeAvatarFile).toHaveBeenCalledWith(avatarAsset(uri,1)!.key);
 expect(downloadAvatarFile).toHaveBeenCalledTimes(2);
});
