import { useCallback, useEffect, useRef } from 'react';
import { applyMessageReads, markAppealReadLocal } from '@/utils/appealsStore';
import { markAppealMessagesReadBulk } from '@/utils/appealsService';
import type { AppealMessage } from '@/src/entities/appeal/types';

type DevLogger = (stage: string, extra?: Record<string, any>) => void;

type UseAppealReadControllerParams = {
  appealId: number;
  viewerUserId?: number;
  messagesById: Map<number, AppealMessage>;
  isAtBottom: boolean;
  initialLoading: boolean;
  devLog: DevLogger;
  dismissAppealNotifications: (messageIds?: number[]) => void;
};

export function useAppealReadController({
  appealId,
  viewerUserId,
  messagesById,
  isAtBottom,
  initialLoading,
  devLog,
  dismissAppealNotifications,
}: UseAppealReadControllerParams) {
  const readQueueRef = useRef<Set<number>>(new Set());
  const readTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readArmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readArmedRef = useRef(false);
  const initialPositionReadyRef = useRef(false);
  const userInteractedRef = useRef(false);
  const latestVisibleIdsRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    if (readTimerRef.current) {
      clearTimeout(readTimerRef.current);
      readTimerRef.current = null;
    }
    if (readArmTimerRef.current) {
      clearTimeout(readArmTimerRef.current);
      readArmTimerRef.current = null;
    }
  }, []);

  const resetReadController = useCallback(() => {
    clearTimers();
    readArmedRef.current = false;
    initialPositionReadyRef.current = false;
    userInteractedRef.current = false;
    latestVisibleIdsRef.current = [];
    readQueueRef.current.clear();
  }, [clearTimers]);

  const flushReadQueue = useCallback(() => {
    if (!viewerUserId) return;
    const ids = Array.from(readQueueRef.current);
    readQueueRef.current.clear();
    if (!ids.length) return;
    devLog('read_bulk_sent', { count: ids.length });
    markAppealMessagesReadBulk(appealId, ids)
      .then((res) => {
        applyMessageReads(appealId, res.messageIds, viewerUserId, res.readAt);
        markAppealReadLocal(appealId);
        dismissAppealNotifications(res.messageIds);
      })
      .catch(() => {});
  }, [appealId, devLog, dismissAppealNotifications, viewerUserId]);

  const enqueueReadIds = useCallback(
    (ids: number[]) => {
      if (!ids.length) return;
      let added = false;
      ids.forEach((id) => {
        if (readQueueRef.current.has(id)) return;
        readQueueRef.current.add(id);
        added = true;
      });
      if (!added) return;
      if (readTimerRef.current) clearTimeout(readTimerRef.current);
      readTimerRef.current = setTimeout(() => {
        readTimerRef.current = null;
        flushReadQueue();
      }, 300);
    },
    [flushReadQueue]
  );

  const processVisibleMessageIds = useCallback(
    (ids: number[]) => {
      if (!viewerUserId || !ids.length) return;
      const eligibleIds: number[] = [];
      ids.forEach((id) => {
        const msg = messagesById.get(id);
        if (!msg) return;
        if (msg.sender?.id === viewerUserId) return;
        const alreadyRead = msg.isRead || (msg.readBy || []).some((r) => r.userId === viewerUserId);
        if (alreadyRead) return;
        eligibleIds.push(id);
      });
      enqueueReadIds(eligibleIds);
    },
    [enqueueReadIds, messagesById, viewerUserId]
  );

  const armReads = useCallback(
    (reason: string) => {
      if (readArmedRef.current) return;
      if (readArmTimerRef.current) {
        clearTimeout(readArmTimerRef.current);
        readArmTimerRef.current = null;
      }
      readArmTimerRef.current = setTimeout(() => {
        readArmTimerRef.current = null;
        if (!initialPositionReadyRef.current) return;
        if (reason === 'user_interaction' && !userInteractedRef.current) return;
        if ((reason === 'auto_bottom' || reason === 'incoming_at_bottom') && !isAtBottom) return;
        readArmedRef.current = true;
        devLog('read_armed', { reason });
        if (latestVisibleIdsRef.current.length) {
          processVisibleMessageIds(latestVisibleIdsRef.current);
        }
      }, 280);
    },
    [devLog, isAtBottom, processVisibleMessageIds]
  );

  const tryArmReadsAfterInteraction = useCallback(() => {
    if (!initialPositionReadyRef.current) return;
    if (!userInteractedRef.current) return;
    armReads('user_interaction');
  }, [armReads]);

  const handleUserInteraction = useCallback(() => {
    if (!userInteractedRef.current) {
      userInteractedRef.current = true;
      devLog('user_interaction_detected');
    }
    tryArmReadsAfterInteraction();
  }, [devLog, tryArmReadsAfterInteraction]);

  const handleVisibleMessageIds = useCallback(
    (ids: number[]) => {
      latestVisibleIdsRef.current = ids;
      if (!readArmedRef.current) return;
      processVisibleMessageIds(ids);
    },
    [processVisibleMessageIds]
  );

  useEffect(() => {
    if (initialLoading) return;
    if (!initialPositionReadyRef.current) return;
    if (!isAtBottom) return;
    armReads('auto_bottom');
  }, [armReads, initialLoading, isAtBottom]);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  return {
    initialPositionReadyRef,
    resetReadController,
    handleVisibleMessageIds,
    handleUserInteraction,
    tryArmReadsAfterInteraction,
    armReads,
    enqueueReadIds,
  };
}
