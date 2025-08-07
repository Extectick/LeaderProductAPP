
export interface CreatedBy {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
}

export interface QRCodeItem {
  id: string;
  qrData: string;
  qrType: 'PHONE'|'LINK'|'EMAIL'|'TEXT'|'WHATSAPP'|'TELEGRAM'|'CONTACT';
  description: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  scanCount: number;
  createdAt: string;
  createdBy: CreatedBy;
  qrImage: string;
}

export interface QRCodeListResponse {
  data: QRCodeItem[];
  meta: {
    total: number;
    limit: number;
    offset: number;
  };
}

export interface QRCodeCache {
  data: QRCodeItem[];
  meta: {
    total: number;
    limit: number;
    offset: number;
  };
  timestamp: number;
}
