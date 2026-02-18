import type { AuthMethod } from '@/src/shared/types/api';

export type AuthProviderUiItem = {
  key: string;
  title: string;
  route: string;
};

const AUTH_PROVIDER_REGISTRY: Record<string, AuthProviderUiItem> = {
  telegram: {
    key: 'telegram',
    title: 'Войти через Telegram',
    route: '/(auth)/telegram',
  },
  max: {
    key: 'max',
    title: 'Войти через MAX',
    route: '/(auth)/max',
  },
};

export function resolveEnabledAuthProviders(methods: AuthMethod[]): AuthProviderUiItem[] {
  return methods
    .filter((method) => method.enabled)
    .map((method) => AUTH_PROVIDER_REGISTRY[method.key])
    .filter((item): item is AuthProviderUiItem => Boolean(item));
}

