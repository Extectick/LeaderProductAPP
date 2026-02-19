import type { ServiceAccessItem } from '@/utils/servicesService';

export function getVisibleServices(services: ServiceAccessItem[] | null | undefined) {
  return (services || []).filter((item) => item.visible);
}

type GridPlatform = 'web' | 'native';

type ServiceGridMetricsInput = {
  width: number;
  platform: GridPlatform;
  isMobileLayout: boolean;
};

type ServiceGridMetrics = {
  columns: number;
  cardSize: number;
  gap: number;
  horizontalPadding: number;
  maxContentWidth: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function getServiceGridMetrics({
  width,
  platform,
  isMobileLayout,
}: ServiceGridMetricsInput): ServiceGridMetrics {
  const safeWidth = Math.max(320, Math.floor(width || 0));

  if (isMobileLayout) {
    const gap = safeWidth < 420 ? 12 : 14;
    const horizontalPadding = safeWidth < 420 ? 12 : 14;
    const maxContentWidth = safeWidth;
    const available = Math.max(0, safeWidth - horizontalPadding * 2);
    const targetCard = safeWidth < 620 ? 168 : 178;
    const maxColumns = safeWidth < 860 ? 2 : 3;
    const rawColumns = Math.round((available + gap) / (targetCard + gap));
    const columns = clamp(rawColumns, 1, maxColumns);
    const rawCardSize = Math.floor((available - gap * (columns - 1)) / columns);
    const cardSize = clamp(rawCardSize, 142, 228);
    return { columns, cardSize, gap, horizontalPadding, maxContentWidth };
  }

  const gap = safeWidth < 960 ? 14 : safeWidth < 1320 ? 16 : 18;
  const horizontalPadding = safeWidth < 980 ? 16 : safeWidth < 1360 ? 20 : 24;
  const maxContentWidth = safeWidth < 1320 ? 1200 : safeWidth < 1760 ? 1360 : 1480;
  const effectiveWidth = Math.min(safeWidth, maxContentWidth);
  const available = Math.max(0, effectiveWidth - horizontalPadding * 2);
  const targetCard = safeWidth < 980 ? 250 : safeWidth < 1320 ? 262 : 274;
  const maxColumns = safeWidth < 860 ? 2 : safeWidth < 1160 ? 3 : safeWidth < 1460 ? 4 : safeWidth < 1760 ? 5 : 6;
  const rawColumns = Math.round((available + gap) / (targetCard + gap));
  const columns = clamp(rawColumns, 1, maxColumns);
  const rawCardSize = Math.floor((available - gap * (columns - 1)) / columns);
  const cardSize = clamp(rawCardSize, 190, 280);
  return { columns, cardSize, gap, horizontalPadding, maxContentWidth };
}

export function getMobileServiceColumns(width: number) {
  return getServiceGridMetrics({ width, platform: 'native', isMobileLayout: true }).columns;
}

export function getMobileServiceCardSize(width: number, columns: number, gap = 14) {
  const inner = width - gap * 2 - (columns - 1) * gap;
  return Math.min(200, Math.max(120, Math.floor(inner / columns)));
}

export function getDesktopServiceColumns(width: number) {
  return getServiceGridMetrics({ width, platform: 'web', isMobileLayout: false }).columns;
}

export function getDesktopServiceCardSize(width: number, columns: number, gap = 16) {
  const inner = Math.min(1280, width) - gap * 2 - (columns - 1) * gap;
  return Math.max(140, Math.floor(inner / columns));
}
