let mockToken='user121';
jest.mock('../utils/tokenService',()=>({getAccessToken:jest.fn(async()=>mockToken)}));
jest.mock('jwt-decode',()=>({jwtDecode:(token:string)=>({userId:Number(token.replace('user',''))})}));
jest.mock('expo-file-system/legacy',()=>({cacheDirectory:'file:///cache/',EncodingType:{UTF8:'utf8'},makeDirectoryAsync:jest.fn(async()=>{}),writeAsStringAsync:jest.fn(async()=>{}),deleteAsync:jest.fn(async()=>{})}));
jest.mock('expo-sharing',()=>({isAvailableAsync:jest.fn(async()=>true),shareAsync:jest.fn(async()=>{})}));
jest.mock('expo-clipboard',()=>({setStringAsync:jest.fn(async()=>true)}));
import * as FS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import {getAccessToken} from '../utils/tokenService';
import {copyHelpHtmlLink,downloadHelpHtml,helpHtmlShareLink} from '../src/features/help/helpHtmlActions';
import type {HelpHtmlArtifact} from '../src/features/help/helpHtml';
const id='8cb01504-f89b-4e55-ad30-f8f6eb686547';
const artifact:HelpHtmlArtifact={version:1,id,title:'Мой пример',description:'Описание',compact:{html:'<p>Кратко</p>',css:''},full:{html:'<h1>Подробный пример</h1>',css:'h1{color:green}'}};
const link=`leaderproduct://services/help?ticketId=50&htmlId=${id}`;
const scope=()=>({expectedUserId:121,signal:new AbortController().signal});
beforeEach(()=>{jest.clearAllMocks();mockToken='user121';jest.mocked(getAccessToken).mockImplementation(async()=>mockToken);jest.mocked(FS.writeAsStringAsync).mockResolvedValue();jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);});
test('download shares a complete inert HTML document, never the JSON descriptor, and cleans its unique directory',async()=>{
 await downloadHelpHtml(artifact,'#18212D',scope());
 const [uri,html]=jest.mocked(FS.writeAsStringAsync).mock.calls[0];
 expect(uri).toMatch(/^file:\/\/\/cache\/help-html-export-[\d-]+\/.+\.html$/);
 expect(html).toContain('<!doctype html>');expect(html).toContain('<h1>Подробный пример</h1>');expect(html).toContain("script-src 'none'");expect(html).toContain("connect-src 'none'");
 expect(html).not.toContain('"compact":');expect(html).not.toContain('Bearer');expect(html).not.toContain('user121');
 expect(Sharing.shareAsync).toHaveBeenCalledWith(uri,expect.objectContaining({mimeType:'text/html',UTI:'public.html'}));
 expect(FS.deleteAsync).toHaveBeenCalledWith(expect.stringMatching(/^file:\/\/\/cache\/help-html-export-[\d-]+\/$/),{idempotent:true});
});
test('account switch during native file writing prevents share and removes staged HTML',async()=>{
 jest.mocked(FS.writeAsStringAsync).mockImplementationOnce(async()=>{mockToken='user122';});
 await expect(downloadHelpHtml(artifact,'#18212D',scope())).rejects.toMatchObject({name:'AbortError'});
 expect(Sharing.shareAsync).not.toHaveBeenCalled();expect(FS.deleteAsync).toHaveBeenCalledTimes(1);
});
test('closing while share availability is pending prevents a late share sheet',async()=>{
 const controller=new AbortController();jest.mocked(Sharing.isAvailableAsync).mockImplementationOnce(async()=>{controller.abort();return true;});
 await expect(downloadHelpHtml(artifact,'#18212D',{expectedUserId:121,signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});
 expect(Sharing.shareAsync).not.toHaveBeenCalled();expect(FS.deleteAsync).toHaveBeenCalledTimes(1);
});
test('an unavailable exporter reports failure and removes its own staged file',async()=>{
 jest.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false);
 await expect(downloadHelpHtml(artifact,'#18212D',scope())).rejects.toThrow('HELP_HTML_EXPORT_UNAVAILABLE');
 expect(Sharing.shareAsync).not.toHaveBeenCalled();expect(FS.deleteAsync).toHaveBeenCalledTimes(1);
});
test('link copies the exact private application route',async()=>{
 await copyHelpHtmlLink(artifact,link,scope());expect(Clipboard.setStringAsync).toHaveBeenCalledWith(link);
 const historical=`leaderproduct://services/help?ticketId=50&messageId=1075&htmlId=${id}`;
 await copyHelpHtmlLink(artifact,historical,scope());expect(Clipboard.setStringAsync).toHaveBeenCalledWith(historical);
});
test.each(['https://example.test/help/attachments/id',`leaderproduct://services/help?ticketId=50&htmlId=${id}&token=secret`,`leaderproduct://services/help?ticketId=50&ticketId=60&htmlId=${id}`,`leaderproduct://services/help?ticketId=50&htmlId=9423fa98-0671-4ec5-936e-c905502e4ba0`])('does not copy an unrelated or credential-bearing address: %s',async value=>{
 expect(()=>helpHtmlShareLink(value,id)).toThrow();await expect(copyHelpHtmlLink(artifact,value,scope())).rejects.toThrow();expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
});
test('account switch before clipboard call prevents stale private data from being copied',async()=>{
 jest.mocked(getAccessToken).mockResolvedValueOnce('user121').mockResolvedValueOnce('user122');
 await expect(copyHelpHtmlLink(artifact,link,scope())).rejects.toMatchObject({name:'AbortError'});expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
});
test('cancelled or replaced viewers never start native export',async()=>{
 await expect(downloadHelpHtml(artifact,'#18212D',{expectedUserId:121,signal:AbortSignal.abort()})).rejects.toMatchObject({name:'AbortError'});
 await expect(downloadHelpHtml(artifact,'#18212D',{...scope(),isCurrent:()=>false})).rejects.toMatchObject({name:'AbortError'});expect(FS.makeDirectoryAsync).not.toHaveBeenCalled();
});
