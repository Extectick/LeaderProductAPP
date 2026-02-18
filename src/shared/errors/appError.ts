export type AppErrorCode =
  | 'NETWORK_UNAVAILABLE'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'UNKNOWN';

export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly status?: number;
  public readonly isRetryable: boolean;

  constructor(message: string, options?: { code?: AppErrorCode; status?: number; isRetryable?: boolean; cause?: unknown }) {
    super(message);
    this.name = 'AppError';
    this.code = options?.code || 'UNKNOWN';
    this.status = options?.status;
    this.isRetryable = Boolean(options?.isRetryable);
    if (options?.cause !== undefined) {
      (this as any).cause = options.cause;
    }
  }
}

export function mapHttpStatusToErrorCode(status: number): AppErrorCode {
  if (status === 0) return 'NETWORK_UNAVAILABLE';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 422 || status === 400) return 'VALIDATION_FAILED';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'SERVER_ERROR';
  return 'UNKNOWN';
}

export function mapAppErrorToUserMessage(error: Pick<AppError, 'code' | 'message'>): string {
  switch (error.code) {
    case 'NETWORK_UNAVAILABLE':
      return 'Сервер недоступен. Проверьте соединение.';
    case 'UNAUTHORIZED':
      return 'Сессия истекла. Выполните вход повторно.';
    case 'FORBIDDEN':
      return 'Недостаточно прав для этого действия.';
    case 'NOT_FOUND':
      return 'Запрошенные данные не найдены.';
    case 'VALIDATION_FAILED':
      return error.message || 'Проверьте корректность введенных данных.';
    case 'RATE_LIMITED':
      return 'Слишком много запросов. Повторите позже.';
    case 'SERVER_ERROR':
      return 'Внутренняя ошибка сервера. Повторите позже.';
    default:
      return error.message || 'Произошла ошибка. Попробуйте снова.';
  }
}

export function toAppError(error: unknown, fallbackMessage = 'Неизвестная ошибка'): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error) {
    return new AppError(error.message || fallbackMessage, { code: 'UNKNOWN', cause: error });
  }
  return new AppError(fallbackMessage, { code: 'UNKNOWN', cause: error });
}

