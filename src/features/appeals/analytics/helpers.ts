import type {
  AppealLaborPaymentStatus,
  AppealsAnalyticsAppealItem,
  AppealStatus,
  UserMini,
} from '@/src/entities/appeal/types';
import type { ContextMenuItem } from '@/components/ui/ContextMenu';
import type { ActionKey, AppealMenuActionKey, TableColumnKey } from './types';

export function formatHoursByMs(ms: number | null | undefined) {
  if (typeof ms !== 'number' || Number.isNaN(ms)) return '-';
  return `${(ms / 3600000).toFixed(2)} ч`;
}

export function formatHoursValue(value: number | null | undefined, options?: { withUnit?: boolean }) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  const normalized = Number(value.toFixed(2));
  return options?.withUnit === false ? `${normalized}` : `${normalized} ч`;
}

export function formatRub(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  const normalized = Number(value.toFixed(2));
  return `${normalized.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

export function toDraftNumericString(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value) || value === 0) return '';
  return String(value);
}

export function appealStatusLabel(status: AppealStatus) {
  if (status === 'OPEN') return 'Открыто';
  if (status === 'IN_PROGRESS') return 'В работе';
  if (status === 'RESOLVED') return 'Ожидание подтверждения';
  if (status === 'COMPLETED') return 'Завершено';
  return 'Отклонено';
}

export function paymentStatusLabel(status: AppealLaborPaymentStatus) {
  if (status === 'PAID') return 'Оплачено';
  if (status === 'PARTIAL') return 'Частично оплачено';
  if (status === 'NOT_REQUIRED') return 'Не требуется';
  return 'Не оплачено';
}

type AppealActionMenuHandlers = {
  onOpenAppeal: (appealId: number) => void;
  onOpenAction: (action: ActionKey) => void;
};

export function buildAppealActionMenuItems(
  appeal: AppealsAnalyticsAppealItem | null | undefined,
  handlers: AppealActionMenuHandlers
): ContextMenuItem<AppealMenuActionKey>[] {
  if (!appeal) return [];

  const items: ContextMenuItem<AppealMenuActionKey>[] = [
    {
      key: 'open',
      action: 'open',
      label: 'Открыть обращение',
      icon: 'open-outline',
      onSelect: () => handlers.onOpenAppeal(appeal.id),
    },
  ];

  const appendAction = (
    action: ActionKey,
    enabled: boolean,
    label: string,
    icon: ContextMenuItem<AppealMenuActionKey>['icon']
  ) => {
    if (!enabled) return;
    items.push({
      key: action,
      action,
      label,
      icon,
      onSelect: () => handlers.onOpenAction(action),
    });
  };

  appendAction('status', appeal.actionPermissions.canChangeStatus, 'Изменить статус', 'sync-outline');
  appendAction('deadline', appeal.actionPermissions.canEditDeadline, 'Изменить дедлайн', 'time-outline');
  appendAction('assign', appeal.actionPermissions.canAssign, 'Назначить', 'person-add-outline');
  appendAction('participants', appeal.actionPermissions.canOpenParticipants, 'Участники', 'people-outline');
  appendAction('transfer', appeal.actionPermissions.canTransfer, 'Передать в отдел', 'swap-horizontal-outline');
  appendAction('labor', appeal.actionPermissions.canSetLabor, 'Часы и выплаты', 'timer-outline');

  return items;
}

export type AppealDeadlineTone = 'overdue' | 'soon' | 'onTimeCompleted' | 'neutral' | 'none';

export type AppealDeadlineMeta = {
  deadlineText: string;
  badgeText: string | null;
  tone: AppealDeadlineTone;
};

const ACTIVE_DEADLINE_STATUSES = new Set<AppealStatus>(['OPEN', 'IN_PROGRESS', 'RESOLVED']);
const DAY_MS = 24 * 60 * 60 * 1000;

function formatDeadlineDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getAppealDeadlineMeta(
  appeal: Pick<AppealsAnalyticsAppealItem, 'status' | 'deadline' | 'completedAt'>,
  now: Date = new Date()
): AppealDeadlineMeta {
  if (!appeal.deadline) {
    return { deadlineText: '—', badgeText: null, tone: 'none' };
  }

  const deadline = new Date(appeal.deadline);
  if (!Number.isFinite(deadline.getTime())) {
    return { deadlineText: '—', badgeText: null, tone: 'none' };
  }

  const deadlineText = formatDeadlineDate(appeal.deadline);

  if (appeal.status === 'DECLINED') {
    return { deadlineText, badgeText: null, tone: 'none' };
  }

  if (appeal.status === 'COMPLETED') {
    if (appeal.completedAt) {
      const completedAt = new Date(appeal.completedAt);
      if (Number.isFinite(completedAt.getTime())) {
        if (completedAt.getTime() > deadline.getTime()) {
          return { deadlineText, badgeText: 'Просрочено', tone: 'overdue' };
        }
        return { deadlineText, badgeText: 'Завершено в срок', tone: 'onTimeCompleted' };
      }
    }
    return { deadlineText, badgeText: 'В срок', tone: 'neutral' };
  }

  if (ACTIVE_DEADLINE_STATUSES.has(appeal.status)) {
    const diffMs = deadline.getTime() - now.getTime();
    if (diffMs < 0) {
      return { deadlineText, badgeText: 'Просрочено', tone: 'overdue' };
    }
    if (diffMs < DAY_MS) {
      return { deadlineText, badgeText: 'Меньше суток', tone: 'soon' };
    }
    return { deadlineText, badgeText: 'В срок', tone: 'neutral' };
  }

  return { deadlineText, badgeText: 'В срок', tone: 'neutral' };
}

export function personName(user: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  id?: number;
}) {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  if (full) return full;
  if (user.email) return user.email;
  return `Пользователь #${user.id || '-'}`;
}

export function departmentRouteText(appeal: Pick<AppealsAnalyticsAppealItem, 'fromDepartment' | 'toDepartment'>) {
  const fromName = appeal.fromDepartment?.name || 'Без отдела';
  const toName = appeal.toDepartment?.name || 'Без отдела';
  return `${fromName} -> ${toName}`;
}

export function slaTransitionLabel(key: string) {
  if (key === 'OPEN_TO_IN_PROGRESS') return 'Открытие -> Взято в работу';
  if (key === 'IN_PROGRESS_TO_RESOLVED') return 'В работе -> Ожидание подтверждения';
  return 'Ожидание подтверждения -> Завершено';
}

export function laborSummaryText(appeal: AppealsAnalyticsAppealItem) {
  if (appeal.laborNotRequired) {
    const assigneeNames = (appeal.assignees || []).map((assignee) => personName(assignee));
    return assigneeNames.length ? `${assigneeNames.join('; ')} — Не требуется` : 'Не требуется';
  }
  const rows = (appeal.assignees || []).map((assignee) => {
    const labor = (appeal.laborEntries || []).find((entry) => entry.assigneeUserId === assignee.id);
    const accruedHours = labor?.accruedHours ?? 0;
    const paidHours = labor?.paidHours ?? 0;
    const remainingHours = labor?.remainingHours ?? Math.max(0, accruedHours - paidHours);
    const rate = labor?.effectiveHourlyRateRub ?? assignee.effectiveHourlyRateRub ?? 0;
    if (!labor?.payable) {
      return `${personName(assignee)} — ${formatHoursValue(accruedHours)} • Не требуется`;
    }
    return `${personName(assignee)} — начисл. ${formatHoursValue(accruedHours, { withUnit: false })}, выпл. ${formatHoursValue(paidHours, { withUnit: false })}, остаток ${formatHoursValue(remainingHours)} • ${formatRub(rate)}/ч`;
  });
  return rows.length ? rows.join('; ') : 'Исполнители не назначены';
}

type LaborMultilineColumns = Record<
  Extract<
    TableColumnKey,
    'assignees' | 'hoursAccrued' | 'hoursPaid' | 'hoursRemaining' | 'hourlyRate' | 'amountAccrued' | 'amountPaid' | 'amountRemaining'
  >,
  string
>;

export function buildAppealLaborMultilineColumns(appeal: AppealsAnalyticsAppealItem): LaborMultilineColumns {
  const assignees = appeal.assignees || [];
  if (!assignees.length) {
    return {
      assignees: appeal.laborNotRequired ? 'Не требуется' : 'Исполнители не назначены',
      hoursAccrued: '—',
      hoursPaid: '—',
      hoursRemaining: '—',
      hourlyRate: appeal.laborNotRequired ? 'Не требуется' : '—',
      amountAccrued: '—',
      amountPaid: '—',
      amountRemaining: '—',
    };
  }

  const lines: Record<keyof LaborMultilineColumns, string[]> = {
    assignees: [],
    hoursAccrued: [],
    hoursPaid: [],
    hoursRemaining: [],
    hourlyRate: [],
    amountAccrued: [],
    amountPaid: [],
    amountRemaining: [],
  };

  for (const assignee of assignees) {
    const labor = (appeal.laborEntries || []).find((entry) => entry.assigneeUserId === assignee.id);
    const isUnset = !labor;
    const accruedHours = labor?.accruedHours ?? 0;
    const paidHours = labor?.paidHours ?? 0;
    const remainingHours = labor?.remainingHours ?? Math.max(0, accruedHours - paidHours);
    const isNotRequired = Boolean(appeal.laborNotRequired || (labor && !labor.payable));

    lines.assignees.push(personName(assignee));
    lines.hoursAccrued.push(isNotRequired ? '—' : formatHoursValue(accruedHours));
    lines.hoursPaid.push(isNotRequired ? '—' : formatHoursValue(paidHours));
    lines.hoursRemaining.push(isNotRequired ? '—' : formatHoursValue(remainingHours));
    if (isUnset) {
      lines.hourlyRate.push(appeal.laborNotRequired ? 'Не требуется' : 'Не установлено');
    } else if (labor.payable && !appeal.laborNotRequired) {
      lines.hourlyRate.push(`${formatRub(labor.effectiveHourlyRateRub)}/ч`);
    } else {
      lines.hourlyRate.push('Не требуется');
    }
    lines.amountAccrued.push(isNotRequired ? '—' : formatRub(labor?.amountAccruedRub ?? 0));
    lines.amountPaid.push(isNotRequired ? '—' : formatRub(labor?.amountPaidRub ?? 0));
    lines.amountRemaining.push(isNotRequired ? '—' : formatRub(labor?.amountRemainingRub ?? 0));
  }

  return {
    assignees: lines.assignees.join('\n'),
    hoursAccrued: lines.hoursAccrued.join('\n'),
    hoursPaid: lines.hoursPaid.join('\n'),
    hoursRemaining: lines.hoursRemaining.join('\n'),
    hourlyRate: lines.hourlyRate.join('\n'),
    amountAccrued: lines.amountAccrued.join('\n'),
    amountPaid: lines.amountPaid.join('\n'),
    amountRemaining: lines.amountRemaining.join('\n'),
  };
}

export function participantsList(appeal: AppealsAnalyticsAppealItem) {
  const users: { id?: number; label: string; role: string }[] = [];
  if (appeal.createdBy) {
    users.push({
      id: appeal.createdBy.id,
      label: personName(appeal.createdBy),
      role: 'Автор',
    });
  }
  for (const assignee of appeal.assignees || []) {
    users.push({
      id: assignee.id,
      label: personName(assignee),
      role: 'Исполнитель',
    });
  }

  const deduped = new Map<string, { label: string; role: string }>();
  for (const row of users) {
    const key = row.id ? `id:${row.id}` : `${row.role}:${row.label}`;
    if (!deduped.has(key)) deduped.set(key, { label: row.label, role: row.role });
  }
  return Array.from(deduped.values());
}

export function hydrateLaborDraftState(
  prev: Record<
    number,
    Record<number, { accruedHours: string; paidHours: string; paymentStatus?: AppealLaborPaymentStatus }>
  >,
  items: AppealsAnalyticsAppealItem[]
) {
  const next = { ...prev };
  for (const appeal of items) {
    const current = next[appeal.id] || {};
    for (const assignee of appeal.assignees || []) {
      const existing = (appeal.laborEntries || []).find((entry) => entry.assigneeUserId === assignee.id);
      current[assignee.id] = {
        accruedHours: existing ? toDraftNumericString(existing.accruedHours) : current[assignee.id]?.accruedHours ?? '',
        paidHours: existing ? toDraftNumericString(existing.paidHours) : current[assignee.id]?.paidHours ?? '',
        paymentStatus: existing?.paymentStatus ?? current[assignee.id]?.paymentStatus,
      };
    }
    next[appeal.id] = current;
  }
  return next;
}

export async function blobToBase64(blob: Blob) {
  if (typeof FileReader !== 'undefined') {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Ошибка чтения файла'));
      reader.onloadend = () => {
        const raw = String(reader.result || '');
        resolve(raw.includes(',') ? raw.split(',')[1] : raw);
      };
      reader.readAsDataURL(blob);
    });
  }

  const ab = await blob.arrayBuffer();
  const arr = new Uint8Array(ab);
  let binary = '';
  for (let i = 0; i < arr.length; i += 1) binary += String.fromCharCode(arr[i]);
  if (typeof btoa === 'function') return btoa(binary);
  throw new Error('Недоступно base64 кодирование');
}

export function userMiniToDisplay(user: UserMini | null | undefined) {
  if (!user) return 'Не назначен';
  return personName(user);
}
