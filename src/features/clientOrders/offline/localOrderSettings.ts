import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ClientOrderOrganization, ClientOrderSettings } from '@/utils/clientOrdersService';

const key = (userId: string, kind: string) => `client_orders_${kind}_v1:${userId}`;

export async function readLocalOrderSettings(userId: string) {
  const [settingsJson, preferenceJson] = await Promise.all([
    AsyncStorage.getItem(key(userId, 'settings')),
    AsyncStorage.getItem(key(userId, 'organization')),
  ]);
  const parse = (value: string | null) => { try { return value ? JSON.parse(value) : null; } catch { return null; } };
  const settings = parse(settingsJson) as ClientOrderSettings | null;
  const preference = parse(preferenceJson) as { organization: ClientOrderOrganization | null } | null;
  return {
    settings: Array.isArray(settings?.organizations) ? settings : null,
    preference: preference && (preference.organization === null || (typeof preference.organization?.guid === 'string'
      && typeof preference.organization?.name === 'string')) ? preference : null,
  };
}

export function writeLocalOrderSettings(userId: string, settings: ClientOrderSettings) {
  return AsyncStorage.setItem(key(userId, 'settings'), JSON.stringify(settings));
}

export function writeLocalOrderOrganization(userId: string, organization: ClientOrderOrganization | null) {
  return AsyncStorage.setItem(key(userId, 'organization'), JSON.stringify({ organization }));
}

export function applyLocalOrderOrganization(settings: ClientOrderSettings, preference: { organization: ClientOrderOrganization | null } | null) {
  if (!preference) return settings;
  const organization = settings.organizations.find(item => item.guid === preference.organization?.guid
    && item.isActive !== false && item.isSelectable !== false) ?? null;
  return { ...settings, preferredOrganization: organization };
}
