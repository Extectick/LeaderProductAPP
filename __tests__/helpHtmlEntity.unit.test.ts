jest.mock('../src/shared/api/httpClient',()=>({httpRequest:jest.fn()}));
import {httpRequest} from '../src/shared/api/httpClient';
import {helpHtmlEntityTarget,loadHelpHtmlEntityPreview,validateHelpHtmlImageDataUrl} from '../src/features/help/helpHtmlEntity';
const url='leaderproduct://entity/v1/user/121',target={v:1,source:'app',kind:'user',id:'121'} as const;
const png='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10,1,2,3,4]).toString('base64');
beforeEach(()=>jest.clearAllMocks());
test('only canonical entity identities can bind actions',()=>{
 expect(helpHtmlEntityTarget(url)).toEqual(target);
 for(const value of ['https://example.com',url+'?token=secret',url+'/../122','leaderproduct://entity/v1/user/0121'])expect(helpHtmlEntityTarget(value)).toBeNull();
});
test('allows bounded raster data and rejects vectors, spoofed types and remote URLs',()=>{
 expect(validateHelpHtmlImageDataUrl(png)).toBe(png);
 for(const value of ['https://example.com/photo.png','data:image/svg+xml;base64,PHN2Zz4=',png.replace('/png','/jpeg'),png+'!', 'data:image/png;base64,'+'A'.repeat(360000)])expect(()=>validateHelpHtmlImageDataUrl(value)).toThrow();
});
test('uses authenticated current owner transport, validates exact target and raster bytes',async()=>{
 const signal=new AbortController().signal;jest.mocked(httpRequest).mockResolvedValue({ok:true,status:200,data:{target,title:'Сотрудник',imageDataUrl:png}});
 expect(await loadHelpHtmlEntityPreview(url,121,signal)).toEqual({target,title:'Сотрудник',imageDataUrl:png});
 expect(httpRequest).toHaveBeenCalledWith('/entity-links/preview',expect.objectContaining({method:'POST',body:{target},expectedUserId:121,signal,networkRetryCount:0}));
 jest.mocked(httpRequest).mockResolvedValue({ok:true,status:200,data:{target:{...target,id:'122'},title:'Другой'}});
 await expect(loadHelpHtmlEntityPreview(url,121,signal)).rejects.toThrow();
 jest.mocked(httpRequest).mockResolvedValue({ok:false,status:403,data:{target,title:'Сотрудник',imageDataUrl:png}});
 await expect(loadHelpHtmlEntityPreview(url,121,signal)).rejects.toThrow();
});
test('aborted preview never returns image data',async()=>{
 const controller=new AbortController();jest.mocked(httpRequest).mockImplementation(async()=>{controller.abort();return {ok:true,status:200,data:{target,title:'Сотрудник',imageDataUrl:png}};});
 await expect(loadHelpHtmlEntityPreview(url,121,controller.signal)).rejects.toMatchObject({name:'AbortError'});
});
