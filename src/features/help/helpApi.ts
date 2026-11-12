import { Platform } from 'react-native';
import { jwtDecode } from 'jwt-decode';
import { apiClient } from '@/utils/apiClient';
import { API_BASE_URL } from '@/utils/config';
import { getAccessToken, getAccessTokenForRequest, refreshToken } from '@/utils/tokenService';
import { withDeadline } from '@/src/shared/network/withDeadline';
import type { HelpEvent, HelpHistoryPage, HelpHistoryQuery, HelpSearchResult, HelpSyncResult } from './helpHistoryTypes';
import type { HelpAssistantRun } from './helpAssistant';
import type {HelpClientContext} from './helpClientContext';
import type {HelpItBrief} from './helpItBrief';
import {downloadNativeHelpAudio,readCachedHelpAudio,readHelpAudioResponse,rememberDownloadedHelpAudio,rememberUploadedHelpAudio} from './helpAudioTransfer';

export type HelpUser = { id: number; name: string; avatarUrl: string | null };
export type HelpAttachment = { localUri?: string; durationMs?: number; id: string; name: string; mimeType: string; size: number; kind: 'IMAGE' | 'AUDIO' | 'FILE'; url: string; width?: number | null; height?: number | null; thumbnailDataUri?: string | null; position?: number };
export type HelpMessage = {
  itStatusChange?: 'REQUESTED' | 'JOINED' | 'LEFT' | 'AI_RESUMED' | null;
  ticketStatusChange?: 'CLOSED' | 'REOPENED' | null;
  assistantRun?: HelpAssistantRun;
  id: number; ticketId: number; sequence: number; clientMessageId: string | null;
  authorId: number | null; author: HelpUser | null; authorRole: 'USER' | 'IT' | 'SYSTEM';
  kind: 'TEXT' | 'CLOSURE' | 'SYSTEM' | 'ASSISTANT_PROGRESS'; text: string; createdAt: string; editedAt: string | null;
  replyToId: number | null; replyTo: { id: number; text: string; author?: HelpUser | null; attachments?: HelpAttachment[] } | null;
  forwardedFromId: number | null; rating: number | null; attachments: HelpAttachment[];
  reactions: { emoji: string; count: number; mine: boolean; userIds: number[] }[];
};
export type HelpTicket = {
  id: number; number: number; title: string; status: 'OPEN' | 'CLOSED'; ownerId: number;
  createdAt: string; updatedAt: string; closedAt: string | null; sourceTicketId: number | null;
  sourceTicket: { id: number; number: number; title: string } | null; itRequested: boolean;
  canRate?: boolean;
  members: { itDisplayName?: string; userId: number; role: 'OWNER' | 'IT'; user: HelpUser; lastReadSequence?: number }[];
  unreadCount: number; lastMessage: HelpMessage | null; canReopen: boolean; aiEnabled: boolean;
  lastReadSequence?: number; lastSequence?: number;
};
export type HelpDetail = { queued?:boolean; ticket: HelpTicket; messages: HelpMessage[] } & Partial<HelpHistoryPage>;
export type HelpConfig = { aiEnabled: boolean; canManage: boolean; maxAttachments: number; maxFileBytes: number };
export type HelpFile = { uri: string; name: string; mimeType?: string; file?: File };
export type HelpMessageInput = { text: string; attachmentIds?: string[]; replyToId?: number; forwardedFromId?: number; clientMessageId?: string; clientContext?:HelpClientContext };
export type HelpCreateInput = HelpMessageInput & { sourceTicketId?: number; clientTicketId?: string };
export type HelpCloseInput = { text: string; rating: number; attachmentIds?: string[]; clientMessageId?: string };
export type HelpMediaSource = { uri: string; headers?: Record<string, string>; cacheKey?: string };
export type HelpAudioTranscript = {attachmentId:string;status:'transcribed'|'no_speech'|'unavailable'|'pending'|'not_started';text?:string;truncated?:boolean;reason?:string};
export type HelpTransferProgress = {transferred:number;total:number|null};
export type HelpMediaResolveOptions = {signal?:AbortSignal;onProgress?:(value:HelpTransferProgress)=>void};
export class HelpApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}
type HelpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
type HelpAuth = { userId: number; token: string };
const AUTH_WAIT_TIMEOUT_MS = 15000;
async function waitForAuth<T>(work: Promise<T>): Promise<T> {
  try { return await withDeadline(work, AUTH_WAIT_TIMEOUT_MS); }
  catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new HelpApiError('Восстановление сессии занимает больше времени. Повторите попытку.', 408, 'REQUEST_TIMEOUT');
    }
    throw error;
  }
}
function tokenUserId(token: string | null): number | null {
  try { const id = Number(jwtDecode<{ userId?: number }>(token || '').userId); return Number.isSafeInteger(id) && id > 0 ? id : null; } catch { return null; }
}
function accountChanged(): never {
  // A previous request may already have committed; retain its immutable outbox item.
  throw new HelpApiError('Учётная запись изменилась. Вернитесь в исходную учётную запись для повтора.', 0, 'HELP_ACCOUNT_CHANGED');
}
async function captureAuth(expectedUserId?: number): Promise<HelpAuth> {
  const token = await waitForAuth(getAccessTokenForRequest()), userId = tokenUserId(token);
  if (!token || !userId) {
    if (expectedUserId !== undefined) accountChanged();
    throw new HelpApiError('Войдите в приложение для продолжения', 401, 'UNAUTHORIZED');
  }
  if (expectedUserId !== undefined && userId !== expectedUserId) accountChanged();
  return { token, userId };
}
async function assertAuth(auth: HelpAuth) {
  if (tokenUserId(await waitForAuth(getAccessToken())) !== auth.userId) accountChanged();
}
async function refreshAuth(auth: HelpAuth): Promise<HelpAuth> {
  await assertAuth(auth);
  const token = await waitForAuth(refreshToken());
  if (!token || tokenUserId(token) !== auth.userId) accountChanged();
  await assertAuth(auth);
  return { token, userId: auth.userId };
}
async function requestWithAuth<T>(path: string, method: HelpMethod, body: unknown, auth: HelpAuth, options?:{signal?:AbortSignal;timeoutMs?:number}): Promise<T> {
  const send = (session: HelpAuth) => apiClient<unknown, T>(`/help${path}`, {
    method, body, timeoutMs: options?.timeoutMs??30000, signal:options?.signal, skipAuth: true, headers: { Authorization: `Bearer ${session.token}` },
  });
  options?.signal?.throwIfAborted();
  await assertAuth(auth);
  let result = await send(auth);
  if (result.status === 401) result = await send(await refreshAuth(auth));
  await assertAuth(auth);
  options?.signal?.throwIfAborted();
  if (!result.ok || result.data === undefined) throw new HelpApiError(result.message || 'Не удалось выполнить действие. Попробуйте ещё раз.', result.status, result.backendErrorCode);
  return result.data;
}
export async function helpRequest<T>(path: string, method: HelpMethod = 'GET', body?: unknown, expectedUserId?: number): Promise<T> {
  return requestWithAuth<T>(path, method, body, await captureAuth(expectedUserId));
}
export function createHelpApi(expectedUserId?: number) {
  const helpRequest = async <T,>(path: string, method: HelpMethod = 'GET', body?: unknown) =>
    requestWithAuth<T>(path, method, body, await captureAuth(expectedUserId));
  return {
  audioTranscript: async (id:string,request:boolean,signal?:AbortSignal) => requestWithAuth<HelpAudioTranscript>(`/attachments/${encodeURIComponent(id)}/transcript`,request?'POST':'GET',request?{}:undefined,await captureAuth(expectedUserId),{signal,timeoutMs:request?120000:30000}),
  events: (after=0) => helpRequest<{events:HelpEvent[];nextCursor:number;hasMore:boolean;resyncRequired?:boolean;snapshotCursor?:number;visibleTicketIds?:number[];visibilityComplete?:boolean}>(`/events?after=${after}`),
  stopAssistant: (id:number,runId:string) => helpRequest<HelpDetail>(`/tickets/${id}/assistant/stop`,'POST',{runId}),
  retryAssistant: (id:number,runId:string) => helpRequest<HelpDetail>(`/tickets/${id}/assistant/retry`,'POST',{runId}),
  config: () => helpRequest<HelpConfig>('/config'),
  list: (status: string, scope: string, cursor?: string | number, query = '') => helpRequest<{ tickets: HelpTicket[]; nextCursor: string | number | null }>(`/tickets?status=${status}&scope=${scope}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}${query ? `&q=${encodeURIComponent(query)}` : ''}`),
  detail: (id: number) => helpRequest<HelpDetail>(`/tickets/${id}`),
  itBrief: (id: number) => helpRequest<HelpItBrief>(`/tickets/${id}/it-brief`),
  summaries: (ids:number[]) => helpRequest<{tickets:HelpTicket[]}>('/tickets/summaries','POST',{ids}),
  messages: (id: number, query: HelpHistoryQuery | number = {}) => {
    const options = typeof query === 'number' ? {before:query} : query;
    const params = new URLSearchParams({limit:String(options.limit ?? 100)});
    for (const name of ['before','after','around','aroundMessageId'] as const) if (options[name] !== undefined) params.set(name,String(options[name]));
    return helpRequest<HelpHistoryPage>(`/tickets/${id}/messages?${params}`);
  },
  search: (id:number, query:string, before?:number) => helpRequest<HelpSearchResult>(`/tickets/${id}/search?q=${encodeURIComponent(query)}&limit=30${before ? `&before=${before}` : ''}`),
  date: (id:number, from:string, to:string) => helpRequest<{messageId:number;sequence:number}>(`/tickets/${id}/date?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  sync: (id:number, after=0) => helpRequest<HelpSyncResult>(`/tickets/${id}/sync?after=${after}&limit=200`),
  create: (input: HelpCreateInput) => helpRequest<HelpDetail>('/tickets', 'POST', input),
  send: (id: number, input: HelpMessageInput) => helpRequest<HelpDetail>(`/tickets/${id}/messages`, 'POST', input),
  close: (id: number, input: HelpCloseInput) => helpRequest<HelpDetail>(`/tickets/${id}/close`, 'POST', input),
  reopen: (id: number, input: HelpMessageInput) => helpRequest<HelpDetail>(`/tickets/${id}/reopen`, 'POST', input),
  leaveIt: (id: number) => helpRequest<HelpDetail>(`/tickets/${id}/leave-it`, 'POST', {}),
  closeIt: (id: number) => helpRequest<HelpDetail>(`/tickets/${id}/close-it`, 'POST', {}),
  continueAi: (id: number) => helpRequest<HelpDetail>(`/tickets/${id}/continue-ai`, 'POST', {}),
  requestIt: (id: number) => helpRequest<HelpDetail>(`/tickets/${id}/request-it`, 'POST', {}),
  claim: (id: number) => helpRequest<HelpDetail>(`/tickets/${id}/claim`, 'POST', {}),
  read: (id: number, sequence?: number) => helpRequest(`/tickets/${id}/read`, 'POST', { sequence }),
  readAll: () => helpRequest('/read-all', 'POST', {}),
  edit: (id: number, input: { text: string; rating?: number; attachmentIds?: string[] }) => helpRequest<HelpDetail>(`/messages/${id}`, 'PATCH', input),
  react: (id: number, emoji: string, remove: boolean) => helpRequest<HelpDetail>(`/messages/${id}/reactions/${encodeURIComponent(emoji)}`, remove ? 'DELETE' : 'PUT', {}),
  };
}
export const helpApi = createHelpApi();

export async function uploadHelpFiles(files: HelpFile[], expectedUserId?: number, onProgress?:(value:HelpTransferProgress)=>void): Promise<HelpAttachment[]> {
  if (!files.length || files.length > 10) throw new Error('Можно прикрепить от 1 до 10 файлов.');
  const reportProgress=(value:HelpTransferProgress)=>{try{onProgress?.(value);}catch{/* A UI observer cannot fail a durable upload. */}};
  let auth = await captureAuth(expectedUserId);
  if (Platform.OS === 'android') {
    // Read local recordings on the native side. RN fetch/FormData can fail
    // before issuing HTTP for file-backed multipart bodies on Android.
    const fs:typeof import('expo-file-system/legacy') = require('expo-file-system/legacy');
    const attachments:HelpAttachment[]=[];
    for(const file of files){
      await assertAuth(auth);
      const info=await fs.getInfoAsync(file.uri);
      if(!info.exists||info.isDirectory)throw new HelpApiError('Файл вложения недоступен. Выберите его заново или повторите запись.',0,'HELP_FILE_UNAVAILABLE');
      await assertAuth(auth);
      const upload=async()=>{
        // The native multipart writer uses the URI basename as filename. Draft
        // storage uses opaque names, so stage a named copy without altering it.
        const name=file.name.replace(/[\\/\u0000-\u001f]/g,'_');
        const root=fs.cacheDirectory;
        if(!root)throw new HelpApiError('Не удалось открыть папку вложений.',0,'HELP_FILE_UNAVAILABLE');
        const directory=`${root}help-upload-${Date.now()}-${Math.random().toString(36).slice(2)}/`;
        const uri=directory+encodeURIComponent(name&&name!=='.'&&name!=='..'?name:'attachment');
        await fs.makeDirectoryAsync(directory,{intermediates:true});
        try{
          await fs.copyAsync({from:file.uri,to:uri});
          await assertAuth(auth);
          const task=fs.createUploadTask(`${API_BASE_URL.replace(/\/$/,'')}/help/attachments`,uri,{
            httpMethod:'POST',uploadType:fs.FileSystemUploadType.MULTIPART,fieldName:'files',mimeType:file.mimeType||'application/octet-stream',
            headers:{Authorization:`Bearer ${auth.token}`},parameters:{},
          },...(onProgress?[((value:{totalBytesSent:number;totalBytesExpectedToSend:number})=>reportProgress({transferred:value.totalBytesSent,total:value.totalBytesExpectedToSend>0?value.totalBytesExpectedToSend:null}))] as const:[]));
          const timer=setTimeout(()=>{void task.cancelAsync().catch(()=>{});},30000);
          try{return await task.uploadAsync();}
          catch{throw new HelpApiError('Не удалось загрузить вложение. Проверьте соединение и повторите отправку. Запись сохранена.',0,'HELP_UPLOAD_FAILED');}
          finally{clearTimeout(timer);await Promise.resolve(task.cancelAsync()).catch(()=>{});}
        }finally{await fs.deleteAsync(directory,{idempotent:true}).catch(()=>{});}
      };
      let result=await upload();
      await assertAuth(auth);
      if(result?.status===401){auth=await refreshAuth(auth);result=await upload();await assertAuth(auth);}
      if(!result)throw new HelpApiError('Загрузка вложения прервана. Повторите отправку.',408,'HELP_UPLOAD_TIMEOUT');
      let body:any;try{body=JSON.parse(result.body);}catch{throw new HelpApiError('Сервер вернул некорректный ответ при загрузке вложения.',result.status);}
      if(result.status<200||result.status>=300)throw new HelpApiError(typeof body.message==='string'?body.message:'Не удалось загрузить вложение.',result.status,body.error?.code);
      const rows=(body.data??body).attachments;
      if(!Array.isArray(rows)||rows.length!==1)throw new HelpApiError('Сервер не подтвердил загрузку вложения. Повторите отправку.',result.status);
      attachments.push(rows[0]);
      await rememberUploadedHelpAudio(auth.userId,rows[0],file).catch(()=>{});
      await assertAuth(auth);
    }
    return attachments;
  }
  const form = new FormData();
  for (const file of files) {
    if (Platform.OS === 'web') {
      const blob = file.file || await (await fetch(file.uri)).blob();
      form.append('files', blob, file.name);
    } else form.append('files', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' } as any);
  }
  let data:{attachments:HelpAttachment[]};
  if(onProgress&&typeof XMLHttpRequest!=='undefined'){
    const send=()=>new Promise<{status:number;body:any}>((resolve,reject)=>{
      const xhr=new XMLHttpRequest();xhr.open('POST',`${API_BASE_URL.replace(/\/$/,'')}/help/attachments`);xhr.setRequestHeader('Authorization',`Bearer ${auth.token}`);xhr.timeout=30000;
      xhr.upload.onprogress=event=>reportProgress({transferred:event.loaded,total:event.lengthComputable&&event.total>0?event.total:null});
      xhr.onload=()=>{try{resolve({status:xhr.status,body:JSON.parse(xhr.responseText)});}catch{reject(new HelpApiError('Некорректный ответ сервера при отправке',xhr.status));}};
      xhr.onerror=xhr.ontimeout=xhr.onabort=()=>reject(new HelpApiError('Не удалось загрузить вложение. Повторите отправку.',0,'HELP_UPLOAD_FAILED'));
      xhr.send(form);
    });
    await assertAuth(auth);let response=await send();await assertAuth(auth);
    if(response.status===401){auth=await refreshAuth(auth);response=await send();await assertAuth(auth);}
    if(response.status<200||response.status>=300)throw new HelpApiError('Не удалось загрузить вложение',response.status);
    data=response.body.data??response.body;
    if(!Array.isArray(data.attachments)||data.attachments.length!==files.length)throw new HelpApiError('Сервер не подтвердил вложение',response.status);
  }else data=await requestWithAuth<{attachments:HelpAttachment[]}>('/attachments','POST',form,auth);
  for(let index=0;index<data.attachments.length;index++)await rememberUploadedHelpAudio(auth.userId,data.attachments[index],files[index]).catch(()=>{});
  await assertAuth(auth);
  return data.attachments;
}

// Never send account tokens to an arbitrary URL supplied by message content.
export function helpAttachmentUrl(attachment: HelpAttachment): string {
  const url = new URL(attachment.url, `${API_BASE_URL}/`);
  const base = new URL(API_BASE_URL);
  if (url.origin !== base.origin || !url.pathname.startsWith(`${base.pathname.replace(/\/$/, '')}/help/attachments/`)) throw new Error('Недопустимый адрес вложения');
  return url.toString();
}
export async function loadHelpMedia(attachment: HelpAttachment, expectedUserId?: number, options?:HelpMediaResolveOptions): Promise<HelpMediaSource> {
  const uri = helpAttachmentUrl(attachment);
  let auth = await captureAuth(expectedUserId);
  await assertAuth(auth);
  if(attachment.kind==='AUDIO'){
    options?.signal?.throwIfAborted();
    const cached=await readCachedHelpAudio(auth.userId,attachment);
    if(cached){try{await assertAuth(auth);options?.signal?.throwIfAborted();return{uri:cached};}catch(error){if(cached.startsWith('blob:'))URL.revokeObjectURL(cached);throw error;}}
    const signal=options?.signal?AbortSignal.any([options.signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000);
    const transfer={...options,signal};
    if(Platform.OS!=='web'){
      let result=await downloadNativeHelpAudio(auth.userId,attachment,uri,{Authorization:`Bearer ${auth.token}`},transfer);await assertAuth(auth);
      if(result.status===401){auth=await refreshAuth(auth);result=await downloadNativeHelpAudio(auth.userId,attachment,uri,{Authorization:`Bearer ${auth.token}`},transfer);await assertAuth(auth);}
      signal.throwIfAborted();if(result.status!==200)throw new HelpApiError('Голосовое сообщение недоступно',result.status);
      return {uri:result.uri};
    }
    let response=await fetch(uri,{headers:{Authorization:`Bearer ${auth.token}`},signal});
    if(response.status===401){auth=await refreshAuth(auth);response=await fetch(uri,{headers:{Authorization:`Bearer ${auth.token}`},signal});}
    await assertAuth(auth);if(!response.ok)throw new HelpApiError('Голосовое сообщение недоступно',response.status);
    const blob=await readHelpAudioResponse(response,attachment,transfer);await assertAuth(auth);signal.throwIfAborted();
    rememberDownloadedHelpAudio(auth.userId,attachment,blob);return{uri:URL.createObjectURL(blob)};
  }
  if (Platform.OS !== 'web') return { uri, headers: { Authorization: `Bearer ${auth.token}` }, cacheKey: `help:${auth.userId}:${attachment.id}:${API_BASE_URL}` };
  let response = await fetch(uri, { headers: { Authorization: `Bearer ${auth.token}` } });
  if (response.status === 401) {
    auth = await refreshAuth(auth);
    response = await fetch(uri, { headers: { Authorization: `Bearer ${auth.token}` } });
  }
  await assertAuth(auth);
  if (!response.ok) throw new HelpApiError('Вложение недоступно', response.status);
  const blob = await response.blob();
  await assertAuth(auth);
  return { uri: URL.createObjectURL(blob) };
}

/** Bounded authenticated reads for generated HTML descriptors; never render an authenticated URL. */
export async function loadHelpAttachmentText(attachment:HelpAttachment,expectedUserId:number,signal:AbortSignal,maxBytes:number):Promise<string>{
  if(!Number.isSafeInteger(attachment.size)||attachment.size<1||attachment.size>maxBytes)throw new HelpApiError('Пример недоступен',0,'HELP_HTML_INVALID');
  const uri=helpAttachmentUrl(attachment);let auth=await captureAuth(expectedUserId);
  const combined=AbortSignal.any([signal,AbortSignal.timeout(15000)]);
  const send=()=>fetch(uri,{headers:{Authorization:`Bearer ${auth.token}`},signal:combined});
  await assertAuth(auth);let response=await send();
  if(response.status===401){auth=await refreshAuth(auth);response=await send();}
  await assertAuth(auth);combined.throwIfAborted();
  if(!response.ok)throw new HelpApiError('Пример недоступен',response.status);
  const length=Number(response.headers.get('content-length'));
  if(Number.isFinite(length)&&length>maxBytes)throw new HelpApiError('Пример слишком большой',0,'HELP_HTML_INVALID');
  const text=await response.text();await assertAuth(auth);combined.throwIfAborted();
  if(text.length>maxBytes||new TextEncoder().encode(text).length>maxBytes)throw new HelpApiError('Пример слишком большой',0,'HELP_HTML_INVALID');
  return text;
}
