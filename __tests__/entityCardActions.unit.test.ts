let mockToken='user121';
jest.mock('../utils/tokenService',()=>({getAccessToken:jest.fn(async()=>mockToken)}));
jest.mock('jwt-decode',()=>({jwtDecode:(token:string)=>({userId:Number(token.replace('user',''))})}));
jest.mock('expo-clipboard',()=>({setStringAsync:jest.fn(async()=>true)}));
import * as Clipboard from 'expo-clipboard';
import {getAccessToken} from '../utils/tokenService';
import {copyEntityCardLink} from '../src/features/entityCards/entityCardActions';
import {buildEntityLink,type EntityTarget} from '../src/shared/entityLinks';
const profile:EntityTarget={v:1,source:'app',kind:'user',id:'121'};
const order:EntityTarget={v:1,source:'onec',baseKey:'torg2026',metaType:'Documents',name:'ЗаказКлиента',guid:'12345678-abcd-1234-abcd-123456789abc'};
const scope=()=>({expectedUserId:121,signal:new AbortController().signal});
beforeEach(()=>{jest.clearAllMocks();mockToken='user121';jest.mocked(getAccessToken).mockImplementation(async()=>mockToken);});
test.each([profile,order])('copies only canonical current-card identity: %j',async target=>{
 await copyEntityCardLink(target,scope());expect(Clipboard.setStringAsync).toHaveBeenCalledWith(buildEntityLink(target));
 expect(String(jest.mocked(Clipboard.setStringAsync).mock.calls[0][0])).not.toContain('token=');
});
test('account changes between validation and copying prevent the disclosure',async()=>{
 jest.mocked(getAccessToken).mockResolvedValueOnce('user121').mockResolvedValueOnce('user122');
 await expect(copyEntityCardLink(profile,scope())).rejects.toMatchObject({name:'AbortError'});expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
});
test('invalid identities and cancelled/replaced views never copy',async()=>{
 await expect(copyEntityCardLink({...profile,id:'../secret'},scope())).rejects.toThrow();
 await expect(copyEntityCardLink(profile,{expectedUserId:121,signal:AbortSignal.abort()})).rejects.toMatchObject({name:'AbortError'});
 await expect(copyEntityCardLink(profile,{...scope(),isCurrent:()=>false})).rejects.toMatchObject({name:'AbortError'});
 expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
});
