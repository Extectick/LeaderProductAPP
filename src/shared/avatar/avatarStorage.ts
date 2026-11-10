import * as FileSystem from 'expo-file-system/legacy';

const directory = () => FileSystem.cacheDirectory ? `${FileSystem.cacheDirectory}user-avatars-v1/` : null;
const pathFor = (key: string) => {
  const dir = directory();
  if (!dir || !/^[a-zA-Z0-9_-]{1,220}$/.test(key)) throw Error('AVATAR_CACHE_UNAVAILABLE');
  return dir + key;
};
export async function readAvatarFile(key: string): Promise<string | null> {
  try { const path = pathFor(key), info = await FileSystem.getInfoAsync(path);
    return info.exists && !info.isDirectory && info.size > 0 && info.size <= 10 * 1024 * 1024 ? path : null;
  } catch { return null; }
}
export async function removeAvatarFile(key: string) {
  await FileSystem.deleteAsync(pathFor(key), { idempotent: true }).catch(() => {});
}
let sequence = 0;
export async function downloadAvatarFile(key: string, uri: string, token: string, signal: AbortSignal, validate?: () => Promise<void>): Promise<string> {
  const path = pathFor(key), temporary = `${path}.pending-${Date.now()}-${++sequence}`;
  await FileSystem.makeDirectoryAsync(directory()!, { intermediates: true });
  signal.throwIfAborted();
  const task = FileSystem.createDownloadResumable(uri, temporary, { headers: { Authorization: `Bearer ${token}` } });
  const cancel = () => { void task.cancelAsync().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const result = await task.downloadAsync(); signal.throwIfAborted();
    if (result?.status !== 200) throw Object.assign(Error('AVATAR_DOWNLOAD_FAILED'), { status: result?.status });
    const contentType=Object.entries(result.headers||{}).find(([key])=>key.toLowerCase()==='content-type')?.[1]?.split(';')[0];
    if(!contentType||!['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(contentType))throw Error('AVATAR_INVALID_TYPE');
    const info = await FileSystem.getInfoAsync(temporary); signal.throwIfAborted();
    if (!info.exists || info.isDirectory || !info.size || info.size > 10 * 1024 * 1024) throw Error('AVATAR_INVALID_SIZE');
    // A unique temporary path never becomes a reusable cache entry until complete.
    await validate?.(); signal.throwIfAborted();
    await FileSystem.moveAsync({ from: temporary, to: path }); signal.throwIfAborted();
    void pruneAvatarFiles(path);
    return path;
  } finally {
    signal.removeEventListener('abort', cancel);
    await task.cancelAsync().catch(() => {});
    await FileSystem.deleteAsync(temporary, { idempotent: true }).catch(() => {});
  }
}
async function pruneAvatarFiles(keep: string) {
  try {
    const dir = directory()!;
    const names = (await FileSystem.readDirectoryAsync(dir)).filter(name => !name.includes('.pending-'));
    if (names.length <= 32) return;
    const files = await Promise.all(names.map(async name => ({ path: dir + name, info: await FileSystem.getInfoAsync(dir + name) })));
    files.sort((a,b) => (a.info.exists ? a.info.modificationTime : 0) - (b.info.exists ? b.info.modificationTime : 0));
    for (const file of files.filter(file => file.path !== keep).slice(0, names.length - 32)) await FileSystem.deleteAsync(file.path, { idempotent: true });
  } catch { /* Cache eviction cannot invalidate an otherwise usable photograph. */ }
}
