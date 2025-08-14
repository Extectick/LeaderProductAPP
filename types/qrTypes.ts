import { GestureResponderEvent } from "react-native";

export type QRType = "PHONE" | "LINK" | "EMAIL" | "TEXT" | "WHATSAPP" | "TELEGRAM" | "CONTACT" | "WIFI" | "SMS" | "GEO" | "BITCOIN";

export interface QRCodeItemType {
  id: string;
  description: string | null;
  qrData: string;
  qrImage?: string;
  qrType: QRType;
  status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED';
  scanCount: number;
  createdAt: string;
  onPress?: () => void;
  onLongPress?: (event: GestureResponderEvent) => void;
  loading?: boolean;
}
