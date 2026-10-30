import type { HelpCreateInput } from './helpApi';
export type HelpPending = {
    key: string;
    ticketId?: number;
    create: boolean;
    action?: 'close' | 'reopen';
    input: HelpCreateInput & {
        rating?: number;
    };
    createdAt: number;
    attempts?: number;
    nextAttemptAt?: number;
    status?: 'queued' | 'sending' | 'failed';
    error?: string;
};
