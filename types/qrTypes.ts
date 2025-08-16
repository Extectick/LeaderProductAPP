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

export type SeriesPoint = { ts: string; scans: number };
export interface Totals { scans: number; uniqueIPs: number; uniqueDevices: number; }
export interface BreakdownRow { key: Record<string, string>; scans: number }
export interface Breakdown { by: string[]; rows: BreakdownRow[] }

export interface AnalyticsPayload {
  meta: { from: string; to: string; tz: string; ids: string[] };
  totals?: Totals;
  series?: SeriesPoint[];
  breakdown?: Breakdown;
}

export type ScanRow = {
  id: number;
  qrListId: string;
  createdAt: string;
  ip?: string;
  device?: string;
  browser?: string;
  location?: string;
  scanDuration?: number | null;
};
export type ScansEnvelope = { data: ScanRow[]; meta: { total: number; limit: number; offset: number } };
