import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { useAppealUpdates } from '@/hooks/useAppealUpdates';
import { applyMessageReads, removeMessage, updateMessage, upsertMessage } from '@/utils/appealsStore';
import type { AppealDetail, AppealMessage } from '@/src/entities/appeal/types';
import type { Profile } from '@/src/entities/user/types';

type UseAppealRealtimeEventsParams = {
  appealId: number;
  enabled: boolean;
  profile: Profile | null | undefined;
  data: AppealDetail | null;
  setData: Dispatch<SetStateAction<AppealDetail | null>>;
  load: (force?: boolean, refreshMessages?: boolean) => Promise<void> | void;
  isAtBottom: boolean;
  initialPositionReadyRef: MutableRefObject<boolean>;
  armReads: (reason: string) => void;
  enqueueReadIds: (ids: number[]) => void;
};

export function useAppealRealtimeEvents({
  appealId,
  enabled,
  profile,
  data,
  setData,
  load,
  isAtBottom,
  initialPositionReadyRef,
  armReads,
  enqueueReadIds,
}: UseAppealRealtimeEventsParams) {
  const handleRealtimeEvent = useCallback(
    (evt: any) => {
      const eventName = evt.event || evt.eventType || evt.type;
      if (eventName === 'messageAdded' && evt.appealId === appealId) {
        const incomingMessageId = Number(evt.id || evt.messageId);
        const newMsg: AppealMessage = {
          id: incomingMessageId,
          appealId: evt.appealId,
          text: evt.text || '',
          type: evt.type === 'SYSTEM' ? 'SYSTEM' : 'USER',
          systemEvent: evt.systemEvent ?? null,
          createdAt: evt.createdAt || new Date().toISOString(),
          sender: evt.sender || { id: evt.senderId, email: '' },
          attachments: evt.attachments || [],
          isRead: evt.isRead,
          readBy: evt.readBy || [],
        };
        upsertMessage(appealId, newMsg, profile?.id).catch(() => {});
        const senderId = evt.senderId ?? evt.sender?.id ?? newMsg.sender?.id;
        const isIncoming = Number.isFinite(senderId) && senderId !== profile?.id;
        if (isIncoming && Number.isFinite(incomingMessageId) && initialPositionReadyRef.current && isAtBottom) {
          armReads('incoming_at_bottom');
          enqueueReadIds([incomingMessageId]);
        }
      } else if (eventName === 'messageEdited' && evt.appealId === appealId) {
        updateMessage(appealId, evt.messageId, { text: evt.text, editedAt: evt.editedAt }).catch(() => {});
      } else if (eventName === 'messageDeleted' && evt.appealId === appealId) {
        removeMessage(appealId, evt.messageId).catch(() => {});
      } else if (eventName === 'messageRead' && evt.appealId === appealId) {
        const ids = Array.isArray(evt.messageIds)
          ? evt.messageIds
          : evt.messageId
          ? [evt.messageId]
          : [];
        if (ids.length && evt.userId && evt.readAt) {
          applyMessageReads(appealId, ids, evt.userId, evt.readAt, profile?.id ?? evt.userId).catch(() => {});
        }
      } else if (eventName === 'appealUpdated' && evt.appealId === appealId) {
        if (evt.lastMessage?.id) {
          upsertMessage(appealId, evt.lastMessage, profile?.id).catch(() => {});
        }
        if (!data) {
          void load(true, false);
          return;
        }
        const hasDeadline = Object.prototype.hasOwnProperty.call(evt, 'deadline');
        setData((prev) => {
          if (!prev) return prev;
          const nextAssignees = Array.isArray(evt.assigneeIds)
            ? evt.assigneeIds.map((id: number) => ({ user: { id, email: '' } }))
            : prev.assignees;
          return {
            ...prev,
            status: evt.status ?? prev.status,
            priority: evt.priority ?? prev.priority,
            deadline: hasDeadline ? (evt.deadline ?? null) : prev.deadline,
            assignees: nextAssignees as any,
            toDepartment:
              evt.toDepartmentId && prev.toDepartment?.id !== evt.toDepartmentId
                ? {
                    ...prev.toDepartment,
                    id: evt.toDepartmentId,
                  }
                : prev.toDepartment,
          };
        });
        if (evt.toDepartmentId && data.toDepartment?.id !== evt.toDepartmentId) {
          void load(true, false);
        }
      } else if (eventName === 'statusUpdated' && evt.appealId === appealId) {
        if (!data || !evt.status) {
          void load(true, false);
          return;
        }
        setData((prev) => (prev ? { ...prev, status: evt.status } : prev));
      } else if (
        evt.appealId === appealId &&
        (eventName === 'assigneesUpdated' ||
          eventName === 'departmentChanged' ||
          eventName === 'watchersUpdated')
      ) {
        void load(true, false);
      }
    },
    [appealId, armReads, data, enqueueReadIds, initialPositionReadyRef, isAtBottom, load, profile?.id, setData]
  );

  useAppealUpdates(
    enabled ? appealId : undefined,
    handleRealtimeEvent,
    profile?.id,
    profile?.departmentRoles?.map((d) => d.department.id) || profile?.employeeProfile?.department?.id
  );
}
