import type { ServiceAccessItem, ServiceKind } from '@/utils/servicesService';

type PartialService = Partial<ServiceAccessItem> & { key?: string | null };

function normalizeKind(value: unknown): ServiceKind {
  return String(value || '').toUpperCase() === 'LOCAL' ? 'LOCAL' : 'CLOUD';
}

export function normalizeServiceItem(raw: PartialService, fallback?: ServiceAccessItem): ServiceAccessItem | null {
  const key = String(raw?.key || fallback?.key || '').trim();
  if (!key) return null;

  return {
    id: Number(raw?.id || fallback?.id || 0),
    key,
    name: String(raw?.name || fallback?.name || key),
    kind: normalizeKind(raw?.kind || fallback?.kind),
    route: raw?.route ?? fallback?.route ?? null,
    icon: raw?.icon ?? fallback?.icon ?? null,
    description: raw?.description ?? fallback?.description ?? null,
    gradientStart: raw?.gradientStart ?? fallback?.gradientStart ?? null,
    gradientEnd: raw?.gradientEnd ?? fallback?.gradientEnd ?? null,
    visible: raw?.visible ?? fallback?.visible ?? true,
    enabled: raw?.enabled ?? fallback?.enabled ?? true,
  };
}

export function mergeServices(baseCatalog: ServiceAccessItem[], nextItems?: PartialService[] | null): ServiceAccessItem[] {
  const byKey = new Map<string, ServiceAccessItem>();
  (baseCatalog || []).forEach((item) => {
    const normalized = normalizeServiceItem(item);
    if (!normalized) return;
    byKey.set(normalized.key, normalized);
  });

  (nextItems || []).forEach((item) => {
    const key = String(item?.key || '').trim();
    if (!key) return;
    const merged = normalizeServiceItem(item, byKey.get(key));
    if (!merged) return;
    byKey.set(key, merged);
  });

  return Array.from(byKey.values()).sort((a, b) => a.id - b.id || a.key.localeCompare(b.key));
}

