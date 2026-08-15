import { apiClient } from '@/utils/apiClient';
import type { CounterpartyCardBootstrap, CounterpartyCardParams } from '../model/counterpartyCard.types';

// Keep the client budget slightly above the dedicated analytical timeout in API.
const REQUEST_TIMEOUT_MS = 70_000;

export async function getCounterpartyCard(params: CounterpartyCardParams) {
  const query = new URLSearchParams();
  if (params.organizationGuid) query.set('organizationGuid', params.organizationGuid);
  if (params.refresh) query.set('refresh', 'true');
  if (params.preset) query.set('preset', params.preset);
  if (params.periodFrom) query.set('periodFrom', params.periodFrom);
  if (params.periodTo) query.set('periodTo', params.periodTo);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const path = `/api/counterparties/${encodeURIComponent(params.counterpartyGuid)}/card${suffix}`;
  const response = await apiClient<void, CounterpartyCardBootstrap>(path, {
    timeoutMs: REQUEST_TIMEOUT_MS,
    networkRetryCount: 1,
  });
  if (!response.ok || !response.data) {
    throw new Error(response.message || 'Не удалось загрузить карточку контрагента.');
  }
  return response.data;
}
