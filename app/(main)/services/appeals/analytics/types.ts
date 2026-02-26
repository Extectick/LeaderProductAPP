import type { AppealLaborPaymentStatus } from '@/src/entities/appeal/types';

export type TabKey = 'appeals' | 'users';
export type PeriodPreset = 'all' | '7' | '30' | '90' | 'custom';
export type ActionKey = 'status' | 'deadline' | 'assign' | 'participants' | 'transfer' | 'labor';

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
