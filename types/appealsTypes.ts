// types/appealsTypes.ts
export type AppealStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type AppealPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AttachmentType = 'IMAGE' | 'AUDIO' | 'FILE';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export type Scope = 'my' | 'department' | 'assigned';

export interface DepartmentMini { id: number; name: string }
export interface UserMini { id: number; email: string; firstName?: string|null; lastName?: string|null }

export interface AppealAttachment {
  id?: number;
  fileUrl: string;
  fileName: string;
  fileType: AttachmentType;
}

export interface AppealMessage {
  id: number;
  tempId?: string;
  text?: string | null;
  createdAt: string;
  editedAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  status?: MessageStatus;
  uploadProgress?: number;
  sender: UserMini;
  attachments: AppealAttachment[];
}

export interface StatusHistoryItem {
  oldStatus: AppealStatus;
  newStatus: AppealStatus;
  changedAt: string;
  changedBy: UserMini;
}

export interface AppealListItem {
  id: number;
  number: number;
  status: AppealStatus;
  priority: AppealPriority;
  title?: string|null;
  createdAt: string;
  fromDepartment?: DepartmentMini|null;
  toDepartment: DepartmentMini;
  assignees: { user: UserMini }[];
}

export interface AppealListResponse {
  data: AppealListItem[];
  meta: { total: number; limit: number; offset: number };
}

export interface AppealDetail {
  id: number;
  number: number;
  title?: string|null;
  status: AppealStatus;
  priority: AppealPriority;
  createdAt: string;
  deadline?: string|null;
  fromDepartment?: DepartmentMini|null;
  toDepartment: DepartmentMini;
  createdBy: UserMini;
  assignees: { user: UserMini }[];
  watchers: { user: UserMini }[];
  statusHistory: StatusHistoryItem[];
  messages: AppealMessage[];
}

export interface AppealCreateResult {
  id: number;
  number: number;
  status: AppealStatus;
  priority: AppealPriority;
  createdAt: string;
}

export interface AddMessageResult {
  id: number;
  createdAt: string;
}

export interface EditMessageResult {
  id: number;
  editedAt: string;
}

export interface DeleteMessageResult {
  id: number;
}
