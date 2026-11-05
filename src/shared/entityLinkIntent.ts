import {buildEntityLink,parseEntityLink} from './entityLinks';
// One explicit external navigation intent, never credentials or an authorization grant.
let pending:string|null=null;
export function queueEntityLinkIntent(url:string):boolean {
 const target=parseEntityLink(url);if(!target)return false;
 pending=buildEntityLink(target);return true;
}
export function takeEntityLinkIntent():string|null {const url=pending;pending=null;return url;}
export function hasEntityLinkIntent():boolean {return pending!==null;}
export function redirectEntitySystemPath(path:string):string {
 return queueEntityLinkIntent(path)?'/entity-link':path;
}
