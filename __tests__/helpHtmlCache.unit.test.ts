import {createHelpHtmlCache,HELP_HTML_CACHE_LIMITS,type HelpHtmlCacheScope} from '../src/features/help/helpHtmlCache';
import {HELP_HTML_MIME,helpHtmlCompactHeight,type HelpHtmlArtifact} from '../src/features/help/helpHtml';
import type {HelpAttachment} from '../src/features/help/helpApi';

const id='12345678-1234-4234-8234-123456789abc';
const file:HelpAttachment={id:'attachment-1',kind:'FILE',name:`${id}.help-html.json`,mimeType:HELP_HTML_MIME,size:300,url:'/help/attachments/attachment-1'};
const scope:HelpHtmlCacheScope={account:'https://dev.example.test:121',resolver:()=>{},ticketId:61,messageId:120};
const artifact:HelpHtmlArtifact={version:1,id,title:'Профиль',description:'Карточка сотрудника',compact:{html:'<article>Сотрудник</article>',css:'article { height:128px; }'},entity:{url:'leaderproduct://entity/v1/user/121'}};
const imageDataUrl='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10,1,2,3,4]).toString('base64');
const signal=()=>new AbortController().signal;

test('reopened messages reuse parsed fixed-height HTML and a validated image without fetching',()=>{
  const cache=createHelpHtmlCache();
  expect(cache.read(scope,file)).toBeUndefined();
  expect(cache.remember(scope,file,{artifact,imageDataUrl},signal())).toBe(true);
  const first=cache.read(scope,file)!;
  expect(first).toEqual({artifact,imageDataUrl});
  expect(helpHtmlCompactHeight(first.artifact.compact)).toBe(128);
  expect(cache.read({...scope},{...file})).toBe(first);
  const anotherScreen=createHelpHtmlCache();
  expect(anotherScreen.read(scope,file)).toBeUndefined();
});

test('API, account, resolver, ticket and message identities cannot share cached private HTML',()=>{
  const cache=createHelpHtmlCache();
  cache.remember(scope,file,{artifact},signal());
  for(const other of [
    {...scope,account:'https://dev.example.test:122'},
    {...scope,account:'https://other.example.test:121'},
    {...scope,resolver:()=>{}},
    {...scope,ticketId:62},
    {...scope,messageId:121},
    {...scope,ticketId:undefined,messageId:undefined},
    {...scope,account:''},
  ])expect(cache.read(other,file)).toBeUndefined();
  expect(cache.read(scope,{...file,id:'attachment-2'})).toBeUndefined();
  expect(cache.read(scope,file)?.artifact).toEqual(artifact);
});

test.each([
  {url:'/help/attachments/attachment-1?v=2'},
  {size:301},
  {name:'22345678-1234-4234-8234-123456789abc.help-html.json'},
  {mimeType:HELP_HTML_MIME.toUpperCase()},
  {localUri:'file:///replacement'},
  {width:320,height:128},
  {thumbnailDataUri:'changed'},
])('a changed attachment descriptor invalidates its old value: %p',change=>{
  const cache=createHelpHtmlCache();
  cache.remember(scope,file,{artifact},signal());
  expect(cache.read(scope,{...file,...change})).toBeUndefined();
  // Reverting the descriptor must not resurrect the already-invalidated value.
  expect(cache.read(scope,file)).toBeUndefined();
});

test('cached documents are owned immutable snapshots, not caller-mutable references',()=>{
  const cache=createHelpHtmlCache(),input=JSON.parse(JSON.stringify(artifact));
  cache.remember(scope,file,{artifact:input},signal());
  input.title='Другой сотрудник';input.compact.css='article { height:900px; }';
  const stored=cache.read(scope,file)!;
  expect(stored.artifact.title).toBe('Профиль');
  expect(helpHtmlCompactHeight(stored.artifact.compact)).toBe(128);
  expect(Object.isFrozen(stored)).toBe(true);
  expect(Object.isFrozen(stored.artifact.compact)).toBe(true);
});

test('LRU eviction is bounded across resolvers and respects recently used cards',()=>{
  const cache=createHelpHtmlCache({maxEntries:2});
  const otherScope={...scope,resolver:()=>{}},third={...file,id:'attachment-3'};
  cache.remember(scope,file,{artifact},signal());
  cache.remember(otherScope,file,{artifact},signal());
  expect(cache.read(scope,file)).toBeDefined();
  cache.remember(scope,third,{artifact},signal());
  expect(cache.read(otherScope,file)).toBeUndefined();
  expect(cache.read(scope,file)).toBeDefined();
  expect(cache.read(scope,third)).toBeDefined();
});

test('the shared memory budget evicts old HTML and rejects an individually oversized card',()=>{
  const cache=createHelpHtmlCache({maxBytes:3600});
  const body={...artifact,compact:{html:`<article>${'x'.repeat(500)}</article>`,css:''}};
  const second={...file,id:'attachment-2'};
  expect(cache.remember(scope,file,{artifact:body},signal())).toBe(true);
  expect(cache.read(scope,file)).toBeDefined();
  expect(cache.remember(scope,second,{artifact:body},signal())).toBe(true);
  expect(cache.read(scope,file)).toBeUndefined();
  expect(cache.read(scope,second)).toBeDefined();
  expect(cache.remember(scope,file,{artifact:{...body,compact:{html:`<article>${'x'.repeat(4000)}</article>`,css:''}}},signal())).toBe(false);
  expect(cache.read(scope,second)).toBeDefined();
});

test('reading a card does not extend its five-minute authorization-sensitive lifetime',()=>{
  let now=0;
  const cache=createHelpHtmlCache({now:()=>now});
  cache.remember(scope,file,{artifact},signal());
  now=HELP_HTML_CACHE_LIMITS.ttlMs-1;
  expect(cache.read(scope,file)).toBeDefined();
  now++;
  expect(cache.read(scope,file)).toBeUndefined();
  expect(cache.remember(scope,file,{artifact},signal())).toBe(true);
  expect(cache.read(scope,file)).toBeDefined();
});

test('late aborted loads cannot populate or replace a completed card',async()=>{
  const cache=createHelpHtmlCache(),controller=new AbortController();
  let finish!:(value:{artifact:HelpHtmlArtifact})=>void;
  const pending=new Promise<{artifact:HelpHtmlArtifact}>(resolve=>{finish=resolve;})
    .then(value=>cache.remember(scope,file,value,controller.signal));
  controller.abort();finish({artifact});
  expect(await pending).toBe(false);
  expect(cache.read(scope,file)).toBeUndefined();
  cache.remember(scope,file,{artifact},signal());
  expect(cache.remember(scope,file,{artifact:{...artifact,title:'Поздний ответ'}},controller.signal)).toBe(false);
  expect(cache.read(scope,file)?.artifact.title).toBe('Профиль');
});

test('errors, mismatched artifacts and unsafe images never enter the cache',()=>{
  const cache=createHelpHtmlCache();
  for(const value of [
    {error:true},{artifact,error:true},
    {artifact:{...artifact,id:'22345678-1234-4234-8234-123456789abc'}},
    {artifact:{...artifact,compact:{html:'<script>secret()</script>',css:''}}},
    {artifact,imageDataUrl:'https://example.test/private.png'},
    {artifact,imageDataUrl:'data:image/svg+xml;base64,PHN2Zz4='},
    {artifact:{...artifact,entity:undefined},imageDataUrl},
  ])expect(cache.remember(scope,file,value as any,signal())).toBe(false);
  expect(cache.read(scope,file)).toBeUndefined();
  expect(cache.remember({...scope,account:''},file,{artifact},signal())).toBe(false);
  expect(cache.remember(scope,{...file,kind:'IMAGE'},{artifact},signal())).toBe(false);
});

test('explicit invalidation removes only the requested attachment; clear removes every partition',()=>{
  const cache=createHelpHtmlCache(),otherScope={...scope,resolver:()=>{}};
  cache.remember(scope,file,{artifact},signal());cache.remember(otherScope,file,{artifact},signal());
  cache.forget(scope,file);
  expect(cache.read(scope,file)).toBeUndefined();expect(cache.read(otherScope,file)).toBeDefined();
  cache.clear();expect(cache.read(otherScope,file)).toBeUndefined();
});
