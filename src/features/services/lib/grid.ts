import type { ServiceAccessItem } from '@/utils/servicesService';

export function getVisibleServices(services: ServiceAccessItem[] | null | undefined) {
  return (services || []).filter((item) => item.visible);
}

export function getMobileServiceColumns(width: number) {
  if (width < 360) return 2;
  if (width < 768) return 2;
  return 3;
}

export function getMobileServiceCardSize(width: number, columns: number, gap = 14) {
  const inner = width - gap * 2 - (columns - 1) * gap;
  return Math.min(200, Math.max(120, Math.floor(inner / columns)));
}

export function getDesktopServiceColumns(width: number) {
  if (width < 640) return 2;
  if (width < 960) return 3;
  if (width < 1280) return 4;
  if (width < 1600) return 5;
  return 6;
}

export function getDesktopServiceCardSize(width: number, columns: number, gap = 16) {
  const inner = Math.min(1280, width) - gap * 2 - (columns - 1) * gap;
  return Math.max(140, Math.floor(inner / columns));
}
