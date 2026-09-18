import { isSameOrderOperation, orderChangeReview } from '../src/features/clientOrders/lib/orderOperationIntegrity';

describe('local order operation integrity', () => {
  it('keeps a newer operation when an old request completes', () => {
    const sent = { id: 'draft', clientRevision: 1 };
    const pending = [{ id: 'draft', clientRevision: 2 }, { id: 'other', clientRevision: 1 }];
    expect(pending.filter(i => !isSameOrderOperation(i, sent))).toEqual(pending);
  });
  it('consumes only the acknowledged operation', () => {
    const sent = { id: 'draft', clientRevision: 1 };
    expect([sent, { id: 'other', clientRevision: 1 }].filter(i => !isSameOrderOperation(i, sent)))
      .toEqual([{ id: 'other', clientRevision: 1 }]);
  });
  it('keeps a promoted SUBMIT when SAVE of the same revision completes', () => {
    expect(isSameOrderOperation({ id: 'draft', clientRevision: 1, intent: 'SUBMIT' }, { id: 'draft', clientRevision: 1, intent: 'SAVE' })).toBe(false);
  });
  it('never turns an ordinary conflict into permission to overwrite', () => {
    expect(orderChangeReview({ errorDetails: { kind: 'ORDER_CONTENT_CONFLICT' } })).toBeNull();
    expect(orderChangeReview(new Error('Conflict'))).toBeNull();
  });
  it('accepts only the structured review challenge', () => {
    const details = { kind: 'ORDER_CHANGE_REVIEW_REQUIRED', baseContentToken: 'base', confirmationToken: 'signed', changes: [] };
    expect(orderChangeReview({ errorDetails: details })).toEqual(details);
    expect(orderChangeReview({ errorDetails: { ...details, confirmationToken: null } })).toBeNull();
  });
});
