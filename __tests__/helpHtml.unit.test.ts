import {HELP_HTML_MIME,helpHtmlAttachmentId,helpHtmlDocument,parseHelpHtmlArtifact,parseHelpHtmlLink} from '../src/features/help/helpHtml';
import type {HelpAttachment} from '../src/features/help/helpApi';
const id='8cb01504-f89b-4e55-ad30-f8f6eb686547';
const file:HelpAttachment={id:'attachment-1',kind:'FILE',name:`${id}.help-html.json`,mimeType:HELP_HTML_MIME,size:100,url:'/help/attachments/attachment-1'};
const compact={html:'<section><h2>Пример</h2><p>120 шт.</p></section>',css:'section{display:grid;gap:12px}'};
const payload=(extra:Record<string,unknown>={})=>JSON.stringify({version:1,id,title:'Остатки',description:'Условный пример',compact,...extra});
test('binds a private descriptor to an exact attachment MIME, filename and id',()=>{
 expect(helpHtmlAttachmentId(file)).toBe(id);
 expect(helpHtmlAttachmentId({...file,mimeType:'application/json'})).toBeNull();
 expect(helpHtmlAttachmentId({...file,name:'fake.html'})).toBeNull();
 expect(parseHelpHtmlArtifact(payload(),id).compact).toEqual(compact);
 expect(()=>parseHelpHtmlArtifact(payload(),'90d31752-d4bf-4e50-a2a1-47c705db821e')).toThrow();
});
test('supports compact-only, full-only and two independent versions',()=>{
 expect(parseHelpHtmlArtifact(payload(),id).full).toBeUndefined();
 const both=parseHelpHtmlArtifact(payload({full:{html:'<h1>Подробно</h1>',css:''}}),id);expect(both.full?.html).toContain('Подробно');
 expect(parseHelpHtmlArtifact(payload({compact:null,full:compact}),id).compact).toBeUndefined();
 expect(()=>parseHelpHtmlArtifact(payload({compact:null}),id)).toThrow();
});
test.each(['<script>alert(1)</script>','<meta http-equiv="refresh" content="0;url=https://example.com">','<iframe src="https://example.com"></iframe>','<style>body{color:red}</style>','<form><input></form>'])('rejects document control HTML %s',html=>{
 expect(()=>parseHelpHtmlArtifact(payload({compact:{html,css:''}}),id)).toThrow();
});
test('rejects style escape, oversized descriptors and unknown fields',()=>{
 expect(()=>parseHelpHtmlArtifact(payload({compact:{html:'<p>OK</p>',css:'</style><script>bad</script>'}}),id)).toThrow();
 expect(()=>parseHelpHtmlArtifact(payload({compact:{html:'x'.repeat(48001),css:''}}),id)).toThrow();
 expect(()=>parseHelpHtmlArtifact(payload({secret:'no'}),id)).toThrow();
});
test('only canonical internal links are routable',()=>{
 expect(parseHelpHtmlLink(`leaderproduct://help-html/${id}`)).toBe(id);
 for(const link of [`https://example.com/${id}`,`leaderproduct://help-html/${id}?token=1`,`leaderproduct://help-html/${id}/../other`,`leaderproduct://help-html/bad`])expect(parseHelpHtmlLink(link)).toBeNull();
});
test('inert local wrapper isolates CSS and forbids remote assets or scripting',()=>{
 const html=helpHtmlDocument(compact,'#18212D',true);
 expect(html).toContain("default-src 'none'");expect(html).toContain("script-src 'none'");expect(html).toContain("connect-src 'none'");expect(html).toContain("form-action 'none'");
 expect(html).toContain('background:transparent');expect(html).toContain('overflow:hidden');expect(html).toContain(compact.html);
 expect(()=>helpHtmlDocument({...compact,css:'</style>'},'#fff',true)).toThrow();
 expect(()=>helpHtmlDocument(compact,'red;}',true)).toThrow();
});
