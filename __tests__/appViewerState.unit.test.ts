import {entityCardReducer as reduce,initialEntityCardState} from '../src/features/entityCards/entityCardState';
const account='https://api.invalid:1',profile:any={v:1,source:'app',kind:'user',id:'1'};
const html:any={artifact:{id:'example',title:'Пример',full:{html:'<p>Example</p>',css:''}},expectedUserId:1,scopeId:'message-1',isCurrent:()=>true};
test('one history preserves card/site/HTML parents and website current address',()=>{
 let s=reduce(initialEntityCardState,{type:'open',account,target:profile});
 s=reduce(s,{type:'web',account,url:'https://tass.ru/',title:'Новости'});const web=s.frames.at(-1)!;
 s=reduce(s,{type:'web-location',key:web.key,url:'https://tass.ru/article'});
 expect(reduce(s,{type:'web-location',key:web.key,url:'https://tass.ru/article'})).toBe(s);
 s=reduce(s,{type:'html',account,payload:html});expect(s.frames.map(f=>f.kind)).toEqual(['entity','web','html']);
 s=reduce(s,{type:'back'});expect(s.frames.at(-1)).toMatchObject({kind:'web',url:'https://tass.ru/',currentUrl:'https://tass.ru/article'});
 s=reduce(s,{type:'back'});expect(s.frames.at(-1)).toMatchObject({kind:'entity',target:profile});
});
test.each(['javascript:alert(1)','file:///etc/passwd','https://user:secret@example.invalid/','//example.invalid'])('invalid websites never become viewer frames: %s',url=>{
 expect(reduce(initialEntityCardState,{type:'web',account,url})).toBe(initialEntityCardState);
});
test('revoked HTML source removes its descendants without losing an earlier card',()=>{
 let s=reduce(initialEntityCardState,{type:'open',account,target:profile});s=reduce(s,{type:'html',account,payload:html});s=reduce(s,{type:'web',account,url:'https://tass.ru/'});
 s=reduce(s,{type:'release-html',scopeId:'different'});expect(s.frames).toHaveLength(3);
 s=reduce(s,{type:'release-html',scopeId:html.scopeId});expect(s.frames.map(f=>f.kind)).toEqual(['entity']);
 expect(reduce(s,{type:'html',account,payload:{...html,isCurrent:()=>false}})).toBe(s);
});
test('account switches clear all content types; old dismiss cannot close the next viewer',()=>{
 let s=reduce(initialEntityCardState,{type:'web',account,url:'https://tass.ru/'});const old=s.session;
 s=reduce(s,{type:'account',account:'other'});expect(s.frames).toHaveLength(0);
 s=reduce(s,{type:'web',account:'other',url:'https://example.invalid/'});
 expect(reduce(s,{type:'dismissed',session:old})).toBe(s);
});
