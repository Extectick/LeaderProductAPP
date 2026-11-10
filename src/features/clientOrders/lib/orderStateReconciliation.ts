import type { ClientOrder, ClientOrderState } from '@/utils/clientOrdersService';
import { preserveSubmittedVersion } from './orderSubmissionPresentation';

export function matchesOrderState(order: ClientOrder, state: ClientOrderState) {
  return order.guid === state.guid || order.appGuid === state.guid
    || (!!order.clientOrderId && (order.clientOrderId === state.clientOrderId || order.clientOrderId === `legacy-server:${state.guid}`));
}

/** Do not mix partial state into editable lines/tokens. Device edits only receive
 * independent submitted-version metadata; canonical cache rows receive status. */
export function mergeOrderState(order: ClientOrder, state: ClientOrderState): ClientOrder {
  if (!matchesOrderState(order, state)) return order;
  const server = { ...state, origin: 'local', items: [], events: [] } as ClientOrder;
  if (order.origin === 'device') return preserveSubmittedVersion(order, server);
  if (state.revision < (order.revision || 0)
    || (state.revision === order.revision && Date.parse(state.updatedAt || '') < Date.parse(order.updatedAt || ''))) return order;
  return { ...order, ...state, origin: order.origin || 'local',
    // A partial response cannot certify old line contents or edit tokens.
    contentToken: undefined, acceptedSubmission: undefined, submittedVersion: undefined,
    status1c: state.revision === order.revision ? order.status1c : null,
    currentState1c: state.revision === order.revision ? order.currentState1c : null,
    documentStatus1c: state.revision === order.revision ? order.documentStatus1c : null,
    readOnly: !!state.hasRealization,
    readOnlyReason: state.hasRealization ? 'По заказу создана проведенная реализация товаров и услуг.' : null,
    queuePosition: state.syncState === 'QUEUED' ? order.queuePosition : null,
  };
}

/** Shipment dates are calendar dates in 1C, not instants in the phone's timezone. */
export function orderCalendarDate(value: string | null | undefined): string | null {
  const text = String(value || '').trim();
  const dotted = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
  const key = dotted ? `${dotted[3]}-${dotted[2]}-${dotted[1]}` : /^(\d{4}-\d{2}-\d{2})(?:T|$)/.exec(text)?.[1];
  if (!key) return null;
  const date = new Date(`${key}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === key ? key : null;
}
export function matchesDeliveryDateRange(value: string | null | undefined, from?: string, to?: string) {
  const date = orderCalendarDate(value), start = orderCalendarDate(from), end = orderCalendarDate(to);
  return (!start || (!!date && date >= start)) && (!end || (!!date && date <= end));
}
