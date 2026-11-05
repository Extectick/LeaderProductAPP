let mockToken='user121';
jest.mock('../utils/config',()=>({API_BASE_URL:'https://example.test'}));
jest.mock('../utils/apiClient',()=>({apiClient:jest.fn()}));
jest.mock('../utils/tokenService',()=>({getAccessTokenForRequest:jest.fn(async()=>mockToken),getAccessToken:jest.fn(async()=>mockToken),refreshToken:jest.fn(async()=>mockToken)}));
jest.mock('jwt-decode',()=>({jwtDecode:(token:string)=>({userId:Number(token.replace('user',''))})}));
import {loadHelpAttachmentText,type HelpAttachment} from '../src/features/help/helpApi';
import {refreshToken} from '../utils/tokenService';
const file:HelpAttachment={id:'attachment',kind:'FILE',name:'example.help-html.json',mimeType:'application/vnd.leaderproduct.help-html+json',size:100,url:'/help/attachments/attachment'};
const response=(text='{}',status=200,length?:number)=>({ok:status===200,status,headers:{get:()=>length===undefined?null:String(length)},text:jest.fn(async()=>text)}) as any;
beforeEach(()=>{mockToken='user121';jest.clearAllMocks();});
test('uses private attachment path with account token and refreshes one expired token',async()=>{
 jest.mocked(fetch).mockResolvedValueOnce(response('',401)).mockResolvedValueOnce(response('{"version":1}'));
 const signal=new AbortController().signal;
 await expect(loadHelpAttachmentText(file,121,signal,192*1024)).resolves.toBe('{"version":1}');
 expect(refreshToken).toHaveBeenCalledTimes(1);
 expect(fetch).toHaveBeenCalledWith('https://example.test/help/attachments/attachment',expect.objectContaining({headers:{Authorization:'Bearer user121'},signal:expect.any(AbortSignal)}));
});
test('foreign source and mismatching expected account never receive a fetch',async()=>{
 await expect(loadHelpAttachmentText({...file,url:'https://foreign.test/help/attachments/attachment'},121,new AbortController().signal,1000)).rejects.toThrow();
 await expect(loadHelpAttachmentText(file,122,new AbortController().signal,1000)).rejects.toMatchObject({code:'HELP_ACCOUNT_CHANGED'});
 expect(fetch).not.toHaveBeenCalled();
});
test('account change during body read rejects the private data',async()=>{
 const result=response();result.text.mockImplementation(async()=>{mockToken='user122';return '{"private":"old"}';});
 jest.mocked(fetch).mockResolvedValueOnce(result);
 await expect(loadHelpAttachmentText(file,121,new AbortController().signal,1000)).rejects.toMatchObject({code:'HELP_ACCOUNT_CHANGED'});
});
test('oversized metadata or response is rejected before reading body',async()=>{
 await expect(loadHelpAttachmentText({...file,size:1001},121,new AbortController().signal,1000)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();
 const result=response('',200,1001);jest.mocked(fetch).mockResolvedValueOnce(result);
 await expect(loadHelpAttachmentText(file,121,new AbortController().signal,1000)).rejects.toMatchObject({code:'HELP_HTML_INVALID'});expect(result.text).not.toHaveBeenCalled();
});
test('aborted requests cannot deliver a completed response',async()=>{
 const controller=new AbortController();jest.mocked(fetch).mockImplementationOnce(async()=>{controller.abort();return response();});
 await expect(loadHelpAttachmentText(file,121,controller.signal,1000)).rejects.toMatchObject({name:'AbortError'});
});
