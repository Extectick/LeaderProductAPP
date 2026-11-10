const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(require.resolve('./networkBoundary.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function environment(){
 const sent=[];
 class Xhr {open(method,url){sent.push({method,url});}}
 const context={exports:{},window:{location:{href:'http://localhost:8131/',origin:'http://localhost:8131'}},fetch:async(input)=>{sent.push({input});return {ok:true};},XMLHttpRequest:Xhr,URL,Promise,Error};
 vm.createContext(context);vm.runInContext(source,context);
 return {context,sent};
}
test('fixture fetch permits Metro assets and rejects live API/external traffic',async()=>{
 const {context,sent}=environment();
 await context.fetch('/assets/icon.png');
 await assert.rejects(context.fetch('https://dev.example.invalid/api/client-orders'),/реальным API/);
 await assert.rejects(context.fetch('/api/client-orders'),/реальным API/);
 assert.equal(sent.length,1);
 assert.deepEqual(Array.from(context.__ordersFixtureNetwork.blocked),['/api/client-orders','/api/client-orders']);
});
test('XHR cannot bypass fixture fetch boundary',()=>{
 const {context,sent}=environment();
 const request=new context.XMLHttpRequest();
 assert.throws(()=>request.open('POST','https://dev.example.invalid/api/client-orders'),/реальным API/);
 assert.throws(()=>request.open('POST','/api/client-orders'),/реальным API/);
 request.open('GET','/assets/fonts.ttf');
 assert.equal(sent.length,1);
});
test('reinstalling fixture boundary is idempotent',async()=>{
 const {context,sent}=environment();
 const fetch=context.fetch;
 vm.runInContext(`(()=>{${source}})()`,context);
 assert.equal(context.fetch,fetch);
 await context.fetch('/assets/logo.png');
 assert.equal(sent.length,1);
});
