// Local-only preview. Read-only proxy to the existing dev public-order API.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../dist-order');
const edgeCases = process.argv.includes('--edge-cases');
const port = edgeCases ? 4174 : 4173;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' };
http.createServer(async (req, res) => {
  if (req.method !== 'GET') { res.writeHead(405).end(); return; }
  const url = new URL(req.url, 'http://127.0.0.1:4173');
  try {
    if (url.pathname === '/public/order' || /^\/public\/order\/images\/[^/]+$/.test(url.pathname)) {
      const headers = {};
      for (const name of ['authorization', 'if-none-match']) if (req.headers[name]) headers[name] = req.headers[name];
      if (edgeCases) delete headers['if-none-match'];
      const upstream = await fetch('https://dev.leader-product.ru' + url.pathname, { headers, signal: AbortSignal.timeout(15000) });
      if (edgeCases && url.pathname === '/public/order' && upstream.status === 200) {
        const body = await upstream.json();
        if (!body.data?.customer?.includes('тестовый заказ')) { res.writeHead(400).end('QA fixture only'); return; }
        body.data.items[0].image = null;
        body.data.manager.phones = Array.from({ length: 5 }, (_, i) => ({ number: `+7000000000${i + 1}`, label: `Тестовый ${i + 1}` }));
        body.data.manager.telegramUrl = 'https://t.me/test_manager';
        body.data.manager.maxUrl = 'https://max.ru/test_manager';
        body.data.manager.whatsappUrl = 'https://wa.me/70000000001';
        body.data.manager.email = 'manager+sales@example.invalid';
        body.data.deliveryMethod = process.argv.includes('--pickup') ? 'Самовывоз' : 'До клиента';
        body.data.deliveryAddress = body.data.deliveryMethod === 'Самовывоз' ? null : 'Омск, улица Тестовая, дом 12, корпус 2, вход со двора';
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body)); return;
      }
      res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store', ...(upstream.headers.get('etag') ? { ETag: upstream.headers.get('etag') } : {}) });
      res.end(Buffer.from(await upstream.arrayBuffer())); return;
    }
    const relative = url.pathname === '/order/' ? 'index.html' : url.pathname.replace(/^\/order\//, '');
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch { if (!res.headersSent) res.writeHead(502); res.end(); }
}).listen(port, '127.0.0.1', () => console.log(`Order preview: http://127.0.0.1:${port}/order/ (dev API, read-only${edgeCases ? ', synthetic QA edge cases' : ''})`));
