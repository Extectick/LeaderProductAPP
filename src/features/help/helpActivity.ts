export type HelpActivity = { userId: number; ticketId: number | null };
const screens = new Map<object,HelpActivity>();
const listeners=new Set<()=>void>();
export function readHelpActivity(userId:number){return [...screens.values()].reverse().find(screen=>screen.userId===userId)?.ticketId??null;}
export function publishHelpActivity(owner:object,activity:HelpActivity){screens.set(owner,activity);listeners.forEach(listener=>listener());return()=>{if(screens.get(owner)===activity){screens.delete(owner);listeners.forEach(listener=>listener());}};}
export function subscribeHelpActivity(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
