// types/appealsTypes.ts
export type AppealStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'DECLINED' | 'RESOLVED';
export type AppealPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AttachmentType = 'IMAGE' | 'AUDIO' | 'FILE';
export type AppealMessageType = 'USER' | 'SYSTEM';
export type AppealLaborPaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'NOT_REQUIRED';

export type Scope = 'my' | 'department' | 'assigned';
export type AppealRoleBadge = 'OWN_APPEAL' | 'ASSIGNEE';

export interface DepartmentMini { id: number; name: string }
export interface UserMini {
  id: number;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  department?: DepartmentMini | null;
  isAdmin?: boolean;
  isDepartmentManager?: boolean;
}

export interface AppealAttachment {
  id?: number;
  fileUrl?: string;
  fileName?: string;
  fileType: AttachmentType;
}

export interface AppealMessage {
  id: number;
  appealId?: number;
  appealNumber?: number;
  text?: string|null;
  type?: AppealMessageType;
  systemEvent?: { type: string; [key: string]: any } | null;
  createdAt: string;
  editedAt?: string|null;
  sender: UserMini;
  attachments: AppealAttachment[];
  readBy?: { userId: number; readAt: string }[];
  isRead?: boolean;
  localState?: 'pending' | 'failed';
  localError?: string;
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
  deadline?: string|null;
  createdById?: number;
  fromDepartment?: DepartmentMini|null;
  toDepartment: DepartmentMini;
  assignees: { user: UserMini }[];
  lastMessage?: AppealMessage | null;
  unreadCount?: number;
}

export interface AppealListResponse {
  data: AppealListItem[];
  meta: { total: number; limit: number; offset: number };
}

export interface AppealScopeCounters {
  activeCount: number;
  unreadMessagesCount: number;
}

export interface AppealCounters {
  my: AppealScopeCounters;
  department: AppealScopeCounters & {
    available: boolean;
  };
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

export interface AppealMessagesResponse {
  data: AppealMessage[];
  meta: {
    hasMore?: boolean;
    nextCursor?: string | null;
    hasMoreBefore: boolean;
    prevCursor: string | null;
    hasMoreAfter: boolean;
    anchorMessageId: number | null;
  };
}

export interface AppealUpdatedEvent {
  appealId: number;
  status: AppealStatus;
  priority: AppealPriority;
  toDepartmentId: number;
  updatedAt: string;
  assigneeIds?: number[];
  lastMessage?: AppealMessage | null;
}

export interface AppealMessageAddedEvent extends AppealMessage {
  messageId?: number;
  senderId?: number;
  appealNumber?: number;
  senderName?: string;
  senderAvatarUrl?: string | null;
}

export interface AppealLaborEntryDto {
  assigneeUserId: number;
  accruedHours: number;
  paidHours: number;
  remainingHours: number;
  payable: boolean;
  hourlyRateRub: number | null;
  effectiveHourlyRateRub: number;
  amountAccruedRub: number;
  amountPaidRub: number;
  amountRemainingRub: number;
  // alias for backward compatibility
  hours: number;
  paymentStatus: AppealLaborPaymentStatus;
  paidAt: string | null;
  paidBy: UserMini | null;
  assignee: UserMini;
  updatedAt: string;
}

export interface AppealsAnalyticsAppealItem {
  id: number;
  number: number;
  title: string | null;
  status: AppealStatus;
  createdAt: string;
  deadline: string | null;
  completedAt: string | null;
  createdBy: {
    id: number;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  };
  toDepartment: {
    id: number;
    name: string;
    paymentRequired: boolean;
    hourlyRateRub: number;
  };
  assignees: Array<UserMini & { hourlyRateRub: number | null; effectiveHourlyRateRub: number }>;
  sla: {
    openDurationMs: number;
    workDurationMs: number;
    timeToFirstInProgressMs: number | null;
    timeToFirstResolvedMs: number | null;
  };
  allowedStatuses: AppealStatus[];
  actionPermissions: {
    canChangeStatus: boolean;
    canEditDeadline: boolean;
    canAssign: boolean;
    canTransfer: boolean;
    canOpenParticipants: boolean;
    canSetLabor: boolean;
    canClaim: boolean;
  };
  laborEntries: AppealLaborEntryDto[];
}

export interface AppealsAnalyticsMeta {
  availableDepartments: Array<{
    id: number;
    name: string;
    paymentRequired: boolean;
    hourlyRateRub: number;
  }>;
  availableAssignees: Array<{
    id: number;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    department: { id: number; name: string } | null;
    hourlyRateRub: number | null;
  }>;
  role: {
    isAdmin: boolean;
    isDepartmentManager: boolean;
  };
}

export interface AppealsAnalyticsAppealsResponse {
  data: AppealsAnalyticsAppealItem[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface AppealsAnalyticsUsersSummaryItem {
  user: UserMini & {
    hourlyRateRub: number | null;
    effectiveHourlyRateRub: number;
  };
  stats: {
    appealsCount: number;
    paidAppealsCount: number;
    unpaidAppealsCount: number;
    partialAppealsCount: number;
    notRequiredAppealsCount: number;
    accruedHours: number;
    paidHours: number;
    remainingHours: number;
    accruedAmountRub: number;
    paidAmountRub: number;
    remainingAmountRub: number;
  };
}

export interface AppealsAnalyticsUsersResponse {
  data: AppealsAnalyticsUsersSummaryItem[];
}

export interface AppealsAnalyticsUserAppealsResponse {
  user: UserMini;
  data: AppealsAnalyticsAppealItem[];
}

export type AppealFinancialFunnelStatus = 'NOT_PAYABLE' | 'TO_PAY' | 'PARTIAL' | 'PAID';

export interface AppealsSlaDashboardResponse {
  transitions: Array<{
    key: 'OPEN_TO_IN_PROGRESS' | 'IN_PROGRESS_TO_RESOLVED' | 'RESOLVED_TO_COMPLETED';
    count: number;
    avgMs: number | null;
    p50Ms: number | null;
    p90Ms: number | null;
  }>;
}

export interface AppealsKpiDashboardResponse {
  appeals: {
    totalCount: number;
    openCount: number;
    inProgressCount: number;
    completedCount: number;
    resolvedCount: number;
    declinedCount: number;
  };
  timing: {
    avgTakeMs: number | null;
    avgExecutionMs: number | null;
    takeCount: number;
    executionCount: number;
  };
  labor: {
    totalAccruedHours: number;
    totalPaidHours: number;
    totalRemainingHours: number;
    totalNotRequiredHours: number;
    totalAccruedAmountRub: number;
    totalPaidAmountRub: number;
    totalRemainingAmountRub: number;
    currency: 'RUB';
  };
}

export interface AppealsPaymentQueueUserGroup {
  assignee: UserMini;
  departments: Array<{
    id: number;
    name: string;
    items: Array<{
      appealId: number;
      appealNumber: number;
      hours: number;
      paymentStatus: AppealLaborPaymentStatus;
      financialStatus: AppealFinancialFunnelStatus;
    }>;
    totalHours: number;
  }>;
  totalHours: number;
}

export interface AppealsPaymentQueueResponse {
  data: AppealsPaymentQueueUserGroup[];
  meta: { totalItems: number };
}

export interface AppealsLaborAuditLogResponse {
  data: Array<{
    id: number;
    appealId: number;
    assigneeUserId: number;
    changedBy: UserMini;
    oldHours: number | null;
    newHours: number;
    oldPaidHours: number | null;
    newPaidHours: number | null;
    oldPaymentStatus: AppealLaborPaymentStatus | null;
    newPaymentStatus: AppealLaborPaymentStatus;
    changedAt: string;
  }>;
  meta: { total: number; limit: number; offset: number; hasMore: boolean };
}

export interface AppealsAnalyticsUpdateHourlyRateResponse {
  userId: number;
  hourlyRateRub: number;
}

export interface AppealsFunnelResponse {
  byStatus: Array<{ status: AppealFinancialFunnelStatus; count: number }>;
}

export interface AppealsHeatmapResponse {
  data: Array<{
    user: UserMini;
    cells: Array<{ date: string; totalHours: number; appealsCount: number }>;
  }>;
}

export interface AppealsForecastResponse {
  horizon: 'week' | 'month';
  generatedAt: string;
  lookbackDays: number;
  remainingDays: number;
  departments: Array<{
    id: number;
    name: string;
    expectedHours: number;
    expectedPayout: number;
    formula: string;
  }>;
}
