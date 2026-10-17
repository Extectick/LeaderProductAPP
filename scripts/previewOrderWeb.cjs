// Local-only preview. Read-only proxy to the existing dev public-order API.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../dist-order');
const edgeCases = process.argv.includes('--edge-cases');
const demo = process.argv.includes('--demo');
const missingWeight = process.argv.includes('--missing-weight');
const portArgument = process.argv.find(value => value.startsWith('--port='));
const port = portArgument ? Number(portArgument.slice(7)) : demo ? 4180 : edgeCases ? 4174 : 4173;
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port');
const demoFixtures = new Map();
function weightDemo(source) {
  const imageFor = name => source.items.find(item => item.name.toLocaleUpperCase('ru-RU').includes(name))?.image || null;
  const items = [
    { id: 'demo-sauce', name: 'Соус ШРИРАЧА UNI-EAGLE 815 г', quantity: '3', unit: 'шт', unitPrice: '353', amount: '1059', weightKg: '2.445', image: imageFor('ШРИРАЧА') },
    { id: 'demo-astoria', name: 'Соус сливочно-чесночный АСТОРИЯ 1 кг', quantity: '2', unit: 'шт', unitPrice: '346', amount: '692', weightKg: missingWeight ? null : '2', image: imageFor('СЛИВОЧНО-ЧЕСНОЧНЫЙ') },
  ];
  return { number:'ДЕМО', date:'2026-10-17T05:00:00Z', customer:'Пример заказа', deliveryDate:'2026-10-18T05:00:00Z',
    deliveryMethod:'До клиента', deliveryAddress:'Омск · доставка до клиента', currency:'RUB', cancelled:false,
    total:'1751', totalWeightKg:missingWeight?'2.445':'4.445', weightComplete:!missingWeight, missingWeightItems:missingWeight?1:0,
    updatedAt:'2026-10-17T05:00:00Z', items,
    manager:{name:'Тестовый менеджер',phones:[{label:'Демонстрационный номер',number:'+70000000001'}],telegramUrl:null,maxUrl:null,whatsappUrl:null,email:'manager@example.invalid'} };
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.woff': 'font/woff' };
http.createServer(async (req, res) => {
  if (req.method !== 'GET') { res.writeHead(405).end(); return; }
  const url = new URL(req.url, 'http://127.0.0.1:4173');
  try {
    if (url.pathname === '/public/order' || /^\/public\/order\/images\/[^/]+$/.test(url.pathname)) {
      const headers = {};
      for (const name of ['authorization', 'if-none-match']) if (req.headers[name]) headers[name] = req.headers[name];
      if (demo && url.pathname === '/public/order') {
        const key = req.headers.authorization || '';
        if (demoFixtures.has(key)) { res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({ok:true,data:demoFixtures.get(key)})); return; }
        delete headers['if-none-match'];
      }
      if (edgeCases) delete headers['if-none-match'];
      const upstream = await fetch('https://dev.leader-product.ru' + url.pathname, { headers, signal: AbortSignal.timeout(15000) });
      if (demo && url.pathname === '/public/order' && upstream.status === 200) {
        const source = await upstream.json();
        if (!source.ok || !Array.isArray(source.data?.items)) { res.writeHead(502).end(); return; }
        const fixture = weightDemo(source.data);
        if (demoFixtures.size < 10) demoFixtures.set(req.headers.authorization || '', fixture);
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({ok:true,data:fixture})); return;
      }
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
    const relative = url.pathname === '/order/' || /^\/order\/[A-Za-z0-9_-]{12}$/.test(url.pathname) ? 'index.html' : url.pathname.replace(/^\/order\//, '');
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch { if (!res.headersSent) res.writeHead(502); res.end(); }
}).listen(port, '127.0.0.1', () => console.log(`Order preview: http://127.0.0.1:${port}/order/ (dev API, read-only${demo ? ', DEMO order, no customer details' : edgeCases ? ', synthetic QA edge cases' : ''})`));
