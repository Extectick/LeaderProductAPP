import React from 'react';
import { createRoot } from 'react-dom/client';
import { Alert, Button, CssBaseline, Dialog, IconButton, Skeleton, ThemeProvider, Tooltip, createTheme } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PhoneIcon from '@mui/icons-material/PhoneOutlined';
import TelegramIcon from '@mui/icons-material/Telegram';
import ChatIcon from '@mui/icons-material/ChatBubbleOutline';
import DeliveryIcon from '@mui/icons-material/LocalShippingOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import ImageIcon from '@mui/icons-material/ImageOutlined';
import logo from '../assets/images/icon.png';
import './style.css';

type Item = { id: string; name: string; quantity: string; unit: string; unitPrice: string; amount: string; image: { id: string; version: string } | null };
type Order = { number: string; date: string | null; customer: string; deliveryDate: string | null; currency: string; cancelled: boolean;
  total: string; updatedAt: string; items: Item[]; manager: { name: string; phones: { label: string; number: string }[]; telegramUrl: string | null; maxUrl: string | null } };
const theme = createTheme({ palette: { primary: { main: '#1859f7' }, text: { primary: '#111a35', secondary: '#61708a' } },
  typography: { fontFamily: 'Arial, system-ui, sans-serif', button: { textTransform: 'none', fontWeight: 600 } },
  shape: { borderRadius: 8 }, components: { MuiButton: { defaultProps: { disableElevation: true } } } });
// A second shared URL opened in this tab must not keep the previous capability/data.
window.addEventListener('hashchange', () => window.location.reload());
const token = window.location.hash.slice(1);
const validToken = /^[A-Za-z0-9_-]{43}$/.test(token);
const money = (value: string, currency: string, precision = 2) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: precision }).format(Number(value));
const number = (value: string) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 }).format(Number(value));
const date = (value: string | null, year = false) => value ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', ...(year ? { year: 'numeric' } : {}), timeZone: 'Asia/Omsk' }).format(new Date(value)) : '';

function ProductPhoto({ item, onOpen }: { item: Item; onOpen: (url: string, title: string) => void }) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(!!item.image);
  const element = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    let objectUrl: string | null = null;
    const controller = new AbortController();
    setUrl(null); setLoading(!!item.image);
    const load = async () => {
      if (!item.image) { setLoading(false); return; }
      try {
        const response = await fetch(`/public/order/images/${encodeURIComponent(item.image.id)}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store', credentials: 'omit' });
        if (!response.ok) throw new Error('image');
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
      } catch { /* Photo is optional. Never substitute another product's picture. */ }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); void load(); }
    }, { rootMargin: '250px' });
    if (element.current) observer.observe(element.current);
    return () => { observer.disconnect(); controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [item.image?.id, item.image?.version]);
  return <div className="photo" ref={element}>
    {loading ? <Skeleton variant="rectangular" width="100%" height="100%" /> : url ?
      <button className="photo-button" onClick={() => onOpen(url, item.name)} aria-label={`Увеличить фото: ${item.name}`}><img src={url} alt={item.name} decoding="async" /></button>
      : <div className="photo-empty"><ImageIcon aria-hidden="true" /><span>Нет фото</span></div>}
  </div>;
}

function App() {
  const [order, setOrder] = React.useState<Order | null>(null);
  const [loading, setLoading] = React.useState(validToken);
  const [busy, setBusy] = React.useState(false);
  const [unavailable, setUnavailable] = React.useState(!validToken);
  const [error, setError] = React.useState('');
  const [photo, setPhoto] = React.useState<{ url: string; title: string } | null>(null);
  const etag = React.useRef('');
  const inFlight = React.useRef(false);
  const request = React.useRef<AbortController | null>(null);
  const refresh = React.useCallback(async () => {
    if (!validToken || unavailable || inFlight.current || document.hidden) return;
    if (!navigator.onLine) { setError('Нет сети. Показаны последние загруженные данные.'); setLoading(false); return; }
    const controller = new AbortController(); request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    inFlight.current = true; setBusy(true);
    try {
      const response = await fetch('/public/order', { headers: { Authorization: `Bearer ${token}`, ...(etag.current ? { 'If-None-Match': etag.current } : {}) }, signal: controller.signal, cache: 'no-store', credentials: 'omit' });
      if (response.status === 410 || response.status === 404) { setUnavailable(true); setOrder(null); setPhoto(null); return; }
      if (response.status === 304) { setError(''); return; }
      if (!response.ok) throw new Error('network');
      const body = await response.json();
      if (!body.ok || !body.data || !Array.isArray(body.data.items)) throw new Error('response');
      etag.current = response.headers.get('ETag') || '';
      setOrder(body.data); setError('');
    } catch { if (!controller.signal.aborted || request.current === controller) setError('Не удалось обновить заказ. Попробуйте ещё раз.'); }
    finally { clearTimeout(timeout); inFlight.current = false; setLoading(false); setBusy(false); }
  }, [unavailable]);
  React.useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    const update = () => { void refresh(); };
    const offline = () => setError('Нет сети. Показаны последние загруженные данные.');
    document.addEventListener('visibilitychange', update); window.addEventListener('online', update); window.addEventListener('offline', offline);
    return () => { clearInterval(timer); request.current?.abort(); request.current = null; document.removeEventListener('visibilitychange', update); window.removeEventListener('online', update); window.removeEventListener('offline', offline); };
  }, [refresh]);
  return <ThemeProvider theme={theme}><CssBaseline /><div className="page">
    <header className="brand"><img src={logo} alt="" /><span>Лидер-Продукт</span></header>
    <main>
      {unavailable ? <section className="empty-state"><h1>Ссылка недоступна</h1><p>Обратитесь к менеджеру за новой ссылкой на заказ.</p></section> : <>
        {error ? <Alert severity="warning" className="network-note" action={<IconButton color="inherit" aria-label="Обновить заказ" disabled={busy} onClick={() => void refresh()}><RefreshIcon /></IconButton>}>{error}</Alert> : null}
        {loading ? <><div className="intro"><Skeleton width={110} /><Skeleton height={48} width="60%" /><Skeleton width={210} /></div><section className="products">{[1, 2, 3, 4].map(i => <article key={i}><div className="photo"><Skeleton variant="rectangular" width="100%" height="100%" /></div><Skeleton height={30} /><Skeleton width="65%" /></article>)}</section></> : order ? <>
          <section className="intro"><span className="eyebrow">Заказ для</span><h1>{order.customer}</h1><p>{order.number === 'Черновик' ? 'Заказ' : `№ ${order.number}`}{order.date ? ` от ${date(order.date, true)}` : ''}</p></section>
          {order.cancelled ? <Alert severity="info">Заказ отменён</Alert> : null}
          <section className="products" aria-label="Товары заказа">{order.items.map(item => <article key={item.id}>
            <ProductPhoto item={item} onOpen={(url, title) => setPhoto({ url, title })} />
            <h2>{item.name}</h2><p className="quantity">{number(item.quantity)} {item.unit} × {money(item.unitPrice, order.currency, 4)}</p>
            <p className="line-total">{money(item.amount, order.currency)}</p>
          </article>)}</section>
          <footer className="order-footer">
            <div className="delivery"><DeliveryIcon aria-hidden="true" /><div><span className="eyebrow">Доставка</span><strong>{order.deliveryDate ? date(order.deliveryDate) : 'Уточните у менеджера'}</strong></div></div>
            <div className="total"><span className="eyebrow">Итого</span><strong>{money(order.total, order.currency)}</strong></div>
          </footer>
          <section className="manager" aria-label="Связаться с менеджером"><div className="manager-name"><span className="eyebrow">Ваш менеджер</span><strong>{order.manager.name || 'Менеджер'}</strong></div>
            <div className="contacts">{order.manager.phones.map(phone => <Button key={phone.number} className="contact-phone" href={`tel:${phone.number}`} startIcon={<PhoneIcon />} variant="text"><span>{phone.label ? <small>{phone.label}</small> : null}{phone.number}</span></Button>)}
              {order.manager.telegramUrl ? <Button href={order.manager.telegramUrl} target="_blank" rel="noreferrer noopener" variant="outlined" startIcon={<TelegramIcon />}>Telegram</Button> : null}
              {order.manager.maxUrl ? <Button href={order.manager.maxUrl} target="_blank" rel="noreferrer noopener" variant="outlined" startIcon={<ChatIcon />}>MAX</Button> : null}
            </div>
          </section>
          <div className="freshness"><span>Обновлено {new Date(order.updatedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span><Tooltip title="Обновить"><IconButton size="small" disabled={busy} onClick={() => void refresh()} aria-label="Обновить заказ"><RefreshIcon fontSize="small" /></IconButton></Tooltip></div>
        </> : <section className="empty-state"><h1>Не удалось загрузить заказ</h1><Button variant="contained" disabled={busy} onClick={() => void refresh()}>Повторить</Button></section>}
      </>}
    </main>
  </div><Dialog open={!!photo} onClose={() => setPhoto(null)} maxWidth="md" fullWidth PaperProps={{ sx: { padding: 2 } }}>
    <div className="photo-dialog-header"><strong>{photo?.title}</strong><IconButton aria-label="Закрыть фото" onClick={() => setPhoto(null)}><CloseIcon /></IconButton></div>
    {photo ? <img className="enlarged-photo" src={photo.url} alt={photo.title} /> : null}
  </Dialog></ThemeProvider>;
}
createRoot(document.getElementById('root')!).render(<App />);
