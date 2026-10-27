const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const apk = path.resolve(__dirname, '../dev-builds/development-client/leader-product-dev-client.apk');
const metro = process.env.LEADER_METRO_URL || 'http://192.168.30.244:8081';
const connect = `leaderproduct-dev://expo-development-client/?url=${encodeURIComponent(metro)}`;
const page = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Лидер Продукт DEV</title><style>body{font:17px system-ui;background:#f7f9fc;color:#18212d;max-width:480px;margin:48px auto;padding:24px}a{display:block;padding:18px;margin:16px 0;background:#3289ff;color:white;border-radius:18px;text-align:center;text-decoration:none}code{overflow-wrap:anywhere}</style><h1>Лидер Продукт DEV</h1><p>Установите отдельное приложение для разработки. Телефон должен иметь доступ к компьютеру в локальной сети или через VPN.</p><a href="/leader-product-dev-client.apk">1. Скачать и установить APK</a><a href="${connect}">2. Подключить приложение</a><p>Сервер: <code>${metro}</code></p><p>Если ссылка подключения не открылась, в приложении DEV выберите ввод адреса вручную и укажите адрес сервера выше.</p><p>После сохранения изменений экран обновляется через Fast Refresh.</p></html>`;
http.createServer((req, res) => {
  if (req.url === '/' && req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(page); }
  if (req.url !== '/leader-product-dev-client.apk' || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); return res.end(); }
  if (!fs.existsSync(apk)) { res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '30' }); return res.end('Сборка ещё готовится. Обновите страницу позже.'); }
  res.writeHead(200, { 'Content-Type': 'application/vnd.android.package-archive', 'Content-Length': fs.statSync(apk).size, 'Content-Disposition': 'attachment; filename="leader-product-dev-client.apk"', 'Cache-Control': 'no-store' });
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(apk); stream.on('error', () => res.destroy()); stream.pipe(res);
}).listen(8098, '0.0.0.0', () => console.log('Dev client download/connect: http://192.168.30.244:8098/'));
