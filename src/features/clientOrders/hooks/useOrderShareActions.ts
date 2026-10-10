import React from 'react';
import * as Clipboard from 'expo-clipboard';
import type { useClientOrdersWorkspace } from '../useClientOrdersWorkspace';
import { publishClientOrderShare } from '../lib/orderSharing';

type Workspace = ReturnType<typeof useClientOrdersWorkspace>;
export function useOrderShareActions(workspace: Workspace, selectOrder: (guid: string) => Promise<boolean>) {
  const workspaceRef = React.useRef(workspace);
  workspaceRef.current = workspace;
  const [visible, setVisible] = React.useState(false);
  const [pendingGuid, setPendingGuid] = React.useState<string | null>(null);
  const [copying, setCopying] = React.useState(false);
  const [feedback, setFeedback] = React.useState('');
  const openingRef = React.useRef(false);
  const copyingRef = React.useRef(false);
  const mounted = React.useRef(true);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  React.useEffect(() => {
    // Wait for React to commit the loaded document, not the previously selected order.
    if (pendingGuid && workspace.selectedOrder?.guid === pendingGuid && !workspace.loadingDetail) {
      setPendingGuid(null); setVisible(true);
    }
  }, [pendingGuid, workspace.selectedOrder?.guid, workspace.loadingDetail]);
  const open = React.useCallback(() => { setPendingGuid(null); setVisible(true); }, []);
  const close = React.useCallback(() => { setPendingGuid(null); setVisible(false); }, []);
  const openFromList = React.useCallback(async (guid: string) => {
    if (openingRef.current || copyingRef.current) return;
    openingRef.current = true;
    setPendingGuid(null);
    try {
      const opened = await selectOrder(guid);
      if (mounted.current && opened) setPendingGuid(guid);
    } catch {
      if (mounted.current) setFeedback('Не удалось открыть заказ. Повторите попытку.');
    } finally { openingRef.current = false; }
  }, [selectOrder]);
  const copy = React.useCallback(async () => {
    const current = workspaceRef.current;
    if (copyingRef.current || openingRef.current || current.loadingDetail || current.mutationLocked) return;
    copyingRef.current = true; setCopying(true); setFeedback('');
    try {
      const { link } = await publishClientOrderShare(current);
      if (!mounted.current) return;
      await Clipboard.setStringAsync(link.url);
      if (mounted.current) setFeedback('Ссылка скопирована');
    } catch (error: any) {
      if (mounted.current) setFeedback(error?.message || 'Не удалось скопировать ссылку. Проверьте подключение.');
    } finally { copyingRef.current = false; if (mounted.current) setCopying(false); }
  }, []);
  const dismissFeedback = React.useCallback(() => setFeedback(''), []);
  return { visible, open, close, openFromList, copy, copying, feedback, dismissFeedback };
}
