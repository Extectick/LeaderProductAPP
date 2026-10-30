import {DurableHelpProbe} from './durableProbe';
/** Local visual fixture entry. Never imported by app/ or the production entry. */
import React, { useEffect, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StatusBar, Text, View, useWindowDimensions } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { SafeAreaInsetsContext, SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '../../context/ThemeContext';
import { HelpMessageBubble } from '../../src/features/help/components/HelpMessageBubble';
import { HelpComposer, type HelpComposeMode, type HelpLocalFile } from '../../src/features/help/components/HelpComposer';
import { HelpGallery, type ResolveHelpMedia } from '../../src/features/help/components/HelpMedia';
import { HelpIcon } from '../../src/features/help/components/HelpPrimitives';
import { useHelpTheme } from '../../src/features/help/helpTheme';
import type { HelpAttachment, HelpMessage } from '../../src/features/help/helpApi';
import HelpScreen from '../../src/features/help/HelpScreen';
import {helpDevActions} from '../../src/features/help/helpDiagnostics';
import { installHelpCacheProbe } from './cacheProbe';
import { FixtureCacheBoundary } from './FixtureCacheBoundary';
import { NotificationHost } from '../../components/NotificationHost';
import { pushNotification } from '../../utils/notificationStore';
import { helpAssistantAvatarColor } from '../../src/features/help/helpAssistant';

export const OWNER = { id: 101, name: 'Вы', avatarUrl: null };
export const IT = { id: 202, name: 'Анна · IT', avatarUrl: null };
const LONG = 'После повторного входа заказ снова не открывается. Приложение сообщает об ошибке обмена. Проверил интернет и перезапустил приложение, но результат тот же. Нужно проверить статус заказа и историю изменений.';
const imageUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380"><rect width="600" height="380" fill="#233f60"/><rect x="35" y="35" width="530" height="310" rx="24" fill="#eef2f7"/><text x="65" y="100" font-family="sans-serif" font-size="28" fill="#18212d">QA: ошибка обмена</text><rect x="65" y="140" width="420" height="18" rx="9" fill="#a6b0be"/><rect x="65" y="177" width="340" height="18" rx="9" fill="#a6b0be"/><rect x="65" y="245" width="180" height="50" rx="15" fill="#3289ff"/></svg>');
const imageAttachment: HelpAttachment = { id: 'qa-image', name: 'Ошибка обмена.png', kind: 'IMAGE', mimeType: 'image/svg+xml', size: 600, url: imageUri };
const voiceAttachment: HelpAttachment = { id: 'qa-voice', name: 'Голосовое.wav', kind: 'AUDIO', mimeType: 'audio/wav', size: 128044, url: '' };

// Real expo-audio playback, but generated locally: no API, private files or network fixture.
let voiceUri: string | undefined;
let nativeVoiceUri: Promise<string> | undefined;
function wavUri() {
  if (voiceUri) return voiceUri;
  const rate = 8000, samples = rate * 8, bytes = new Uint8Array(44 + samples * 2), view = new DataView(bytes.buffer);
  const str = (at: number, value: string) => { for (let i = 0; i < value.length; i++) bytes[at + i] = value.charCodeAt(i); };
  str(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); str(8, 'WAVE'); str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); str(36, 'data'); view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, Math.sin(i / rate * Math.PI * 2 * 330) * Math.sin(i / rate * Math.PI * 3) ** 2 * 1800, true);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let encoded = '';
  for (let i = 0; i < bytes.length; i += 3) { const a = bytes[i], b = bytes[i + 1] || 0, c = bytes[i + 2] || 0; encoded += alphabet[a >> 2] + alphabet[((a & 3) << 4) | (b >> 4)] + (i + 1 < bytes.length ? alphabet[((b & 15) << 2) | (c >> 6)] : '=') + (i + 2 < bytes.length ? alphabet[c & 63] : '='); }
  voiceUri = `data:audio/wav;base64,${encoded}`; return voiceUri;
}
export const resolve: ResolveHelpMedia = async attachment => {
  if (attachment.id === voiceAttachment.id) {
    if (Platform.OS === 'web') return { uri: wavUri() };
    nativeVoiceUri ??= (async () => { const uri = `${FileSystem.cacheDirectory}help-qa-tone.wav`; await FileSystem.writeAsStringAsync(uri, wavUri().split(',')[1], { encoding: FileSystem.EncodingType.Base64 }); return uri; })();
    return { uri: await nativeVoiceUri };
  }
  if (Platform.OS !== 'web' && attachment.id === imageAttachment.id) return { uri: Image.resolveAssetSource(require('../../assets/images/icon.png')).uri };
  return { uri: attachment.url };
};
export function message(id: number, text: string, own = false, extra: Partial<HelpMessage> = {}): HelpMessage {
  return { id, ticketId: 1042, sequence: id, clientMessageId: null, authorId: own ? OWNER.id : IT.id, author: own ? OWNER : IT, authorRole: own ? 'USER' : 'IT', kind: 'TEXT', text, createdAt: new Date().toISOString(), editedAt: null, replyToId: null, replyTo: null, forwardedFromId: null, rating: null, attachments: [], reactions: [], ...extra };
}
export const fixtures = [
  message(1, 'Проверю заказ и статус обмена.'),
  message(2, 'Спасибо!', true),
  message(3, LONG, true),
  message(4, '', true, { attachments: [voiceAttachment] }),
  message(5, 'Заказ найден. Проверяю статус в приложении.', false, { reactions: [{ emoji: '❤️', count: 2, mine: true, userIds: [101, 203] }, { emoji: '👍', count: 1, mine: false, userIds: [203] }] }),
  message(6, 'Вот снимок ошибки.', true, { attachments: [imageAttachment] }),
  message(7, 'Спасибо, вижу ошибку. Проверяю.', false, { replyToId: 6, replyTo: { id: 6, text: 'Вот снимок ошибки.', author: OWNER, attachments: [imageAttachment] } }),
  message(8, 'Обмен восстановлен. Попробуйте снова.', false, { editedAt: new Date().toISOString() }),
];

function Preview() {
  const { theme, setTheme } = useTheme(); const c = useHelpTheme();
  useEffect(()=>helpDevActions('fixture.notifications',{'fixture.notification':()=>pushNotification({variant:'message',id:`qa-help-${Date.now()}`,groupKey:'qa-help-1043',title:'Не печатает принтер',message:'Проверьте подключение USB и очередь печати. Подготовил следующие шаги для решения проблемы.',icon:'hardware-chip-outline',avatarColor:helpAssistantAvatarColor(1043),backgroundColor:c.surface,textColor:c.text,borderColor:c.line,durationMs:8000})}),[c]);
  useEffect(() => installHelpCacheProbe(), []);
  useEffect(()=>helpDevActions('fixture.theme',{'fixture.theme':value=>{if(value==='dark'||value==='light')void setTheme(value);}}));
  const windowSize = useWindowDimensions();
  const [messages, setMessages] = useState(fixtures), [value, setValue] = useState(''), [files, setFiles] = useState<HelpLocalFile[]>([]);
  const [mode, setMode] = useState<HelpComposeMode>('message'), [rating, setRating] = useState(0), [selected, setSelected] = useState<number | null>(null), [quote, setQuote] = useState<HelpMessage | null>(null);
  const [notice, setNotice] = useState('QA: локальные данные · нет API и авторизации'), [gallery, setGallery] = useState<{ attachments: HelpAttachment[]; index: number } | null>(null);
  const [width, setWidth] = useState(390);
  const [toolbarHeight, setToolbarHeight] = useState(0);
  const params = Platform.OS === 'web' ? new URLSearchParams(window.location.search) : new Map([['screen', 'chat'], ['ticketId', '1042']]);
  const fullScreen = params.get('screen');
  const requestedHeight = Number(params.get('height'));
  const fixedHeight = requestedHeight >= 300 && requestedHeight <= 2000 ? requestedHeight : null;
  const inset = (key: string) => Math.min(150, Math.max(0, Number(params.get(key)) || 0));
  const safeInsets = { top: inset('insetTop'), bottom: inset('insetBottom'), left: 0, right: 0 };
  useEffect(() => {
    if (Platform.OS !== 'web' || !fixedHeight) return;
    // Expo's default reset hides body overflow. Snapshot mode must extend beyond
    // the browser viewport so a full-page screenshot includes the whole device.
    const nodes = [document.documentElement, document.body, document.getElementById('root')].filter((node): node is HTMLElement => !!node);
    const previous = nodes.map(node => ({ node, height: node.style.height, overflow: node.style.overflow, minHeight: node.style.minHeight }));
    nodes.forEach(node => { node.style.height = 'auto'; node.style.overflow = 'visible'; node.style.minHeight = '100%'; });
    return () => previous.forEach(({ node, height, overflow, minHeight }) => { node.style.height = height; node.style.overflow = overflow; node.style.minHeight = minHeight; });
  }, [fixedHeight]);
  useEffect(() => { if (Platform.OS !== 'web') { void setTheme('dark'); return; } const requested = params.get('theme'); if (requested === 'light' || requested === 'dark') void setTheme(requested); const w = Number(params.get('width')); if (w >= 280 && w <= 600) setWidth(w); if (params.get('composer') === 'long') setValue(Array.from({ length: 10 }, (_, i) => `${i + 1}. Проверка длинного текста в поле ввода.`).join('\n')); }, []);
  // No browser toolbar or fake insets on native: use the full real screen,
  // OS keyboard, safe area, PanResponder gestures and expo-audio recorder.
  if (Platform.OS !== 'web') return <View testID="help-qa-surface" style={{ flex: 1, width: windowSize.width, backgroundColor: c.background }}><StatusBar barStyle={c.dark ? 'light-content' : 'dark-content'}/><HelpScreen /></View>;
  const button = (label: string, onPress: () => void) => <Pressable key={label} accessibilityRole="button" onPress={onPress} style={{ backgroundColor: c.elevated, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}><Text style={{ color: c.text, fontSize: 12 }}>{label}</Text></Pressable>;
  return <View style={{ ...(fixedHeight ? { flexGrow: 1, flexShrink: 0, minHeight: fixedHeight + toolbarHeight, overflow: 'visible' as const } : { flex: 1 }), backgroundColor: c.background, alignItems: 'center' }}>
    <View onLayout={event => setToolbarHeight(event.nativeEvent.layout.height)} style={{ width: '100%', flexShrink: 0, padding: 8, borderBottomWidth: 1, borderColor: c.line, gap: 6 }}>
      <Text style={{ color: c.muted, fontSize: 11 }}>{notice}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>{button(theme === 'dark' ? 'Светлая' : 'Тёмная', () => void setTheme(theme === 'dark' ? 'light' : 'dark'))}{[320, 390, 430].map(w => button(`${w}px`, () => setWidth(w)))}{button('Длинный ввод', () => setValue(Array.from({ length: 10 }, (_, i) => `${i + 1}. Проверка длинного текста в поле ввода.`).join('\n')))}{button('Очистить ввод', () => setValue(''))}{button('Закрытие', () => setMode('close'))}{button('Повторное открытие', () => setMode('reopen'))}{button('Обычный ввод', () => setMode('message'))}</View>
    </View>
    <View testID="help-qa-surface" style={{ width, ...(fixedHeight ? { height: fixedHeight, minHeight: fixedHeight, flexGrow: 0, flexShrink: 0 } : { maxWidth: '100%' as const, flex: 1, minHeight: 0, borderLeftWidth: 1, borderRightWidth: 1, borderColor: c.line }) }}>
      {fullScreen ? <SafeAreaInsetsContext.Provider value={safeInsets}><HelpScreen /></SafeAreaInsetsContext.Provider> : <>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 8, gap: 8, borderBottomWidth: 1, borderColor: c.line, backgroundColor: c.headerSurface }}><HelpIcon name="arrow-back" label="Назад — QA" onPress={() => setNotice('QA: каталог не подключён')} /><View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: c.text, fontWeight: '600', fontSize: 16 }}>Не открывается заказ</Text><Text style={{ color: c.muted, fontSize: 11 }}>#1042 · 23.10.2026, 10:40 · QA</Text></View><HelpIcon name="ellipsis-horizontal" label="Действия — QA" onPress={() => setMode('close')} /></View>
      <ScrollView testID="help-qa-messages" keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 10, paddingBottom: 16 }}>
        <Text style={{ color: c.muted, textAlign: 'center', fontSize: 11, marginBottom: 12 }}>Сегодня</Text>
        {messages.map(m => <HelpMessageBubble key={m.id} message={m} userId={OWNER.id} open canInteract selected={selected === m.id} highlighted={false} solution={m.id === 8} resolve={resolve}
          onDismissMenu={() => setSelected(null)} onMenu={() => setSelected(selected === m.id ? null : m.id)} onReply={() => { setQuote(m); setSelected(null); }} onCopy={() => setNotice('QA: копирование выбрано')} onEdit={() => { setMode('edit'); setValue(m.text); setSelected(null); }} onForward={() => setNotice('QA: пересылка выбрана')}
          onReaction={emoji => setMessages(all => all.map(item => item.id !== m.id ? item : { ...item, reactions: item.reactions.some(r => r.emoji === emoji) ? item.reactions.filter(r => r.emoji !== emoji) : [...item.reactions, { emoji, count: 1, mine: true, userIds: [OWNER.id] }] }))}
          onQuote={id => { document.querySelector(`[data-testid="help-message-${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} onImage={(attachments, index) => setGallery({ attachments, index })} onFile={file => setNotice(`QA: файл ${file.name}`)} onCloseTicket={() => setMode('close')} onRequestIt={() => setNotice('QA: подключение IT не отправляется')} onError={setNotice} />)}
      </ScrollView>
      <View style={{ padding: 5, paddingBottom: 18 }}><HelpComposer value={value} onChange={setValue} files={files} onFiles={setFiles} busy={false} mode={mode} rating={rating} onRating={setRating} onCancelMode={() => setMode('message')} onCancelQuote={() => setQuote(null)} quote={quote ? { name: quote.author?.name || 'Сообщение', text: quote.text || 'Вложение', onPress: () => document.querySelector(`[data-testid="help-message-${quote.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), thumbnail: quote.attachments.find(a => a.kind === 'IMAGE') } : undefined} resolve={resolve} error={setNotice} onResize={() => {}} onSend={async voice => { setMessages(all => [...all, message(Date.now(), value || (voice ? 'QA: голосовое записано локально' : files.length ? `QA: выбрано файлов ${files.length}` : 'Обращение завершено'), true, mode === 'close' ? { kind: 'CLOSURE', rating } : {})]); setValue(''); setFiles([]); setQuote(null); setMode('message'); setNotice('QA: сообщение добавлено только в память страницы'); }} /></View>
      </>}
    </View>
    {gallery ? <HelpGallery attachments={gallery.attachments} initialIndex={gallery.index} resolve={resolve} onClose={() => setGallery(null)} onError={setNotice} /> : null}
  </View>;
}
export default function HelpPreview() { return <SafeAreaProvider><ThemeProvider><NotificationHost><DurableHelpProbe/><FixtureCacheBoundary><Preview /></FixtureCacheBoundary></NotificationHost></ThemeProvider></SafeAreaProvider>; }
