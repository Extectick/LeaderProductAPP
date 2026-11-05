const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { checkReleaseDiagnostics } = require('./checkReleaseDiagnostics');
async function serve(handler, testCase) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await testCase(`http://127.0.0.1:${server.address().port}/_health/`); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
test('healthy private monitoring accepts publication', () => serve((req,res)=>res.end('ok'), url=>checkReleaseDiagnostics(url)));
test('redirect/error cannot substitute for healthy monitoring', async () => {
  for (const status of [302,403,503]) await serve((req,res)=>{res.writeHead(status);res.end();}, url=>assert.rejects(checkReleaseDiagnostics(url), new RegExp(`HTTP ${status}`)));
});
test('stalled monitoring fails with recovery instructions and bounded timeout', ()=>serve(()=>{}, async url=>{
  await assert.rejects(checkReleaseDiagnostics(url,30), /pinned host126 SSH key.*StrictHostKeyChecking/);
}));
test('refused connection fails without exposing transport details or credentials', async ()=>{
  let url; await serve((req,res)=>res.end(), async u=>{url=u;});
  await assert.rejects(checkReleaseDiagnostics(url), error=>!error.message.includes(url)&&error.message.includes('existing candidate'));
});
