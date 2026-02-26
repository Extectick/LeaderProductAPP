import { Platform } from 'react-native';
import type { Href } from 'expo-router';
import MaxMessengerSignLogo from '@/assets/icons/max-messenger-sign-logo.svg';

/** Горизонтальный паддинг карточки (должен совпадать с styles.card.padding). */
export const CARD_PAD_H = Platform.OS === 'web' ? 20 : 22;

export const APP_LOGO = require('../../../assets/images/icon.png');
export { MaxMessengerSignLogo };

export const STORAGE_KEYS = {
  REMEMBER_FLAG: '@remember_me',
  REMEMBER_EMAIL: '@remember_email',
  REMEMBER_PASSWORD: '@remember_password',
} as const;

export const ROUTES = {
  HOME: '/home' as Href,
  PROFILE: '/ProfileSelectionScreen' as Href,
  PENDING: '/(auth)/ProfilePendingScreen' as Href,
  BLOCKED: '/(auth)/ProfileBlockedScreen' as Href,
} as const;
