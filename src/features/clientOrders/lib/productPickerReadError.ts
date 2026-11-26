export function productPickerReadError(status: unknown, offset: number) {
  if (status === 403) {
    return {
      kind: 'forbidden' as const, retryOffset: 0,
      message: 'Подбор недоступен для выбранных реквизитов заказа. Проверьте организацию, клиента и вид цены. Если они указаны верно, попросите администратора проверить ваш доступ.',
    };
  }
  if (status === 401) {
    return {kind: 'unauthorized' as const, retryOffset: 0, message: 'Сеанс завершён. Войдите в приложение снова.'};
  }
  return {
    kind: 'retry' as const, retryOffset: offset,
    message: offset > 0 ? 'Не удалось загрузить следующую страницу товаров.' : 'Не удалось загрузить товары.',
  };
}

export type ProductPickerReadError = ReturnType<typeof productPickerReadError>;
