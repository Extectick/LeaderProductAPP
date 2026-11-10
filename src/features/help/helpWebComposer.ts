/** Browser-only policy kept separate from the native input/IME owner. */
export type HelpWebSendMode = 'enter' | 'modifier';
export const HELP_WEB_SEND_MODE_KEY = 'help:web:send-key:v1';
export const HELP_ATTACHMENT_LIMIT = 10;
export const HELP_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

export function shouldSendHelpWebKey(event: {
  key?: string; keyCode?: number; which?: number; isComposing?: boolean;
  shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean;
  repeat?: boolean; defaultPrevented?: boolean;
}, mode: HelpWebSendMode, finePointer: boolean, composing = false) {
  if (event.key !== 'Enter' || composing || event.isComposing || event.keyCode === 229 || event.which === 229 || event.shiftKey || event.altKey || event.repeat || event.defaultPrevented) return false;
  return Boolean(event.ctrlKey || event.metaKey || mode === 'enter' && finePointer);
}

export function helpAttachmentBatchError(files: readonly {size?: number; file?: {size: number}}[], existingCount: number): string | null {
  if (existingCount + files.length > HELP_ATTACHMENT_LIMIT) return 'В одном сообщении можно прикрепить до 10 файлов.';
  if (files.some(file => (file.size ?? file.file?.size ?? 0) > HELP_ATTACHMENT_MAX_BYTES)) return 'Размер каждого файла должен быть не больше 20 МБ.';
  return null;
}

/** A clipboard can contain text and files. Only consume its file representation. */
export function helpTransferredFiles(transfer: Pick<DataTransfer, 'files' | 'items'> | null): File[] {
  if (!transfer) return [];
  const files = Array.from(transfer.files ?? []);
  if (files.length) return files;
  return Array.from(transfer.items ?? []).flatMap(item => {
    const file = item.kind === 'file' ? item.getAsFile() : null;
    return file ? [file] : [];
  });
}

export function helpTransferHasFiles(transfer: Pick<DataTransfer, 'types'> | null) {
  return Boolean(transfer && Array.from(transfer.types ?? []).includes('Files'));
}
