import { httpRequest, type HttpResponse } from '@/src/shared/api/httpClient';
import { normalizeEntityTarget } from '@/src/shared/entityLinks';
import { API_ENDPOINTS } from '@/utils/apiEndpoints';
import type { ClientOrder } from '@/utils/clientOrdersService';
import { clientOrderRoute, isClientOrderEntityTarget } from '../clientOrders/lib/clientOrderOpening';
import type {StockProduct} from '../stockBalances/products';
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
  if(code==='CLIENT_ORDER_SOURCE_MISMATCH')return new EntityCardError('unsupported',code,'Эта ссылка относится к другой базе заказов. Откройте заказ через «Заказы клиентов».');
  if(code==='STOCK_SOURCE_MISMATCH')return new EntityCardError('unsupported',code,'Эта ссылка относится к другой базе. Откройте товар через «Остатки по складам».');
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

export type EntityCardResult = { kind: 'entity'; data: EntityCardData } | { kind: 'profile'; profile: Profile } | {kind:'stock-product';product:StockProduct} | {kind:'client-order';orderGuid:string;title:string;order:ClientOrder};

/** Reject malformed source lines instead of silently dropping them while keeping the source total. */
function validClientOrderBody(order: Record<string, unknown>): boolean {
  const optionalText = (value: unknown) => value == null || shortText(value, 20000);
  const optionalNumber = (value: unknown) => value == null || typeof value === 'number' && Number.isFinite(value);
  const reference = (value: unknown): boolean => value == null || record(value) &&
    ['guid', 'name', 'number', 'symbol', 'fullAddress', 'deliveryComment', 'comment'].every(key => optionalText(value[key]));
  if (!['currency', 'sourceCurrencyName', 'date1c', 'comment', 'deliveryDate', 'paymentForm', 'deliveryMethod', 'readOnlyReason'].every(key => optionalText(order[key])) ||
      !['totalAmount', 'generalDiscountPercent', 'itemsCount'].every(key => optionalNumber(order[key])) ||
      !['organization', 'counterparty', 'agreement', 'contract', 'warehouse', 'deliveryAddress', 'priceType'].every(key => reference(order[key]))) return false;
  if (record(order.agreement) && !reference(order.agreement.priceType)) return false;
  if (order.items == null) return true; // The service normalizes omitted collections to empty arrays.
  return Array.isArray(order.items) && order.items.length <= 1000 && order.items.every(item => record(item) &&
    record(item.product) && shortText(item.product.guid, 100) && !!item.product.guid && shortText(item.product.name, 20000) &&
    ['code', 'article', 'sku'].every(key => optionalText((item.product as Record<string,unknown>)[key])) &&
    typeof item.quantity === 'number' && Number.isFinite(item.quantity) &&
    ['quantityBase', 'price', 'basePrice', 'receiptPrice', 'manualPrice', 'lineAmount', 'discountPercent', 'cancelledAmount'].every(key => optionalNumber(item[key])) &&
    ['lineGuid', 'comment', 'cancelReasonGuid', 'cancelReasonName', 'cancelReason', 'priceSource'].every(key => optionalText(item[key])) &&
    ['package', 'unit', 'priceType'].every(key => reference(item[key])) &&
    (!record(item.package) || optionalNumber(item.package.multiplier)));
}

/** Object identity remains typed; legacy 1C links require a server-verified mapping. */
function isStockProductTarget(target:EntityTarget):target is Extract<EntityTarget,{guid:string}> {
  const value=target as {source:string;kind?:string;metaType?:string;name?:string};
  return value.source==='app'&&value.kind==='product'||value.source==='onec'&&value.metaType==='Catalogs'&&value.name==='Номенклатура';
}
function validStockProduct(value:unknown,guid:string):value is StockProduct {
  return record(value)&&value.guid===guid&&shortText(value.name,1000)&&!!value.name.trim()&&
    (value.code===null||shortText(value.code))&&['inStock','reserved'].every(key=>typeof value[key]==='number'&&Number.isFinite(value[key]))&&
    (value.available===null||typeof value.available==='number'&&Number.isFinite(value.available))&&
    (value.baseUnit===null||record(value.baseUnit)&&shortText(value.baseUnit.name)&&
      (value.baseUnit.symbol===null||shortText(value.baseUnit.symbol)));
}

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
  if(isClientOrderEntityTarget(normalized)){
    // The service verifies the original 1C base and its ordinary order ACL before
    // returning a source-bound read-only document. Do not send its GUID to another base.
    const path=API_ENDPOINTS.CLIENT_ORDERS.DETAIL(normalized.guid)+`?baseKey=${encodeURIComponent(normalized.baseKey)}`;
    const response=await httpRequest<undefined,unknown>(path,requestOptions);
    signal.throwIfAborted();
    if(!response.ok)throw responseError(response);
    const order=response.data;
    const route=record(order)?clientOrderRoute(order.guid):null;
    if(!record(order)||!route||route.params.orderGuid!==normalized.guid||order.sourceBaseKey!==normalized.baseKey||order.readOnly!==true||!validClientOrderBody(order))throw new EntityCardError('unsupported','ENTITY_RESPONSE_UNSUPPORTED','Не удалось прочитать заказ приложения.');
    const number=shortText(order.number1c,100)&&order.number1c.trim()?order.number1c:shortText(order.number,100)?order.number:'';
    // Keep the verified response; opening a card must not perform a second route-owned lookup.
    const {normalizeClientOrder}=require('@/utils/clientOrdersService') as typeof import('@/utils/clientOrdersService');
    return {kind:'client-order',orderGuid:route.params.orderGuid,title:number?`Заказ ${number}`:'Заказ клиента',order:normalizeClientOrder(order as ClientOrder)};
  }
  if(isStockProductTarget(normalized)){
    const query=normalized.source==='onec'?`?baseKey=${encodeURIComponent(normalized.baseKey)}`:'';
    const response=await httpRequest<undefined,StockProduct>(`/stock-balances/products/${encodeURIComponent(normalized.guid)}${query}`,requestOptions);
    signal.throwIfAborted();
    if(!response.ok){
      const error=responseError(response);
      if(error.kind==='connect')throw new EntityCardError('unavailable',error.code,'Сервис остатков временно недоступен. Повторите загрузку товара.');
      throw error;
    }
    if(!validStockProduct(response.data,normalized.guid))throw new EntityCardError('unsupported','ENTITY_RESPONSE_UNSUPPORTED','Не удалось прочитать товар приложения.');
    return {kind:'stock-product',product:response.data};
  }
  if (normalized.source === 'app' && normalized.kind==='user') {
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
