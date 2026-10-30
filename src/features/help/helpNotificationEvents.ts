import type {HelpPushTarget} from './helpPush';
export type HelpPushNotice=HelpPushTarget&{title?:string;body?:string};
const listeners=new Set<(notice:HelpPushNotice)=>void>();
export function emitHelpPushReceived(notice:HelpPushNotice){listeners.forEach(listener=>listener(notice));}
export function subscribeHelpPushReceived(listener:(notice:HelpPushNotice)=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
