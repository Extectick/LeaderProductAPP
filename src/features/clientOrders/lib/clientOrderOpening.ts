import type { EntityTarget, OnecEntityTarget } from '@/src/shared/entityLinks';

export function isClientOrderEntityTarget(target: EntityTarget): target is OnecEntityTarget & {metaType:'Documents';name:'ЗаказКлиента'} {
  return target.source === 'onec' && target.metaType === 'Documents' && target.name === 'ЗаказКлиента';
}

/** Direct service routes preserve source identity; entity links render in the viewer. */
export function clientOrderRoute(guid: unknown, baseKey?: string) {
  if (typeof guid !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(guid) ||
      /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(guid)) return null;
  if(baseKey!==undefined&&!/^[a-z0-9-]{1,48}$/.test(baseKey))return null;
  return { pathname: '/services/client_orders' as const, params: { orderGuid: guid.toLowerCase(), ...(baseKey===undefined?{}:{orderBaseKey:baseKey}) } };
}
