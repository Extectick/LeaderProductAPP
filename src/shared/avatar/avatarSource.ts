import type { ImageSource } from 'expo-image';
import { jwtDecode } from 'jwt-decode';
import { API_BASE_URL } from '@/utils/config';
import { getAccessToken, getAccessTokenForRequest, refreshToken, onAuthSessionExpired } from '@/utils/tokenService';
import { readAvatarFile, downloadAvatarFile, removeAvatarFile } from './avatarStorage';

type Asset = { uri: string; key: string };
type Entry = { source?: ImageSource; promise?: Promise<ImageSource | null>; controller?: AbortController; used: number; failedAt?: number; cacheOnly?: boolean };
const entries = new Map<string, Entry>();
let generation = 0;
const retired = new Map<string, ReturnType<typeof setTimeout>>();
const tokenUserId = (token: string | null) => { try { return Number(jwtDecode<{userId?:number}>(token || '').userId) || null; } catch { return null; } };
/** Only this exact authenticated route can receive an app Bearer token. */
export function avatarAsset(uri: string, viewerId: number): Asset | null {
  try {
    const base = new URL(API_BASE_URL), url = new URL(uri.startsWith('/') ? `${API_BASE_URL}${uri}` : uri);
    const prefix = base.pathname.replace(/\/$/, '');
    if (url.origin !== base.origin || url.search || url.hash || url.username || url.password) return null;
    const match = url.pathname.slice(prefix.length).match(/^\/users\/([1-9]\d*)\/avatars\/(USER|CLIENT|SUPPLIER|EMPLOYEE)\/([a-f0-9]{64})$/);
    if (!url.pathname.startsWith(prefix+'/') || !match || !Number.isSafeInteger(viewerId) || viewerId <= 0) return null;
    // API origin is represented without secrets; prevents reuse against another environment.
    const origin = Array.from(API_BASE_URL).map(char => char.charCodeAt(0).toString(16).padStart(2,'0')).join('');
    return {uri:url.href,key:`${origin}-${viewerId}-${match[1]}-${match[2]}-${match[3]}`};
  } catch { return null; }
}
export function peekAvatar(uri: string, viewerId: number): ImageSource | null {
  const asset = avatarAsset(uri, viewerId);
  if (!asset) return {uri};
  const entry = entries.get(asset.key); if (entry) entry.used = Date.now();
  return entry?.source || null;
}
function revoke(source?: ImageSource) { if(source?.uri?.startsWith('blob:')) URL.revokeObjectURL(source.uri); }
function prune() {
  if(entries.size <= 32) return;
  for(const [key, entry] of [...entries].sort((a,b)=>a[1].used-b[1].used)) {
    if(entries.size <= 32) break;
    // Do not revoke a blob still transitioning on-screen.
    if(entry.promise || Date.now()-entry.used<60000) continue;
    revoke(entry.source); entries.delete(key);
  }
}
export function clearAvatarMemory() {
  generation++;
  for (const entry of entries.values()) {entry.controller?.abort();revoke(entry.source);}
  entries.clear();
  for(const [uri,timer] of retired){clearTimeout(timer);URL.revokeObjectURL(uri);}retired.clear();
}
onAuthSessionExpired(clearAvatarMemory);
export async function loadAvatar(uri: string, viewerId: number, force = false, cacheOnly = false): Promise<ImageSource | null> {
  const asset = avatarAsset(uri, viewerId); if(!asset) return {uri};
  const old = entries.get(asset.key);
  if(old?.promise) return old.cacheOnly && !cacheOnly ? old.promise.then(value=>value||loadAvatar(uri,viewerId,force)) : old.promise;
  if(!force && old?.source) return old.source;
  if(!force && old?.failedAt && Date.now()-old.failedAt<30000) return null;
  if(force && old?.source?.uri?.startsWith('blob:')) {
    const previous=old.source.uri;
    retired.set(previous,setTimeout(()=>{URL.revokeObjectURL(previous);retired.delete(previous);},60000));
  }
  const entry: Entry = {used:Date.now(),cacheOnly}, controller = new AbortController(), captured = generation;
  entry.controller=controller;entries.set(asset.key,entry);
  const timeout=setTimeout(()=>controller.abort(),15000);
  const check=async()=>{
    controller.signal.throwIfAborted();
    if(captured!==generation || tokenUserId(await getAccessToken())!==viewerId) throw Error('AVATAR_ACCOUNT_CHANGED');
  };
  entry.promise=(async()=>{
    let local: string | null = null;
    try {
      if(force) await removeAvatarFile(asset.key);
      else local=await readAvatarFile(asset.key);
      controller.signal.throwIfAborted();
      if(!local){
        if(cacheOnly)return null;
        let token=await getAccessTokenForRequest();
        if(!token||tokenUserId(token)!==viewerId) throw Error('AVATAR_ACCOUNT_CHANGED');
        await check();
        try { local=await downloadAvatarFile(asset.key,asset.uri,token,controller.signal,check); }
        catch(error){
          if((error as {status?:number})?.status!==401) throw error;
          await check(); token=await refreshToken();
          if(!token||tokenUserId(token)!==viewerId) throw Error('AVATAR_ACCOUNT_CHANGED');
          local=await downloadAvatarFile(asset.key,asset.uri,token,controller.signal,check);
        }
      }
      await check();
      const source={uri:local,cacheKey:asset.key};entry.source=source;entry.used=Date.now();prune();return source;
    } catch {
      if(local?.startsWith('blob:'))URL.revokeObjectURL(local);
      entry.failedAt=Date.now();return null;
    } finally {clearTimeout(timeout);entry.promise=undefined;entry.controller=undefined;}
  })();
  return entry.promise;
}

/** Warm local bytes during auth restoration; never hold startup for a network download. */
export async function primeOwnAvatar(profile: {id:number;avatarAssetUrl?:string|null}) {
  const uri=profile.avatarAssetUrl;
  if(!uri||!avatarAsset(uri,profile.id))return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  try { await Promise.race([loadAvatar(uri,profile.id,false,true),new Promise<void>(resolve=>{timer=setTimeout(resolve,150);})]); }
  finally {if(timer)clearTimeout(timer);}
}
