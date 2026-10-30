import { createContext } from 'react';
import type { HelpAttachment, HelpMediaSource } from './helpApi';

// Text is always rendered. Only originals near the viewport enter the native
// image loader; tiny previews already travel with the message metadata.
export const HelpMediaLoadingContext=createContext<'visible'|'near'|'deferred'|'retained'>('visible');

/** Only readiness/source metadata lives here; Expo owns the pixel/disk cache.
 * A timeline owns this store, so navigation copies share it and leaving the
 * conversation releases it. Resolvers isolate account/source identities. */
export function createHelpImageCache() {
  const resolvers = new WeakMap<object, Map<string, HelpMediaSource>>();
  const key = (attachment: HelpAttachment) => JSON.stringify([attachment.id,attachment.url]);
  return {
    read(resolver: object, attachment: HelpAttachment) {
      const entries=resolvers.get(resolver), id=key(attachment), source=entries?.get(id);
      if (entries && source) { entries.delete(id); entries.set(id,source); }
      return source;
    },
    remember(resolver: object, attachment: HelpAttachment, source: HelpMediaSource) {
      let entries=resolvers.get(resolver);
      if (!entries) { entries=new Map(); resolvers.set(resolver,entries); }
      const id=key(attachment); entries.delete(id); entries.set(id,source);
      if (entries.size>128) entries.delete(entries.keys().next().value!);
    },
    forget(resolver: object, attachment: HelpAttachment) { resolvers.get(resolver)?.delete(key(attachment)); },
  };
}
export const HelpImageCacheContext=createContext<ReturnType<typeof createHelpImageCache>|null>(null);
