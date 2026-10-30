import { createContext } from 'react';
import type { HelpTextLineMeasurement } from './helpTextStampLayout';

export type HelpCachedTextLayout = {
  rowWidth:number; textWidth:number; stampWidth:number;
  lastLine:HelpTextLineMeasurement & {text:string;fontScale:number;windowWidth:number};
};

/** Account-scoped, bounded presentation metadata. No React trees or bitmaps. */
export function createHelpMessageLayoutCache() {
  const entries=new Map<string,HelpCachedTextLayout>();
  return {
    read(key:string) { const value=entries.get(key);if(value){entries.delete(key);entries.set(key,value);}return value; },
    remember(key:string,value:HelpCachedTextLayout) { entries.delete(key);entries.set(key,value);if(entries.size>200)entries.delete(entries.keys().next().value!); },
  };
}
export const HelpMessageLayoutCacheContext=createContext<ReturnType<typeof createHelpMessageLayoutCache>|null>(null);
