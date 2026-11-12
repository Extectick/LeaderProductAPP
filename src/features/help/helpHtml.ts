import type {HelpAttachment} from './helpApi';
import {helpHtmlEntityTarget,validateHelpHtmlImageDataUrl} from './helpHtmlEntity';

export const HELP_HTML_MIME='application/vnd.leaderproduct.help-html+json';
export const HELP_HTML_MAX_BYTES=192*1024;
const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const filePattern=new RegExp(`^(${uuid})\\.help-html\\.json$`,'i');
const linkPattern=new RegExp(`^leaderproduct://help-html/(${uuid})$`,'i');
export const HELP_HTML_COMPACT_HEIGHT_MIN=48;
export const HELP_HTML_COMPACT_HEIGHT_MAX=1200;
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
/** Fixed CSS sizing is deliberately narrow: one outer element and simple root
 * selectors only, never child/media sizing, DOM measurements or JavaScript. */
export function helpHtmlCompactHeight(value:HelpHtmlVariant|undefined):number|undefined {
 if(!value)return;
 const bounded=(height:number)=>Number.isFinite(height)&&height>=HELP_HTML_COMPACT_HEIGHT_MIN&&height<=HELP_HTML_COMPACT_HEIGHT_MAX?height:undefined;
 const html=value.html.trim();
 const root=html.match(/^<([a-z][a-z0-9]*)\b([^>]*)>/i);
 if(!root||/\b(?:img|br|hr|col)\b/i.test(root[1]))return;
 // Balance passive tags so adjacent siblings cannot borrow the first child's height.
 const stack:string[]=[];let complete=-1;
 const tags=/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;let tag:RegExpExecArray|null;
 while((tag=tags.exec(html))){
  const name=tag[1].toLowerCase();
  if(tag[0].startsWith('</')){if(stack.pop()!==name)return;}
  else if(!['br','hr','img','col'].includes(name)&&!tag[0].endsWith('/>'))stack.push(name);
  if(!stack.length){complete=tags.lastIndex;break;}
 }
 if(complete<0||html.slice(complete).trim())return;
 const declaration=(style:string):{present:boolean;height?:number;important?:boolean}=>{
  let result:{present:boolean;height?:number;important?:boolean}={present:false};
  for(const item of style.split(';')){
   const match=item.match(/^\s*height\s*:\s*(.*?)\s*$/i);if(!match)continue;
   const fixed=match[1].match(/^(\d+(?:\.\d+)?)px(?:\s*!important)?$/i);
   const important=/!important$/i.test(match[1]);
   if(result.important&&!important)continue;
   result={present:true,important,...(fixed?{height:bounded(Number(fixed[1]))}:{})};
  }
  return result;
 };
 const attrs=root[2],inline=attrs.match(/(?:^|\s)style\s*=\s*(["'])(.*?)\1/is);
 const inlineHeight=inline?declaration(inline[2]):undefined;
 const css=value.css.replace(/\/\*[\s\S]*?\*\//g,'');
 // Conditional/cascade layers need a browser's layout engine: retain legacy fallback.
 if(/[@{}]/.test(css.replace(/[^{}]*\{[^{}]*\}/g,''))||css.includes('@'))return inlineHeight?.important?inlineHeight.height:undefined;
 const id=attrs.match(/(?:^|\s)id\s*=\s*(["'])(.*?)\1/is)?.[2];
 const classes=attrs.match(/(?:^|\s)class\s*=\s*(["'])(.*?)\1/is)?.[2].split(/\s+/)||[];
 const selectors=new Set([root[1].toLowerCase(),...(id&&/^[a-z_][\w-]*$/i.test(id)?['#'+id]:[]),...classes.filter(name=>/^[a-z_][\w-]*$/i.test(name)).map(name=>'.'+name)]);
 let height:number|undefined,specificity=-1,important=false;
 const rules=/([^{}]+)\{([^{}]*)\}/g;let rule:RegExpExecArray|null;
 while((rule=rules.exec(css))){
  const matches=rule[1].split(',').map(selector=>selector.trim()).filter(selector=>selectors.has(selector));
  if(!matches.length)continue;
  const result=declaration(rule[2]);if(!result.present)continue;
  const score=Math.max(...matches.map(selector=>selector.startsWith('#')?100:selector.startsWith('.')?10:1));
  const nextImportant=result.important===true;
  if((important&&!nextImportant)||important===nextImportant&&score<specificity)continue;
  height=result.height;specificity=score;important=nextImportant;
 }
 if(inlineHeight?.present&&(inlineHeight.important||!important))return inlineHeight.height;
 return height;
}
export function helpHtmlDocument(value:HelpHtmlVariant,color:string,compact:boolean,topInset=0,imageDataUrl?:string,colorScheme?:'light'|'dark'):string {
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
 // Match the iframe and document scheme to the app, not the browser/OS theme.
 // Chromium otherwise paints an opaque dark canvas behind transparent corners.
 return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=${compact?'1,user-scalable=no':'5'}"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>html,body{margin:0;padding:0;background:transparent;color:${color};font-family:system-ui,-apple-system,sans-serif;overflow-x:hidden}*{box-sizing:border-box}${value.css}${compactViewport}${viewerInset}html{color-scheme:${colorScheme?`only ${colorScheme}`:'light dark'}!important}</style></head><body>${body}</body></html>`;
}

/** Private app navigation, never a public attachment URL or authorization grant. */
export function helpHtmlPageLink(ticketId:number,messageId:number,artifactId:string):string|undefined {
 if(!Number.isSafeInteger(ticketId)||ticketId<1||!Number.isSafeInteger(messageId)||messageId<1||!new RegExp(`^${uuid}$`,'i').test(artifactId))return;
 return `leaderproduct://services/help?ticketId=${ticketId}&messageId=${messageId}&htmlId=${artifactId.toLowerCase()}`;
}
