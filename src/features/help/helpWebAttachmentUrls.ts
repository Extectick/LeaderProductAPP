import type {HelpLocalFile} from './components/HelpComposer';

// Composer previews and in-flight submissions own independent references. A
// navigation/unmount must not invalidate a pending message's image preview.
const urls = new Map<string, number>();

export function createHelpWebAttachment(file: File): HelpLocalFile {
  const uri = URL.createObjectURL(file);
  urls.set(uri, 1);
  return {uri, file, name: file.name || 'Вложение', mimeType: file.type || 'application/octet-stream', size: file.size, webObjectUrl: true};
}

export function retainHelpWebAttachment(uri: string): boolean {
  const count = urls.get(uri);
  if (count === undefined) return false;
  urls.set(uri, count + 1);
  return true;
}

export function releaseHelpWebAttachment(uri: string) {
  const count = urls.get(uri);
  if (count === undefined) return;
  if (count > 1) urls.set(uri, count - 1);
  else { urls.delete(uri); URL.revokeObjectURL(uri); }
}

export function holdHelpWebAttachments(files: readonly HelpLocalFile[]) {
  const held = [...new Set(files.map(file => file.uri))].filter(retainHelpWebAttachment);
  let released = false;
  return () => { if (released) return; released = true; held.forEach(releaseHelpWebAttachment); };
}
