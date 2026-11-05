import {HELP_HTML_MIME,helpHtmlAttachmentId,helpHtmlDocument,helpHtmlPageLink,parseHelpHtmlArtifact,parseHelpHtmlLink} from '../src/features/help/helpHtml';
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
test('compact viewport overrides model overflow and hides all inner scrollbars',()=>{
 const css='html,body{overflow:auto!important;height:200vh!important}';
 const html=helpHtmlDocument({...compact,css},'#18212D',true);
 expect(html.lastIndexOf('overflow:hidden!important')).toBeGreaterThan(html.indexOf(css));
 expect(html).toContain('max-height:100%!important');expect(html).toContain('scrollbar-width:none!important');expect(html).toContain('*::-webkit-scrollbar');
 const full=helpHtmlDocument({...compact,css},'#18212D',false);expect(full).not.toContain('max-height:100%!important');
});
test('share links bind both the accessible chat and original message without credentials',()=>{
 expect(helpHtmlPageLink(50,1075,id)).toBe(`leaderproduct://services/help?ticketId=50&messageId=1075&htmlId=${id}`);
 expect(helpHtmlPageLink(-1,1,id)).toBeUndefined();expect(helpHtmlPageLink(1,NaN,id)).toBeUndefined();expect(helpHtmlPageLink(1,2,'bad')).toBeUndefined();
});
test('floating viewer header inset applies only to viewing, never to a standalone export',()=>{
 expect(helpHtmlDocument(compact,'#18212D',false,80)).toContain('body{padding-top:80px!important}');
 expect(helpHtmlDocument(compact,'#18212D',false)).not.toContain('padding-top:80px');
 expect(()=>helpHtmlDocument(compact,'#18212D',false,Infinity)).toThrow();
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

test('entity cards bind one canonical action and only the authenticated image slot',()=>{
 const entity={url:'leaderproduct://entity/v1/user/121'},compact={html:'<figure><span>ИС</span><img src="help-entity-image" alt="Фото" /></figure>',css:''};
 expect(parseHelpHtmlArtifact(payload({entity,compact}),id).entity).toEqual(entity);
 for(const bad of [{entity:{url:entity.url+'?token=x'},compact},{entity,compact:null,full:compact},{compact},{entity,compact:{...compact,html:'<img src="https://example.com/photo.jpg">'}},{entity,compact:{...compact,html:'<img src="data:image/svg+xml;base64,PHN2Zz4=" src="help-entity-image">'}}])expect(()=>parseHelpHtmlArtifact(payload(bad),id)).toThrow();
 const image='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10,1,2,3,4]).toString('base64');
 const shown=helpHtmlDocument(compact,'#18212D',true,0,image);
 expect(shown).toContain('img-src data:');expect(shown).toContain(`src="${image}"`);expect(shown).not.toContain('help-entity-image');
 const missing=helpHtmlDocument(compact,'#18212D',true);expect(missing).not.toContain('<img');expect(missing).toContain('<span>ИС</span>');
});
