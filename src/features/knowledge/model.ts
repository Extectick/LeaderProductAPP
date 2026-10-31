import type { KnowledgeDocument, KnowledgePreview, KnowledgeSource, KnowledgeStatus, KnowledgeView } from './types';
export const views: { key: KnowledgeView; label: string }[] = [
  { key: 'pending', label: 'На проверке' }, { key: 'published', label: 'Опубликовано' },
  { key: 'processing', label: 'Обработка' }, { key: 'errors', label: 'Ошибки' }, { key: 'all', label: 'Все документы' },
];
export const sections = { COMPANY: 'Материалы компании', AI_WORKSPACE: 'Рабочая область ИИ', ARCHIVE: 'Архив', OTHER: 'Другие папки' };
export const statusNames: Record<KnowledgeStatus, string> = { QUEUED: 'В очереди', PROCESSING: 'Обрабатывается', READY: 'Готов к проверке', ERROR: 'Ошибка обработки', SKIPPED: 'Не обрабатывается' };
export function documentStatus(document: KnowledgeDocument) {
  if (document.deletedAt) return { label: 'Удалён из хранилища', tone: 'muted' };
  if (document.section === 'ARCHIVE') return { label: 'В архиве', tone: 'muted' };
  if (document.publishedRevision !== null) return { label: 'Опубликовано', tone: 'success' };
  const status = document.versions?.[0]?.status;
  return { label: status ? statusNames[status] : 'Ожидает обработки', tone: status === 'ERROR' ? 'error' : status === 'READY' ? 'ready' : 'muted' };
}
export function sourceReady(source?: KnowledgeSource, now = Date.now()) {
  return !!source?.enabled && !source.lastErrorCode && !!source.lastSuccessAt && now - Date.parse(source.lastSuccessAt) < 600000;
}
export function canPublish(preview: KnowledgePreview | null, source?: KnowledgeSource) {
  return !!preview && sourceReady(source) && !preview.document.deletedAt && preview.document.section === 'COMPANY' &&
    preview.version.status === 'READY' && !!preview.version.text?.trim() && preview.version.revision === preview.document.currentRevision;
}
export function knowledgeError(error: unknown) {
  const e = error as { code?: string; status?: number; message?: string };
  if (e.code === 'KNOWLEDGE_VERSION_CHANGED') return 'Документ изменился. Откройте актуальную версию, проверьте текст и повторите публикацию.';
  if (e.status === 401) return 'Сессия истекла. Войдите в приложение заново.';
  if (e.status === 403) return 'Недостаточно прав для проверки и публикации документов.';
  if (e.code === 'KNOWLEDGE_DISABLED' || e.status === 404) return 'База знаний недоступна в этом окружении или документ больше не существует.';
  if (e.code?.startsWith('DAV_')) return 'Не удалось проверить файл в Nextcloud. Публикация не выполнена. Повторите после восстановления связи.';
  if (e.status === 0 || e.code === 'NETWORK_UNAVAILABLE') return 'Нет связи с сервером. Изменения не подтверждены; обновите данные перед повтором.';
  return e.message && !/^[A-Z_]+$/.test(e.message) ? e.message : 'Не удалось выполнить действие. Обновите данные и попробуйте ещё раз.';
}
export const extractionErrors: Record<string, string> = {
  NO_TEXT_OCR_REQUIRED: 'В файле не найден текст. Для скана потребуется распознавание; пока загрузите документ с текстовым слоем.',
  UNSUPPORTED_FORMAT: 'Поддерживаются TXT, MD, DOCX и PDF. Сохраните документ в одном из этих форматов.',
  DOCUMENT_TOO_LARGE: 'Файл превышает лимит: 10 МБ, 500 страниц PDF или 500 000 символов текста. Разделите документ.',
  EXCLUDED_SECTION: 'Документы из этой папки не используются в базе знаний.',
  INVALID_DOCUMENT: 'Не удалось прочитать формат файла. Откройте его на компьютере и сохраните заново.',
  VERSION_SUPERSEDED: 'Во время обработки появилась новая версия документа.',
  DOCUMENT_REMOVED: 'Исходный файл удалён из хранилища.',
  EXTRACTION_FAILED: 'Не удалось извлечь текст. Проверьте файл или повторите обработку.',
  EXTRACTION_TIMEOUT: 'Обработка заняла слишком много времени. Разделите большой документ или повторите обработку.',
};
export function dateLabel(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'ещё не выполнялась';
}
export function textBlocks(text: string) {
  const blocks: string[] = []; let start = 0;
  while (start < text.length) {
    let end = Math.min(start + 3000, text.length);
    const newline = text.lastIndexOf('\n', end); if (newline > start + 1000 && end < text.length) end = newline + 1;
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    blocks.push(text.slice(start, end)); start = end;
  }
  return blocks;
}
