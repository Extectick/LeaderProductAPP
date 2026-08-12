export const ONEC_CONNECTION_UNAVAILABLE_MESSAGE =
  'Нет связи с 1С. Проверьте интернет-соединение. Приложение повторит подключение автоматически.';
export const SERVER_CONNECTION_UNAVAILABLE_MESSAGE =
  'Нет связи с сервером. Проверьте интернет-соединение. Подключение восстановится автоматически.';

type ErrorLike = {
  status?: number;
  errorCode?: string;
  code?: string;
  name?: string;
  message?: string;
};

function errorRecord(value: unknown): ErrorLike {
  if (value && typeof value === 'object') return value as ErrorLike;
  return {};
}

export function errorMessageText(value: unknown) {
  if (typeof value === 'string') return value.trim();
  const record = errorRecord(value);
  return String(record.message || '').trim();
}

export function isNetworkUnavailableError(value: unknown) {
  const record = errorRecord(value);
  const message = errorMessageText(value).toLocaleLowerCase('ru');
  return (
    record.status === 0
    || record.errorCode === 'NETWORK_UNAVAILABLE'
    || record.code === 'NETWORK_UNAVAILABLE'
    || record.name === 'AbortError'
    || message.includes('fetch failed')
    || message.includes('failed to fetch')
    || message.includes('failed to connect')
    || message.includes('connectexception')
    || message.includes('network request failed')
    || message.includes('network error')
    || message.includes('request timeout')
    || message.includes('socket hang up')
    || message.includes('econnrefused')
    || message.includes('econnreset')
    || message.includes('econnaborted')
    || message.includes('enotfound')
    || message.includes('etimedout')
    || message.includes('нет соединения')
    || message.includes('нет связи с 1с')
    || message.includes('нет связи с сервером')
    || message.includes('1с временно недоступ')
    || message.includes('1c временно недоступ')
    || message.includes('ошибка сети')
    || message.includes('не удалось подключиться')
  );
}

export function isTechnicalErrorMessage(value: unknown) {
  const message = errorMessageText(value);
  if (!message) return true;
  const lower = message.toLocaleLowerCase('ru');
  return (
    isNetworkUnavailableError(value)
    || message.startsWith('{')
    || message.startsWith('[')
    || message.startsWith('<!DOCTYPE')
    || lower.includes('errorid=')
    || lower.includes('internal_error')
    || lower.includes('zoderror')
    || lower.includes('expected number')
    || lower.includes('java.net.')
    || lower.includes('http 500')
    || lower.startsWith('http ')
    || lower.includes('"path"')
    || lower.includes('"code"')
    || lower.includes('поле объекта не обнаружено')
    || lower.includes('метод объекта не обнаружен')
    || message.includes('\n    at ')
    || /https?:\/\/\S+/i.test(message)
    || /(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?/.test(message)
  );
}

export function toUserErrorMessage(value: unknown, fallback: string) {
  if (isNetworkUnavailableError(value)) return ONEC_CONNECTION_UNAVAILABLE_MESSAGE;
  const message = errorMessageText(value);
  return isTechnicalErrorMessage(message) ? fallback : message.slice(0, 240);
}
