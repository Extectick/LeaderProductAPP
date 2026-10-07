import {
  ONEC_CONNECTION_UNAVAILABLE_MESSAGE,
  SERVER_CONNECTION_UNAVAILABLE_MESSAGE,
  isNetworkUnavailableError,
  toUserErrorMessage,
} from '@/src/shared/errors/userErrorMessage';

describe('user error messages', () => {
  it('hides native connection details from a client-orders error', () => {
    const nativeError = Object.assign(
      new Error('fetch failed: java.net.ConnectException: Failed to connect to api.leader-product.ru/155.212.144.191:443'),
      { status: 0, errorCode: 'NETWORK_UNAVAILABLE' }
    );

    expect(isNetworkUnavailableError(nativeError)).toBe(true);
    expect(toUserErrorMessage(nativeError, 'Не удалось загрузить список')).toBe(
      ONEC_CONNECTION_UNAVAILABLE_MESSAGE
    );
    expect(toUserErrorMessage(nativeError, 'Не удалось загрузить список')).not.toContain('155.212.144.191');
  });

  it('recognizes the safe server reconnect message as a transient connection error', () => {
    expect(isNetworkUnavailableError(SERVER_CONNECTION_UNAVAILABLE_MESSAGE)).toBe(true);
  });

  it('keeps a normal business error', () => {
    expect(toUserErrorMessage('Недостаточно остатка по позиции', 'Ошибка')).toBe(
      'Недостаточно остатка по позиции'
    );
  });

  it.each([
    "Call to function 'NativeStatement.finalizeAsync' has been rejected",
    'NativeDatabase.execAsync failed: database is locked',
    'SQLITE_IOERR: disk I/O error',
    'NOT NULL constraint failed: offline_stock.product_guid',
    'Unable to find shared object already released',
  ])('hides native storage details: %s', (message) => {
    expect(toUserErrorMessage(new Error(message), 'Не удалось сохранить данные')).toBe('Не удалось сохранить данные');
  });
});
