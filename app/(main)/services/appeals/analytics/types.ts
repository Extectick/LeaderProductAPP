import type { AppealLaborPaymentStatus } from '@/src/entities/appeal/types';
import type { AppealsAnalyticsPaymentState, AppealsAnalyticsTableColumnKey } from '@/src/entities/appeal/types';

export type TabKey = 'appeals' | 'users';
export type PeriodPreset = 'all' | '7' | '30' | '90' | 'custom';
export type ActionKey = 'status' | 'deadline' | 'assign' | 'participants' | 'transfer' | 'labor';
export type PaymentStateFilter = AppealsAnalyticsPaymentState;
export type TableColumnKey = AppealsAnalyticsTableColumnKey;

export const APPEALS_ANALYTICS_ALL_COLUMNS: TableColumnKey[] = [
  'number',
  'title',
  'status',
  'department',
  'deadline',
  'slaOpen',
  'slaWork',
  'slaToTake',
  'slaToResolve',
  'assignees',
  'hoursAccrued',
  'hoursPaid',
  'hoursRemaining',
  'hourlyRate',
  'amountAccrued',
  'amountPaid',
  'amountRemaining',
];

export const APPEALS_ANALYTICS_LOCKED_COLUMNS: TableColumnKey[] = ['number', 'title'];

export const APPEALS_ANALYTICS_COLUMN_LABELS: Record<TableColumnKey, string> = {
  number: '№',
  title: 'Обращение',
  status: 'Статус',
  department: 'Отдел',
  deadline: 'Дедлайн',
  slaOpen: 'Открыто',
  slaWork: 'В работе',
  slaToTake: 'До взятия',
  slaToResolve: 'До решения',
  assignees: 'Исполнители',
  hoursAccrued: 'Часы начислено',
  hoursPaid: 'Часы оплачено',
  hoursRemaining: 'Часы остаток',
  hourlyRate: 'Ставка ₽/ч',
  amountAccrued: 'Сумма начислено',
  amountPaid: 'Сумма оплачено',
  amountRemaining: 'Сумма к доплате',
};

export type LaborDraftState = Record<
  number,
  Record<
    number,
    {
      accruedHours: string;
      paidHours: string;
      paymentStatus?: AppealLaborPaymentStatus;
    }
  >
>;
