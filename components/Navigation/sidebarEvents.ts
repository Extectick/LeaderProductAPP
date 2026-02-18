export type WebSidebarStatePhase = 'start' | 'progress' | 'end';

export type WebSidebarStateEventDetail = {
  collapsed: boolean;
  width: number;
  phase: WebSidebarStatePhase;
};

export const WEB_SIDEBAR_STATE_EVENT = 'lp:web-sidebar:state';
export const WEB_SIDEBAR_COLLAPSE_STORAGE_KEY = 'lp:web-sidebar:collapsed:v1';
export const WEB_SIDEBAR_COLLAPSED_WIDTH = 84;
export const WEB_SIDEBAR_EXPANDED_WIDTH = 264;

export function getWebSidebarWidthByCollapsed(collapsed: boolean): number {
  return collapsed ? WEB_SIDEBAR_COLLAPSED_WIDTH : WEB_SIDEBAR_EXPANDED_WIDTH;
}

export function getPersistedWebSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(WEB_SIDEBAR_COLLAPSE_STORAGE_KEY);
    return raw === '1' || raw === 'true';
  } catch {
    return false;
  }
}

export function isWebSidebarStateDetail(value: unknown): value is WebSidebarStateEventDetail {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WebSidebarStateEventDetail>;
  if (typeof candidate.collapsed !== 'boolean') return false;
  if (typeof candidate.width !== 'number' || !Number.isFinite(candidate.width)) return false;
  return candidate.phase === 'start' || candidate.phase === 'progress' || candidate.phase === 'end';
}

export function emitWebSidebarState(detail: WebSidebarStateEventDetail): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent<WebSidebarStateEventDetail>(WEB_SIDEBAR_STATE_EVENT, { detail }));
  } catch {}
}
