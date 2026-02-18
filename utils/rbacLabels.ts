export type RoleLabelInput =
  | {
      name?: string | null;
      displayName?: string | null;
    }
  | null
  | undefined;

const BUILTIN_ROLE_LABELS_RU: Record<string, string> = {
  user: 'Пользователь',
  employee: 'Сотрудник',
  department_manager: 'Руководитель отдела',
  admin: 'Администратор',
};

export function getRoleDisplayName(role: RoleLabelInput): string {
  const explicit = String(role?.displayName || '').trim();
  if (explicit) return explicit;
  const technicalName = String(role?.name || '').trim();
  if (!technicalName) return 'Без роли';
  return BUILTIN_ROLE_LABELS_RU[technicalName] || technicalName;
}

