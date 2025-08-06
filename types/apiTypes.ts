
export interface CreatedBy {
  id: number;
  email: string;
}

export interface QRCodeItem {
  id: string;
  qrData: string;
  description: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  createdBy: CreatedBy;
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
