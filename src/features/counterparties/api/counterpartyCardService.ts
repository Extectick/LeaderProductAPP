import { apiClient } from '@/utils/apiClient';
import type { CounterpartyCardBootstrap, CounterpartyCardParams, CounterpartyFinancialDocumentsPage, CounterpartyFinancialDocumentsParams } from '../model/counterpartyCard.types';

// Keep the client budget slightly above the dedicated analytical timeout in API.
const REQUEST_TIMEOUT_MS = 70_000;

export async function getCounterpartyCard(params: CounterpartyCardParams, signal?: AbortSignal) {
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
    // An analytical request is expensive for 1C. A new user action will issue a
    // fresh request, so repeating the same failed network call only adds load.
    networkRetryCount: 0,
    signal,
  });
  if (!response.ok || !response.data) {
    throw new Error(response.message || 'Не удалось загрузить карточку контрагента.');
  }
  return response.data;
}

export async function getCounterpartyFinancialDocuments(params: CounterpartyFinancialDocumentsParams, signal?: AbortSignal) {
  const query = new URLSearchParams({
    organizationGuid: params.organizationGuid,
    preset: params.preset,
    limit: String(params.limit ?? 20),
  });
  if (params.periodFrom) query.set('periodFrom', params.periodFrom);
  if (params.periodTo) query.set('periodTo', params.periodTo);
  if (params.status) query.set('status', params.status);
  if (params.cursor) query.set('cursor', params.cursor);
  const path = `/api/counterparties/${encodeURIComponent(params.counterpartyGuid)}/financial-documents?${query.toString()}`;
  const response = await apiClient<void, CounterpartyFinancialDocumentsPage>(path, {
    timeoutMs: REQUEST_TIMEOUT_MS,
    networkRetryCount: 0,
    signal,
  });
  if (!response.ok || !response.data) {
    throw new Error(response.message || 'Не удалось загрузить финансовые документы.');
  }
  return response.data;
}
