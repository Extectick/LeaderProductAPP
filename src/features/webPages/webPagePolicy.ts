const forbidden = /[\u0000-\u0020\u007f\\]/u;

/** Browser addresses are data, never an application capability or credentials. */
export function normalizeWebUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value || value.length > 8192 || forbidden.test(value)) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

/** A site can propose a non-browser action, but only a separate native user
 * action may pass it to the application router. Never run it on navigation. */
export function webPageActionUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048 || forbidden.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || !['leaderproduct:', 'mailto:', 'tel:'].includes(url.protocol)) return null;
    return value;
  } catch { return null; }
}

export function webPageDomain(value: string): string {
  const normalized = normalizeWebUrl(value);
  if (!normalized) return 'Сайт';
  return new URL(normalized).hostname;
}
