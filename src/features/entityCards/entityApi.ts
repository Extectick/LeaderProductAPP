import { httpRequest, type HttpResponse } from '@/src/shared/api/httpClient';
import { normalizeEntityTarget } from '@/src/shared/entityLinks';
import type { Profile } from '@/src/entities/user/types';
import { EntityCardError, type EntityCardData, type EntityTarget, type EntityValue } from './entityTypes';

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const shortText = (value: unknown, max = 1000): value is string => typeof value === 'string' && value.length <= max;
const scalar = (value: unknown): value is EntityValue => value === null || typeof value === 'boolean' ||
  typeof value === 'number' && Number.isFinite(value) || shortText(value, 20000);

export function entityIdentity(value: EntityTarget): string {
  const target = normalizeEntityTarget(value);
  if (!target) throw new EntityCardError('unsupported', 'ENTITY_INVALID_TARGET', 'Эта ссылка не поддерживается.');
  return JSON.stringify(target);
}

function validValue(value: unknown): value is EntityValue {
  return scalar(value) || record(value) && shortText(value.label) && !!normalizeEntityTarget(value.target);
}

/** Do not render a mismatched target, malformed references or arbitrary nested provider objects. */
export function validateEntityCardData(value: unknown, requested: EntityTarget): EntityCardData {
  if (!record(value) || !normalizeEntityTarget(value.target) || entityIdentity(value.target as EntityTarget) !== entityIdentity(requested) ||
      !shortText(value.title) || !value.title.trim() || value.subtitle !== undefined && !shortText(value.subtitle, 4000) ||
      !['product', 'client-order', 'user', 'generic'].includes(String(value.view)) || typeof value.truncated !== 'boolean' ||
      !Array.isArray(value.fields) || value.fields.length > 1000 || !Array.isArray(value.tables) || value.tables.length > 100) {
    throw new EntityCardError('unsupported', 'ENTITY_RESPONSE_UNSUPPORTED', 'Не удалось прочитать карточку. Обновите приложение или повторите позже.');
  }
  const fieldKeys = new Set<string>();
  for (const field of value.fields) {
    if (!record(field) || !shortText(field.key, 200) || !shortText(field.label) || !validValue(field.value) || fieldKeys.has(field.key)) {
      throw new EntityCardError('unsupported', 'ENTITY_RESPONSE_UNSUPPORTED', 'Не удалось прочитать поля карточки.');
    }
    fieldKeys.add(field.key);
  }
  const tableKeys = new Set<string>();
  for (const table of value.tables) {
    if (!record(table) || !shortText(table.key, 200) || !shortText(table.label) || typeof table.truncated !== 'boolean' ||
        !Array.isArray(table.columns) || table.columns.length > 256 || !Array.isArray(table.rows) || table.rows.length > 1000 || tableKeys.has(table.key)) {
      throw new EntityCardError('unsupported', 'ENTITY_RESPONSE_UNSUPPORTED', 'Не удалось прочитать таблицу карточки.');
    }
    tableKeys.add(table.key);
    const columns = new Set<string>();
    for (const column of table.columns) {
      if (!record(column) || !shortText(column.key, 200) || !shortText(column.label) || columns.has(column.key)) {
        throw new EntityCardError('unsupported', 'ENTITY_RESPONSE_UNSUPPORTED', 'Не удалось прочитать столбцы карточки.');
      }
      columns.add(column.key);
    }
    for (const row of table.rows) {
      if (!record(row) || Object.entries(row).some(([key, cell]) => !columns.has(key) || !validValue(cell))) {
        throw new EntityCardError('unsupported', 'ENTITY_RESPONSE_UNSUPPORTED', 'Не удалось прочитать строки карточки.');
      }
    }
  }
  return value as EntityCardData;
}

function responseError(response: HttpResponse<unknown>): EntityCardError {
  const code = response.backendErrorCode || response.errorCode || `HTTP_${response.status}`;
  if (['ONEC_AUTH_REQUIRED', 'ONEC_CREDENTIALS_INVALID', 'ONEC_ACCESS_DENIED'].includes(code)) {
    return new EntityCardError('connect', code, 'Для просмотра нужно проверить личное подключение 1С.');
  }
  if (response.status === 401 || response.status === 409 || code === 'ACCOUNT_CHANGED') {
    return new EntityCardError('session', code, 'Учётная запись изменилась или сессия завершена. Откройте карточку после входа.');
  }
  if (response.status === 403) return new EntityCardError('denied', code, 'Нет доступа к этой карточке.');
  if (response.status === 404) return new EntityCardError('not-found', code, 'Объект не найден или больше недоступен.');
  if (response.status === 400 || code === 'ENTITY_RESPONSE_UNSUPPORTED' || code === 'ENTITY_PROFILE_USE_EXISTING') {
    return new EntityCardError('unsupported', code, 'Эта карточка пока не поддерживается.');
  }
  return new EntityCardError('unavailable', code, 'Не удалось загрузить карточку. Проверьте соединение и повторите попытку.');
}

export type EntityCardResult = { kind: 'entity'; data: EntityCardData } | { kind: 'profile'; profile: Profile };

export async function loadEntityCard(target: EntityTarget, userId: number, signal: AbortSignal,
  options: { maxTabularRows?: number } = {}): Promise<EntityCardResult> {
  const normalized = normalizeEntityTarget(target);
  if (!normalized) throw new EntityCardError('unsupported', 'ENTITY_INVALID_TARGET', 'Эта ссылка не поддерживается.');
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new EntityCardError('session', 'ENTITY_SESSION_REQUIRED', 'Для просмотра войдите в приложение.');
  const maxTabularRows = options.maxTabularRows ?? 100;
  if (!Number.isSafeInteger(maxTabularRows) || maxTabularRows < 1 || maxTabularRows > 1000) {
    throw new EntityCardError('unsupported', 'ENTITY_INVALID_LIMIT', 'Не удалось выбрать размер таблицы.');
  }
  signal.throwIfAborted();
  const requestOptions = { expectedUserId: userId, signal, networkRetryCount: 0, timeoutMs: 60000 };
  if (normalized.source === 'app') {
    const response = await httpRequest<undefined, { profile: Profile }>(`/users/${encodeURIComponent(normalized.id)}/profile`, requestOptions);
    signal.throwIfAborted();
    if (!response.ok) throw responseError(response);
    const profile = response.data?.profile;
    if (!profile || String(profile.id) !== normalized.id || !record(profile.role) || !Array.isArray(profile.departmentRoles)) {
      throw new EntityCardError('unsupported', 'ENTITY_RESPONSE_UNSUPPORTED', 'Не удалось прочитать профиль.');
    }
    return { kind: 'profile', profile };
  }
  const response = await httpRequest<{ target: EntityTarget; maxTabularRows: number }, EntityCardData>('/entity-links/resolve', {
    ...requestOptions, method: 'POST', body: { target: normalized, maxTabularRows },
  });
  signal.throwIfAborted();
  if (!response.ok) throw responseError(response);
  return { kind: 'entity', data: validateEntityCardData(response.data, normalized) };
}
