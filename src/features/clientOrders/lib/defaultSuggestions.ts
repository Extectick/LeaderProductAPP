import type {ClientOrderDefaults, ClientOrderOrganization, ClientOrderCounterpartyOption,
  ClientOrderAgreementOption, ClientOrderContractOption, ClientOrderWarehouseOption,
  ClientOrderDeliveryAddressOption} from '@/utils/clientOrdersService';
import {hasManualPrice, type DraftOrder} from '../clientOrdersShared';

export type DefaultSelections = {organization: ClientOrderOrganization | null; counterparty: ClientOrderCounterpartyOption | null;
  agreement: ClientOrderAgreementOption | null; contract: ClientOrderContractOption | null;
  warehouse: ClientOrderWarehouseOption | null; deliveryAddress: ClientOrderDeliveryAddressOption | null};
export const DEFAULT_SUGGESTION_FIELDS = ['agreementGuid', 'contractGuid', 'warehouseGuid', 'deliveryAddressGuid',
  'priceTypeGuid', 'priceTypeName', 'deliveryDate', 'paymentForm', 'deliveryMethod', 'invoiceRequested', 'currency'] as const;
export const defaultsNeedRefresh = (value: ClientOrderDefaults) => Boolean(value.pending || value.incomplete
  || value.readState?.refreshPending || value.readState?.stale);

/** Reference suggestions never authorize a write. A manually touched field, including an
 * explicit clear or same-value choice, is fenced until the customer/org context changes. */
export function mergeDefaultSuggestions(draft: DraftOrder, selections: DefaultSelections, defaults: ClientOrderDefaults,
  touched: ReadonlySet<string>, context: {organizationGuid: string; counterpartyGuid: string}) {
  if (draft.organizationGuid !== context.organizationGuid || draft.counterpartyGuid !== context.counterpartyGuid)
    return {draft, selections};
  const next = {...draft};
  const refs = {...selections};
  const agreement = defaults.agreement;
  const related = !draft.agreementGuid || draft.agreementGuid === agreement?.guid;
  const candidates = {agreement, contract: defaults.contract ?? (related ? agreement?.contract : null),
    warehouse: related ? agreement?.warehouse ?? defaults.warehouse : null,
    deliveryAddress: defaults.deliveryAddress};
  for (const key of ['agreement', 'contract', 'warehouse', 'deliveryAddress'] as const) {
    const field = `${key}Guid` as 'agreementGuid' | 'contractGuid' | 'warehouseGuid' | 'deliveryAddressGuid';
    const value = candidates[key];
    if (!touched.has(field) && !draft[field] && value?.guid) {
      next[field] = value.guid;
      // This mapping is explicit to retain the concrete selection types.
      Object.assign(refs, {[key]: value});
    }
  }
  const priceType = related ? agreement?.priceType ?? defaults.priceType : null;
  if (!touched.has('priceTypeGuid') && !touched.has('priceTypeName') && !draft.priceTypeGuid && priceType?.guid) {
    next.priceTypeGuid = priceType.guid; next.priceTypeName = priceType.name;
  }
  for (const field of ['deliveryDate', 'paymentForm', 'deliveryMethod'] as const) {
    if (!touched.has(field) && !draft[field] && defaults[field] != null) next[field] = defaults[field];
  }
  // Neither a false/empty fallback nor a pending response may revoke a prior choice.
  if (!touched.has('invoiceRequested') && defaults.invoiceRequested === true) next.invoiceRequested = true;
  if (!touched.has('currency') && !draft.currency && defaults.currency) next.currency = defaults.currency;
  if (next.priceTypeGuid !== draft.priceTypeGuid) next.items = draft.items.map(item => hasManualPrice(item) ? item : {...item, priceTypeGuid: next.priceTypeGuid, priceTypeName: next.priceTypeName});
  const restrictionsKnown = defaults.restrictionsKnown === true || (defaults.restrictionsKnown == null
    && !defaultsNeedRefresh(defaults) && defaults.readState?.verificationRequired !== true);
  if (defaults.counterparty?.guid === context.counterpartyGuid) refs.counterparty = {
    ...selections.counterparty, ...defaults.counterparty,
    hasDebt: restrictionsKnown ? defaults.counterparty.hasDebt ?? defaults.hasDebt ?? null : selections.counterparty?.hasDebt ?? null,
    shipmentProhibited: restrictionsKnown ? defaults.counterparty.shipmentProhibited ?? defaults.shipmentProhibited ?? null : selections.counterparty?.shipmentProhibited ?? null,
    debtReason: restrictionsKnown ? defaults.counterparty.debtReason ?? defaults.debtReason ?? null : selections.counterparty?.debtReason ?? null,
  };
  const changed = Object.keys(next).some(key => next[key as keyof DraftOrder] !== draft[key as keyof DraftOrder]);
  return {draft: changed ? next : draft, selections: refs};
}
