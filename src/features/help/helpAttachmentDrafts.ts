import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { helpClientId, helpStorageKey } from './helpStorage';
import type { HelpLocalFile } from './components/HelpComposer';

type DraftFile = HelpLocalFile & { assetId?: string };
type Manifest = { version: 1; files: DraftFile[] };
const marker = ':attachment-draft:';
const held = new Map<string, number>(), garbage = new Set<string>();
let writes: Promise<unknown> = Promise.resolve();
const keyFor = (userId: number, key: string) => helpStorageKey(userId, `attachment-draft:${key}`);
const directory = () => FileSystem.documentDirectory ? `${FileSystem.documentDirectory}help-drafts/` : null;
function owned(uri: string) {
  const root = directory();
  return Boolean(root && uri.startsWith(root) && /^(?:photo|attachment)-[a-z0-9-]+\.[a-z0-9]{1,10}$/i.test(uri.slice(root.length)));
}
function decode(value: string | null): DraftFile[] {
  if (!value) return [];
  try {
    const record = JSON.parse(value) as Manifest;
    return record.version === 1 && Array.isArray(record.files) ? record.files.filter(file => file && typeof file.uri === 'string' && owned(file.uri) && typeof file.name === 'string').slice(0, 10) : [];
  } catch { return []; }
}
function serialized<T>(action: () => Promise<T>): Promise<T> {
  const next = writes.catch(() => {}).then(action); writes = next; return next;
}
function retain(files: readonly HelpLocalFile[]) {
  const uris = [...new Set(files.map(file => file.uri))];
  uris.forEach(uri => held.set(uri, (held.get(uri) ?? 0) + 1));
  return () => uris.forEach(uri => { const count = (held.get(uri) ?? 1) - 1; if (count) held.set(uri, count); else held.delete(uri); });
}
async function collectGarbage() {
  if (!garbage.size) return;
  // A prepared photo may intentionally be referenced by a restored/linked
  // draft. Never delete a file still owned by another account's manifest.
  const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith('help:v1:') && key.includes(marker));
  const referenced = new Set((await AsyncStorage.multiGet(keys)).flatMap(([, value]) => decode(value).map(file => file.uri)));
  for (const uri of garbage) {
    if (held.has(uri) || referenced.has(uri)) continue;
    if (owned(uri)) await FileSystem.deleteAsync(uri, { idempotent: true });
    garbage.delete(uri);
  }
}

/** Keep a submission's files alive while uploads or a competing draft write run. */
export function holdHelpAttachmentFiles(files: readonly HelpLocalFile[]): () => void {
  const release = retain(files); let active = true;
  return () => { if (!active) return; active = false; release(); void serialized(collectGarbage).catch(() => {}); };
}

export async function loadHelpAttachmentDraft(userId: number, key: string): Promise<HelpLocalFile[]> {
  if (Platform.OS === 'web' || userId <= 0) return [];
  await writes.catch(() => {});
  const files = decode(await AsyncStorage.getItem(keyFor(userId, key)));
  const available = await Promise.all(files.map(async file => {
    const info = await FileSystem.getInfoAsync(file.uri).catch(() => null);
    return info?.exists && !info.isDirectory ? file : null;
  }));
  return available.filter((file): file is DraftFile => file !== null);
}

/** Native manifests contain only owned, durable app files, never expiring picker URIs. */
export function saveHelpAttachmentDraft(userId: number, key: string, files: readonly DraftFile[]): Promise<HelpLocalFile[]> {
  if (Platform.OS === 'web') return Promise.resolve([...files]); // Browser File objects stay in the current session.
  if (userId <= 0) return Promise.reject(new Error('Учётная запись недоступна'));
  const snapshot = files.map(file => ({ ...file })), release = retain(snapshot);
  return serialized(async () => {
    const created: string[] = [];
    try {
      if (snapshot.length > 10) throw new Error('В одном сообщении можно прикрепить до 10 файлов.');
      const root = directory(); if (!root) throw new Error('Не удалось открыть папку черновиков приложения.');
      const storage = keyFor(userId, key), previous = decode(await AsyncStorage.getItem(storage)), durable: DraftFile[] = [];
      if (snapshot.length) await FileSystem.makeDirectoryAsync(root, { intermediates: true });
      for (const file of snapshot) {
        const info = await FileSystem.getInfoAsync(file.uri);
        if (!info.exists || info.isDirectory) throw new Error('Выбранный файл больше недоступен. Выберите его ещё раз.');
        if ((info.size ?? file.size ?? 0) > 20 * 1024 * 1024) throw new Error('Размер каждого файла должен быть не больше 20 МБ.');
        let uri = file.uri;
        if (!owned(uri)) {
          const extension = file.name.match(/\.([a-z0-9]{1,10})$/i)?.[1]?.toLowerCase() ?? 'bin';
          uri = `${root}attachment-${helpClientId()}.${extension}`;
          created.push(uri); await FileSystem.copyAsync({ from: file.uri, to: uri });
        }
        durable.push({ uri, name: file.name, mimeType: file.mimeType, size: info.size ?? file.size, width: file.width, height: file.height, ...(file.assetId ? { assetId: file.assetId } : {}) });
      }
      if (durable.length) await AsyncStorage.setItem(storage, JSON.stringify({ version: 1, files: durable } satisfies Manifest));
      else await AsyncStorage.removeItem(storage);
      previous.forEach(file => { if (!durable.some(next => next.uri === file.uri)) garbage.add(file.uri); });
      return durable;
    } catch (error) { created.forEach(uri => garbage.add(uri)); throw error; }
    finally { release(); await collectGarbage().catch(() => {}); }
  });
}

export async function clearHelpAttachmentDraft(userId: number, key: string) {
  await saveHelpAttachmentDraft(userId, key, []);
}
