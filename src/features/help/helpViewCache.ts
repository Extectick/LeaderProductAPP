import type { HelpMessage, HelpTicket } from './helpApi';
import type { HelpHistoryPage, HelpViewportAnchor } from './helpHistoryTypes';

export type HelpViewWindow = {ticket: HelpTicket; page: HelpHistoryPage; anchor: HelpViewportAnchor | null};
type ViewCache = {lists: Map<string, HelpTicket[]>; windows: Map<number, HelpViewWindow>};
const scopes = new Map<string, ViewCache>();
export const helpListCacheKey = (status: string, scope: string, query = '') => JSON.stringify([status,scope,query]);
export function helpViewCache(identity: string): ViewCache {
  let cache = scopes.get(identity);
  if (!cache) { cache = {lists:new Map(),windows:new Map()}; scopes.set(identity,cache); }
  if (scopes.size > 8) scopes.delete(scopes.keys().next().value!);
  return cache;
}
/** Keep references for unchanged rows/cells, including quiet socket repairs. */
function sameHelpValue(a: unknown, b: unknown): boolean {
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
  if(Array.isArray(a)!==Array.isArray(b))return false;
  const left=a as Record<string,unknown>,right=b as Record<string,unknown>;
  const keys=Object.keys(left),otherKeys=Object.keys(right);
  return keys.length===otherKeys.length&&keys.every(key=>Object.prototype.hasOwnProperty.call(right,key)&&sameHelpValue(left[key],right[key]));
}
export function shareHelpItems<T extends {id: number}>(previous: T[], incoming: T[]): T[] {
  if(previous===incoming || !previous.length)return incoming;
  const byId = new Map(previous.map(item=>[item.id,item]));
  const next = incoming.map(item=>{const old=byId.get(item.id);return old && sameHelpValue(old,item) ? old : item;});
  return next.length===previous.length && next.every((item,index)=>item===previous[index]) ? previous : next;
}
export function rememberHelpWindow(identity: string, window: HelpViewWindow) {
  const cache=helpViewCache(identity);cache.windows.delete(window.ticket.id);cache.windows.set(window.ticket.id,window);
  if(cache.windows.size>30)cache.windows.delete(cache.windows.keys().next().value!);
}
export function forgetHelpView(identity: string, ticketId: number) {
  const cache=helpViewCache(identity);cache.windows.delete(ticketId);
  for(const [key,list] of cache.lists)if(list.some(ticket=>ticket.id===ticketId))cache.lists.set(key,list.filter(ticket=>ticket.id!==ticketId));
}
