import {createContext} from 'react';
import type {HelpAttachment} from './helpApi';
import {helpHtmlAttachmentId,parseHelpHtmlArtifact,type HelpHtmlArtifact} from './helpHtml';
import {validateHelpHtmlImageDataUrl} from './helpHtmlEntity';

export type HelpHtmlCacheScope={
  /** The authenticated API/account scope supplied by the owning Help screen. */
  account:string;
  resolver:object;
  ticketId?:number;
  messageId?:number;
};
export type HelpHtmlCacheValue=Readonly<{artifact:HelpHtmlArtifact;imageDataUrl?:string}>;
export const HELP_HTML_CACHE_LIMITS={maxEntries:32,maxBytes:4*1024*1024,ttlMs:5*60*1000} as const;
type Options={maxEntries?:number;maxBytes?:number;ttlMs?:number;now?:()=>number};
type Entry={descriptor:string;value:HelpHtmlCacheValue;bytes:number;expiresAt:number};

/** Volatile presentation data for one screen/account lifetime. Callers still
 * validate the current attachment, account and generation before using a hit.
 * This cache neither fetches data nor grants access to an entity or attachment. */
export function createHelpHtmlCache(options:Options={}){
  const limit=(value:number|undefined,maximum:number)=>{
    if(value===undefined)return maximum;
    if(!Number.isSafeInteger(value)||value<1)throw new RangeError('HELP_HTML_CACHE_INVALID_LIMIT');
    return Math.min(value,maximum);
  };
  const maxEntries=limit(options.maxEntries,HELP_HTML_CACHE_LIMITS.maxEntries);
  const maxBytes=limit(options.maxBytes,HELP_HTML_CACHE_LIMITS.maxBytes);
  const ttlMs=limit(options.ttlMs,HELP_HTML_CACHE_LIMITS.ttlMs);
  const now=options.now??Date.now;
  const entries=new Map<string,Entry>(),resolvers=new WeakMap<object,number>();
  let resolverSequence=0,totalBytes=0;
  const remove=(key:string)=>{
    const previous=entries.get(key);
    if(previous){totalBytes-=previous.bytes;entries.delete(key);}
  };
  const identity=(scope:HelpHtmlCacheScope,file:HelpAttachment)=>{
    if(!scope.account||typeof scope.account!=='string'||scope.account.length>2048||
      !scope.resolver||!['object','function'].includes(typeof scope.resolver)||
      [scope.ticketId,scope.messageId].some(id=>id!==undefined&&(!Number.isSafeInteger(id)||id<1)))return;
    try{
      const artifactId=helpHtmlAttachmentId(file);
      if(!artifactId||!file.id||typeof file.id!=='string'||!file.url||typeof file.url!=='string'||!Number.isSafeInteger(file.size)||file.size<0)return;
      let resolverId=resolvers.get(scope.resolver);
      if(resolverId===undefined){resolverId=++resolverSequence;resolvers.set(scope.resolver,resolverId);}
      const key=JSON.stringify([scope.account,resolverId,scope.ticketId??null,scope.messageId??null,file.id]);
      const descriptor=JSON.stringify([file.name,file.url,file.mimeType,file.kind,file.size,file.localUri,file.width,file.height,file.durationMs,file.thumbnailDataUri]);
      return {key,descriptor,artifactId};
    }catch{return;}
  };
  return {
    read(scope:HelpHtmlCacheScope,file:HelpAttachment):HelpHtmlCacheValue|undefined{
      const id=identity(scope,file);if(!id)return;
      const entry=entries.get(id.key);if(!entry)return;
      // Never resurrect an older descriptor if an attachment was replaced.
      if(entry.descriptor!==id.descriptor||entry.expiresAt<=now()){remove(id.key);return;}
      entries.delete(id.key);entries.set(id.key,entry);
      return entry.value;
    },
    /** Only completed, validated loads can be admitted. An aborted request may
     * not populate a cache retained after its originating message unmounts. */
    remember(scope:HelpHtmlCacheScope,file:HelpAttachment,value:HelpHtmlCacheValue,signal:AbortSignal):boolean{
      if(!signal||signal.aborted)return false;
      const id=identity(scope,file);if(!id)return false;
      try{
        if(!value||Object.keys(value).some(key=>key!=='artifact'&&key!=='imageDataUrl'))return false;
        const serialized=JSON.stringify(value.artifact);
        const artifact=parseHelpHtmlArtifact(serialized,id.artifactId);
        const imageDataUrl=value.imageDataUrl===undefined?undefined:validateHelpHtmlImageDataUrl(value.imageDataUrl);
        if(imageDataUrl&&!artifact.entity)return false;
        // Conservatively count UTF-16 strings and fixed record overhead. The
        // budget is shared across all resolver/account partitions of this cache.
        const bytes=2*(id.key.length+id.descriptor.length+serialized.length+(imageDataUrl?.length??0))+256;
        if(bytes>maxBytes||signal.aborted)return false;
        if(artifact.compact)Object.freeze(artifact.compact);
        if(artifact.full)Object.freeze(artifact.full);
        if(artifact.entity)Object.freeze(artifact.entity);
        Object.freeze(artifact);
        const stored=Object.freeze({artifact,...(imageDataUrl===undefined?{}:{imageDataUrl})});
        const at=now();
        for(const [key,entry] of entries)if(entry.expiresAt<=at)remove(key);
        remove(id.key);
        entries.set(id.key,{descriptor:id.descriptor,value:stored,bytes,expiresAt:at+ttlMs});totalBytes+=bytes;
        while(entries.size>maxEntries||totalBytes>maxBytes)remove(entries.keys().next().value!);
        return true;
      }catch{return false;}
    },
    forget(scope:HelpHtmlCacheScope,file:HelpAttachment){const id=identity(scope,file);if(id)remove(id.key);},
    clear(){entries.clear();totalBytes=0;},
  };
}

export type HelpHtmlCache=ReturnType<typeof createHelpHtmlCache>;
export const HelpHtmlCacheContext=createContext<HelpHtmlCache|null>(null);
