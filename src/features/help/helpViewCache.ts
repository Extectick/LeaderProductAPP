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
export function shareHelpItems<T extends {id: number}>(previous: T[], incoming: T[]): T[] {
  if(previous===incoming || !previous.length)return incoming;
  const byId = new Map(previous.map(item=>[item.id,item]));
  const next = incoming.map(item=>{const old=byId.get(item.id);return old && (old===item || JSON.stringify(old)===JSON.stringify(item)) ? old : item;});
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
