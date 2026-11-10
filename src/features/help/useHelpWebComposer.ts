import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {Platform, type View} from 'react-native';
import type {HelpLocalFile} from './components/HelpComposer';
import {createHelpWebAttachment, releaseHelpWebAttachment, retainHelpWebAttachment} from './helpWebAttachmentUrls';
import {HELP_WEB_SEND_MODE_KEY, helpAttachmentBatchError, helpTransferredFiles, helpTransferHasFiles, type HelpWebSendMode} from './helpWebComposer';

type Options = {
  files: readonly HelpLocalFile[]; existingCount: number; enabled: boolean; scope?: string;
  accept: (files: HelpLocalFile[]) => boolean; replace: (files: HelpLocalFile[]) => void; error: (text: string) => void;
};

export function useHelpWebComposer(options: Options) {
  const root = useRef<View>(null), latest = useRef(options); latest.current = options;
  const composing = useRef(false), owned = useRef(new Map<string, boolean>());
  const [dragging, setDragging] = useState(false), [finePointer, setFinePointer] = useState(false);
  const [sendMode, setSendMode] = useState<HelpWebSendMode>(() => {
    if (Platform.OS !== 'web') return 'modifier';
    try { return globalThis.window?.localStorage.getItem(HELP_WEB_SEND_MODE_KEY) === 'modifier' ? 'modifier' : 'enter'; } catch { return 'enter'; }
  });
  const toggleSendMode = () => setSendMode(previous => {
    const next = previous === 'enter' ? 'modifier' : 'enter';
    try { globalThis.window?.localStorage.setItem(HELP_WEB_SEND_MODE_KEY, next); } catch { /* private browsing still keeps the current setting */ }
    return next;
  });

  useEffect(() => {
    if (Platform.OS !== 'web' || !globalThis.window?.matchMedia) return;
    const query = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setFinePointer(query.matches);
    update(); query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  useLayoutEffect(() => {
    if (Platform.OS !== 'web') return;
    let changed = false;
    const next = options.files.map(file => {
      // Preview ownership also applies while recording, sending or otherwise
      // disabling input. Transfer handlers remain fenced by enabled below.
      if (!file.webObjectUrl || !file.file || owned.current.has(file.uri)) return file;
      if (retainHelpWebAttachment(file.uri)) { owned.current.set(file.uri, true); return file; }
      // A linked-chat draft can outlive its old composer. Its File remains valid,
      // so create a fresh preview instead of reusing a revoked object URL.
      const restored = {...file, ...createHelpWebAttachment(file.file)};
      owned.current.set(restored.uri, false); changed = true;
      return restored;
    });
    const present = new Set(next.map(file => file.uri));
    for (const [uri, observed] of owned.current) {
      if (present.has(uri)) owned.current.set(uri, true);
      else if (observed) { owned.current.delete(uri); releaseHelpWebAttachment(uri); }
    }
    // Restoration replaces only the expired files; it must not append them.
    if (changed) options.replace(next);
  }, [options.files, options.enabled]);

  useLayoutEffect(() => {
    if (Platform.OS !== 'web') return;
    const element = root.current as unknown as HTMLElement | null;
    if (!element?.addEventListener) return;
    let alive = true;
    const scope = options.scope;
    const available = () => alive && latest.current.enabled && latest.current.scope === scope;
    const reset = () => { if (alive) setDragging(false); };
    const add = (files: File[]) => {
      if (!available() || !files.length) return;
      const current = latest.current;
      const error = helpAttachmentBatchError(files, current.files.length + current.existingCount);
      if (error) { current.error(error); return; }
      const selected: HelpLocalFile[] = [];
      try {
        for (const file of files) {
          const value = createHelpWebAttachment(file); selected.push(value); owned.current.set(value.uri, false);
        }
        if (available() && latest.current.accept(selected)) return;
      } catch { if (available()) latest.current.error('Не удалось прикрепить файлы. Попробуйте выбрать их через меню.'); }
      for (const file of selected) { owned.current.delete(file.uri); releaseHelpWebAttachment(file.uri); }
    };
    const paste = (event: ClipboardEvent) => {
      const files = helpTransferredFiles(event.clipboardData);
      if (!files.length || !available()) return;
      event.preventDefault(); add(files);
    };
    const enter = (event: DragEvent) => {
      if (!helpTransferHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (available()) setDragging(true);
    };
    const over = (event: DragEvent) => {
      if (!helpTransferHasFiles(event.dataTransfer)) return;
      event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = available() ? 'copy' : 'none';
    };
    const leave = (event: DragEvent) => {
      if (event.relatedTarget && element.contains(event.relatedTarget as Node)) return;
      reset();
    };
    const drop = (event: DragEvent) => {
      if (!helpTransferHasFiles(event.dataTransfer)) return;
      event.preventDefault(); reset(); add(helpTransferredFiles(event.dataTransfer));
    };
    const compositionStart = () => { composing.current = true; };
    const compositionEnd = () => { composing.current = false; };
    element.addEventListener('paste', paste);
    element.addEventListener('dragenter', enter); element.addEventListener('dragover', over);
    element.addEventListener('dragleave', leave); element.addEventListener('drop', drop);
    element.addEventListener('compositionstart', compositionStart, true); element.addEventListener('compositionend', compositionEnd, true);
    element.addEventListener('focusout', compositionEnd);
    window.addEventListener('dragend', reset); window.addEventListener('blur', reset);
    return () => {
      alive = false; composing.current = false;
      element.removeEventListener('paste', paste);
      element.removeEventListener('dragenter', enter); element.removeEventListener('dragover', over);
      element.removeEventListener('dragleave', leave); element.removeEventListener('drop', drop);
      element.removeEventListener('compositionstart', compositionStart, true); element.removeEventListener('compositionend', compositionEnd, true);
      element.removeEventListener('focusout', compositionEnd);
      window.removeEventListener('dragend', reset); window.removeEventListener('blur', reset);
    };
  }, [options.scope]);

  useEffect(() => { if (!options.enabled) setDragging(false); }, [options.enabled]);
  useEffect(() => () => { for (const uri of owned.current.keys()) releaseHelpWebAttachment(uri); owned.current.clear(); }, []);
  return {root, dragging, finePointer, sendMode, toggleSendMode, composing};
}
