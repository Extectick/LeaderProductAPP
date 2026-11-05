import type {HelpAttachment} from './helpApi';
import {helpHtmlEntityTarget,validateHelpHtmlImageDataUrl} from './helpHtmlEntity';

export const HELP_HTML_MIME='application/vnd.leaderproduct.help-html+json';
export const HELP_HTML_MAX_BYTES=192*1024;
const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const filePattern=new RegExp(`^(${uuid})\\.help-html\\.json$`,'i');
const linkPattern=new RegExp(`^leaderproduct://help-html/(${uuid})$`,'i');
export type HelpHtmlVariant={html:string;css:string};
export type HelpHtmlArtifact={version:1;id:string;title:string;description:string;compact?:HelpHtmlVariant;full?:HelpHtmlVariant;entity?:{url:string}};
export function helpHtmlAttachmentId(file:HelpAttachment):string|null {
 return file.kind==='FILE'&&file.mimeType.toLowerCase()===HELP_HTML_MIME?file.name.match(filePattern)?.[1].toLowerCase()??null:null;
}
export function parseHelpHtmlLink(url:string):string|null{return url.match(linkPattern)?.[1].toLowerCase()??null;}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function variant(value:unknown):HelpHtmlVariant|undefined {
 if(value===undefined||value===null)return undefined;
 if(!record(value)||Object.keys(value).some(key=>!['html','css'].includes(key))||typeof value.html!=='string'||!value.html.trim()||value.html.length>48000||typeof value.css!=='string'||value.css.length>24000)throw Error('HELP_HTML_INVALID');
 // CSP and disabled scripting remain the enforcement boundary. Reject document
 // controls as defence in depth, even if an attachment bypassed server rendering.
 if(/<\s*\/?\s*(?:script|style|meta|base|link|iframe|frame|object|embed|form|input|button|textarea|select|audio|video|svg|math|picture|source)\b/i.test(value.html)||/<|\u0000/.test(value.css))throw Error('HELP_HTML_INVALID');
 return {html:value.html,css:value.css};
}
export function parseHelpHtmlArtifact(text:string,expectedId:string):HelpHtmlArtifact {
 if(text.length>HELP_HTML_MAX_BYTES)throw Error('HELP_HTML_INVALID');
 const data:unknown=JSON.parse(text);
 if(!record(data)||Object.keys(data).some(key=>!['version','id','title','description','compact','full','entity'].includes(key))||data.version!==1||typeof data.id!=='string'||data.id.toLowerCase()!==expectedId.toLowerCase()||typeof data.title!=='string'||!data.title.trim()||data.title.length>200||typeof data.description!=='string'||data.description.length>2000)throw Error('HELP_HTML_INVALID');
 const compact=variant(data.compact),full=variant(data.full);if(!compact&&!full)throw Error('HELP_HTML_INVALID');
 let entity:HelpHtmlArtifact['entity'];
 if(data.entity!==undefined){if(!record(data.entity)||Object.keys(data.entity).length!==1||typeof data.entity.url!=='string'||!helpHtmlEntityTarget(data.entity.url)||!compact)throw Error('HELP_HTML_INVALID');entity={url:data.entity.url};}
 for(const value of [compact,full])if(value){const images=value.html.match(/<img\b[^>]*>/gi)||[];if(images.length>2)throw Error('HELP_HTML_INVALID');for(const image of images)if(!entity||!/^<img(?=\s)[^>]*\ssrc="help-entity-image"[^>]*>$/i.test(image)||(image.match(/\ssrc\s*=/gi)||[]).length!==1||/\s(?:srcset|on[a-z]+)\s*=/i.test(image))throw Error('HELP_HTML_INVALID');}
 return {version:1,id:data.id.toLowerCase(),title:data.title,description:data.description,...(compact?{compact}:{}),...(full?{full}:{}),...(entity?{entity}:{})};
}
export function helpHtmlDocument(value:HelpHtmlVariant,color:string,compact:boolean,topInset=0,imageDataUrl?:string):string {
 // The CSS cannot break out of its style element. No auth cookies, JS bridge,
 // remote assets, forms, frames or navigation capabilities enter this document.
 if(/</.test(value.css)||!/^#[\da-f]{3,8}$/i.test(color)||!Number.isFinite(topInset)||topInset<0||topInset>300)throw Error('HELP_HTML_INVALID');
 const image=imageDataUrl===undefined?undefined:validateHelpHtmlImageDataUrl(imageDataUrl);
 if((value.html.match(/<img\b/gi)||[]).length>2)throw Error('HELP_HTML_INVALID');
 const body=value.html.replace(/<img\b[^>]*>/gi,tag=>image&&/\ssrc="help-entity-image"/i.test(tag)?tag.replace(/\ssrc="help-entity-image"/i,` src="${image}"`):'');
 const csp="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src "+(image?"data:":"'none'")+"; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
 // Enforce viewport geometry AFTER model CSS: the compact document cannot grow,
 // acquire inner scrolling or flash scrollbars even if its styles set overflow.
 const compactViewport=compact?'html,body{width:100%!important;height:100%!important;min-height:0!important;max-height:100%!important;overflow:hidden!important;overscroll-behavior:none!important}*{scrollbar-width:none!important}*::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}':'';
 const viewerInset=!compact&&topInset?`body{padding-top:${topInset}px!important}`:'';
 return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=${compact?'1,user-scalable=no':'5'}"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>html,body{margin:0;padding:0;background:transparent;color:${color};font-family:system-ui,-apple-system,sans-serif;overflow-x:hidden}*{box-sizing:border-box}html{color-scheme:light dark}${value.css}${compactViewport}${viewerInset}</style></head><body>${body}</body></html>`;
}

/** Private app navigation, never a public attachment URL or authorization grant. */
export function helpHtmlPageLink(ticketId:number,messageId:number,artifactId:string):string|undefined {
 if(!Number.isSafeInteger(ticketId)||ticketId<1||!Number.isSafeInteger(messageId)||messageId<1||!new RegExp(`^${uuid}$`,'i').test(artifactId))return;
 return `leaderproduct://services/help?ticketId=${ticketId}&messageId=${messageId}&htmlId=${artifactId.toLowerCase()}`;
}
