export function normalizeRoutePath(path: string | null | undefined): string {
  const raw = String(path || '').trim();
  if (!raw) return '/';
  const noGroups = raw.replace(/\/\([^/]+\)/g, '');
  const compact = noGroups.replace(/\/+/g, '/');
  if (compact.length > 1 && compact.endsWith('/')) return compact.slice(0, -1);
  return compact || '/';
}

