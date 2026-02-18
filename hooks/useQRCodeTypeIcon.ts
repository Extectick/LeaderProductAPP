// hooks/useQRCodeTypeIcon.ts
import { QRType } from '@/src/entities/qr/types';
import { Ionicons } from '@expo/vector-icons';

type IoniconName = keyof typeof Ionicons.glyphMap;

export function useQRCodeTypeIcon(type: QRType): { iconName: IoniconName; color: string } {
  switch (type) {
    case 'PHONE':
      return { iconName: 'call', color: '#007AFF' }; // Синий
    case 'LINK':
      return { iconName: 'link', color: '#34C759' }; // Зеленый
    case 'EMAIL':
      return { iconName: 'mail', color: '#FF9500' }; // Оранжевый
    case 'TEXT':
      return { iconName: 'document-text', color: '#5F6368' }; // Серый
    case 'WHATSAPP':
      return { iconName: 'logo-whatsapp', color: '#25D366' }; // WhatsApp зеленый
    case 'TELEGRAM':
      return { iconName: 'paper-plane', color: '#0088CC' }; // Telegram синий
    case 'CONTACT':
      return { iconName: 'person', color: '#5856D6' }; // Фиолетовый
    default:
      return { iconName: 'qr-code', color: '#000000' }; // Черный
  }
}
