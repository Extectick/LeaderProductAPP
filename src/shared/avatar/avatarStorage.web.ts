const DATABASE = 'leader-user-avatars-v1';
const STORE = 'images';
type Entry = { key: string; blob: Blob; savedAt: number };
async function database(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') throw Error('AVATAR_CACHE_UNAVAILABLE');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let settled=false;
    const timer = setTimeout(() => {settled=true;reject(Error('AVATAR_CACHE_TIMEOUT'));}, 2000);
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE, { keyPath: 'key' }); };
    request.onsuccess = () => { clearTimeout(timer);if(settled){request.result.close();return;}settled=true;resolve(request.result); };
    request.onerror = request.onblocked = () => { clearTimeout(timer);settled=true;reject(Error('AVATAR_CACHE_UNAVAILABLE')); };
  });
}
async function transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  try { return await new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode), request = operation(tx.objectStore(STORE));
    const timer = setTimeout(() => { try { tx.abort(); } catch {} reject(Error('AVATAR_CACHE_TIMEOUT')); }, 2000);
    tx.oncomplete = () => { clearTimeout(timer); resolve(request.result); };
    tx.onerror = tx.onabort = () => { clearTimeout(timer); reject(Error('AVATAR_CACHE_UNAVAILABLE')); };
  }); } finally { db.close(); }
}
export async function readAvatarBlob(key: string): Promise<Blob | null> {
  try { const value = await transact<Entry | undefined>('readonly', store => store.get(key));
    return value?.blob instanceof Blob && value.blob.size > 0 && value.blob.size <= 10*1024*1024 ? value.blob : null;
  } catch { return null; }
}
export async function writeAvatarBlob(key: string, blob: Blob) {
  try {
    await transact('readwrite', store => store.put({ key, blob, savedAt: Date.now() }));
    const rows = await transact<Entry[]>('readonly', store => store.getAll());
    rows.sort((a,b) => a.savedAt-b.savedAt);
    for (const row of rows.slice(0, Math.max(0,rows.length-32))) await removeAvatarBlob(row.key);
  } catch { /* Private mode/quota failures leave the memory cache working. */ }
}
export async function removeAvatarBlob(key: string) {
  try { await transact('readwrite', store => store.delete(key)); } catch {}
}

export async function readAvatarFile(key: string): Promise<string | null> {
  const blob = await readAvatarBlob(key);
  return blob ? URL.createObjectURL(blob) : null;
}
export const removeAvatarFile = removeAvatarBlob;
export async function downloadAvatarFile(key: string, uri: string, token: string, signal: AbortSignal, validate?: () => Promise<void>): Promise<string> {
  const response = await fetch(uri, { headers: { Authorization: `Bearer ${token}` }, signal, redirect: 'error', credentials: 'omit' });
  if (!response.ok) throw Object.assign(Error('AVATAR_DOWNLOAD_FAILED'), { status: response.status });
  const type = response.headers.get('content-type')?.split(';')[0] || '';
  if (!['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(type)) throw Error('AVATAR_INVALID_TYPE');
  const limit = 10 * 1024 * 1024;
  if (Number(response.headers.get('content-length')) > limit) throw Error('AVATAR_INVALID_SIZE');
  let blob: Blob;
  if (response.body?.getReader) {
    const reader = response.body.getReader(), chunks: Uint8Array<ArrayBuffer>[] = []; let size = 0;
    try { for (;;) { const part = await reader.read(); signal.throwIfAborted(); if (part.done) break;
      size += part.value.byteLength; if (size > limit) throw Error('AVATAR_INVALID_SIZE'); chunks.push(new Uint8Array(part.value));
    } } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    blob = new Blob(chunks, { type });
  } else blob = await response.blob();
  signal.throwIfAborted(); if (!blob.size || blob.size > limit) throw Error('AVATAR_INVALID_SIZE');
  await validate?.(); signal.throwIfAborted();
  await writeAvatarBlob(key, blob); signal.throwIfAborted();
  return URL.createObjectURL(blob);
}
