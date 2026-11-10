jest.mock('expo-file-system/legacy',()=>({cacheDirectory:'file://cache/',getInfoAsync:jest.fn(),makeDirectoryAsync:jest.fn(),createDownloadResumable:jest.fn(),moveAsync:jest.fn(),deleteAsync:jest.fn(),readDirectoryAsync:jest.fn()}));
import * as fs from 'expo-file-system/legacy';
import {downloadAvatarFile,readAvatarFile} from '../src/shared/avatar/avatarStorage';
const task={downloadAsync:jest.fn(),cancelAsync:jest.fn()};
beforeEach(()=>{jest.clearAllMocks();task.downloadAsync.mockResolvedValue({status:200,headers:{'Content-Type':'image/jpeg'}});task.cancelAsync.mockResolvedValue(undefined);(fs.getInfoAsync as jest.Mock).mockResolvedValue({exists:true,isDirectory:false,size:20});(fs.createDownloadResumable as jest.Mock).mockReturnValue(task);(fs.deleteAsync as jest.Mock).mockResolvedValue(undefined);(fs.readDirectoryAsync as jest.Mock).mockResolvedValue([]);});
test('only complete validated download is moved into persistent version key',async()=>{
 const validate=jest.fn(async()=>{});await downloadAvatarFile('one','https://api.test/avatar','private-test-token',new AbortController().signal,validate);
 expect(validate).toHaveBeenCalledTimes(1);expect(fs.moveAsync).toHaveBeenCalledWith({from:expect.stringContaining('.pending-'),to:'file://cache/user-avatars-v1/one'});
 expect(task.cancelAsync).toHaveBeenCalledTimes(1);
});
test('failed HTTP, oversized files and account revocation never become cached photos',async()=>{
 task.downloadAsync.mockResolvedValueOnce({status:404});await expect(downloadAvatarFile('a','https://api.test','t',new AbortController().signal)).rejects.toThrow();
 (fs.getInfoAsync as jest.Mock).mockResolvedValueOnce({exists:true,isDirectory:false,size:20*1024*1024});await expect(downloadAvatarFile('b','https://api.test','t',new AbortController().signal)).rejects.toThrow();
 await expect(downloadAvatarFile('c','https://api.test','t',new AbortController().signal,async()=>{throw Error('revoked');})).rejects.toThrow('revoked');
 expect(fs.moveAsync).not.toHaveBeenCalled();expect(fs.deleteAsync).toHaveBeenCalledTimes(3);
});
test('empty/partial entries are not restored as an avatar',async()=>{
 (fs.getInfoAsync as jest.Mock).mockResolvedValueOnce({exists:true,isDirectory:false,size:0});expect(await readAvatarFile('a')).toBeNull();
 expect(await readAvatarFile('../outside')).toBeNull();
});
