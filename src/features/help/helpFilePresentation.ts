export type HelpFileFormat = {
  icon: 'file-excel' | 'file-word' | 'file-pdf-box' | 'file-powerpoint' | 'folder-zip'
    | 'file-code' | 'file-delimited' | 'android' | 'file-document-outline' | 'file-image' | 'file-music' | 'file-video';
  label: string;
};

/** Prefer a real file extension; MIME is the fallback for extensionless files. */
export function helpFileFormat(name: string, mimeType = ''): HelpFileFormat {
  const extension = name.trim().match(/\.([a-z0-9]{1,12})$/i)?.[1].toLowerCase() || '';
  const mime = mimeType.toLowerCase().split(';')[0].trim();
  if (/^(xlsx?|xlsm|xlsb|xltx|xltm|ods)$/.test(extension)) return {icon:'file-excel',label:'Excel'};
  if (/^(docx?|docm|dotx|dotm|odt|rtf)$/.test(extension)) return {icon:'file-word',label:'Word'};
  if (extension === 'pdf') return {icon:'file-pdf-box',label:'PDF'};
  if (/^(pptx?|pptm|ppsx?|odp)$/.test(extension)) return {icon:'file-powerpoint',label:'PowerPoint'};
  if (/^(csv|tsv)$/.test(extension)) return {icon:'file-delimited',label:'Таблица'};
  if (/^(zip|rar|7z|tar|gz|bz2|xz|tgz)$/.test(extension)) return {icon:'folder-zip',label:'Архив'};
  if (extension === 'apk') return {icon:'android',label:'Приложение Android'};
  if (/^(json|xml|html?|js|ts|tsx|jsx|css|yaml|yml|sql|py|sh)$/.test(extension)) return {icon:'file-code',label:'Код'};
  if (/^(png|jpe?g|gif|webp|heic|bmp|tiff?|svg)$/.test(extension)) return {icon:'file-image',label:'Изображение'};
  if (/^(mp3|m4a|wav|ogg|aac|flac|opus)$/.test(extension)) return {icon:'file-music',label:'Аудио'};
  if (/^(mp4|mov|avi|webm|mkv|m4v)$/.test(extension)) return {icon:'file-video',label:'Видео'};
  if (/^(txt|md|log)$/.test(extension)) return {icon:'file-document-outline',label:'Текстовый документ'};
  if (/spreadsheet|ms-excel|opendocument.spreadsheet/.test(mime)) return {icon:'file-excel',label:'Excel'};
  if (/wordprocessing|msword|opendocument.text|application\/rtf/.test(mime)) return {icon:'file-word',label:'Word'};
  if (mime === 'application/pdf') return {icon:'file-pdf-box',label:'PDF'};
  if (/presentation|powerpoint/.test(mime)) return {icon:'file-powerpoint',label:'PowerPoint'};
  if (/zip|compressed|x-tar/.test(mime)) return {icon:'folder-zip',label:'Архив'};
  if (/csv|tab-separated-values/.test(mime)) return {icon:'file-delimited',label:'Таблица'};
  if (mime === 'application/vnd.android.package-archive') return {icon:'android',label:'Приложение Android'};
  if (/json|xml|javascript/.test(mime)) return {icon:'file-code',label:'Код'};
  if (mime.startsWith('image/')) return {icon:'file-image',label:'Изображение'};
  if (mime.startsWith('audio/')) return {icon:'file-music',label:'Аудио'};
  if (mime.startsWith('video/')) return {icon:'file-video',label:'Видео'};
  return {icon:'file-document-outline',label:extension ? extension.toUpperCase() : 'Файл'};
}

/** Preserve zero and small real byte counts instead of claiming a minimum 1KB. */
export function helpFileBytes(bytes: number): string {
  const size = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  const unit = size >= 1073741824 ? 3 : size >= 1048576 ? 2 : size >= 1024 ? 1 : 0;
  const value = size / 1024 ** unit;
  return `${value.toLocaleString('ru-RU', {maximumFractionDigits:unit && value < 100 ? 1 : 0})} ${['Б','КБ','МБ','ГБ'][unit]}`;
}

export function helpFileTransferText(progress: {downloaded: number; total: number | null}): string {
  const downloaded = helpFileBytes(progress.downloaded);
  return progress.total !== null && Number.isFinite(progress.total) && progress.total >= 0
    ? `${downloaded} / ${helpFileBytes(progress.total)}` : `${downloaded} загружено`;
}
