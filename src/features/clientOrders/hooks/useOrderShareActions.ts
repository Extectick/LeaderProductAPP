import React from 'react';
import * as Clipboard from 'expo-clipboard';
import type { useClientOrdersWorkspace } from '../useClientOrdersWorkspace';
import { publishClientOrderShare, publishClientOrderShareByGuid } from '../lib/orderSharing';

type Workspace = ReturnType<typeof useClientOrdersWorkspace>;
export function useOrderShareActions(workspace: Workspace) {
  const workspaceRef = React.useRef(workspace);
  workspaceRef.current = workspace;
  const [copying, setCopying] = React.useState(false);
  const [feedback, setFeedback] = React.useState('');
  const copyingRef = React.useRef(false);
  const mounted = React.useRef(true);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // Stable callbacks are required by the mobile header override. A list action
  // never navigates or mutates whichever draft happens to be open in the editor.
  const copyLink = React.useCallback(async (guid?: string) => {
    const current = workspaceRef.current;
    if (copyingRef.current || current.mutationLocked || (guid === undefined && current.loadingDetail)) return;
    copyingRef.current = true; setCopying(true); setFeedback('Копирую ссылку…');
    try {
      const { link } = guid !== undefined ? await publishClientOrderShareByGuid(guid) : await publishClientOrderShare(current);
      if (!mounted.current) return;
      const copied = await Clipboard.setStringAsync(link.url);
      if (copied === false) throw new Error('Не удалось скопировать ссылку. Разрешите доступ к буферу обмена и повторите.');
      if (mounted.current) setFeedback('Ссылка скопирована');
    } catch (error: any) {
      if (mounted.current) setFeedback(error?.message || 'Не удалось скопировать ссылку. Проверьте подключение.');
    } finally { copyingRef.current = false; if (mounted.current) setCopying(false); }
  }, []);
  const copy = React.useCallback(() => copyLink(), [copyLink]);
  const copyFromList = React.useCallback((guid: string) => copyLink(guid), [copyLink]);
  const dismissFeedback = React.useCallback(() => setFeedback(''), []);
  return { copy, copyFromList, copying, feedback, dismissFeedback };
}
