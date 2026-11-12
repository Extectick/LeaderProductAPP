import {normalizeWebUrl} from '../webPages/webPagePolicy';
export type HelpHtmlWebLink={url:string;label:string};
const attribute=/(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i;
function decode(value:string){
 return value.replace(/&(?:#(x[\da-f]+|\d+)|amp|quot|apos|lt|gt);/gi,(whole,digits:string|undefined)=>{
  if(digits){const point=digits.toLowerCase().startsWith('x')?parseInt(digits.slice(1),16):Number(digits);return Number.isInteger(point)&&point>=0&&point<=0x10ffff&&!(point>=0xd800&&point<=0xdfff)?String.fromCodePoint(point):'';}
  return ({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'} as Record<string,string>)[whole.toLowerCase()]??whole;
 });
}
/** The sandboxed web iframe has no script bridge. Expose only validated links
 * as app-owned controls; never let its srcDoc navigate to a remote document. */
export function helpHtmlWebLinks(html:string):HelpHtmlWebLink[]{
 const links=new Map<string,HelpHtmlWebLink>();
 for(const anchor of html.matchAll(/<a\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/a\s*>/gi)){
  const href=attribute.exec(anchor[1]);if(!href)continue;
  const url=normalizeWebUrl(decode(href[1]??href[2]??href[3]??''));if(!url)continue;
  const label=decode(anchor[2].replace(/<[^>]*>/g,'')).replace(/\s+/g,' ').trim().slice(0,200)||new URL(url).hostname;
  if(!links.has(url))links.set(url,{url,label});
 }
 return [...links.values()];
}
export function helpHtmlLocalAnchors(html:string):string{
 let output='',start=0;
 while(start<html.length){
  const begin=html.indexOf('<',start);if(begin<0){output+=html.slice(start);break;}
  output+=html.slice(start,begin);
  let end=begin+1,quote='';
  for(;end<html.length;end++){
   const char=html[end];if(quote){if(char===quote)quote='';}
   else if(char==='"'||char==="'")quote=char;
   else if(char==='>'){end++;break;}
  }
  const tag=html.slice(begin,end);
  if(/^<a(?=[\s/>])/i.test(tag)){
   const occurrences=[...tag.matchAll(/(?:[\s/])href\s*=/gi)];
   const href=attribute.exec(tag.slice(2)),value=href?decode(href[1]??href[2]??href[3]??''):'';
   // Even malformed/unclosed attributes are renamed; the sandbox cannot navigate
   // out through an attribute the URL extractor could not safely understand.
   output+=occurrences.length===1&&/^#[a-z0-9_-]{1,100}$/i.test(value)?tag:tag.replace(/([\s/])href(?=\s*=)/gi,'$1data-help-viewer-href');
  }else output+=tag;
  start=end;
 }
 return output;
}
