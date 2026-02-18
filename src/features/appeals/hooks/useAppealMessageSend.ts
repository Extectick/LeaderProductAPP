import { useCallback } from 'react';
import type { AttachmentFile } from '@/components/ui/AttachmentsPicker';
import type { Profile } from '@/src/entities/user/types';
import { enqueueAppealOutboxMessage, flushAppealsOutbox } from '@/src/features/appeals/sync/outbox';
import type { UserMini } from '@/src/entities/appeal/types';

function mapProfileToUserMini(profile: Profile | null | undefined): UserMini {
  if (!profile) {
    return { id: 0, email: '' };
  }

  const avatarUrl =
    profile.avatarUrl ||
    profile.employeeProfile?.avatarUrl ||
    profile.clientProfile?.avatarUrl ||
    profile.supplierProfile?.avatarUrl ||
    null;

  const isDepartmentManager = (profile.departmentRoles || []).some(
    (role) => role.role?.name === 'department_manager'
  );

  return {
    id: profile.id,
    email: profile.email || '',
    firstName: profile.firstName || undefined,
    lastName: profile.lastName || undefined,
    avatarUrl,
    department: profile.employeeProfile?.department || null,
    isAdmin: profile.role?.name === 'admin',
    isDepartmentManager,
  };
}

export function useAppealMessageSend(params: { appealId: number; profile: Profile | null | undefined }) {
  const { appealId, profile } = params;

  const onSend = useCallback(
    async ({ text, files }: { text?: string; files?: AttachmentFile[] }) => {
      const cleanText = text?.trim();
      const cleanFiles = (files || []).filter((file) => !!file?.uri);
      if (!cleanText && cleanFiles.length === 0) {
        throw new Error('Нужно указать текст и/или приложить файлы');
      }

      const sender = mapProfileToUserMini(profile);
      await enqueueAppealOutboxMessage({
        appealId,
        sender,
        text: cleanText,
        files: cleanFiles,
      });

      // Fire-and-forget: if offline, message remains queued and will retry.
      void flushAppealsOutbox();
    },
    [appealId, profile]
  );

  return { onSend };
}
