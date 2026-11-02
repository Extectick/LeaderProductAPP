import type { HelpCreateInput, HelpMessage } from './helpApi';
export type HelpPending = {
    key: string;
    replyTo?: HelpMessage['replyTo'];
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
